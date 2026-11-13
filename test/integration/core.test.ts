// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/core.ts against Postgres: what the SQL compiled in
// test/unit/core.test.ts does once run on the fixture, surprises included.

import { afterEach, describe, expect, it } from 'vitest';
import type { Whereable } from 'zapatos/schema';
import * as db from '../../src/db';
import { sql, param, raw, cols, vals, parent, self, Default } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();
const c = db.conditions;

afterEach(resetConfig);

describe('identifiers, raw, arrays', () => {
  it('runs a query built from quoted, dotted and pre-quoted identifiers', async () => {
    const q = sql`SELECT ${'display_name'}, ${'"select"'} FROM ${'public.users'}, ${'"OrderLines"'}
      WHERE ${{ id: 1 }} AND ${'"lineNo"'} = 1${raw(' ORDER BY 1')}`;
    expect(await q.run(t.client)).toEqual([{ display_name: 'Ada', select: 'gift' }]);
  });
});

describe('param', () => {
  it('sends plain values; pg serialises arrays as Postgres arrays and objects as JSON', async () => {
    const q = sql`SELECT ${param(1)}::int AS n, ${param([1, 2])}::int[] AS a, ${param({ a: 1 })}::jsonb AS o,
      ${param(null)}::text AS z, ${param(undefined)}::text AS u`;
    expect(await q.run(t.client)).toEqual([{ n: 1, a: [1, 2], o: { a: 1 }, z: null, u: null }]);
  });

  it('a text cast to a simple type works', async () => {
    expect(await sql`SELECT ${param('2026-01-31', 'date')} + 1 AS d`.run(t.client))
      .toEqual([{ d: new Date(2026, 1, 1) }]);
  });

  it('a text cast that is well-formed once quoted reaches another schema, as in 6.6.1', async () => {
    const q = sql`SELECT ${param('1', 'pg_catalog"."int4')} AS n`;
    expect(q.compile().text).toBe('SELECT CAST($1 AS "pg_catalog"."int4") AS n');
    expect(await q.run(t.client)).toEqual([{ n: 1 }]);
  });

  it('a schema-qualified or array type cast reaches its type', async () => {
    const typed = async (value: unknown, cast: string) =>
      (await sql`SELECT ${param(value, cast)} AS v, pg_typeof(${param(value, cast)})::text AS t`.run(t.client))[0];
    expect(await typed('ok', 'public.mood')).toEqual({ v: 'ok', t: 'mood' });
    expect(await typed('ok', '"public"."mood"')).toEqual({ v: 'ok', t: 'mood' });
    // pg does not parse an enum array: it comes back as text
    expect(await typed(['draft'], 'extra.status[]')).toEqual({ v: '{draft}', t: 'extra.status[]' });
    expect(await typed([1, 2], 'int4[]')).toEqual({ v: [1, 2], t: 'integer[]' });
    expect(await typed([[1], [2]], 'int4[3][]')).toEqual({ v: [[1], [2]], t: 'integer[]' });
    expect(await typed([1], 'pg_catalog"."int4[]')).toEqual({ v: [1], t: 'integer[]' });
    // a quoted name skips the grammar's aliases and multi-word names, as in 6.6.1: `"int"[]` is no type
    expect(await pgError(t.client, () => sql`SELECT ${param([1], 'int[]')}`.run(t.client)))
      .toEqual({ code: '42704', message: 'type "int[]" does not exist' });
    expect(await pgError(t.client, () => sql`SELECT ${param(1, 'double precision')}`.run(t.client)))
      .toEqual({ code: '42704', message: 'type "double precision" does not exist' });
  });

  it('a type whose own name holds a `.` is reached quoted, as `"a.b"`; `a.b` is type b in schema a', async () => {
    await t.client.query(`CREATE TYPE "a.b" AS ENUM ('x')`);
    expect(await sql`SELECT pg_typeof(${param('x', '"a.b"')})::text AS t`.run(t.client)).toEqual([{ t: '"a.b"' }]);
    // 6.6.1 wrote `"a.b"` for this one too
    expect(await pgError(t.client, () => sql`SELECT ${param('x', 'a.b')}`.run(t.client)))
      .toEqual({ code: '3F000', message: 'schema "a" does not exist' });
  });

  it('a type whose own name ends with `[]` is reached quoted, as `"tag[]"`; `tag[]` is an array of tag', async () => {
    await t.client.query(`CREATE TYPE tag AS ENUM ('x'); CREATE DOMAIN "tag[]" AS text`);
    const typeOf = async (cast: string) =>
      (await sql`SELECT pg_typeof(${param('{x}', cast)})::text AS t`.run(t.client))[0];
    expect(await typeOf('"tag[]"')).toEqual({ t: '"tag[]"' });
    // 6.6.1 wrote `"tag[]"` and `"public"."tag[]"` for these two, the domain
    expect(await typeOf('tag[]')).toEqual({ t: 'tag[]' });
    expect(await typeOf('public"."tag[]')).toEqual({ t: 'tag[]' });
  });

  it('a JSON cast (true, or the config) sends JSON text', async () => {
    db.setConfig({ castObjectParamsToJson: true });
    const q = sql`SELECT ${param([1, 'a'], true)}::jsonb AS a, ${param({ b: [2] })}::jsonb AS o`;
    expect(await q.run(t.client)).toEqual([{ a: [1, 'a'], o: { b: [2] } }]);
  });

  it('characterization: castArrayParamsToJson breaks comparing an array column with an array value', async () => {
    // characterization: the config applies to every array parameter, so `int4[] = json` has no operator
    db.setConfig({ castArrayParamsToJson: true });
    const q = sql`SELECT count(*)::int AS n FROM ${'accounts'} WHERE ${{ scores: [1, 2, 3] }}`;
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42883",
        "message": "operator does not exist: integer[] = json",
      }
    `);
  });
});

describe('Default, self, parent, cols, vals', () => {
  it('cols / vals of an object insert in sorted key order, with DEFAULT and fragments', async () => {
    const values = { owner_id: 2, balance: sql`${param(5)} * 2`, lifetime_ops: Default, ratio: param('0.25', 'float8') };
    const q = sql`INSERT INTO ${'accounts'} (${cols(values)}) VALUES (${vals(values)})
      RETURNING ${'balance'}, ${'lifetime_ops'}, ${'ratio'}`;
    expect(await q.run(t.client)).toEqual([{ balance: '10.00', lifetime_ops: '0', ratio: 0.25 }]);
  });

  it('self and parent() resolve inside a nested fragment', async () => {
    const reports = sql`SELECT count(*)::int FROM ${'users'} AS "r" WHERE ${{ manager_id: sql`"r".${self} = ${parent('id')}` }}`
      .copy({ parentTable: 'u' });
    const q = sql`SELECT ${'display_name'}, (${reports}) AS reports FROM ${'users'} AS "u" ORDER BY ${'id'}`;
    expect(await q.run(t.client)).toEqual([
      { display_name: 'Ada', reports: 2 }, { display_name: 'Bob', reports: 0 }, { display_name: 'Cyd', reports: 0 },
    ]);
  });

  it('vals of an array: a Parameter is a parameter, with its cast', async () => {
    // 6.6.1 sent '{"value":1}' (22P02)
    const q = sql`SELECT ${'id'} FROM ${'users'} WHERE ${'id'} IN (${vals([param(1), param('3', 'int4')])}) ORDER BY ${'id'}`;
    expect(await q.run(t.client)).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('vals of an array in an INSERT stores a Parameter value, and the column default for Default', async () => {
    // 6.6.1 stored '{"value":"guest"}' and 'Symbol(DEFAULT)' in the text column, and refused 'Symbol(DEFAULT)' as numeric (22P02)
    const memberships = await sql`INSERT INTO ${'memberships'} (${'user_id'}, ${'org_country'}, ${'org_code'}, ${'role'})
      VALUES (${vals([3, 'FR', 'acme', param('guest')])}), (${vals([3, 'FR', 'acme-lyon', Default])})
      RETURNING ${'org_code'}, ${'role'}`.run(t.client);
    expect(memberships.sort((a, b) => a.org_code.localeCompare(b.org_code))).toEqual([
      { org_code: 'acme', role: 'guest' }, { org_code: 'acme-lyon', role: 'member' },
    ]);
    const accounts = await sql`INSERT INTO ${'accounts'} (${'owner_id'}, ${'balance'}) VALUES (${vals([3, Default])}) RETURNING ${'balance'}`.run(t.client);
    expect(accounts).toEqual([{ balance: '0.00' }]);
  });
});

describe('Whereable', () => {
  const ids = (where: db.SQL) => sql`SELECT ${'id'} FROM ${'users'} WHERE ${where} ORDER BY ${'id'}`.run(t.client);

  it('an empty Whereable matches every row', async () => {
    expect(await ids({})).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('several keys are ANDed', async () => {
    expect(await ids({ manager_id: 1, mood: 'ok' })).toEqual([{ id: 2 }]);
  });

  it('characterization: a null or undefined value matches no row', async () => {
    // characterization: `"manager_id" = NULL` is never true, although Ada's manager_id is NULL
    expect(await ids({ manager_id: null })).toEqual([]);
    expect(await ids({ manager_id: undefined })).toEqual([]);
  });

  it('a Parameter value is a parameter, with its cast', async () => {
    // 6.6.1 sent '{"value":…}': no row on a text or jsonb column, 22P02 on the others
    expect(await ids({ display_name: param('Ada') })).toEqual([{ id: 1 }]);
    expect(await ids({ display_name: param('Ada', 'text') })).toEqual([{ id: 1 }]);
    expect(await ids({ id: param(2) })).toEqual([{ id: 2 }]);
    expect(await ids({ id: param('2', 'int4') })).toEqual([{ id: 2 }]);
    expect(await ids({ mood: param('ok') })).toEqual([{ id: 2 }]);
    expect(await ids({ settings: param({ theme: 'dark' }) })).toEqual([{ id: 1 }]);
    expect(await ids({ tags: param(['admin']) })).toEqual([{ id: 1 }]);
  });

  it('a Parameter value matches on a bytea column', async () => {
    // 6.6.1 sent '{"value":{"type":"Buffer","data":[1]}}', valid bytea input: no row, and isNotIn deleted the row
    const [{ id }] = await sql`INSERT INTO ${'extra.type_zoo'} (${'c_bytea'}) VALUES (${param(Buffer.from([1]))}) RETURNING ${'id'}`.run(t.client);
    const bytes = () => param(Buffer.from([1]));
    expect(await db.select('extra.type_zoo', { c_bytea: bytes() }, { columns: ['id'] }).run(t.client)).toEqual([{ id }]);
    expect(await db.deletes('extra.type_zoo', { c_bytea: c.isNotIn([bytes()]) }, { returning: ['id'] }).run(t.client)).toEqual([]);
  });

  it('a Parameter cast to json is compared as json, which jsonb refuses', async () => {
    // as `` sql`${self} = ${param(x, true)}` `` is; 6.6.1 found no row
    expect(await pgError(t.client, () => ids({ settings: param({ theme: 'dark' }, true) }))).toMatchInlineSnapshot(`
      {
        "code": "42883",
        "message": "operator does not exist: jsonb = json",
      }
    `);
  });

  it('isIn, isNotIn and not() take a Parameter as a value', async () => {
    // 6.6.1: isIn found Bob only, isNotIn and not() matched every row
    expect(await ids({ display_name: c.isIn([param('Ada'), 'Bob']) })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await ids({ id: c.isIn([param(1)]) })).toEqual([{ id: 1 }]);
    expect(await ids({ display_name: c.isNotIn([param('Ada')]) })).toEqual([{ id: 2 }, { id: 3 }]);
    expect(await ids(c.not({ display_name: param('Ada') }))).toEqual([{ id: 2 }, { id: 3 }]);
  });

  it('deletes, update and count reach the rows a Parameter value names', async () => {
    // 6.6.1 deleted every membership with isNotIn([param('owner')]), and found nothing with { display_name: param('Cyd') }
    expect(await db.deletes('memberships', { role: c.isNotIn([param('owner')]) }, { returning: ['user_id'] }).run(t.client))
      .toEqual([{ user_id: 2 }]);
    expect(await db.count('users', { display_name: param('Cyd') }).run(t.client)).toBe(1);
    expect(await db.update('users', { mood: 'ok' }, { display_name: param('Cyd') }, { returning: ['id', 'mood'] }).run(t.client))
      .toEqual([{ id: 3, mood: 'ok' }]);
    expect(await db.deletes('memberships', { user_id: param(1) }, { returning: ['user_id'] }).run(t.client))
      .toEqual([{ user_id: 1 }]);
  });

  it('a Default value rejects run() with an Error that says what to do', async () => {
    // 6.6.1 sent 'Symbol(DEFAULT)': no row on a text column, 22P02 on the others; this Error has no code
    await expect(ids({ display_name: Default })).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.]`);
    await expect(ids({ id: c.isIn([Default]) })).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.]`);
    await expect(ids({ id: Default })).rejects.not.toHaveProperty('code');
  });

  it('raw(), cols(x) and vals(x) as a filter value reject run() before any query, writes included', async () => {
    // 6.6.1 sent them as JSON ({"value":"'Ada'"}): no row on text and jsonb, every row with isNotIn, so deletes()
    // emptied the table, 22P02 elsewhere; this Error comes from compiling, so it has no code and no query is sent
    const queries: unknown[] = [];
    db.setConfig({ queryListener: query => queries.push(query) });
    const rejected = async (query: Promise<unknown>) => {
      const err = await query.then(() => undefined, (e: unknown) => e) as Error | undefined;
      return err instanceof Error && !('code' in err) ? err.message : err;
    };
    const inWhereable = {
      rawValue: await rejected(ids({ display_name: raw("'Ada'") })),
      rawJsonb: await rejected(ids({ settings: raw(`'{"theme": "dark"}'`) })),
      rawHostile: await rejected(ids({ display_name: raw("'Ada'; DELETE FROM memberships; --") })),
      colsValue: await rejected(ids({ display_name: cols('Ada') })),
      valsValue: await rejected(ids({ id: vals(1) })),
      colsArray: await rejected(ids({ tags: cols(['admin']) })),
      isInRaw: await rejected(ids({ display_name: c.isIn([raw("'Ada'")]) })),
      isNotInRaw: await rejected(ids({ display_name: c.isNotIn([raw("'Ada'")]) })),
      isInCols: await rejected(ids({ mood: c.isIn([cols('ok')]) })),
      and: await rejected(ids(c.and({ display_name: raw("'Ada'") }, { id: 1 }))),
      deletesIsNotIn: await rejected(db.deletes('memberships', { role: c.isNotIn([raw("'owner'")]) }).run(t.client)),
      updateWhere: await rejected(db.update('users', { mood: 'ok' }, { display_name: raw("'Ada'") }).run(t.client)),
      lateral: await rejected(db.select('users', db.all, { lateral: { n: db.count('memberships', { role: raw("'owner'") }) } }).run(t.client)),
      upsertWhereable: await rejected(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
        updateValues: { settings: { theme: raw("'x'") } as any },
      }).run(t.client)),
      valsInFragment: await rejected(db.insert('users', { email: 'dan@example.com', display_name: sql`${vals([raw("'Dan'")])}` }).run(t.client)),
    };
    const inCondition = {
      eqRaw: await rejected(ids({ display_name: c.eq(raw("'Ada'")) })),
      neRaw: await rejected(ids({ display_name: c.ne(raw("'Ada'")) })),
      eqVals: await rejected(ids({ id: c.eq(vals(1)) })),
      deletesNe: await rejected(db.deletes('memberships', { role: c.ne(raw("'owner'")) }).run(t.client)),
      updateAdd: await rejected(db.update('accounts', { lifetime_ops: c.add(raw('1') as any) }, { id: 1 }).run(t.client)),
    };
    const inFilter = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`.';
    const asCondition = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`.';
    expect(inWhereable).toEqual(Object.fromEntries(Object.keys(inWhereable).map(k => [k, inFilter])));
    expect(inCondition).toEqual(Object.fromEntries(Object.keys(inCondition).map(k => [k, asCondition])));
    expect(queries).toEqual([]);
    expect(await db.count('memberships', db.all).run(t.client)).toBe(2);
  });

  it('raw() in a fragment value, or in the updateValues of upsert, is SQL, and a plain { value } is a value', async () => {
    // the migration of a raw() filter value, and the slots where raw() and cols() compiled as SQL in 6.6.1 too
    expect(await ids({ display_name: sql`${self} = ${raw("'Ada'")}` })).toEqual([{ id: 1 }]);
    expect(await ids({ display_name: { value: 'Ada' } })).toEqual([]);
    expect(await db.upsert('users', { email: 'bob@example.com', display_name: 'Bobby' }, 'email', {
      updateValues: { display_name: raw(`"users"."display_name" || '!'`) }, returning: ['display_name'],
    }).run(t.client)).toEqual({ display_name: 'Bob!', $action: 'UPDATE' });
    expect(await db.upsert('users', { email: 'cyd@example.com', display_name: 'Cyd', tags: ['x'] }, 'email', {
      updateValues: { tags: cols(['users.tags']) }, returning: ['tags'],
    }).run(t.client)).toEqual({ tags: ['new', 'remote'], $action: 'UPDATE' });
  });

  it('parent() in isIn and isNotIn is the parent column in a lateral', async () => {
    // 6.6.1 sent '{"value":"id"}': 22P02 on an int column; on a text one no row, or every row with isNotIn (#107)
    const counts = (lateral: db.SQLFragment<any>) =>
      db.select('users', db.all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { n: lateral } }).run(t.client);
    const perOwner = [{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 0 }];
    expect(await counts(db.count('accounts', { owner_id: c.isIn([parent('id')]) }))).toEqual(perOwner);
    expect(await counts(db.count('accounts', { owner_id: c.isNotIn([parent('id')]) }))).toEqual([{ id: 1, n: 1 }, { id: 2, n: 2 }, { id: 3, n: 3 }]);
    expect(await counts(db.count('accounts', { owner_id: c.isIn([parent('id'), 2]) }))).toEqual([{ id: 1, n: 3 }, { id: 2, n: 1 }, { id: 3, n: 1 }]);
    expect(await counts(db.count('active_users', { display_name: c.isIn([parent('display_name')]) }))).toEqual([{ id: 1, n: 1 }, { id: 2, n: 1 }, { id: 3, n: 0 }]);
    expect(await counts(db.count('active_users', { display_name: c.isNotIn([parent('display_name')]) }))).toEqual([{ id: 1, n: 1 }, { id: 2, n: 1 }, { id: 3, n: 2 }]);
    // parent() with no column takes the column of the filter, as { id: parent() } does
    expect(await counts(db.count('active_users', { id: c.isIn([parent()]) }))).toEqual([{ id: 1, n: 1 }, { id: 2, n: 1 }, { id: 3, n: 0 }]);
    // and a vals([…]) written by hand, in a fragment value or in a lateral subquery of its own
    expect(await counts(db.count('accounts', { owner_id: sql`${self} IN (${vals([parent('id')])})` }))).toEqual(perOwner);
    expect(await counts(sql`SELECT count(*)::int AS result FROM ${'accounts'} WHERE ${'owner_id'} IN (${vals([parent('id')])})`)).toEqual(perOwner);
    // on jsonb, 6.6.1 compared with {"value": "settings"}: no row, or every row with isNotIn; an alias, as the subquery is on users too
    const sameSettings = (lateral: db.SQLFragment<any>) =>
      db.select('users', db.all, { alias: 'u', columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { n: lateral } }).run(t.client);
    expect(await sameSettings(db.count('users', { settings: c.isIn([parent('settings')]) }))).toEqual([{ id: 1, n: 1 }, { id: 2, n: 2 }, { id: 3, n: 2 }]);
    expect(await sameSettings(db.count('users', { settings: c.isNotIn([parent('settings')]) }))).toEqual([{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 1 }]);
    // any fragment of the subquery, an extras one too: 6.6.1 returned ['{"value":"display_name"}']
    const accounts = db.select('accounts', { owner_id: parent('id') }, {
      columns: ['id'], order: { by: 'id', direction: 'ASC' }, extras: { a: sql<db.SQL, string[]>`ARRAY[${vals([parent('display_name')])}]` },
    });
    expect(await db.select('users', db.all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { accounts } }).run(t.client))
      .toEqual([{ id: 1, accounts: [{ id: 1, a: ['Ada'] }, { id: 2, a: ['Ada'] }] }, { id: 2, accounts: [{ id: 3, a: ['Bob'] }] }, { id: 3, accounts: [] }]);
  });

  it('parent() in isIn is the nearest parent in nested laterals, and the alias of an aliased one', async () => {
    const accounts = db.select('accounts', { owner_id: c.isIn([parent('id')]) }, {
      columns: ['id'], order: { by: 'id', direction: 'ASC' },
      lateral: { out: db.count('transfers', { from_account: c.isIn([parent('id')]) }) },
    });
    expect(await db.select('users', db.all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { accounts } }).run(t.client))
      .toEqual([{ id: 1, accounts: [{ id: 1, out: 1 }, { id: 2, out: 0 }] }, { id: 2, accounts: [{ id: 3, out: 1 }] }, { id: 3, accounts: [] }]);
    const q = db.select('users', db.all, {
      alias: 'u', order: { by: 'id', direction: 'ASC' }, lateral: db.count('accounts', { owner_id: c.isIn([parent('id')]) }),
    });
    expect(q.compile().text).toContain(`WHERE (("owner_id" IN ("u"."id")))`);
    expect(await q.run(t.client)).toEqual([2, 1, 0]);
  });

  it('parent() in vals([…]) outside a lateral rejects run() before any query, writes included', async () => {
    // 6.6.1 sent '{"value":"…"}': select() and count() found no row on a text column, every row with isNotIn,
    // so deletes() and update() reached them all; 22P02 on an int column; the writes stored '{"value":"display_name"}',
    // {"value": "x"} in jsonb and {"{\"value\":\"t\"}"} in text[]
    const queries: unknown[] = [];
    db.setConfig({ queryListener: query => queries.push(query) });
    const rejected = async (query: Promise<unknown>) => {
      const err = await query.then(() => undefined, (e: unknown) => e) as Error | undefined;
      return err instanceof Error && !('code' in err) ? err.message : err;
    };
    const outcomes = {
      selectIsIn: await rejected(db.select('users', { id: c.isIn([parent('id')]) }).run(t.client)),
      selectIsNotIn: await rejected(db.select('users', { display_name: c.isNotIn([parent('display_name')]) }).run(t.client)),
      countIsNotIn: await rejected(db.count('users', { display_name: c.isNotIn([parent('display_name')]) }).run(t.client)),
      deletesIsNotIn: await rejected(db.deletes('memberships', { role: c.isNotIn([parent('role')]) }).run(t.client)),
      updateIsNotIn: await rejected(db.update('users', { mood: 'ok' }, { display_name: c.isNotIn([parent('display_name')]) }).run(t.client)),
      handInsert: await rejected(sql`INSERT INTO ${'users'} (${cols(['email', 'display_name'])}) VALUES (${vals(['dan@example.com', parent('display_name')])})`.run(t.client)),
      insertFragment: await rejected(db.insert('users', { email: 'dan@example.com', display_name: sql`${vals([parent('display_name')])}` }).run(t.client)),
      insertJsonb: await rejected(db.insert('users', { email: 'dan@example.com', display_name: 'Dan', settings: sql`${vals([parent('x')])}` }).run(t.client)),
      insertTextArray: await rejected(db.insert('users', { email: 'dan@example.com', display_name: 'Dan', tags: sql`ARRAY[${vals([parent('t')])}]` }).run(t.client)),
      updateFragment: await rejected(db.update('users', { display_name: sql`${vals([parent('display_name')])}` }, { id: 1 }).run(t.client)),
      upsertValues: await rejected(db.upsert('users', { email: 'bob@example.com', display_name: sql`${vals([parent('display_name')])}` }, 'email').run(t.client)),
      upsertUpdateValues: await rejected(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
        updateValues: { display_name: vals([parent('display_name')]) as any },
      }).run(t.client)),
    };
    expect(outcomes).toEqual(Object.fromEntries(Object.keys(outcomes).map(k => [k, `The 'parent' table alias has no meaning here`])));
    expect(queries).toEqual([]);
    expect(await sql`SELECT ${'display_name'}, ${'mood'} FROM ${'users'} ORDER BY ${'id'}`.run(t.client))
      .toEqual([{ display_name: 'Ada', mood: 'happy' }, { display_name: 'Bob', mood: 'ok' }, { display_name: 'Cyd', mood: 'sad' }]);
    expect(await db.count('memberships', db.all).run(t.client)).toBe(2);
  });

  it('parent() in vals({…}) is the parent column in a lateral, as in vals([…])', async () => {
    // 6.6.1 sent '{"value":"display_name"}' (#259); parent() with no column takes its key's column
    const names = (lateral: db.SQLFragment<any>) =>
      db.select('users', db.all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { v: lateral } }).run(t.client);
    const perUser = [{ id: 1, v: 'Ada' }, { id: 2, v: 'Bob' }, { id: 3, v: 'Cyd' }];
    expect({
      object: await names(sql`SELECT x.a AS result FROM (VALUES (${vals({ a: parent('display_name') })})) AS x(${cols({ a: 1 })})`),
      noColumn: await names(sql`SELECT x.display_name AS result FROM (VALUES (${vals({ display_name: parent() })})) AS x(${cols({ display_name: 1 })})`),
      array: await names(sql`SELECT x.a AS result FROM (VALUES (${vals([parent('display_name')])})) AS x(a)`),
    }).toEqual({ object: perUser, noColumn: perUser, array: perUser });
  });

  it('raw(), cols(x) and vals(x) in vals({…}) reject run() in a lateral too, where parent() has a meaning', async () => {
    // 6.6.1 sent '{"value":…}' (#259)
    const names = (lateral: db.SQLFragment<any>) =>
      db.select('users', db.all, { columns: ['id'], lateral: { v: lateral } }).run(t.client).then(() => 'ran', (err: Error) => err.message);
    expect(new Set(await Promise.all([raw("'x'"), cols('display_name'), vals('x')].map(value => names(sql`SELECT ${vals({ a: value })} AS result`)))))
      .toEqual(new Set([expect.stringMatching(/^`db.raw\(\)`, `db.cols\(\)` and `db.vals\(\)` have no meaning as a value in `vals\(\{…\}\)`/)]));
  });

  it('raw(), cols(x), vals(x) and parent() in vals({…}) of a sql template of its own reject run() before any query', async () => {
    // as the shortcuts' writes do (integration/shortcuts); 6.6.1 inserted '{"value":…}' (#259)
    const queries: unknown[] = [];
    db.setConfig({ queryListener: query => queries.push(query) });
    const outcomes: Record<string, unknown> = {};
    for (const [name, value] of Object.entries({ raw: raw("upper('Dan')"), cols: cols('display_name'), vals: vals('Dan'), parent: parent('display_name') })) {
      const row = { email: `${name}@example.com`, display_name: value };
      outcomes[name] = await sql`INSERT INTO ${'users'} (${cols(row)}) VALUES (${vals(row)})`.run(t.client).then(() => 'ran', (err: Error) => err.message);
    }
    expect({ ...outcomes, queriesSent: queries.length }).toEqual({
      raw: expect.stringMatching(/^`db.raw\(\)`, `db.cols\(\)` and `db.vals\(\)` have no meaning as a value in `vals\(\{…\}\)`/),
      cols: expect.stringMatching(/^`db.raw\(\)`, `db.cols\(\)` and `db.vals\(\)` have no meaning as a value in `vals\(\{…\}\)`/),
      vals: expect.stringMatching(/^`db.raw\(\)`, `db.cols\(\)` and `db.vals\(\)` have no meaning as a value in `vals\(\{…\}\)`/),
      parent: `The 'parent' table alias has no meaning here`,
      queriesSent: 0,
    });
    expect(await db.count('users', db.all).run(t.client)).toBe(3);
  });

  it('parent() as a value, or in eq(), is the parent column in a lateral, and throws outside one', async () => {
    // the type accepts both anywhere (types/core); outside a lateral, compiling throws, so run() rejects
    const counts = (where: Whereable) =>
      db.select('users', db.all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { n: db.count('accounts', where) } }).run(t.client);
    const perOwner = [{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 0 }];
    expect(await counts({ owner_id: parent('id') })).toEqual(perOwner);
    expect(await counts({ owner_id: c.eq(parent('id')) })).toEqual(perOwner);
    await expect(ids({ id: parent('id') })).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
    await expect(ids({ id: c.eq(parent('id')) })).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: The 'parent' table alias has no meaning here]`);
  });

  it('Default and self in a condition, and self as a value or in isIn, reject run() before any query', async () => {
    // 6.6.1 sent 'Symbol(DEFAULT)' and 'Symbol(self)': no row on a text column, every row with ne() and isNotIn(),
    // 22P02 on the others; this Error comes from compiling, so it has no code and no query is sent
    const queries: unknown[] = [];
    db.setConfig({ queryListener: query => queries.push(query) });
    const rejected = async (query: Promise<unknown>) => {
      const err = await query.then(() => undefined, (e: unknown) => e) as Error | undefined;
      return err instanceof Error && !('code' in err) ? err.message : err;
    };
    expect({
      eqDefault: await rejected(ids({ display_name: c.eq(Default) })),
      neDefault: await rejected(ids({ display_name: c.ne(Default) })),
      idEqDefault: await rejected(ids({ id: c.eq(Default) })),
      eqSelf: await rejected(ids({ display_name: c.eq(self) })),
      selfValue: await rejected(ids({ display_name: self })),
      isInSelf: await rejected(ids({ display_name: c.isIn([self]) })),
      isNotInSelf: await rejected(ids({ display_name: c.isNotIn([self]) })),
      deletesNeDefault: await rejected(db.deletes('events', { kind: c.ne(Default) }).run(t.client)),
      updateAddDefault: await rejected(db.update('accounts', { lifetime_ops: c.add(Default as any) }, { id: 1 }).run(t.client)),
      updateWhereSelf: await rejected(db.update('users', { mood: 'ok' }, { display_name: self }).run(t.client)),
      lateralSelf: await rejected(db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: self }) } }).run(t.client)),
      lateralEqDefault: await rejected(db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: c.eq(Default) }) } }).run(t.client)),
      upsertSelfInWhereable: await rejected(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
        updateValues: { settings: { theme: self } as any },
      }).run(t.client)),
      upsertAddDefault: await rejected(db.upsert('accounts', { id: 1, owner_id: 1 }, 'id', { updateValues: { lifetime_ops: c.add(Default as any) } }).run(t.client)),
    }).toMatchInlineSnapshot(`
      {
        "deletesNeDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "eqDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "eqSelf": "\`db.self\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: it is already the column on the left. To compare the column with itself, write a \`sql\` fragment with \`db.self\` on both sides.",
        "idEqDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "isInSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "isNotInSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "lateralEqDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "lateralSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "neDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "selfValue": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "updateAddDefault": "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        "updateWhereSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "upsertAddDefault": "The 'self' column alias has no meaning here",
        "upsertSelfInWhereable": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
      }
    `);
    expect(queries).toEqual([]);
    expect(await db.count('events', db.all).run(t.client)).toBe(3);
  });

  it('self in a fragment value is still the column', async () => {
    expect(await ids({ display_name: sql`${self} = ${self}`, id: sql`${self} > 1` })).toEqual([{ id: 2 }, { id: 3 }]);
  });
});

describe('SQLFragment.run', () => {
  it('prepared(): a named statement can be run twice on the same connection', async () => {
    const name = `pgcast_core_${Date.now()}`;
    const q = sql`SELECT ${'display_name'} FROM ${'users'} WHERE ${{ id: 2 }}`.prepared(name);
    expect(await q.run(t.client)).toEqual([{ display_name: 'Bob' }]);
    expect(await q.run(t.client)).toEqual([{ display_name: 'Bob' }]);
  });

  it('noop: returns noopResult without hitting the database, unless forced', async () => {
    const q = sql`SELECT no_such_column`;
    q.noop = true;
    q.noopResult = 'skipped';
    expect(await q.run(t.client)).toBe('skipped');
    expect(await pgError(t.client, () => q.run(t.client, true))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "no_such_column" does not exist",
      }
    `);
  });

  it('queryListener and resultListener see every run, no-ops included', async () => {
    const seen: unknown[] = [];
    db.setConfig({
      queryListener: (query, txnId) => seen.push(['query', query, txnId]),
      resultListener: (result, txnId, elapsedMs, query) => seen.push(['result', result, txnId, typeof elapsedMs, query?.text]),
    });
    await sql`SELECT ${param(1)}::int AS one`.run(t.client);
    const noop = sql`SELECT 2`;
    noop.noop = true;
    noop.noopResult = 'none';
    await noop.run(t.client);
    expect(seen).toMatchInlineSnapshot(`
      [
        [
          "query",
          {
            "text": "SELECT $1::int AS one",
            "values": [
              1,
            ],
          },
          undefined,
        ],
        [
          "result",
          [
            {
              "one": 1,
            },
          ],
          undefined,
          "number",
          "SELECT $1::int AS one",
        ],
        [
          "query",
          {
            "text": "/* marked no-op: won't hit DB unless forced -> */ SELECT 2",
            "values": [],
          },
          undefined,
        ],
        [
          "result",
          "none",
          undefined,
          "number",
          "/* marked no-op: won't hit DB unless forced -> */ SELECT 2",
        ],
      ]
    `);
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// What a hostile identifier achieves today, run against the fixture (compiled text:
// test/unit/injection.test.ts). A test named `characterization:` is not fixed yet
// (chapter 2).
// Payloads stay harmless and inside this file's database: a SELECT, or the UPDATE
// below, undone by the ROLLBACK that ends each test (test/helpers/db.ts); a test reads
// the row on its own connection before that ROLLBACK, where an UPDATE that ran would show.
// pg sends a query with parameters through the extended protocol, which refuses
// several statements; a query without parameters goes through the simple protocol,
// which runs them all.

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, vals, all } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';
import { builtinObjects } from '../helpers/builtinObjects';
import { hostileArrayCasts, hostileCasts } from '../helpers/hostileCasts';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

const update = `UPDATE users SET display_name = 'injected' WHERE id = 1`;
const adaName = async (queryable: pg.ClientBase | pg.Pool = t.client) =>
  (await queryable.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = 1')).rows[0]!.display_name;

const identifierQueries = (input: string) => ({
  column: sql`SELECT ${input} FROM ${'users'}`,
  table: sql`SELECT 1 FROM ${input}`,
  key: sql`SELECT 1 FROM ${'users'} WHERE ${{ [input]: 1 }}`,
});

/** What each input gives in each query (by default as a column, a table and a Whereable key): its rows, or its error code. */
const identifierOutcomes = async (
  inputs: Record<string, string>,
  queries: (input: string) => Record<string, { run: (client: pg.ClientBase) => Promise<unknown> }> = identifierQueries,
) => {
  const outcomes: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(inputs)) {
    for (const [where, q] of Object.entries(queries(input))) {
      await t.client.query('SAVEPOINT pgcast_identifier');
      try {
        outcomes[`${name} ${where}`] = await q.run(t.client);
        // read before the savepoint goes: a second statement that ran shows here
        if (await adaName() !== 'Ada') outcomes[`${name} ${where}`] = 'injected';
        await t.client.query('RELEASE SAVEPOINT pgcast_identifier');
      } catch (err) {
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_identifier');
        outcomes[`${name} ${where}`] = (err as { code?: string }).code;
      }
    }
  }
  return outcomes;
};

/** What `SELECT CAST(<value> AS <cast>)` gives for each cast: its rows, its error code, or 'injected'. */
const castOutcomes = async (casts: Record<string, string>, value: unknown = '1') => {
  const outcomes: Record<string, unknown> = {};
  for (const [name, cast] of Object.entries(casts)) {
    await t.client.query('SAVEPOINT pgcast_cast');
    try {
      outcomes[name] = await sql`SELECT ${param(value, cast)} AS v`.run(t.client);
      // read before the savepoint goes: a second statement that ran shows here
      if (await adaName() !== 'Ada') outcomes[name] = 'injected';
      await t.client.query('RELEASE SAVEPOINT pgcast_cast');
    } catch (err) {
      await t.client.query('ROLLBACK TO SAVEPOINT pgcast_cast');
      outcomes[name] = (err as { code?: string }).code;
    }
  }
  return outcomes;
};

describe('values are data', () => {
  it('a hostile value in a Whereable is sent as a parameter', async () => {
    const q = db.select('users', { display_name: `Ada' OR '1' = '1` });
    expect(await q.run(t.client)).toEqual([]);
  });

  it('a hostile string in the updateValues of upsert is stored as it is, and runs nothing', async () => {
    // compiled text: test/unit/injection.test.ts; under 6.6.1 each was an identifier, and `reads`
    // closed its quotes to read every email into Bob's name
    const inputs: Record<string, string> = {
      dquote: 'a"b', squote: "a'b", semicolon: 'a;b', dashes: 'a--b', comment: 'a/*b', dollar: 'a$1b',
      backslash: 'a\\b', nul: 'a\0b', dot: 'a.b', lone: '"', prequoted: '"a"', qualified: 'users.display_name',
      closes: `display_name" FROM users; ${update}; SELECT "display_name`,
      reads: `xmin" || (SELECT string_agg(email::text, ',') FROM users) || "xmin`,
    };
    const outcomes: Record<string, unknown> = {};
    for (const [name, input] of Object.entries(inputs)) {
      await t.client.query('SAVEPOINT pgcast_update_value');
      try {
        const row = await db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
          updateColumns: [], updateValues: { display_name: input }, returning: ['display_name'],
        }).run(t.client);
        // read before the savepoint goes: a second statement that ran shows here
        outcomes[name] = row?.display_name === input && await adaName() === 'Ada' ? 'stored' : row?.display_name;
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_update_value');
      } catch (err) {
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_update_value');
        outcomes[name] = (err as { code?: string }).code;
      }
    }
    // a NUL is refused in any text parameter (22021)
    expect(outcomes).toEqual(Object.fromEntries(Object.keys(inputs).map(name => [name, name === 'nul' ? '22021' : 'stored'])));
  });

  it('null stays a NULL parameter, beside a hostile key that stays one column name', async () => {
    expect(await sql`SELECT ${param(null)}::text AS v, ${{ display_name: null }} AS m FROM ${'users'} WHERE id = 1`.run(t.client)).toEqual([{ v: null, m: null }]);
    const key = `display_name" IS NULL OR TRUE OR "`;
    expect(await pgError(t.client, () => sql`SELECT id FROM ${'users'} WHERE ${{ [key]: null }}`.run(t.client))).toEqual({
      code: '42703', message: `column "${key}" does not exist`,
    });
    expect(await adaName()).toBe('Ada');
  });
});

describe('with parameters (extended protocol)', () => {
  it('a `"` in a Whereable key stays in one column name, which does not exist', async () => {
    // 6.6.1: `("id" IS NOT NULL OR "id" = $2)`, every row instead of none
    const q = db.select('users', { ['id" IS NOT NULL OR "id']: 0 } as any, { columns: ['id'], order: { by: 'id', direction: 'ASC' } });
    expect(q.compile().text).toContain(`WHERE ("id"" IS NOT NULL OR ""id" = $2)`);
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "id" IS NOT NULL OR "id" does not exist",
      }
    `);
  });

  it('a column whose name has a `"` is reached by its name, or hand-escaped as under 6.6.1', async () => {
    await t.client.query(`CREATE TABLE "my""table" ("my""col" int); INSERT INTO "my""table" VALUES (1)`);
    expect(await sql`SELECT ${'my"col'} AS v FROM ${'my"table'} WHERE ${{ 'my"col': 1 }}`.run(t.client)).toEqual([{ v: 1 }]);
    expect(await sql`SELECT ${'my""col'} AS v FROM ${'my""table'} WHERE ${{ 'my""col': 1 }}`.run(t.client)).toEqual([{ v: 1 }]);
    // select() too, now that "sq_<table>" doubles the `"` (6.6.1: `AS "sq_my"table"`, a syntax error)
    expect(await db.select('my"table' as any, { 'my"col': 1 } as any).run(t.client)).toEqual([{ 'my"col': 1 }]);
    expect(await db.select('my""table' as any, all).run(t.client)).toEqual([{ 'my"col': 1 }]);
  });

  it('a lateral key that closes its quotes stays one alias, and is still the key of the result', async () => {
    // 6.6.1: `"lateral_x" ON true) AS "sq_users"; …; --".result` in the select list, a syntax error
    const key = `x" ON true) AS "sq_users"; ${update}; --`;
    const q = db.select('users', all, {
      columns: ['id'], order: { by: 'id', direction: 'ASC' }, limit: 1,
      lateral: { [key]: db.count('accounts', { owner_id: db.parent('id') }) },
    } as any);
    expect(await q.run(t.client)).toEqual([{ id: 1, [key]: 2 }]);
    expect(await adaName()).toBe('Ada');
  });

  it('a lateral key that opens a string across its two places is one alias, and reads no other table', async () => {
    // 6.6.1, and master before this fix: the `'` of the first `"lateral_…"` closes in the second, and
    // between them a lateral that reads every email; the key held
    // `("Ada@Example.com,bob@example.com,cyd@example.com")) AS result FROM … || `
    const key = `x" || ') AS result FROM "users" LEFT JOIN LATERAL (SELECT (SELECT string_agg(email::text, chr(44)) FROM users) AS result) AS "lateral_x`;
    const q = db.selectOne('users', { id: 1 }, {
      columns: ['id'], lateral: { [key]: db.count('accounts', { owner_id: db.parent('id') }) },
    } as any);
    expect(q.compile().values).toHaveLength(4);
    expect(await q.run(t.client)).toEqual({ id: 1, [key]: 2 });
  });

  it('an alias that adds a GROUP BY to "sq_<alias>" is one alias, and every row comes back', async () => {
    // 6.6.1, and master before this fix: `) AS "sq_x" ("result") GROUP BY "result"`, one row per
    // distinct result, of which only the first came back: `[{ email: 'bob@example.com' }]`
    const q = db.select('users', all, { columns: ['email'], alias: 'x" ("result") GROUP BY "result' } as any);
    expect(q.compile().values).toHaveLength(1);
    expect((await q.run(t.client)).map(u => u.email).sort())
      .toEqual(['Ada@Example.com', 'bob@example.com', 'cyd@example.com']);
  });

  it('a `"` in a string identifier stays in one column name with parameters too', async () => {
    // 6.6.1: `SELECT "display_name" FROM users; UPDATE …; SELECT "display_name" FROM "users" WHERE ("id" = $1)`,
    // refused by pg (42601, multiple commands in a prepared statement)
    const column = `display_name" FROM users; ${update}; SELECT "display_name`;
    const q = sql`SELECT ${column} FROM ${'users'} WHERE ${{ id: 1 }}`;
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "display_name" FROM users; UPDATE users SET display_name = 'inje" does not exist",
      }
    `);
  });

  it('a `"` in a param cast stays in one type name, which does not exist', async () => {
    // `CAST($1 AS "text"") || (SELECT …) || CAST('' AS ""text")`: one quoted type name
    const cast = `text") || (SELECT display_name FROM users WHERE id = 1) || CAST('' AS "text`;
    const q = sql`SELECT ${param('x', cast)} AS v`;
    expect(q.compile().text).toBe(`SELECT CAST($1 AS "text"") || (SELECT display_name FROM users WHERE id = 1) || CAST('' AS ""text") AS v`);
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42704",
        "message": "type "text") || (SELECT display_name FROM users WHERE id = 1) || CAST" does not exist",
      }
    `);
  });

  it('a dotted cast that splices SQL stays in its type names, the first one a schema that does not exist', async () => {
    // short enough for Postgres to name it whole (an identifier is cut at 63 bytes)
    const q = sql`SELECT ${param('{1}', 'int4; DELETE FROM users; --.int4[]')} AS v`;
    expect(q.compile().text).toBe('SELECT CAST($1 AS "int4; DELETE FROM users; --"."int4"[]) AS v');
    expect(await pgError(t.client, () => q.run(t.client)))
      .toEqual({ code: '3F000', message: 'schema "int4; DELETE FROM users; --" does not exist' });
  });

  it('no hostile cast reads anything: each is a missing type, a syntax error or a harmless name', async () => {
    // compiled text: test/unit/injection.test.ts; a row would show what the cast let through.
    // Rows: pg_catalog.int4, with whitespace around the dot as in 6.6.1, or dotted, or already quoted;
    // a comment between the parts (commentBetween, lineCommentBetween) returned 1 under 6.6.1 and is
    // now one missing type
    const outcomes = await castOutcomes(hostileCasts);
    // `\v` is whitespace from Postgres 17 (scan.l); before, a syntax error
    const { verticalTab, ...others } = outcomes;
    const { rows: [{ version }] } = await t.client.query("SELECT current_setting('server_version_num')::int AS version");
    expect(verticalTab).toEqual(version >= 170000 ? [{ v: 1 }] : '42601');
    expect(others).toMatchInlineSnapshot(`
      {
        "closes": "42704",
        "comment": "42704",
        "commentBetween": "42704",
        "dotted": [
          {
            "v": 1,
          },
        ],
        "dottedBackslash": "3F000",
        "dottedComment": "3F000",
        "dottedDashes": "3F000",
        "dottedDollar": "3F000",
        "dottedEmpty": "42601",
        "dottedNul": "08P01",
        "dottedPrequoted": [
          {
            "v": 1,
          },
        ],
        "dottedSemicolon": "3F000",
        "dottedSquote": "42704",
        "dquote": "42704",
        "empty": "42601",
        "emptyLast": "42704",
        "emptyPart": "42704",
        "escaped": "42704",
        "leadingDot": "42601",
        "lineCommentBetween": "42704",
        "lone": "42704",
        "newlineInside": "42704",
        "newlineOutside": [
          {
            "v": 1,
          },
        ],
        "nul": "08P01",
        "nulQualified": "08P01",
        "oddQuotes": "42704",
        "operator": "42704",
        "otherSpaces": [
          {
            "v": 1,
          },
        ],
        "prequoted": "42704",
        "prequotedDot": "42704",
        "qualified": [
          {
            "v": 1,
          },
        ],
        "qualifiedCloses": "42704",
        "spacesAroundDot": [
          {
            "v": 1,
          },
        ],
        "tabsAroundDot": [
          {
            "v": 1,
          },
        ],
        "threeParts": "0A000",
        "trailingDot": "42704",
      }
    `);
  });
});

describe('array bounds in a cast', () => {
  it('no hostile array cast reads anything: each is a missing type, a syntax error or a malformed array', async () => {
    // compiled text: test/unit/injection.test.ts; 22P02: '1' is no array literal, so the type was found
    expect(await castOutcomes(hostileArrayCasts)).toEqual({
      array: '22P02',
      arrayBounds: '22P02',
      arrayDotted: '22P02',
      arrayQualified: '22P02',
      arrayPrequoted: '22P02',
      arrayOnly: '42601',
      arrayAfterQuote: '42704',
      arrayCloses: '42704',
      arrayInside: '42704',
      arraySplice: '42704',
      arraySemicolon: '42704',
      arraySpace: '42704',
      arrayNegative: '42704',
      arrayUnclosed: '42704',
      arrayNested: '42704',
      arrayNul: '08P01',
      arrayBackslash: '42704',
    });
  });
});

describe('a cast under castArrayParamsToJson and castObjectParamsToJson', () => {
  afterEach(resetConfig);

  it('no hostile cast reads or writes anything, on an array or a plain object', async () => {
    // compiled text: test/unit/injection.test.ts; 6.6.1 dropped each cast for CAST($1 AS "json").
    // A row is a type that was found; `\v` is whitespace from Postgres 17 only, so it is left out
    db.setConfig({ castArrayParamsToJson: true, castObjectParamsToJson: true });
    const casts: Record<string, string> = {
      ...hostileCasts, ...hostileArrayCasts,
      updateBounds: `int4; ${update}; --[]`,
      updateCloses: `int4") || 1; ${update}; --("int4[]`,
    };
    delete casts.verticalTab;
    expect(sql`${param([1, 2], casts.updateBounds)}`.compile())
      .toEqual({ text: `CAST($1 AS "int4; ${update}; --"[])`, values: [[1, 2]] });
    expect(sql`${param({ a: 1 }, casts.updateCloses)}`.compile())
      .toEqual({ text: `CAST($1 AS "int4"") || 1; ${update}; --(""int4"[])`, values: ['{"a":1}'] });
    const summary = (outcomes: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(outcomes).map(([name, o]) => [name, Array.isArray(o) ? JSON.stringify(o) : o]));
    expect({ array: summary(await castOutcomes(casts, [1, 2])), object: summary(await castOutcomes(casts, { a: 1 })) })
      .toMatchInlineSnapshot(`
        {
          "array": {
            "array": "[{"v":[1,2]}]",
            "arrayAfterQuote": "42704",
            "arrayBackslash": "42704",
            "arrayBounds": "[{"v":[1,2]}]",
            "arrayCloses": "42704",
            "arrayDotted": "[{"v":[1,2]}]",
            "arrayInside": "42704",
            "arrayNegative": "42704",
            "arrayNested": "42704",
            "arrayNul": "08P01",
            "arrayOnly": "42601",
            "arrayPrequoted": "[{"v":[1,2]}]",
            "arrayQualified": "[{"v":[1,2]}]",
            "arraySemicolon": "42704",
            "arraySpace": "42704",
            "arraySplice": "42704",
            "arrayUnclosed": "42704",
            "closes": "42704",
            "comment": "42704",
            "commentBetween": "42704",
            "dotted": "22P02",
            "dottedBackslash": "3F000",
            "dottedComment": "3F000",
            "dottedDashes": "3F000",
            "dottedDollar": "3F000",
            "dottedEmpty": "42601",
            "dottedNul": "08P01",
            "dottedPrequoted": "22P02",
            "dottedSemicolon": "3F000",
            "dottedSquote": "42704",
            "dquote": "42704",
            "empty": "42601",
            "emptyLast": "42704",
            "emptyPart": "42704",
            "escaped": "42704",
            "leadingDot": "42601",
            "lineCommentBetween": "42704",
            "lone": "42704",
            "newlineInside": "42704",
            "newlineOutside": "22P02",
            "nul": "08P01",
            "nulQualified": "08P01",
            "oddQuotes": "42704",
            "operator": "42704",
            "otherSpaces": "22P02",
            "prequoted": "42704",
            "prequotedDot": "42704",
            "qualified": "22P02",
            "qualifiedCloses": "42704",
            "spacesAroundDot": "22P02",
            "tabsAroundDot": "22P02",
            "threeParts": "0A000",
            "trailingDot": "42704",
            "updateBounds": "42704",
            "updateCloses": "42704",
          },
          "object": {
            "array": "22P02",
            "arrayAfterQuote": "42704",
            "arrayBackslash": "42704",
            "arrayBounds": "22P02",
            "arrayCloses": "42704",
            "arrayDotted": "22P02",
            "arrayInside": "42704",
            "arrayNegative": "42704",
            "arrayNested": "42704",
            "arrayNul": "08P01",
            "arrayOnly": "42601",
            "arrayPrequoted": "22P02",
            "arrayQualified": "22P02",
            "arraySemicolon": "42704",
            "arraySpace": "42704",
            "arraySplice": "42704",
            "arrayUnclosed": "42704",
            "closes": "42704",
            "comment": "42704",
            "commentBetween": "42704",
            "dotted": "22P02",
            "dottedBackslash": "3F000",
            "dottedComment": "3F000",
            "dottedDashes": "3F000",
            "dottedDollar": "3F000",
            "dottedEmpty": "42601",
            "dottedNul": "08P01",
            "dottedPrequoted": "22P02",
            "dottedSemicolon": "3F000",
            "dottedSquote": "42704",
            "dquote": "42704",
            "empty": "42601",
            "emptyLast": "42704",
            "emptyPart": "42704",
            "escaped": "42704",
            "leadingDot": "42601",
            "lineCommentBetween": "42704",
            "lone": "42704",
            "newlineInside": "42704",
            "newlineOutside": "22P02",
            "nul": "08P01",
            "nulQualified": "08P01",
            "oddQuotes": "42704",
            "operator": "42704",
            "otherSpaces": "22P02",
            "prequoted": "42704",
            "prequotedDot": "42704",
            "qualified": "22P02",
            "qualifiedCloses": "42704",
            "spacesAroundDot": "22P02",
            "tabsAroundDot": "22P02",
            "threeParts": "0A000",
            "trailingDot": "42704",
            "updateBounds": "42704",
            "updateCloses": "42704",
          },
        }
      `);
  });
});

describe('a Parameter in a Whereable, in isIn or in vals', () => {
  it('a hostile cast does what it does in sql`${param(x, cast)}`, and reads nothing', async () => {
    // compiled text: test/unit/injection.test.ts; outcomes of the cast alone: "no hostile cast reads anything"
    // (array casts compile the same in each place too, but an array against an int4 column fails on its type)
    const outcome = async (q: db.SQLFragment<any[]>) => {
      await t.client.query('SAVEPOINT pgcast_cast');
      try {
        const rows = await q.run(t.client);
        // read before the savepoint goes: a second statement that ran shows here
        return rows.length === 1 && await adaName() === 'Ada' ? 'one row' : rows;
      } catch (err) {
        return (err as { code?: string }).code;
      } finally {
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_cast');
      }
    };
    for (const [name, cast] of Object.entries(hostileCasts)) {
      const alone = await outcome(sql`SELECT ${param('1', cast)} AS v`);
      expect({
        name,
        whereable: await outcome(sql`SELECT ${'id'} FROM ${'users'} WHERE ${{ id: param('1', cast) }}`),
        isIn: await outcome(sql`SELECT ${'id'} FROM ${'users'} WHERE ${{ id: db.conditions.isIn([param('1', cast)]) }}`),
        vals: await outcome(sql`INSERT INTO ${'extra.type_zoo'} (${'c_int4'}) VALUES (${vals([param('1', cast)])}) RETURNING ${'id'}`),
      }).toEqual({ name, whereable: alone, isIn: alone, vals: alone });
    }
  });

  it('a hostile value is sent as a parameter', async () => {
    expect(await db.select('users', { display_name: param(`Ada' OR '1' = '1`) }).run(t.client)).toEqual([]);
    expect(await db.select('users', { display_name: db.conditions.isIn([param(`Ada' OR '1' = '1`)]) }).run(t.client)).toEqual([]);
  });
});

describe('without parameters (simple protocol)', () => {
  it('a `"` in a string identifier stays in one column name, which does not exist', async () => {
    // 6.6.1: `SELECT "display_name" FROM users; UPDATE …; SELECT "display_name" FROM "users"`, three statements
    const column = `display_name" FROM users; ${update}; SELECT "display_name`;
    expect(await pgError(t.client, () => sql`SELECT ${column} FROM ${'users'}`.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "display_name" FROM users; UPDATE users SET display_name = 'inje" does not exist",
      }
    `);
  });

  it('a string that already reads as quoted names is written as is, and stays one name', async () => {
    // as in 6.6.1: `""` is a `"` inside the name, so the SQL around it stays in the name
    const column = `display_name"" FROM users; ${update}; SELECT ""display_name`;
    const q = sql`SELECT ${column}, ${`users.${column}`} FROM ${'users'}`;
    expect(q.compile().text).toBe(`SELECT "${column}", "users"."${column}" FROM "users"`);
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column "display_name" FROM users; UPDATE users SET display_name = 'inje" does not exist",
      }
    `);
    expect(await pgError(t.client, () => sql`SELECT ${`users.${column}`} FROM ${'users'}`.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column users.display_name" FROM users; UPDATE users SET display_name = 'inje does not exist",
      }
    `);
  });

  it('no hostile string identifier runs SQL of its own, as a column, a table or a Whereable key', async () => {
    // compiled text: test/unit/injection.test.ts; each error is a name that does not exist, a
    // cross-database reference (0A000) or a NUL refused by the protocol, and an error runs nothing after it
    expect(await identifierOutcomes({
      dquote: 'a"b', squote: "a'b", semicolon: 'a;b', dashes: 'a--b', comment: 'a/*b', dollar: 'a$1b',
      backslash: 'a\\b', nul: 'a\0b', dot: 'a.b',
      closes: `display_name" FROM users; ${update}; SELECT "display_name`,
      qualifiedCloses: `users"."display_name" FROM users; ${update}; SELECT "display_name`,
      escapedCloses: 'a"" OR TRUE OR ""b', qualifiedEscaped: 's.a"" OR TRUE OR ""b', escapedDot: 'a"."b',
      escapedOdd: 'a"""b',
      prequotedEscaped: '"a"" OR TRUE OR ""b"', prequotedEmpty: '""', lone: '"',
      prequotedCloses: `"display_name" FROM users; ${update}; SELECT "display_name"`,
      mixedEscaped: '"s".a$1."b"" OR TRUE OR ""c"', unicodeEscaped: '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"',
      unicodeCloses: '"s".U&"a\\" OR TRUE OR \\"b"', uescape: `"s".U&"a" UESCAPE '!' || "b"`,
      mixedCloses: `"users".display_name FROM users; ${update}; SELECT "display_name"`,
      unicodeSplice: `"users".U&"display_name" FROM users; ${update}; SELECT U&"display_name"`,
    })).toMatchInlineSnapshot(`
      {
        "backslash column": "42703",
        "backslash key": "42703",
        "backslash table": "42P01",
        "closes column": "42703",
        "closes key": "42703",
        "closes table": "42P01",
        "comment column": "42703",
        "comment key": "42703",
        "comment table": "42P01",
        "dashes column": "42703",
        "dashes key": "42703",
        "dashes table": "42P01",
        "dollar column": "42703",
        "dollar key": "42703",
        "dollar table": "42P01",
        "dot column": "42P01",
        "dot key": "42P01",
        "dot table": "42P01",
        "dquote column": "42703",
        "dquote key": "42703",
        "dquote table": "42P01",
        "escapedCloses column": "42703",
        "escapedCloses key": "42703",
        "escapedCloses table": "42P01",
        "escapedDot column": "42703",
        "escapedDot key": "42703",
        "escapedDot table": "42P01",
        "escapedOdd column": "42703",
        "escapedOdd key": "42703",
        "escapedOdd table": "42P01",
        "lone column": "42703",
        "lone key": "42703",
        "lone table": "42P01",
        "mixedCloses column": "42P01",
        "mixedCloses key": "42P01",
        "mixedCloses table": "42P01",
        "mixedEscaped column": "42P01",
        "mixedEscaped key": "42P01",
        "mixedEscaped table": "0A000",
        "nul column": "08P01",
        "nul key": "08P01",
        "nul table": "08P01",
        "prequotedCloses column": "42703",
        "prequotedCloses key": "42703",
        "prequotedCloses table": "42P01",
        "prequotedEmpty column": "42703",
        "prequotedEmpty key": "42703",
        "prequotedEmpty table": "42P01",
        "prequotedEscaped column": "42703",
        "prequotedEscaped key": "42703",
        "prequotedEscaped table": "42P01",
        "qualifiedCloses column": "42P01",
        "qualifiedCloses key": "42P01",
        "qualifiedCloses table": "42P01",
        "qualifiedEscaped column": "42P01",
        "qualifiedEscaped key": "42P01",
        "qualifiedEscaped table": "42P01",
        "semicolon column": "42703",
        "semicolon key": "42703",
        "semicolon table": "42P01",
        "squote column": "42703",
        "squote key": "42703",
        "squote table": "42P01",
        "uescape column": "42P01",
        "uescape key": "42P01",
        "uescape table": "42P01",
        "unicodeCloses column": "42P01",
        "unicodeCloses key": "42P01",
        "unicodeCloses table": "42P01",
        "unicodeEscaped column": "42P01",
        "unicodeEscaped key": "42P01",
        "unicodeEscaped table": "42P01",
        "unicodeSplice column": "42P01",
        "unicodeSplice key": "42P01",
        "unicodeSplice table": "42P01",
      }
    `);
  });

  it('a `"` in the column of parent() in isIn stays in one column name, which does not exist', async () => {
    // compiled as a Whereable value of parent() is (#107); 6.6.1 sent it as a parameter, '{"value":…}'
    const column = `id"))); ${update}; --`;
    const q = sql`SELECT (SELECT count(*) FROM ${'accounts'} WHERE ${{ owner_id: db.conditions.isIn([db.parent(column)]) }}) AS n FROM ${'users'}`
      .copy({ parentTable: 'users' });
    const { text, values } = q.compile();
    expect(text).toBe(`SELECT (SELECT count(*) FROM "accounts" WHERE (("owner_id" IN ("users"."id""))); ${update}; --")))) AS n FROM "users"`);
    expect(values).toEqual([]);
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column users.id"))); UPDATE users SET display_name = 'injected' WHERE id = 1 does not exist",
      }
    `);
  });

  it('a `"` in the column of parent() in vals({…}) stays in one column name, which does not exist', async () => {
    // compiled as a Whereable value of parent() is (#259); 6.6.1 sent it as a parameter, '{"value":…}';
    // Postgres truncates the name to 63 bytes in its message
    const column = `id")); ${update}; --`;
    const q = sql`SELECT (SELECT x.a FROM (VALUES (${vals({ a: db.parent(column) })})) AS x(a)) AS n FROM ${'users'}`
      .copy({ parentTable: 'users' });
    const { text, values } = q.compile();
    expect(text).toBe(`SELECT (SELECT x.a FROM (VALUES ("users"."id"")); ${update}; --")) AS x(a)) AS n FROM "users"`);
    expect(values).toEqual([]);
    expect(await pgError(t.client, () => q.run(t.client))).toEqual({
      code: '42703', message: `column users.id")); ${update}; does not exist`,
    });
    expect(await adaName()).toBe('Ada');
  });

  it('a `"` in the key of vals({…}) given parent() with no column stays in one column name, which does not exist', async () => {
    // parent() takes its key as the column, as in a Whereable (#259); 6.6.1 sent it as a parameter, '{}'
    const key = `id")); ${update}; --`;
    const q = sql`SELECT (SELECT x.a FROM (VALUES (${vals({ [key]: db.parent() })})) AS x(a)) AS n FROM ${'users'}`
      .copy({ parentTable: 'users' });
    const { text, values } = q.compile();
    expect(text).toBe(`SELECT (SELECT x.a FROM (VALUES ("users"."id"")); ${update}; --")) AS x(a)) AS n FROM "users"`);
    expect(values).toEqual([]);
    expect(await pgError(t.client, () => q.run(t.client))).toEqual({
      code: '42703', message: `column users.id")); ${update}; does not exist`,
    });
    expect(await adaName()).toBe('Ada');
  });

  it('a lateral of an alias that closes its quotes, given parent() with no column, sends no query', async () => {
    // the alias is the parent table: 6.6.1 wrote it, then threw on `undefined`; now nothing of it is written (R58)
    const q = db.select('users', all, { alias: `u"; ${update}; --`, lateral: { n: sql`SELECT ${db.parent()} AS result` } } as any);
    const query = vi.spyOn(t.client, 'query');
    try {
      await expect(q.run(t.client)).rejects.toThrow('`db.parent()` with no column has no meaning here');
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
    }
    expect(await adaName()).toBe('Ada');
  });

  it('a lateral of an alias that closes its quotes, given null as its where, sends no query', async () => {
    const q = db.select('users', all, { alias: `u"; ${update}; --`, lateral: { n: db.selectOne('users', null as any) } } as any);
    const query = vi.spyOn(t.client, 'query');
    try {
      await expect(q.run(t.client)).rejects.toThrow('Interpolating `null` has no meaning in SQL');
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
    }
    expect(await adaName()).toBe('Ada');
  });

  it('an alias that closes its quotes stays one alias, in "sq_<alias>" too', async () => {
    // `) AS "sq_u"; UPDATE …; --"`; 6.6.1: a syntax error; since #74: a second statement that ran
    const q = db.select('users', all, { alias: `u"; ${update}; --`, order: { by: 'id', direction: 'ASC' } } as any);
    const { text, values } = q.compile();
    expect(text).toContain(`AS "sq_u""; ${update}; --"`);
    expect(values).toEqual([]);
    expect((await q.run(t.client)).map(u => u.id)).toEqual([1, 2, 3]);
    expect(await adaName()).toBe('Ada');
  });

  it('no hostile table name, alias or lateral key of select() runs SQL of its own', async () => {
    // compiled text: test/unit/injection.test.ts; rows are given as their number; a lateral key is
    // also a parameter, so its query goes through the extended protocol
    const rows = (q: db.SQLFragment<any[]>) => ({ run: async (client: pg.ClientBase) => `${(await q.run(client)).length} rows` });
    expect(await identifierOutcomes({
      dquote: 'a"b', squote: "a'b", semicolon: 'a;b', dashes: 'a--b', comment: 'a/*b', dollar: 'a$1b',
      backslash: 'a\\b', nul: 'a\0b', dot: 'a.b',
      closes: `a"; ${update}; --`,
      escapedCloses: 'a"" OR TRUE OR ""b', qualifiedEscaped: 's.a"" OR TRUE OR ""b', escapedDot: 'a"."b',
      escapedOdd: 'a"""b',
      prequoted: '"a"', prequotedEscaped: '"a"" OR TRUE OR ""b"', prequotedEmpty: '""', lone: '"',
      prequotedCloses: `"a"; ${update}; --"`,
      mixedEscaped: '"s".a$1."b"" OR TRUE OR ""c"', unicodeEscaped: '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"',
      unicodeCloses: '"s".U&"a\\" OR TRUE OR \\"b"', uescape: `"s".U&"a" UESCAPE '!' || "b"`,
    }, input => ({
      table: rows(db.select(input as any, all)),
      alias: rows(db.select('users', all, { alias: input } as any)),
      key: rows(db.select('users', all, { lateral: { [input]: db.count('accounts', { owner_id: db.parent('id') }) } } as any)),
    }))).toMatchInlineSnapshot(`
      {
        "backslash alias": "3 rows",
        "backslash key": "3 rows",
        "backslash table": "42P01",
        "closes alias": "3 rows",
        "closes key": "3 rows",
        "closes table": "42P01",
        "comment alias": "3 rows",
        "comment key": "3 rows",
        "comment table": "42P01",
        "dashes alias": "3 rows",
        "dashes key": "3 rows",
        "dashes table": "42P01",
        "dollar alias": "3 rows",
        "dollar key": "3 rows",
        "dollar table": "42P01",
        "dot alias": "42601",
        "dot key": "3 rows",
        "dot table": "42P01",
        "dquote alias": "3 rows",
        "dquote key": "3 rows",
        "dquote table": "42P01",
        "escapedCloses alias": "3 rows",
        "escapedCloses key": "3 rows",
        "escapedCloses table": "42P01",
        "escapedDot alias": "3 rows",
        "escapedDot key": "3 rows",
        "escapedDot table": "42P01",
        "escapedOdd alias": "3 rows",
        "escapedOdd key": "3 rows",
        "escapedOdd table": "42P01",
        "lone alias": "3 rows",
        "lone key": "3 rows",
        "lone table": "42P01",
        "mixedEscaped alias": "42601",
        "mixedEscaped key": "3 rows",
        "mixedEscaped table": "0A000",
        "nul alias": "08P01",
        "nul key": "08P01",
        "nul table": "08P01",
        "prequoted alias": "3 rows",
        "prequoted key": "3 rows",
        "prequoted table": "42P01",
        "prequotedCloses alias": "3 rows",
        "prequotedCloses key": "3 rows",
        "prequotedCloses table": "42P01",
        "prequotedEmpty alias": "3 rows",
        "prequotedEmpty key": "3 rows",
        "prequotedEmpty table": "42P01",
        "prequotedEscaped alias": "3 rows",
        "prequotedEscaped key": "3 rows",
        "prequotedEscaped table": "42P01",
        "qualifiedEscaped alias": "42601",
        "qualifiedEscaped key": "3 rows",
        "qualifiedEscaped table": "42P01",
        "semicolon alias": "3 rows",
        "semicolon key": "3 rows",
        "semicolon table": "42P01",
        "squote alias": "3 rows",
        "squote key": "3 rows",
        "squote table": "42P01",
        "uescape alias": "42601",
        "uescape key": "3 rows",
        "uescape table": "42P01",
        "unicodeCloses alias": "42601",
        "unicodeCloses key": "3 rows",
        "unicodeCloses table": "42P01",
        "unicodeEscaped alias": "42601",
        "unicodeEscaped key": "3 rows",
        "unicodeEscaped table": "42P01",
      }
    `);
  });

  it('a pre-quoted string that closes its quotes stays one column name, which does not exist', async () => {
    // 6.6.1: written as is, as anything that starts and ends with `"`, so a second statement ran
    const column = `"display_name" FROM users; ${update}; SELECT "display_name"`;
    const q = sql`SELECT ${column} FROM ${'users'}`;
    expect(q.compile().values).toEqual([]);
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42703",
        "message": "column ""display_name" FROM users; UPDATE users SET display_name = 'inj" does not exist",
      }
    `);
    expect(await adaName()).toBe('Ada');
  });

  it('a well-formed quoted name runs as before, as a column, a table, a Whereable key or order.by', async () => {
    const run = (column: string, table: string) =>
      sql`SELECT ${column} AS v FROM ${table} WHERE ${{ [column]: 'Ada' }}`.run(t.client);
    const order = (column: string) =>
      db.select('users', all, { columns: ['display_name'], order: { by: column as any, direction: 'DESC' } }).run(t.client);
    for (const [column, table] of [
      ['"display_name"', '"users"'], ['"users"."display_name"', '"public"."users"'],
      ['"users" . "display_name"', '"public" . "users"'], ['"users"\n.\n"display_name"', '"public"\t.\t"users"'],
      // unquoted and `U&` quoted parts after the first one, as 6.6.1 wrote them
      ['"public".users."display_name"', '"public".U&"users"'], ['"users".U&"display_name"', '"public" . u&"users"'],
      ['"users".U&"d\\0069splay_name"', '"public".U&"\\0075sers"'],
    ]) {
      expect(await run(column!, table!), column).toEqual([{ v: 'Ada' }]);
      expect((await order(column!)).map(u => u.display_name), column).toEqual(['Cyd', 'Bob', 'Ada']);
    }
  });

  it('a pre-quoted string that ran under 6.6.1 by closing its quotes now names something that does not exist', async () => {
    // 6.6.1 ran each of these in one place at least: an alias, a cast, an expression (`UESCAPE` too), a
    // collation, a comment between the parts, a sort or a second item, a clause; as a table, an alias, a
    // comment, a join or a second table
    expect(await identifierOutcomes({
      alias: '"display_name" AS "x"', cast: '"display_name"::"text"', concat: '"display_name" || "email"',
      uescape: `"users".U&"d!0069splay_name" UESCAPE '!' || "email"`,
      collate: '"display_name" COLLATE "C"', comment: '"users"/**/."display_name"',
      sort: '"display_name" DESC, "email"', second: '"display_name", "email"',
      clause: '"display_name" FROM "users" UNION SELECT "display_name"',
    }, input => ({
      column: sql`SELECT ${input} FROM ${'users'}`,
      order: db.select('users', all, { order: { by: input, direction: 'ASC' } } as any),
      groupBy: db.select('users', all, { columns: ['display_name', 'email'], groupBy: input } as any),
      key: sql`SELECT 1 FROM ${'users'} WHERE ${{ [input]: 'Ada' }}`,
    }))).toMatchInlineSnapshot(`
      {
        "alias column": "42703",
        "alias groupBy": "42703",
        "alias key": "42703",
        "alias order": "42703",
        "cast column": "42703",
        "cast groupBy": "42703",
        "cast key": "42703",
        "cast order": "42703",
        "clause column": "42703",
        "clause groupBy": "42703",
        "clause key": "42703",
        "clause order": "42703",
        "collate column": "42703",
        "collate groupBy": "42703",
        "collate key": "42703",
        "collate order": "42703",
        "comment column": "42P01",
        "comment groupBy": "42P01",
        "comment key": "42P01",
        "comment order": "42P01",
        "concat column": "42703",
        "concat groupBy": "42703",
        "concat key": "42703",
        "concat order": "42703",
        "second column": "42703",
        "second groupBy": "42703",
        "second key": "42703",
        "second order": "42703",
        "sort column": "42703",
        "sort groupBy": "42703",
        "sort key": "42703",
        "sort order": "42703",
        "uescape column": "42P01",
        "uescape groupBy": "42P01",
        "uescape key": "42P01",
        "uescape order": "42P01",
      }
    `);
    expect(await identifierOutcomes({
      alias: '"users" "u"', comment: '"public"/**/."users"', join: '"users" NATURAL JOIN "accounts"', second: '"users", "accounts"',
    }, input => ({ table: sql`SELECT 1 FROM ${input}` }))).toMatchInlineSnapshot(`
      {
        "alias table": "42P01",
        "comment table": "42P01",
        "join table": "42P01",
        "second table": "42P01",
      }
    `);
  });

  it('a pre-quoted alias that closes its quotes stays one alias, in FROM and to_jsonb() alike', async () => {
    // 6.6.1, and master before this fix: written as is in `to_jsonb(<alias>.*)` and `FROM "users" AS <alias>`
    const alias = `"u"; ${update}; --"`;
    const q = db.select('users', all, { alias, order: { by: 'id', direction: 'ASC' } } as any);
    const { text, values } = q.compile();
    expect(text).toContain(`to_jsonb("""u""; ${update}; --""".*)`);
    expect(text).toContain(`FROM "users" AS """u""; ${update}; --"""`);
    expect(values).toEqual([]);
    expect((await q.run(t.client)).map(u => u.id)).toEqual([1, 2, 3]);
    expect(await adaName()).toBe('Ada');
  });

  it('lock.for is checked before any query', () => {
    expect(() => db.select('users', all, { lock: { for: `UPDATE) AS x; ${update}; SELECT (1` } } as any))
      .toThrow(`Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'UPDATE) AS x; ${update}; SELECT (1'`);
  });

  it('the aggregate of select() is checked before any query', () => {
    const aggregate = `count(*) FROM users; ${update}; SELECT count`;
    expect(() => db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate))
      .toThrow(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);
  });

  it('a schema-qualified aggregate runs', async () => {
    expect(await db.select('users', all, {}, db.SelectResultMode.Numeric, 'pg_catalog.count').run(t.client)).toBe(3);
  });

  it('an aggregate with spaces around it runs', async () => {
    for (const aggregate of [' count', 'count ', '\tpg_catalog.count\n'])
      expect(await db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate).run(t.client), aggregate).toBe(3);
  });

  it('an aggregate in three parts, with spaces around the dot or U& quoted runs', async () => {
    const name = (await t.client.query<{ name: string }>('SELECT quote_ident(current_database()) AS name')).rows[0]!.name;
    for (const aggregate of [`${name}.pg_catalog.count`, 'pg_catalog . count', 'U&"c\\006Funt"'])
      expect(await db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate).run(t.client), aggregate).toBe(3);
  });

  it('an aggregate named as Postgres lexes it runs', async () => {
    // each name is created as written, then called by select(); the ROLLBACK drops them; étendue in NFD
    await t.client.query('CREATE SCHEMA my_schema');
    for (const aggregate of ['my$agg', 'a$1b', 'e\u0301tendue', '"my agg"', '"a""b"', '"Stats-2024"', 'my_schema."MyAgg"']) {
      await t.client.query(`CREATE AGGREGATE ${aggregate} (int) (sfunc = int4pl, stype = int, initcond = '0')`);
      expect(await db.select('users', all, { columns: ['id'] }, db.SelectResultMode.Numeric, aggregate).run(t.client), aggregate).toBe(6);
    }
  });
});

describe('raw as a write value', () => {
  it('raw(input) as an insert(), upsert() or update() value, or in vals({…}), rejects run() before any query', async () => {
    // 6.6.1 stored it as JSON, a parameter by accident; compiled as SQL it would run `update` (#259)
    const
      input = `'x')); ${update}; --`,
      outcomes: Record<string, string> = {},
      query = vi.spyOn(t.client, 'query');
    try {
      const queries = {
        insert: db.insert('users', { email: 'x@x.org', display_name: db.raw(input) }),
        upsert: db.upsert('users', { email: 'Ada@Example.com', display_name: db.raw(input) }, 'email'),
        update: db.update('users', { display_name: db.raw(input) }, { id: 1 }),
        sql: sql`INSERT INTO ${'users'} (${db.cols({ display_name: 1, email: 1 })}) VALUES (${vals({ display_name: db.raw(input), email: 'y@x.org' })})`,
      };
      for (const [name, q] of Object.entries(queries))
        outcomes[name] = await q.run(t.client).then(
          () => 'ran',
          (err: { code?: string, message: string }) =>
            err.message.startsWith('`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`') ? 'throws' : err.code ?? err.message);
      outcomes.queried = String(query.mock.calls.length);
    } finally {
      query.mockRestore();
    }
    expect(outcomes).toEqual({ insert: 'throws', upsert: 'throws', update: 'throws', sql: 'throws', queried: '0' });
    expect(await adaName()).toBe('Ada');
  });
});

describe('transaction', () => {
  it('the isolation level is checked before a client is checked out', async () => {
    // the pool would commit: connect() is stubbed, so a regression runs nothing either
    const connect = vi.spyOn(t.pool, 'connect').mockRejectedValue(new Error('connect() was called') as never);
    try {
      await expect(db.transaction(t.pool, `SERIALIZABLE; ${update}; SELECT 1` as any, async () => null))
        .rejects.toThrow(`Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'SERIALIZABLE; ${update}; SELECT 1'`);
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
    }
  });
});

describe('a built-in object as a filter', () => {
  it('throws before any query, through sql and the where of select, update and deletes', async () => {
    // 6.6.1 ran DELETE … WHERE TRUE for a Date (every row), or failed on a column "0" for a view (#170)
    const
      outcomes: Record<string, string> = {},
      query = vi.spyOn(t.client, 'query');
    try {
      for (const [name, x] of Object.entries(builtinObjects())) {
        const queries = {
          sql: sql`DELETE FROM ${'users'} WHERE ${x as any}`,
          select: db.select('users', x as any),
          update: db.update('users', { display_name: 'injected' }, x as any),
          deletes: db.deletes('users', x as any),
        };
        for (const [where, q] of Object.entries(queries))
          outcomes[`${name} ${where}`] = await q.run(t.client).then(
            () => 'ran',
            (err: { code?: string, message: string }) =>
              err.message.startsWith(`A built-in \`${name}\` has no meaning as a Whereable`) ? 'throws' : err.code ?? err.message);
      }
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
    }
    expect(Object.entries(outcomes).filter(([, outcome]) => outcome !== 'throws')).toEqual([]);
    expect(await adaName()).toBe('Ada');
  });

  it('an Error that type-checks as a Whereable of orgs, which has a name column, throws too', async () => {
    // no cast: the weak-type check takes an Error where a column shares one of its members (test/types/shortcuts.test-d.ts)
    await expect(db.deletes('orgs', new Error('x')).run(t.client))
      .rejects.toThrow('A built-in `Error` has no meaning as a Whereable (a filter)');
  });
});

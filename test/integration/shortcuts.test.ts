// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/shortcuts.ts against the fixture: what the SQL
// compiled in test/unit/shortcuts.test.ts returns, surprises included.
// Identity and serial values are never hard-coded: they are read back.

import * as pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, raw, cols, vals, parent, Default, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';
import { resetConfig } from '../helpers/config';

const t = useTestDatabase();

afterEach(resetConfig);

// runtime behaviour only: the types (stub schema here) are step 1.4's
const run = (q: db.SQLFragment<any>): Promise<any> => q.run(t.client);
const fails = (q: db.SQLFragment<any>) => pgError(t.client, () => q.run(t.client));
const scalar = async (text: string) => (await t.client.query(text)).rows[0].v;
/** RETURNING without ORDER BY gives no order: rows sorted by `key` before comparing. */
const sortBy = <R extends Record<string, any>>(rows: R[], key: keyof R) =>
  [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));

const
  wrapperAsValue = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value: to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`.',
  noParent = `The 'parent' table alias has no meaning here`,
  wrappers = { raw: raw("upper('Ada')"), cols: cols('display_name'), colsArray: cols(['display_name']), vals: vals('Ada'), valsObject: vals({ theme: 'dark' }) };

/**
 * What each write's run() gives, by name, each in a savepoint: the message of an Error thrown while compiling
 * (it has no code), Postgres's error code, or 'ran'; and `queriesSent`, the number of queries pgcast sent.
 */
const writeOutcomes = async (writes: Record<string, db.SQLFragment<any>>) => {
  const outcomes: Record<string, unknown> = {}, sent: unknown[] = [];
  db.setConfig({ queryListener: query => sent.push(query) });
  for (const [name, q] of Object.entries(writes)) {
    await t.client.query('SAVEPOINT write_value');
    outcomes[name] = await q.run(t.client).then(() => 'ran', (err: { code?: string, message: string }) => err.code ?? err.message);
    await t.client.query('ROLLBACK TO SAVEPOINT write_value');
  }
  return { ...outcomes, queriesSent: sent.length };
};
const everyOutcome = (writes: Record<string, unknown>, message: string) =>
  ({ ...Object.fromEntries(Object.keys(writes).map(name => [name, message])), queriesSent: 0 });

describe('insert', () => {
  it('one row: the inserted row as JSON, defaults applied', async () => {
    const row = await run(db.insert('users', { email: 'e@x.org', display_name: 'E', mood: 'ok' }));
    expect(row).toMatchInlineSnapshot({ id: expect.any(Number), created_at: expect.any(String) }, `
      {
        "created_at": Any<String>,
        "display_name": "E",
        "email": "e@x.org",
        "home": null,
        "id": Any<Number>,
        "manager_id": null,
        "mood": "ok",
        "settings": {},
        "tags": [],
      }
    `);
  });

  it('several rows with different keys: a missing key takes the column DEFAULT', async () => {
    const rows = await run(db.insert('users', [
      { email: 'a@x.org', display_name: 'A', settings: { theme: 'light' } },
      { mood: 'ok', email: 'b@x.org', display_name: 'B', manager_id: 1 },
    ], { returning: ['email', 'mood', 'manager_id', 'settings'] }));
    expect(sortBy(rows, 'email')).toMatchInlineSnapshot(`
      [
        {
          "email": "a@x.org",
          "manager_id": null,
          "mood": null,
          "settings": {
            "theme": "light",
          },
        },
        {
          "email": "b@x.org",
          "manager_id": 1,
          "mood": "ok",
          "settings": {},
        },
      ]
    `);
  });

  it('an empty array: [] without hitting the database', async () => {
    expect(await run(db.insert('users', []))).toEqual([]);
  });

  it('characterization: an empty array, forced, can still fail', async () => {
    // characterization: `INSERT INTO t SELECT null WHERE false` targets the first column, here GENERATED ALWAYS
    expect(await db.insert('memberships', []).run(t.client, true)).toEqual([]);
    expect(await pgError(t.client, () => db.insert('users', []).run(t.client, true))).toMatchInlineSnapshot(`
      {
        "code": "428C9",
        "message": "cannot insert a non-DEFAULT value into column "id"",
      }
    `);
  });

  it('returning and extras', async () => {
    expect(await run(db.insert('users', { email: 'e@x.org', display_name: 'Eve' }, {
      returning: ['email'], extras: { upper: sql`upper(${'display_name'})`, name: 'display_name' },
    }))).toMatchInlineSnapshot(`
      {
        "email": "e@x.org",
        "name": "Eve",
        "upper": "EVE",
      }
    `);
  });

  it('an undefined value inserts NULL without undefinedMeansMissing, the column DEFAULT with it', async () => {
    // deprecated (PGCAST_DEP002): accounts.balance is NOT NULL DEFAULT 0, yet `balance: undefined` sends NULL
    expect(await fails(db.insert('accounts', { owner_id: 1, balance: undefined }))).toMatchInlineSnapshot(`
      {
        "code": "23502",
        "message": "null value in column "balance" of relation "accounts" violates not-null constraint",
      }
    `);
    const row = await run(db.insert('accounts', { owner_id: 1, ratio: undefined, lifetime_ops: Default }, {
      returning: ['ratio', 'lifetime_ops'],
    }));
    expect(row).toEqual({ ratio: null, lifetime_ops: 0 });
    db.setConfig({ undefinedMeansMissing: true });
    expect(sortBy(await run(db.insert('accounts', [{ owner_id: 1, balance: undefined }, { owner_id: 1, balance: 5 }], {
      returning: ['balance'],
    })), 'balance')).toEqual([{ balance: 0 }, { balance: 5 }]);
  });

  it('raw(), cols(x) and vals(x) as values throw before any query; in an array or a jsonb object, they stay values', async () => {
    // R66: Zapatos 6.6.1 sent each as one parameter, as JSON ({"value":…}): stored on text and jsonb, 22P02
    // elsewhere; compiled as SQL, a raw(input) would be an injection, so each throws, as a filter value does
    const writes: Record<string, db.SQLFragment<any>> = {};
    for (const [name, w] of Object.entries(wrappers)) {
      for (const column of ['display_name', 'settings', 'manager_id', 'mood', 'tags', 'home'])
        writes[`${name} ${column}`] = db.insert('users', { email: 'r@x.org', display_name: 'R', [column]: w });
      writes[`${name} rows`] = db.insert('users', [{ email: 'r1@x.org', display_name: 'R' }, { email: 'r2@x.org', display_name: w }]);
      writes[`${name} any`] = db.insert('extra.type_zoo', { c_xml: w });
    }
    expect(await writeOutcomes(writes)).toEqual(everyOutcome(writes, wrapperAsValue));
    // in an array or a jsonb object, a wrapper is part of the value, sent as JSON: the type refuses it, and
    // finding it would walk every value of every write
    expect(await run(db.insert('users', { email: 'r3@x.org', display_name: 'R', tags: [raw("'admin'")], settings: { theme: vals('dark') } }, {
      returning: ['tags', 'settings'],
    }))).toEqual({ tags: [`{"value":"'admin'"}`], settings: { theme: { value: 'dark' } } });
  });
});

describe('upsert', () => {
  it('a conflicting row is updated ($action UPDATE), a new one inserted ($action INSERT)', async () => {
    const [updated, inserted] = sortBy(await run(db.upsert('users', [
      { email: 'ADA@example.com', display_name: 'Ada L.' },
      { email: 'new@x.org', display_name: 'New' },
    ], 'email', { returning: ['id', 'email', 'display_name'] })), 'email');
    expect(updated).toEqual({ id: 1, email: 'ADA@example.com', display_name: 'Ada L.', $action: 'UPDATE' });
    expect(inserted).toEqual({ id: expect.any(Number), email: 'new@x.org', display_name: 'New', $action: 'INSERT' });
  });

  it('characterization: the conflict column itself is rewritten', async () => {
    // characterization: updateColumns defaults to every inserted column, the conflict target included,
    // so a citext email that matched case-insensitively takes the new spelling (see above: ADA@example.com)
    const row = await run(db.upsert('users', { email: 'ada@EXAMPLE.com', display_name: 'Ada' }, 'email', {
      returning: ['email'],
    }));
    expect(row).toEqual({ email: 'ada@EXAMPLE.com', $action: 'UPDATE' });
  });

  it('several conflict columns, several rows', async () => {
    const rows = await run(db.upsert('products', [
      { sku: 'TEE', variant: 'S', price_cents: 1300, title: 'T-shirt S' },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ], ['sku', 'variant'], { returning: ['sku', 'variant', 'price_cents', 'title'] }));
    expect(sortBy(rows, 'sku')).toMatchInlineSnapshot(`
      [
        {
          "$action": "INSERT",
          "price_cents": 900,
          "sku": "CAP",
          "title": "Cap",
          "variant": "",
        },
        {
          "$action": "UPDATE",
          "price_cents": 1300,
          "sku": "TEE",
          "title": "T-shirt S",
          "variant": "S",
        },
      ]
    `);
  });

  it('in several rows, a key missing from one row overwrites with DEFAULT on UPDATE, without upsertRequiresSameKeys', async () => {
    // deprecated (PGCAST_DEP001): the missing key is filled with DEFAULT, then `SET title = EXCLUDED.title` erases the title
    const [, tee] = sortBy(await run(db.upsert('products', [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ], ['sku', 'variant'], { returning: ['sku', 'title'] })), 'sku');
    expect(tee).toEqual({ sku: 'TEE', title: null, $action: 'UPDATE' });
  });

  it('in several rows, a key missing from one row throws with upsertRequiresSameKeys, unless updateColumns is given', async () => {
    db.setConfig({ upsertRequiresSameKeys: true });
    const rows = [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ];
    expect(() => db.upsert('products', rows, ['sku', 'variant']))
      .toThrow('rows have different keys: pass updateColumns, or give every row the same keys');
    const [, tee] = sortBy(await run(db.upsert('products', rows, ['sku', 'variant'], {
      updateColumns: ['price_cents'], returning: ['sku', 'title', 'price_cents'],
    })), 'sku');
    expect(tee).toEqual({ sku: 'TEE', title: 'T-shirt small', price_cents: 1300, $action: 'UPDATE' });
  });

  it('with upsertRequiresSameKeys, new rows without their serial id among existing rows run, and nothing is overwritten', async () => {
    db.setConfig({ upsertRequiresSameKeys: true });
    const { id } = await run(db.selectExactlyOne('products', { sku: 'TEE', variant: 'S' }, { columns: ['id'] }));
    const [cap, tee] = sortBy(await run(db.upsert('products', [
      { id, sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900 },
    ], 'id', { returning: ['id', 'sku', 'title', 'price_cents'] })), 'sku');
    expect(tee).toEqual({ id, sku: 'TEE', title: 'T-shirt small', price_cents: 1300, $action: 'UPDATE' });
    expect(cap).toEqual({ id: expect.any(Number), sku: 'CAP', title: null, price_cents: 900, $action: 'INSERT' });
    expect(cap).not.toMatchObject({ id });
  });

  it('an undefined value: set from EXCLUDED as NULL without undefinedMeansMissing, left as it is with it', async () => {
    const tee = { sku: 'TEE', variant: 'S', price_cents: 1400, title: undefined };
    db.setConfig({ undefinedMeansMissing: true });
    expect(await run(db.upsert('products', tee, ['sku', 'variant'], { returning: ['title', 'price_cents'] })))
      .toEqual({ title: 'T-shirt small', price_cents: 1400, $action: 'UPDATE' });
    db.setConfig({ undefinedMeansMissing: false });  // deprecated (PGCAST_DEP002)
    expect(await run(db.upsert('products', tee, ['sku', 'variant'], { returning: ['title', 'price_cents'] })))
      .toEqual({ title: null, price_cents: 1400, $action: 'UPDATE' });
  });

  it('constraint()', async () => {
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'Bobby' },
      db.constraint('users_email_key'), { returning: ['id', 'display_name'] })))
      .toEqual({ id: 2, display_name: 'Bobby', $action: 'UPDATE' });
  });

  it('updateColumns: only those columns change', async () => {
    expect(await run(db.upsert('users', { email: 'ADA@EXAMPLE.COM', display_name: 'Ada L.', mood: 'sad' }, 'email', {
      updateColumns: ['display_name'], returning: ['email', 'display_name', 'mood'],
    }))).toEqual({ email: 'Ada@Example.com', display_name: 'Ada L.', mood: 'happy', $action: 'UPDATE' });
  });

  it('updateValues: a fragment computed from the existing row', async () => {
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'ignored' }, 'email', {
      updateColumns: [],
      updateValues: { display_name: sql`${'users'}.${'display_name'} || ${param('!')}` },
      returning: ['display_name'],
    }))).toEqual({ display_name: 'Bob!', $action: 'UPDATE' });
  });

  it('updateValues: a plain value is stored as it is', async () => {
    const createdAt = new Date('2020-01-02T03:04:05.000Z');
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
      updateColumns: [],
      updateValues: { display_name: 'Bobby', mood: 'happy', manager_id: null, settings: { theme: 'light' }, tags: ['a', 'b'], created_at: createdAt },
      returning: ['display_name', 'mood', 'manager_id', 'settings', 'tags'],
    }))).toEqual({ display_name: 'Bobby', mood: 'happy', manager_id: null, settings: { theme: 'light' }, tags: ['a', 'b'], $action: 'UPDATE' });
    expect(await scalar(`SELECT created_at = '2020-01-02T03:04:05Z' AS v FROM users WHERE email = 'bob@example.com'`)).toBe(true);
    const id = await scalar(`SELECT min(id) AS v FROM accounts WHERE owner_id = 2`);
    expect(await run(db.upsert('accounts', { id, owner_id: 2 }, 'id', {
      updateColumns: [], updateValues: { balance: 5, lifetime_ops: BigInt(42) }, returning: ['balance', 'lifetime_ops'],
    }))).toEqual({ balance: 5, lifetime_ops: 42, $action: 'UPDATE' });
  });

  it('updateValues: a string that named a column is now stored as text; in sql it reads the column, as before', async () => {
    const upsertBob = (displayName: any) => run(db.upsert('users', { email: 'bob@example.com', display_name: 'Robert' }, 'email', {
      updateColumns: [], updateValues: { display_name: displayName }, returning: ['display_name'],
    }));
    expect(await upsertBob('users.display_name')).toEqual({ display_name: 'users.display_name', $action: 'UPDATE' });
    // the same string in a fragment compiles to the same identifier as under 6.6.1
    expect(await upsertBob(sql`${'users.display_name'}`)).toEqual({ display_name: 'users.display_name', $action: 'UPDATE' });
    expect(await upsertBob(sql`${'excluded.display_name'}`)).toEqual({ display_name: 'Robert', $action: 'UPDATE' });
    // a bare column name is ambiguous here, between the existing row and EXCLUDED: it never ran
    expect(await fails(db.upsert('users', { email: 'bob@example.com', display_name: 'Robert' }, 'email', {
      updateColumns: [], updateValues: { display_name: sql`${'email'}` },
    }))).toMatchInlineSnapshot(`
      {
        "code": "42702",
        "message": "column reference "email" is ambiguous",
      }
    `);
  });

  it('updateValues: raw, param and Default compile as under 6.6.1', async () => {
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
      updateColumns: [], updateValues: { created_at: db.raw('now()'), mood: Default, display_name: param('Bobby') },
      returning: ['mood', 'display_name'],
    }))).toEqual({ mood: null, display_name: 'Bobby', $action: 'UPDATE' });
    expect(await scalar(`SELECT created_at = now() AS v FROM users WHERE email = 'bob@example.com'`)).toBe(true);
  });

  it('updateValues: an array that holds a pgcast object runs item by item, as under 6.6.1', async () => {
    const upsertBob = (displayName: any) => run(db.upsert('users', { email: 'bob@example.com', display_name: 'Robert' }, 'email', {
      updateColumns: [], updateValues: { display_name: displayName }, returning: ['display_name'],
    })).then(row => row.display_name);
    expect({
      sql: await upsertBob([sql`upper(`, sql`EXCLUDED.display_name`, sql`)`]),
      param: await upsertBob([param('Bobby')]),
      raw: await upsertBob([db.raw(`'Bobby'`)]),
      mapWithSeparator: await upsertBob(db.mapWithSeparator(['Bo', 'bby'], sql` || `, c => param(c))),
      // a string in such an array is an identifier, as in a sql template
      mixed: await upsertBob([sql`upper(`, 'excluded.display_name', sql`)`]),
    }).toEqual({ sql: 'ROBERT', param: 'Bobby', raw: 'Bobby', mapWithSeparator: 'Bobby', mixed: 'ROBERT' });
  });

  it('updateValues: a plain object that holds a pgcast object runs as under 6.6.1; one of plain values is stored', async () => {
    const upsertBob = (displayName: any) => run(db.upsert('users', { email: 'bob@example.com', display_name: 'Robert' }, 'email', {
      updateColumns: [], updateValues: { display_name: displayName }, returning: ['display_name'],
    })).then(row => row.display_name);
    expect({
      like: await upsertBob({ 'users.display_name': db.conditions.like('B%') }),
      sql: await upsertBob({ x: sql`'Robert'` }),
      inArray: await upsertBob([{ x: sql`'Bobby'` }]),
      // under 6.6.1, these gave TRUE or a comparison, stored as true; in sql, they still do
      empty: await upsertBob({}),
      emptyBuffer: await upsertBob(Buffer.alloc(0)),
      where: await upsertBob({ 'users.email': 'bob@example.com' }),
      emptyInSql: await upsertBob(sql`${{}}`),
      whereInSql: await upsertBob(sql`${{ 'users.email': 'bob@example.com' }}`),
    }).toEqual({
      like: 'true', sql: 'Robert', inArray: 'Bobby',
      empty: '{}', emptyBuffer: '', where: '{"users.email":"bob@example.com"}', emptyInSql: 'true', whereInSql: 'true',
    });
  });

  it('updateValues: a plain object that holds a Parameter compares with its value (#31); one that holds Default throws', async () => {
    // a Whereable of the existing row; 6.6.1 sent '{"value":"bob@example.com"}', and stored false (true for isNotIn) on both rows
    const upsertAdaBob = (displayName: any) => run(db.upsert('users',
      [{ email: 'Ada@Example.com', display_name: 'A' }, { email: 'bob@example.com', display_name: 'B' }], 'email', {
        updateColumns: [], updateValues: { display_name: displayName }, returning: ['email', 'display_name'],
      })).then((rows: { email: string; display_name: string }[]) => sortBy(rows, 'email').map(row => row.display_name));
    expect(await upsertAdaBob({ 'users.email': param('bob@example.com') })).toEqual(['false', 'true']);
    expect(await upsertAdaBob({ 'users.email': db.conditions.isNotIn([param('bob@example.com')]) })).toEqual(['true', 'false']);
    await expect(upsertAdaBob({ 'users.email': Default })).rejects.toThrow('`db.Default` has no meaning in a Whereable');
  });

  it('noNullUpdateColumns: a NULL does not overwrite (one column, a list, all)', async () => {
    const values = { email: 'ada@example.com', display_name: 'Ada', mood: null, manager_id: null };
    const returning = ['mood', 'manager_id'] as const;
    expect(await run(db.upsert('users', { ...values, email: 'bob@example.com' }, 'email', {
      noNullUpdateColumns: 'mood', returning,
    }))).toEqual({ mood: 'ok', manager_id: null, $action: 'UPDATE' });
    expect(await run(db.upsert('users', { ...values, email: 'cyd@example.com' }, 'email', {
      noNullUpdateColumns: ['mood', 'manager_id'], returning,
    }))).toEqual({ mood: 'sad', manager_id: 1, $action: 'UPDATE' });
    expect(await run(db.upsert('users', values, 'email', { noNullUpdateColumns: all, returning })))
      .toEqual({ mood: 'happy', manager_id: null, $action: 'UPDATE' });
  });

  it("reportAction: 'suppress'", async () => {
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', {
      reportAction: 'suppress', returning: ['display_name'],
    }))).toEqual({ display_name: 'Bob' });
  });

  it('doNothing: a conflicting row returns nothing', async () => {
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'X' }, 'email', {
      updateColumns: db.doNothing,
    }))).toBeUndefined();
    expect(await run(db.upsert('users', [
      { email: 'bob@example.com', display_name: 'X' }, { email: 'n@x.org', display_name: 'N' },
    ], 'email', { updateColumns: db.doNothing, returning: ['email'] }))).toEqual([{ email: 'n@x.org', $action: 'INSERT' }]);
    expect(await scalar(`SELECT display_name AS v FROM users WHERE id = 2`)).toBe('Bob');
  });

  it('an empty array: []', async () => {
    expect(await run(db.upsert('users', [], 'email'))).toEqual([]);
  });

  it('raw(), cols(x) and vals(x) as values throw before any query, on a conflicting row or a new one', async () => {
    // R66: 6.6.1 inserted the JSON, or set it from EXCLUDED on conflict; in updateValues they are SQL (above)
    const writes: Record<string, db.SQLFragment<any>> = {};
    for (const [name, w] of Object.entries(wrappers)) {
      writes[`${name} conflict`] = db.upsert('users', { email: 'bob@example.com', display_name: w }, 'email');
      writes[`${name} new`] = db.upsert('users', { email: 'u@x.org', display_name: 'U', settings: w }, 'email');
      writes[`${name} rows`] = db.upsert('users', [
        { email: 'cyd@example.com', display_name: 'Cyd', manager_id: 1 }, { email: 'u@x.org', display_name: 'U', manager_id: w },
      ], 'email');
      writes[`${name} beside updateValues`] = db.upsert('users', { email: 'bob@example.com', display_name: w }, 'email', {
        updateValues: { display_name: raw("upper('Bob')") },
      });
    }
    expect(await writeOutcomes(writes)).toEqual(everyOutcome(writes, wrapperAsValue));
  });
});

describe('update', () => {
  it('one column, every matching row returned', async () => {
    expect(sortBy(await run(db.update('accounts', { balance: 10 }, { owner_id: 1 }, { returning: ['id', 'balance'] })), 'id'))
      .toEqual([{ id: 1, balance: 10 }, { id: 2, balance: 10 }]);
  });

  it('fragments with self, Default, a fragment as the where clause, extras', async () => {
    expect(await run(db.update('accounts', { ratio: Default, balance: db.conditions.add(5), lifetime_ops: sql`${db.self} + 1` },
      sql`${'id'} = ${param(1)}`, { returning: ['ratio', 'balance'], extras: { ops: sql`${'lifetime_ops'}::text` } })))
      .toEqual([{ ratio: null, balance: 1505.5, ops: '9007199254740994' }]);
  });

  it('no matching row: []', async () => {
    expect(await run(db.update('accounts', { balance: 1 }, { id: -1 }))).toEqual([]);
  });

  it('no column at all throws before any query', async () => {
    expect(() => db.update('accounts', {}, { id: 1 }))
      .toThrow('nothing to update: an Updatable needs at least one column');
    // no query was sent, so the transaction is not aborted
    expect(await run(db.select('accounts', { id: 1 }, { columns: ['id'] }))).toEqual([{ id: 1 }]);
  });

  it('an undefined value sets the column to NULL without undefinedMeansMissing, leaves it with it', async () => {
    // deprecated (PGCAST_DEP002): Bob loses his manager; on a NOT NULL column the update fails
    expect(await run(db.update('users', { mood: 'sad', manager_id: undefined }, { id: 2 }, { returning: ['mood', 'manager_id'] })))
      .toEqual([{ mood: 'sad', manager_id: null }]);
    expect(await fails(db.update('users', { display_name: undefined }, { id: 2 }))).toMatchInlineSnapshot(`
      {
        "code": "23502",
        "message": "null value in column "display_name" of relation "users" violates not-null constraint",
      }
    `);
  });

  it('with undefinedMeansMissing, an undefined value leaves its column', async () => {
    db.setConfig({ undefinedMeansMissing: true });
    expect(await run(db.update('users', { mood: 'sad', manager_id: undefined }, { id: 3 }, { returning: ['mood', 'manager_id'] })))
      .toEqual([{ mood: 'sad', manager_id: 1 }]);
    expect(await run(db.update('users', { mood: 'ok', display_name: undefined }, { id: 2 }, { returning: ['display_name'] })))
      .toEqual([{ display_name: 'Bob' }]);
  });

  it('raw(), cols(x) and vals(x) as values throw before any query; in an array, they stay values', async () => {
    // R66: 6.6.1 stored the JSON: cols('display_name') did not read the column, it stored {"value":"display_name"}
    const writes: Record<string, db.SQLFragment<any>> = {};
    for (const [name, w] of Object.entries(wrappers)) {
      for (const column of ['display_name', 'settings', 'manager_id', 'mood', 'tags', 'home'])
        writes[`${name} ${column}`] = db.update('users', { [column]: w }, { id: 2 });
      writes[`${name} second key`] = db.update('users', { mood: 'ok', display_name: w }, { id: 2 });
      writes[`${name} any`] = db.update('extra.type_zoo', { c_xml: w }, sql`TRUE`);
    }
    expect(await writeOutcomes(writes)).toEqual(everyOutcome(writes, wrapperAsValue));
    expect(await run(db.update('users', { tags: [vals('x')] }, { id: 3 }, { returning: ['tags'] }))).toEqual([{ tags: ['{"value":"x"}'] }]);
  });
});

describe('parent() as a write value', () => {
  // an INSERT or an UPDATE has no parent query; the type refuses the call on every column it types (types/shortcuts)

  it('parent() as an insert(), upsert() or update() value throws before any query, as in vals([…])', async () => {
    // R65: 6.6.1 sent it as one parameter, as JSON ('{"value":"id"}', '{}' with no column): stored on text and
    // jsonb, an empty array in text[], set from EXCLUDED by upsert(), 22P02 on int, an enum or a composite
    const writes: Record<string, db.SQLFragment<any>> = {};
    for (const [name, p] of Object.entries({ "parent('id')": parent('id'), 'parent()': parent() })) {
      for (const column of ['display_name', 'settings', 'manager_id', 'mood', 'tags', 'home'])
        writes[`${name} insert ${column}`] = db.insert('users', { email: 'dan@example.com', display_name: 'Dan', [column]: p });
      writes[`${name} insert rows`] = db.insert('users', [{ email: 'e@x.org', display_name: 'E' }, { email: 'f@x.org', display_name: p }]);
      writes[`${name} insert any`] = db.insert('extra.type_zoo', { c_xml: p });
      writes[`${name} upsert`] = db.upsert('users', { email: 'bob@example.com', display_name: p }, 'email');
      writes[`${name} upsert new`] = db.upsert('users', { email: 'gus@example.com', display_name: 'Gus', tags: p }, 'email');
      writes[`${name} update`] = db.update('users', { display_name: p }, { id: 3 });
      writes[`${name} update any`] = db.update('extra.type_zoo', { c_xml: p }, sql`TRUE`);
    }
    expect(await writeOutcomes(writes)).toEqual(everyOutcome(writes, noParent));
    // as parent() in a fragment value
    expect(() => db.insert('users', { email: 'gus@example.com', display_name: sql`${parent('id')}` }).compile()).toThrow(noParent);
  });
});

describe('deletes', () => {
  it('returns the deleted rows', async () => {
    expect(await run(db.deletes('memberships', { user_id: 2 }, { returning: ['org_code'], extras: { r: 'role' } })))
      .toEqual([{ org_code: 'acme-lyon', r: 'member' }]);
    expect(await run(db.deletes('memberships', sql`${'role'} = ${param('nobody')}`))).toEqual([]);
    expect(await scalar('SELECT count(*)::int AS v FROM memberships')).toBe(1);
  });
});

describe('truncate', () => {
  it('one table', async () => {
    expect(await run(db.truncate('extra.articles'))).toEqual([]);
    expect(await scalar('SELECT count(*)::int AS v FROM extra.articles')).toBe(0);
  });

  it('RESTRICT (the default) refuses a referenced table, CASCADE empties the referencing ones', async () => {
    expect(await fails(db.truncate('users', 'CONTINUE IDENTITY', 'RESTRICT'))).toMatchInlineSnapshot(`
      {
        "code": "0A000",
        "message": "cannot truncate a table referenced in a foreign key constraint",
      }
    `);
    await run(db.truncate('users', 'CASCADE'));
    expect(await scalar('SELECT count(*)::int AS v FROM accounts')).toBe(0);
  });

  it('RESTART IDENTITY restarts the sequences', async () => {
    await run(db.truncate(['extra.articles'], 'RESTART IDENTITY'));
    // the point of the option: the next identity value is the first one again
    expect(await run(db.insert('extra.articles', { author_id: 1, body: 'b' }, { returning: ['id'] }))).toEqual({ id: 1 });
  });
});

describe('select', () => {
  const ids = (rows: { id: unknown }[]) => rows.map(r => r.id);

  it('all rows, a Whereable, a fragment', async () => {
    expect(await run(db.select('users', all, { columns: ['id', 'display_name'], order: { by: 'id', direction: 'ASC' } })))
      .toEqual([{ id: 1, display_name: 'Ada' }, { id: 2, display_name: 'Bob' }, { id: 3, display_name: 'Cyd' }]);
    expect(ids(await run(db.select('users', { manager_id: 1 }, { columns: ['id'], order: { by: 'id', direction: 'DESC' } }))))
      .toEqual([3, 2]);
    expect(await run(db.select('users', sql`false`))).toEqual([]);
  });

  it('characterization: a full row comes through to_jsonb, int8 beyond 2^53 included', async () => {
    // characterization: lifetime_ops 9007199254740993 comes back as the JSON number 9007199254740992
    expect(await run(db.selectOne('accounts', { id: 1 }))).toMatchInlineSnapshot({ opened_on: expect.any(String) }, `
      {
        "balance": 1500.5,
        "flags": [
          true,
          false,
        ],
        "grid": [
          [
            1,
            2,
          ],
          [
            3,
            4,
          ],
        ],
        "id": 1,
        "lifetime_ops": 9007199254740992,
        "opened_on": Any<String>,
        "overdraft_limit": 100,
        "owner_id": 1,
        "ratio": 0.5,
        "scores": [
          1,
          2,
          3,
        ],
      }
    `);
  });

  it('characterization: with enableCustomJSONParsingForLargeNumbers, an int8 beyond 2^53 is a string', async () => {
    // characterization: the option sets pg's global json / jsonb parsers; sum() reads no JSON and stays rounded
    const { JSON: json, JSONB: jsonb } = pg.types.builtins;
    const parsers = [json, jsonb].map(oid => [oid, pg.types.getTypeParser(oid)] as const);
    const lifetimeOps = () => run(db.selectOne('accounts', { id: 1 }, { columns: ['lifetime_ops', 'balance'] }));
    try {
      db.enableCustomJSONParsingForLargeNumbers(pg);
      expect(await lifetimeOps()).toEqual({ lifetime_ops: '9007199254740993', balance: 1500.5 });
      expect(await run(db.sum('accounts', { id: 1 }, { columns: ['lifetime_ops'] }))).toBe(9007199254740992);
    } finally {
      for (const [oid, parser] of parsers) pg.types.setTypeParser(oid, parser);
    }
    expect(await lifetimeOps()).toEqual({ lifetime_ops: 9007199254740992, balance: 1500.5 });  // control: parsers restored
  });

  it('distinct', async () => {
    const owners = await run(db.select('accounts', all, { columns: ['owner_id'], distinct: true }));
    expect(owners.map((r: { owner_id: number }) => r.owner_id).sort()).toEqual([1, 2]);
    const firstPerOwner = (distinct: any) => run(db.select('accounts', all, {
      columns: ['id'], distinct, order: [{ by: 'owner_id', direction: 'ASC' }, { by: 'balance', direction: 'ASC' }],
    }));
    expect(ids(await firstPerOwner('owner_id'))).toEqual([2, 3]);
    expect(ids(await firstPerOwner(['owner_id']))).toEqual([2, 3]);
    expect(ids(await firstPerOwner(sql`${'owner_id'}`))).toEqual([2, 3]);
  });

  it('characterization: distinct: true with an order on a column fails', async () => {
    // characterization: DISTINCT applies to the JSON result, so ORDER BY "owner_id" is not in the select list
    expect(await fails(db.select('accounts', all, {
      columns: ['owner_id'], distinct: true, order: { by: 'owner_id', direction: 'ASC' },
    }))).toMatchInlineSnapshot(`
      {
        "code": "42P10",
        "message": "for SELECT DISTINCT, ORDER BY expressions must appear in select list",
      }
    `);
  });

  it('order with nulls', async () => {
    const byRatio = (nulls: 'FIRST' | 'LAST') =>
      run(db.select('accounts', all, { columns: ['id'], order: { by: 'ratio', direction: 'ASC', nulls } }));
    expect(ids(await byRatio('FIRST'))).toEqual([2, 1, 3]);
    expect(ids(await byRatio('LAST'))).toEqual([1, 3, 2]);
  });

  it('limit, offset, withTies', async () => {
    const order = { by: 'id', direction: 'ASC' } as const;
    expect(ids(await run(db.select('users', all, { columns: ['id'], order, limit: 1, offset: 1 })))).toEqual([2]);
    expect(await run(db.select('products', all, {
      columns: ['variant'], order: [{ by: 'sku', direction: 'DESC' }], limit: 1, withTies: true,
    }))).toHaveLength(2);
  });

  it('characterization: withTies without order is a Postgres error', async () => {
    expect(await fails(db.select('users', all, { limit: 1, withTies: true }))).toMatchInlineSnapshot(`
      {
        "code": "42601",
        "message": "WITH TIES cannot be specified without ORDER BY clause",
      }
    `);
  });

  it('columns and extras', async () => {
    expect(await run(db.selectOne('users', { id: 1 }, {
      columns: ['display_name'],
      extras: { reports: sql<db.SQL, number>`(SELECT count(*) FROM ${'users'} AS "r" WHERE "r".${'manager_id'} = ${'users'}.${'id'})`, mail: 'email' },
    }))).toEqual({ display_name: 'Ada', reports: 2, mail: 'Ada@Example.com' });
  });

  it('groupBy and having', async () => {
    expect(await run(db.select('accounts', all, {
      columns: ['owner_id'], extras: { n: sql`count(*)` }, groupBy: 'owner_id', having: sql`count(*) > ${param(1)}`,
    }))).toEqual([{ owner_id: 1, n: 2 }]);
  });

  it('lateral as an object, with parent()', async () => {
    expect(await run(db.select('users', { id: 1 }, {
      columns: ['display_name'],
      lateral: {
        accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } }),
        accountCount: db.count('accounts', { owner_id: parent('id') }),
        manager: db.selectOne('users', { id: parent('manager_id') }),
      },
    }))).toEqual([{ display_name: 'Ada', accounts: [{ id: 1 }, { id: 2 }], accountCount: 2, manager: null }]);
  });

  it('lateral as a passthru', async () => {
    expect(await run(db.select('users', all, {
      lateral: db.count('accounts', { owner_id: parent('id') }), order: { by: 'id', direction: 'ASC' },
    }))).toEqual([2, 1, 0]);
  });

  it('lateral nested, with alias for a self-join', async () => {
    expect(await run(db.selectOne('users', { id: 1 }, {
      alias: 'u',
      columns: ['display_name'],
      lateral: {
        reports: db.select('users', { manager_id: parent('id') }, {
          alias: 'r',
          columns: ['display_name'],
          order: { by: 'id', direction: 'ASC' },
          lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['id'] }) },
        }),
      },
    }))).toEqual({
      display_name: 'Ada',
      reports: [{ display_name: 'Bob', accounts: [{ id: 3 }] }, { display_name: 'Cyd', accounts: [] }],
    });
  });

  it('lock: FOR UPDATE, OF, NOWAIT, SKIP LOCKED', async () => {
    expect(await run(db.select('users', { id: 1 }, { columns: ['id'], lock: { for: 'UPDATE' } }))).toEqual([{ id: 1 }]);
    expect(await run(db.select('users', { id: 1 }, {
      alias: 'u', columns: ['id'],
      lock: [{ for: 'NO KEY UPDATE', of: 'u', wait: 'NOWAIT' }, { for: 'SHARE', of: ['u'], wait: 'SKIP LOCKED' }],
    }))).toEqual([{ id: 1 }]);
  });

  it('characterization: a lock without `of` fails with an aggregate lateral', async () => {
    // characterization: FOR UPDATE reaches the LATERAL subqueries, and count() refuses it; `of` limits it to the table
    expect(await fails(db.select('users', all, {
      lateral: { n: db.count('accounts', { owner_id: parent('id') }) }, lock: { for: 'UPDATE' },
    }))).toMatchInlineSnapshot(`
      {
        "code": "0A000",
        "message": "FOR UPDATE is not allowed with aggregate functions",
      }
    `);
    expect(await run(db.select('users', { id: 1 }, {
      columns: ['id'], lateral: { n: db.count('accounts', { owner_id: parent('id') }) }, lock: { for: 'UPDATE', of: 'users' },
    }))).toEqual([{ id: 1, n: 2 }]);
  });
});

describe('selectOne, selectExactlyOne', () => {
  it('selectOne: the first row, or undefined', async () => {
    expect(await run(db.selectOne('users', { mood: 'ok' }, { columns: ['id'] }))).toEqual({ id: 2 });
    expect(await run(db.selectOne('users', { id: -1 }))).toBeUndefined();
  });

  it('selectExactlyOne: the row, or a NotExactlyOneError carrying the query', async () => {
    expect(await run(db.selectExactlyOne('users', { id: 3 }, { columns: ['display_name'] }))).toEqual({ display_name: 'Cyd' });
    const q = db.selectExactlyOne('users', { id: -1 });
    const err = await q.run(t.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(db.NotExactlyOneError);
    expect((err as db.NotExactlyOneError).name).toBe('NotExactlyOneError');
    expect((err as db.NotExactlyOneError).message).toMatchInlineSnapshot(`"One result expected but none returned (hint: check \`.query.compile()\` on this Error)"`);
    expect((err as db.NotExactlyOneError).query).toBe(q);
    expect((err as db.NotExactlyOneError).query.compile()).toEqual(q.compile());
  });

  it('selectExactlyOne does not check for a second row, without selectExactlyOneChecksForSecondRow', async () => {
    // LIMIT 1 hides the second row, so "exactly one" means "at least one", as in Zapatos 6.6.1
    expect(await run(db.selectExactlyOne('users', { manager_id: 1 }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } })))
      .toEqual({ id: 2 });
  });

  it('selectExactlyOne throws a NotExactlyOneError on a second row, with selectExactlyOneChecksForSecondRow', async () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    const q = db.selectExactlyOne('users', { manager_id: 1 }, { columns: ['id'] });
    const err = await q.run(t.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(db.NotExactlyOneError);
    expect((err as db.NotExactlyOneError).message).toBe('One result expected but more returned (hint: check `.query.compile()` on this Error)');
    expect((err as db.NotExactlyOneError).query).toBe(q);
  });

  it('selectExactlyOne gives its one row, or throws on none, with selectExactlyOneChecksForSecondRow', async () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    expect(await run(db.selectExactlyOne('users', { id: 3 }, { columns: ['display_name'] }))).toEqual({ display_name: 'Cyd' });
    const err = await db.selectExactlyOne('users', { id: -1 }).run(t.client).catch((e: unknown) => e);
    expect((err as db.NotExactlyOneError).message).toBe('One result expected but none returned (hint: check `.query.compile()` on this Error)');
  });

  it('in a lateral, selectExactlyOne keeps LIMIT 1, so the parent row comes once, with selectExactlyOneChecksForSecondRow', async () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    expect(await run(db.select('users', { id: 1 }, {
      columns: ['id'],
      lateral: { report: db.selectExactlyOne('users', { manager_id: parent('id') }, { alias: 'r', columns: ['id'], order: { by: 'id', direction: 'ASC' } }) },
    }))).toEqual([{ id: 1, report: { id: 2 } }]);
  });
});

describe('count, sum, avg, min, max', () => {
  it('count, with and without columns', async () => {
    expect(await run(db.count('users', all))).toBe(3);
    expect(await run(db.count('users', all, { columns: ['manager_id'] }))).toBe(2);
    expect(await run(db.count('users', { id: -1 }))).toBe(0);
  });

  it('sum, avg, min, max of a number column', async () => {
    expect(await run(db.sum('accounts', all, { columns: ['balance'] }))).toBe(1520.5);
    expect(await run(db.avg('accounts', all, { columns: ['ratio'] }))).toBe(0.875);
    expect(await run(db.min('accounts', all, { columns: ['balance'] }))).toBe(0);
    expect(await run(db.max('accounts', all, { columns: ['balance'] }))).toBe(1500.5);
  });

  it('sum, avg, min, max without columns throw as the query is built, before any is sent', () => {
    // 6.6.1 sent `sum(*)`, which Postgres refuses (42883)
    expect(() => db.sum('accounts', all)).toThrow("sum() needs one column to aggregate: pass columns: ['column']");
    expect(() => db.avg('accounts', all, {})).toThrow("avg() needs one column to aggregate: pass columns: ['column']");
    expect(() => db.min('accounts', all, { alias: 'a' })).toThrow("min() needs one column to aggregate: pass columns: ['column']");
    expect(() => db.max('accounts', all, { columns: undefined })).toThrow("max() needs one column to aggregate: pass columns: ['column']");
  });

  it('several columns, or none, throw as the query is built', () => {
    // 6.6.1 sent `count("id", "mood")` and `count()`, which Postgres refuses (42883, 42809)
    // @ts-expect-error two columns (refused by the type too)
    expect(() => db.count('users', all, { columns: ['id', 'mood'] })).toThrow('count() takes one column in columns, not 2 (leave columns out for count(*))');
    expect(() => db.count('users', all, { columns: [] })).toThrow('count() takes one column in columns, not 0 (leave columns out for count(*))');
    // @ts-expect-error two columns (refused by the type too)
    expect(() => db.sum('accounts', all, { columns: ['balance', 'ratio'] })).toThrow('sum() takes one column in columns, not 2');
  });

  it('characterization: on an empty set, sum / avg / min / max return 0, not null', async () => {
    // characterization: Number(null) === 0
    const none = { id: -1 };
    expect(await run(db.sum('accounts', none, { columns: ['balance'] }))).toBe(0);
    expect(await run(db.avg('accounts', none, { columns: ['balance'] }))).toBe(0);
    expect(await run(db.max('accounts', none, { columns: ['balance'] }))).toBe(0);
    expect(await run(db.min('events', { kind: 'none' }, { columns: ['occurred_on'] }))).toBe(0);
  });

  it('characterization: an int8 or numeric result beyond 2^53 loses precision', async () => {
    // characterization: 9007199254740993 comes back as 9007199254740992
    expect(await run(db.sum('accounts', { id: 1 }, { columns: ['lifetime_ops'] }))).toBe(9007199254740992);
  });

  it('characterization: min / max of a date is a timestamp in ms, of a text NaN', async () => {
    // characterization: pg parses the date as local midnight, then Number() gives its epoch ms
    expect(await run(db.min('events', all, { columns: ['occurred_on'] }))).toBe(new Date(2025, 5, 1).getTime());
    expect(await run(db.max('users', all, { columns: ['display_name'] }))).toBeNaN();
  });

  it('a passthru lateral throws as the query is built; a lateral map runs', async () => {
    // 6.6.1 sent `SELECT  AS result`, which Postgres refuses (42601)
    // @ts-expect-error a passthru lateral (refused by the type too)
    expect(() => db.count('users', all, { lateral: db.count('accounts', { owner_id: parent('id') }) }))
      .toThrow('count() cannot pass a lateral query through: nest it in the lateral of a select() instead');
    // the map is joined, its results not read
    expect(await run(db.count('users', all, { lateral: { n: db.count('accounts', { owner_id: parent('id') }) } }))).toBe(3);
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/shortcuts.ts against the fixture: what the SQL
// compiled in test/unit/shortcuts.test.ts returns, surprises included.
// Identity and serial values are never hard-coded: they are read back.

import * as pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, raw, cols, vals, parent, Default, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';
import { resetConfig } from '../helpers/config';

const t = useTestDatabase();

afterEach(resetConfig);

// runtime behaviour only: the types (stub schema here) are step 1.4's
const run = (q: db.SQLFragment<any, any>): Promise<any> => q.run(t.client);
const fails = (q: db.SQLFragment<any, any>) => pgError(t.client, () => q.run(t.client));
const scalar = async (text: string) => (await t.client.query(text)).rows[0].v;
/** RETURNING without ORDER BY gives no order: rows sorted by `key` before comparing. */
const sortBy = <R extends Record<string, any>>(rows: R[], key: keyof R) =>
  [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));

const
  wrapperAsValue = '`db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value, nor in a `sql` template of your own (`VALUES (…)` or a filter\'s `IN (…)`): to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`.',
  noParent = `The 'parent' table alias has no meaning here`,
  nothingToInsert = 'nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template',
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

  // the type takes a readonly array (#683): the rows are read, never written, so a frozen array runs as any other
  it('a frozen array of rows, with different keys and an undefined value, is inserted and left as it was (#683)', async () => {
    const rows = Object.freeze([Object.freeze({ email: 'a@x.org', display_name: 'A' }), Object.freeze({ email: 'b@x.org', display_name: 'B', mood: undefined })]);
    const inserted = await run(db.insert('users', rows, { returning: ['email', 'mood'] }));
    expect(sortBy(inserted, 'email')).toEqual([{ email: 'a@x.org', mood: null }, { email: 'b@x.org', mood: null }]);
    expect(rows).toEqual([{ email: 'a@x.org', display_name: 'A' }, { email: 'b@x.org', display_name: 'B', mood: undefined }]);
  });

  it('no column at all throws before any query, where Postgres refused the SQL (#251)', async () => {
    // Zapatos 6.6.1 sent `() VALUES ()`, which .run() rejected with 42601
    expect((await pgError(t.client, () => run(sql`INSERT INTO ${'users'} () VALUES ()`))).code).toBe('42601');
    expect(() => db.insert('users', {})).toThrow(nothingToInsert);
    expect(() => db.insert('users', [{}, {}])).toThrow(nothingToInsert);
    // no query was sent, so the transaction is not aborted
    expect(await run(db.select('users', { id: 1 }, { columns: ['id'] }))).toEqual([{ id: 1 }]);
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

  it('uses the balance default for an undefined cell', async () => {
    const account = await run(db.insert('accounts', { owner_id: 1, balance: undefined }));
    expect(await run(db.selectExactlyOne('accounts', { id: account.id }, { columns: ['balance'] }))).toEqual({ balance: 0 });
  });

  it('an undefined value in one of several rows inserts the column DEFAULT', async () => {
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

  it('a frozen array of rows is upserted and left as it was (#683)', async () => {
    const rows = Object.freeze([Object.freeze({ email: 'ADA@example.com', display_name: 'Ada L.' }), Object.freeze({ email: 'new@x.org', display_name: 'New' })]);
    const upserted = await run(db.upsert('users', rows, 'email', { returning: ['email'] }));
    expect(sortBy(upserted, 'email')).toEqual([{ email: 'ADA@example.com', $action: 'UPDATE' }, { email: 'new@x.org', $action: 'INSERT' }]);
    expect(rows).toEqual([{ email: 'ADA@example.com', display_name: 'Ada L.' }, { email: 'new@x.org', display_name: 'New' }]);
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

  it.each([
    [{ updateColumns: 'price_cents' }, 'T-shirt small'],
    [{ updateValues: { title: 'Tee' } }, 'Tee'],
  ] as const)('accepts a missing title with an explicit update %j', async (options, title) => {
    const rows = [
      { sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' },
    ];
    expect(() => db.upsert('products', rows, ['sku', 'variant']))
      .toThrow('rows have different keys: pass updateColumns, or give every row the same keys');
    await run(db.upsert('products', rows, ['sku', 'variant'], options));
    expect((await t.client.query("SELECT title, price_cents::int FROM products WHERE sku = 'TEE' AND variant = 'S'")).rows)
      .toEqual([{ title, price_cents: 1300 }]);
  });

  it('new rows without their serial id among existing rows run, and nothing is overwritten', async () => {
    const { id } = await run(db.selectExactlyOne('products', { sku: 'TEE', variant: 'S' }, { columns: ['id'] }));
    const [cap, tee] = sortBy(await run(db.upsert('products', [
      { id, sku: 'TEE', variant: 'S', price_cents: 1300 },
      { sku: 'CAP', variant: '', price_cents: 900 },
    ], 'id', { returning: ['id', 'sku', 'title', 'price_cents'] })), 'sku');
    expect(tee).toEqual({ id, sku: 'TEE', title: 'T-shirt small', price_cents: 1300, $action: 'UPDATE' });
    expect(cap).toEqual({ id: expect.any(Number), sku: 'CAP', title: null, price_cents: 900, $action: 'INSERT' });
    expect(cap).not.toMatchObject({ id });
  });

  it('an undefined value: the column is left as it is', async () => {
    const tee = { sku: 'TEE', variant: 'S', price_cents: 1400, title: undefined };
    expect(await run(db.upsert('products', tee, ['sku', 'variant'], { returning: ['title', 'price_cents'] })))
      .toEqual({ title: 'T-shirt small', price_cents: 1400, $action: 'UPDATE' });
  });

  it('an undefined key of updateValues: the column is left as it is', async () => {
    const ada = { email: 'Ada@Example.com', display_name: 'Ada' };
    expect(await run(db.upsert('users', ada, 'email', { updateValues: { settings: undefined }, returning: ['settings'] })))
      .toEqual({ settings: { theme: 'dark' }, $action: 'UPDATE' });
  });

  it('an undefined key of updateValues that leaves nothing to update: DO NOTHING', async () => {
    // so no row back on conflict, and the row is unchanged
    expect(await run(db.upsert('users', { email: 'Ada@Example.com', display_name: 'Ada' }, 'email',
      { updateColumns: db.doNothing, updateValues: { settings: undefined } }))).toBeUndefined();
    expect(await scalar(`SELECT settings AS v FROM users WHERE email = 'Ada@Example.com'`)).toEqual({ theme: 'dark' });
  });

  it('stores SQL NULL for explicit null on each write path', async () => {
    const ada = { display_name: 'A', email: 'Ada@Example.com' };
    expect((await run(db.insert('users', { ...ada, email: 'new@example.com', mood: null }))).mood).toBeNull();
    for (const write of [
      () => db.update('users', { mood: null }, { id: 1 }),
      () => db.upsert('users', { ...ada, mood: null }, 'email'),
      () => db.upsert('users', ada, 'email', { updateValues: { mood: null } }),
    ]) {
      await t.client.query("UPDATE users SET mood = 'happy' WHERE id = 1");
      await run(write());
      expect(await scalar('SELECT mood AS v FROM users WHERE id = 1')).toBeNull();
    }
  });

  it('refuses a missing or an undefined title, and keeps the stored one', async () => {
    const tee = { sku: 'TEE', variant: 'S', price_cents: 1300 };
    for (const first of [tee, { ...tee, title: undefined }]) {
      await t.client.query("UPDATE products SET title = 'T-shirt small' WHERE sku = 'TEE' AND variant = 'S'");
      const rows = [first, { sku: 'CAP', variant: '', price_cents: 900, title: 'Cap' }];
      expect(() => db.upsert('products', rows, ['sku', 'variant'])).toThrow('rows have different keys');
      expect(await scalar("SELECT title AS v FROM products WHERE sku = 'TEE' AND variant = 'S'")).toBe('T-shirt small');
    }
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

  it('characterization: an updateColumns computed empty is DO NOTHING too, as in 6.6.1 (#402)', async () => {
    // typed as the row, not | undefined (test/types/shortcuts.test-d.ts): the docs say to check, or pass doNothing
    const updateColumns = ['display_name'].filter(() => false);
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'X' }, 'email', { updateColumns })))
      .toBeUndefined();
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'X' }, 'email', {
      updateColumns, returning: ['email'],
    }))).toBeUndefined();
    expect(await scalar(`SELECT display_name AS v FROM users WHERE id = 2`)).toBe('Bob');
  });

  it('an empty array: []', async () => {
    expect(await run(db.upsert('users', [], 'email'))).toEqual([]);
  });

  it('no column at all throws before any query, where Postgres refused the SQL (#251)', async () => {
    // Zapatos 6.6.1 sent `() VALUES () ON CONFLICT`, which .run() rejected with 42601
    expect((await pgError(t.client, () => run(sql`INSERT INTO ${'users'} () VALUES () ON CONFLICT (${'email'}) DO NOTHING`))).code).toBe('42601');
    expect(() => db.upsert('users', {}, 'email')).toThrow(nothingToInsert);
    // an undefined key is left out, so no column is left
    expect(() => db.upsert('users', { mood: undefined }, 'email')).toThrow(nothingToInsert);
    expect(await run(db.select('users', { id: 1 }, { columns: ['id'] }))).toEqual([{ id: 1 }]);
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

  describe('characterization: a partitioned table, as in 6.6.1 (#460)', () => {
    // events' partitions are PARTITION OF it, so have its column layout: Postgres routes a row there without converting
    // it, and reads RETURNING from the parent's slot, which has no system column, so no xmax for $action. Documented,
    // not fixed: the SQL is the same for every table, so these pass on master
    const loginId = () => scalar(`SELECT id AS v FROM events WHERE kind = 'login'`);
    const row = (id: string | number) => ({ id, occurred_on: '2026-03-15', kind: 'logout' });

    it('upsert() into the parent rejects with 0A000, whatever the target and the number of rows', async () => {
      const id = await loginId(), version = await scalar(`SELECT current_setting('server_version') AS v`);
      const conflict = db.upsert('events', row(id), ['id', 'occurred_on']);
      expect(conflict.compile().text).toBe(
        `INSERT INTO "events" ("id", "kind", "occurred_on") VALUES ($1, $2, $3) ON CONFLICT ("id", "occurred_on") DO UPDATE SET ("id", "occurred_on", "kind") = ROW(EXCLUDED."id", EXCLUDED."occurred_on", EXCLUDED."kind") RETURNING to_jsonb("events".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result`);
      const writes = {
        'one conflict': conflict,
        'one new': db.upsert('events', row(1000), ['id', 'occurred_on']),
        'constraint()': db.upsert('events', row(id), db.constraint('events_pkey')),
        'several rows': db.upsert('events', [row(id), row(1000)], ['id', 'occurred_on']),
        'doNothing, one new': db.upsert('events', row(1000), ['id', 'occurred_on'], { updateColumns: db.doNothing }),
      };
      expect(await writeOutcomes(writes), `Postgres ${version} ran an upsert() into a partitioned table with its $action: ` +
        'name the versions that refuse it here, in the reportAction JSDoc of src/db/shortcuts.ts, in website/insert.md, ' +
        'website/fr/insert.md and the #460 line of CHANGELOG.md (#460)')
        .toEqual({ ...everyOutcome(writes, '0A000'), queriesSent: 5 });
      expect((await fails(conflict)).message).toBe('cannot retrieve a system column in this context');
    });

    it('upsert() into the parent reports $action when the row lands in a partition with its columns in another order', async () => {
      await t.client.query(`CREATE TABLE events_2027 (payload jsonb, kind text NOT NULL, occurred_on date NOT NULL, id bigint NOT NULL)`);
      await t.client.query(`ALTER TABLE events ATTACH PARTITION events_2027 FOR VALUES FROM ('2027-01-01') TO ('2028-01-01')`);
      const later = { id: 1002, occurred_on: '2027-03-15', kind: 'logout' };
      expect(await run(db.upsert('events', later, ['id', 'occurred_on'], { returning: ['kind'] })))
        .toEqual({ kind: 'logout', $action: 'INSERT' });
      expect(await run(db.upsert('events', { ...later, kind: 'login' }, db.constraint('events_pkey'), { returning: ['kind'] })))
        .toEqual({ kind: 'login', $action: 'UPDATE' });
      expect(await scalar(`SELECT kind AS v FROM events_2027 WHERE id = 1002`)).toBe('login');
    });

    it('upsert() into the parent reports $action when the row lands in a PARTITION OF made after a column was dropped', async () => {
      await t.client.query(`ALTER TABLE events ADD COLUMN dropped int`);
      await t.client.query(`ALTER TABLE events DROP COLUMN dropped`);
      await t.client.query(`CREATE TABLE events_2027 PARTITION OF events FOR VALUES FROM ('2027-01-01') TO ('2028-01-01')`);
      const later = { id: 1002, occurred_on: '2027-03-15', kind: 'logout' };
      expect(await run(db.upsert('events', later, ['id', 'occurred_on'], { returning: ['kind'] })))
        .toEqual({ kind: 'logout', $action: 'INSERT' });
      expect(await run(db.upsert('events', { ...later, kind: 'login' }, ['id', 'occurred_on'], { returning: ['kind'] })))
        .toEqual({ kind: 'login', $action: 'UPDATE' });
      // the older partitions dropped the column with the table, so theirs still sit where its do
      expect((await fails(db.upsert('events', row(await loginId()), ['id', 'occurred_on']))).code).toBe('0A000');
    });

    it("reportAction: 'suppress' runs, as does an upsert into the partition", async () => {
      const id = await loginId();
      expect(await run(db.upsert('events', row(id), ['id', 'occurred_on'], { reportAction: 'suppress', returning: ['kind'] })))
        .toEqual({ kind: 'logout' });
      expect(sortBy(await run(db.upsert('events', [row(id), row(1000)], db.constraint('events_pkey'), {
        reportAction: 'suppress', returning: ['id'],
      })), 'id')).toEqual(sortBy([{ id: Number(id) }, { id: 1000 }], 'id'));
      expect(await run(db.upsert('events_2026', row(1001), ['id', 'occurred_on'], { returning: ['kind'] })))
        .toEqual({ kind: 'logout', $action: 'INSERT' });
      expect(await run(db.upsert('events_2026', { ...row(id), kind: 'login again' }, db.constraint('events_2026_pkey'), {
        returning: ['kind'],
      }))).toEqual({ kind: 'login again', $action: 'UPDATE' });
      expect(await scalar(`SELECT kind AS v FROM events WHERE id = ${Number(id)}`)).toBe('login again');
    });
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

  it('an undefined value leaves its column', async () => {
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

  it('db.all as the filter of deletes() or update() rejects before any query; sql`TRUE`, as its message advises, reaches every row (#637)', async () => {
    const
      allAsWriteFilter = '`db.all` has no meaning as the filter of `deletes()` or `update()`: it is the filter of `select()` and its kin, refused in a write so that a filter that falls back to it for a read never deletes or updates every row. To delete or update every row on purpose, give db.sql`TRUE` as the filter.',
      writes = { deletes: db.deletes('memberships', db.all as any), update: db.update('memberships', { role: 'owner' }, db.all as any) },
      rows = await scalar('SELECT count(*)::int AS v FROM memberships');
    expect(rows).toBeGreaterThan(1);
    expect(await writeOutcomes(writes)).toEqual(everyOutcome(writes, allAsWriteFilter));
    expect(await scalar('SELECT count(*)::int AS v FROM memberships')).toBe(rows);
    expect(await run(db.update('memberships', { role: 'owner' }, sql`TRUE`))).toHaveLength(rows);
    expect(await scalar(`SELECT count(*)::int AS v FROM memberships WHERE role = 'owner'`)).toBe(rows);
    expect(await run(db.deletes('memberships', sql`TRUE`))).toHaveLength(rows);
    expect(await scalar('SELECT count(*)::int AS v FROM memberships')).toBe(0);
  });
});

describe('truncate', () => {
  it('one table; resolves undefined, as its type says', async () => {
    // Zapatos 6.6.1 resolved [], the rows of a TRUNCATE, though typed SQLFragment<undefined> (#167)
    expect(await run(db.truncate('extra.articles'))).toBeUndefined();
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

  it('options in an order Postgres refuses: run() rejects with a plain Error, where 6.6.1 rejected with 42601', async () => {
    // a .catch() chained on run() still gets it, as in 6.6.1: only the DatabaseError becomes an Error
    const caught = await (db.truncate as any)('extra.articles', 'CASCADE', 'RESTART IDENTITY').run(t.client).catch((e: Error) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(pg.DatabaseError);
    expect(caught.message).toBe(`Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not 'CASCADE', 'RESTART IDENTITY'`);
  });

  it('Postgres takes every order that compiles, an undefined or null option included', async () => {
    const orders: any[][] = [
      [], ['CONTINUE IDENTITY'], ['RESTART IDENTITY'], ['RESTRICT'], ['CASCADE'],
      ['CONTINUE IDENTITY', 'RESTRICT'], ['CONTINUE IDENTITY', 'CASCADE'], ['RESTART IDENTITY', 'RESTRICT'], ['RESTART IDENTITY', 'CASCADE'],
      [undefined], [null, 'CASCADE'], ['RESTART IDENTITY', null], ['RESTART IDENTITY', null, 'CASCADE'], ['CASCADE', null, null],
    ];
    for (const opts of orders) await run((db.truncate as any)(['extra.articles'], ...opts));
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

  it('columns and returning as a readonly tuple: the SQL and the rows of a mutable array', async () => {
    const cols = ['id', 'display_name'] as const, order = { by: 'id', direction: 'ASC' } as const;
    expect(db.select('users', all, { columns: cols, order }).compile())
      .toEqual(db.select('users', all, { columns: ['id', 'display_name'], order }).compile());
    expect(await run(db.select('users', all, { columns: cols, order })))
      .toEqual([{ id: 1, display_name: 'Ada' }, { id: 2, display_name: 'Bob' }, { id: 3, display_name: 'Cyd' }]);
    const row = { email: 'ro@x.org', display_name: 'Ro' };
    expect(db.insert('users', row, { returning: cols }).compile())
      .toEqual(db.insert('users', row, { returning: ['id', 'display_name'] }).compile());
    expect(Object.keys(await run(db.insert('users', row, { returning: cols })))).toEqual(['id', 'display_name']);
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

  describe('a shortcut as an extras value, a scalar subquery (#262)', () => {
    // 6.6.1 wrote it bare, `jsonb_build_object($2::text, SELECT …)`, which Postgres refuses (42601)
    const
      owner = sql`${'owner_id'} = ${'users'}.${'id'}`,
      ordered = { columns: ['balance'], order: { by: 'balance', direction: 'ASC' } } as const,
      byName = { columns: ['display_name'], order: { by: 'display_name', direction: 'ASC' } } as const;

    it.each<[string, () => db.SQLFragment<any>, unknown[]]>([
      ['select', () => db.select('accounts', owner, ordered), [[{ balance: 20 }, { balance: 1500.5 }], [{ balance: 0 }], []]],
      ['selectOne', () => db.selectOne('accounts', owner, ordered), [{ balance: 20 }, { balance: 0 }, null]],
      ['selectExactlyOne', () => db.selectExactlyOne('accounts', owner, ordered), [{ balance: 20 }, { balance: 0 }, null]],
      ['count', () => db.count('accounts', owner), [2, 1, 0]],
      ['sum', () => db.sum('accounts', owner, { columns: ['balance'] }), [1520.5, 0, null]],
      ['avg', () => db.avg('accounts', owner, { columns: ['ratio'] }), [0.5, 1.25, null]],
      ['min', () => db.min('accounts', owner, { columns: ['balance'] }), [20, 0, null]],
      ['max', () => db.max('accounts', owner, { columns: ['balance'] }), [1500.5, 0, null]],
    ])('%s: its result as JSON, null where its query gives no row', async (_name, shortcut, expected) => {
      const rows = await run(db.select('users', all, { ...byName, extras: { x: shortcut() } }));
      expect(rows).toEqual([{ display_name: 'Ada', x: expected[0] }, { display_name: 'Bob', x: expected[1] }, { display_name: 'Cyd', x: expected[2] }]);
    });

    it('nested in the extras of a shortcut that is itself an extra', async () => {
      expect(await run(db.selectOne('users', { id: 1 }, {
        columns: ['display_name'],
        extras: { first: db.selectOne('accounts', owner, { ...ordered, extras: { all: db.count('accounts', all) } }) },
      }))).toEqual({ display_name: 'Ada', first: { balance: 20, all: 3 } });
    });

    it('a copy of a shortcut, as the shortcut', async () => {
      expect(await run(db.selectOne('users', { id: 1 }, { columns: ['id'], extras: { n: db.count('accounts', owner).copy() } })))
        .toEqual({ id: 1, n: 2 });
    });

    it('in the extras of a write', async () => {
      expect(await run(db.update('users', { mood: 'ok' }, { id: 1 }, { returning: ['id'], extras: { n: db.count('accounts', owner) } })))
        .toEqual([{ id: 1, n: 2 }]);
    });

    it('unchanged: a column, a sql fragment, a query in parentheses, a shortcut parenthesised in a sql fragment', async () => {
      expect(await run(db.selectOne('users', { id: 1 }, {
        columns: ['id'],
        extras: {
          mail: 'email',
          up: sql`upper(${'display_name'})`,
          sub: sql`(SELECT count(*) FROM ${'accounts'} WHERE ${owner})`,
          wrapped: sql`(${db.count('accounts', owner)})`,
        },
      }))).toEqual({ id: 1, mail: 'Ada@Example.com', up: 'ADA', sub: 2, wrapped: 2 });
      // a shortcut in a sql fragment is the caller's SQL, written as given: bare, Postgres refuses it, as in 6.6.1
      expect(await fails(db.selectOne('users', { id: 1 }, { extras: { bare: sql`${db.count('accounts', owner)}` } })))
        .toEqual({ code: '42601', message: 'syntax error at or near "SELECT"' });
    });
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

describe('selectRows', () => {
  const byId = { by: 'id', direction: 'ASC' } as const;
  const cases: [string, any, any, any?][] = [
    ['db.all', 'users', all, { order: byId }],
    ['a Whereable', 'users', { manager_id: 1 }, { order: byId }],
    ['a sql filter', 'users', sql`${'id'} > ${param(1)}`, { order: byId }],
    ['columns', 'users', all, { columns: ['id', 'display_name'], order: byId }],
    ['extras', 'users', all, { columns: ['id'], extras: { n: db.count('accounts', all), name: 'display_name', upper: sql`upper(${'display_name'})` }, order: byId }],
    ['a lateral map', 'users', all, { columns: ['id'], lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['balance'], order: byId }), n: db.count('accounts', { owner_id: parent('id') }) }, order: byId }],
    ['a select() passed through', 'users', all, { lateral: db.select('accounts', { owner_id: parent('id') }, { columns: ['id'], order: byId }), order: byId }],
    ['a selectOne() passed through', 'users', all, { lateral: db.selectOne('accounts', { owner_id: parent('id') }, { columns: ['id'], order: byId }), order: byId }],
    ['limit and offset', 'users', all, { order: byId, limit: 1, offset: 1 }],
    ['withTies', 'accounts', all, { columns: ['owner_id'], order: { by: 'owner_id', direction: 'ASC' }, limit: 1, withTies: true }],
    ['distinct', 'accounts', all, { columns: ['owner_id'], distinct: true }],  // no ORDER BY with DISTINCT but on its columns (42P10)
    ['distinct on columns', 'accounts', all, { columns: ['owner_id'], distinct: ['owner_id'], order: { by: 'owner_id', direction: 'ASC' } }],
    ['groupBy and having', 'accounts', all, { columns: ['owner_id'], groupBy: 'owner_id', having: sql`count(*) > ${param(1)}` }],
    ['alias', 'users', all, { alias: 'u', columns: ['id'], order: { by: sql`${'u.id'}`, direction: 'DESC' } }],
    ['lock', 'accounts', { owner_id: 1 }, { columns: ['id'], order: byId, lock: { for: 'UPDATE', wait: 'NOWAIT' } }],
    ['no row', 'users', { id: -1 }],
  ];

  it.each(cases)('%s: run() gives what select() gives', async (_, table, where, options) => {
    const
      rows = await run(db.selectRows(table, where, options)), selected = await run(db.select(table, where, options)),
      sorted = (r: unknown[]) => options?.order ? r : [...r].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(sorted(rows)).toEqual(sorted(selected));
    expect(rows.length > 0).toBe(where?.id !== -1);
  });

  it('a count() passed through comes as pg parses its bigint, a string, as selectOne() passes it, where select() reads it from JSON', async () => {
    // past the type, which refuses a lateral typed number (#749)
    const options = { lateral: db.count('accounts', { owner_id: parent('id') }) as any, order: byId } as const;
    expect(await run(db.selectRows('users', all, options))).toEqual(['2', '1', '0']);
    expect(await run(db.selectOne('users', { id: 1 }, options))).toBe('2');
    expect(await run(db.select('users', all, options))).toEqual([2, 1, 0]);
  });

  it('each lateral passed through comes as pg parses its column, where select() reads it from JSON', async () => {
    const
      p = parent('id'), firstEvent = new Date(2025, 5, 1), at = new Date('2025-06-01T12:00:00Z'),
      // the lateral, what selectRows() gives for users 1, 2 and 3, and what select() gives
      laterals: [string, db.SQLFragment<any>, unknown[], unknown[]][] = [
        ['count()', db.count('accounts', { owner_id: p }), ['2', '1', '0'], [2, 1, 0]],
        ['sum() of a numeric', db.sum('accounts', { owner_id: p }, { columns: ['balance'] }), ['1520.50', '0.00', null], [1520.5, 0, null]],
        ['avg() of a numeric', db.avg('accounts', { owner_id: p }, { columns: ['balance'] }), ['760.2500000000000000', '0.00000000000000000000', null], [760.25, 0, null]],
        ['min() of a float8', db.min('accounts', { owner_id: p }, { columns: ['ratio'] }), [0.5, 1.25, null], [0.5, 1.25, null]],
        ['max() of an int8', db.max('accounts', { owner_id: p }, { columns: ['lifetime_ops'] }), ['9007199254740993', '1', null], [9007199254740992, 1, null]],
        ['min() of a date', db.min('events', all, { columns: ['occurred_on'] }), [firstEvent, firstEvent, firstEvent], ['2025-06-01', '2025-06-01', '2025-06-01']],
        ['a sql template of an int8', sql`SELECT 7::int8 AS result`, ['7', '7', '7'], [7, 7, 7]],
        ['a sql template of a timestamptz', sql`SELECT ${param(at)}::timestamptz AS result`, [at, at, at], [expect.any(String), expect.any(String), expect.any(String)]],
      ];
    for (const [name, lateral, rows, selected] of laterals) {
      const options = { lateral: lateral as any, order: byId };
      expect([name, await run(db.selectRows('users', all, options))]).toEqual([name, rows]);
      expect([name, await run(db.select('users', all, options))]).toEqual([name, selected]);
    }
  });

  it('past the type, from JavaScript: a lateral key repeats the parent row once per row, and an extras value gets 21000', async () => {
    const accounts = db.selectRows('accounts', { owner_id: parent('id') }, { columns: ['id'], order: byId });
    expect(await run(db.select('users', { id: 1 }, { columns: ['id'], lateral: { accounts } as any }))).toEqual([{ id: 1, accounts: { id: 1 } }, { id: 1, accounts: { id: 2 } }]);
    expect((await fails(db.select('users', { id: 1 }, { columns: ['id'], extras: { accounts: db.selectRows('accounts', all) } as any }))).code).toBe('21000');
  });

  it('as order.by, or the Whereable value of a column typed any, which its type takes, Postgres refuses it', async () => {
    const accounts = db.selectRows('accounts', all, { columns: ['id'] });
    expect((await fails(db.select('users', all, { order: { by: accounts, direction: 'ASC' } }))).code).toBe('42601');
    expect((await fails(db.select('users', { home: accounts }))).code).toBe('42804');
  });

  it('nested in a sql template, it is a set of rows', async () => {
    expect((await t.client.query(sql`SELECT count(*)::int AS n FROM (${db.selectRows('users', all)}) AS u`.compile())).rows).toEqual([{ n: 3 }]);
  });

  describe('select() with topLevelSelectAsRows (note 018 § 3)', () => {
    /** What run() of `build()` gives without the option, then with it, and the texts the second sent. */
    const offAndOn = async (build: () => db.SQLFragment<any, any>) => {
      const off = await run(build()), texts: string[] = [];
      db.setConfig({ topLevelSelectAsRows: true, queryListener: q => { texts.push(q.text); } });
      const on = await run(build());
      resetConfig();
      return { off, on, texts };
    };

    it.each(cases)('%s: run() gives the same array, from one row per result', async (_, table, where, options) => {
      const
        { off, on, texts } = await offAndOn(() => db.select(table, where, options)),
        sorted = (r: unknown[]) => options?.order ? r : [...r].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      expect(sorted(on)).toEqual(sorted(off));
      expect(on.length > 0).toBe(where?.id !== -1);
      expect(texts).toEqual([db.selectRows(table, where, options).compile().text
        .replace(/^SELECT "lateral_passthru"\.result AS .*$/s, rows => `SELECT to_jsonb(result) AS result FROM (${rows}) AS "sq_users"`)]);
    });

    it('each lateral passed through keeps the value select() reads from JSON', async () => {
      const p = parent('id');
      for (const lateral of [
        db.count('accounts', { owner_id: p }),
        db.sum('accounts', { owner_id: p }, { columns: ['balance'] }),
        db.max('accounts', { owner_id: p }, { columns: ['lifetime_ops'] }),
        db.min('events', all, { columns: ['occurred_on'] }),
        sql`SELECT ${param(new Date('2025-06-01T12:00:00Z'))}::timestamptz AS result`,
      ]) {
        const { off, on } = await offAndOn(() => db.select('users', all, { lateral: lateral as any, order: byId }));
        expect(on).toEqual(off);
      }
    });

    it('a lateral passed through is ordered and made distinct by its raw value, as in the aggregate', async () => {
      // around the end of summer time in Paris, a later instant can read as an earlier local time
      await t.client.query(`SET LOCAL TimeZone = 'Europe/Paris'`);
      await t.client.query(`UPDATE memberships SET since = CASE user_id WHEN 1 THEN timestamptz '2024-10-27 00:30:00+00' ELSE timestamptz '2024-10-27 01:10:00+00' END`);
      const latest = await offAndOn(() => db.select('users', all, {
        lateral: db.max('memberships', { user_id: parent('id') }, { columns: ['since'] }) as any,
        order: { by: sql`result`, direction: 'ASC', nulls: 'LAST' },
      }));
      expect(latest.off).toEqual(['2024-10-27T02:30:00+02:00', '2024-10-27T02:10:00+01:00', null]);
      expect(latest.on).toEqual(latest.off);
      const counts = await offAndOn(() => db.select('users', all, {
        distinct: true,
        lateral: db.count('accounts', { owner_id: parent('id') }) as any,
        order: { by: sql`"lateral_passthru".result`, direction: 'DESC' },
      }));
      expect(counts.off).toEqual([2, 1, 0]);
      expect(counts.on).toEqual(counts.off);
    });

    it('nested, it keeps its aggregate: a lateral, a lateral passed through, extras, a sql template', async () => {
      const accounts = () => db.select('accounts', { owner_id: parent('id') }, { columns: ['id'], order: byId });
      for (const build of [
        () => db.selectOne('users', { id: 1 }, { columns: ['id'], lateral: { accounts: accounts() } }),
        () => db.select('users', all, { columns: ['id'], lateral: { accounts: accounts() }, order: byId }),
        () => db.selectOne('users', { id: 1 }, { lateral: accounts() }),
        () => db.selectOne('users', { id: 1 }, { columns: ['id'], extras: { accounts: db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId }) } }),
        () => sql`SELECT (${db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId })}) AS accounts`,
      ]) {
        const { off, on } = await offAndOn(build);
        expect(on).toEqual(off);
      }
      expect((await offAndOn(() => db.selectOne('users', { id: 1 }, { lateral: accounts() }))).on).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('a copy runs its aggregate, and gives the same array', async () => {
      db.setConfig({ topLevelSelectAsRows: true });
      const q = db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId });
      expect(await run(q)).toEqual([{ id: 1 }, { id: 2 }]);
      expect(await run(q.copy())).toEqual([{ id: 1 }, { id: 2 }]);
      expect(await run(db.select('accounts', { owner_id: -1 }).copy())).toEqual([]);
    });

    it('prepared(), noop and the listeners go with the rows form', async () => {
      const sent: string[] = [], results: unknown[] = [];
      db.setConfig({ topLevelSelectAsRows: true, queryListener: q => { sent.push(q.text); }, resultListener: r => { results.push(r); } });
      const prepared = db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId }).prepared('accounts_as_rows');
      expect([await run(prepared), await run(prepared)]).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }]]);
      expect(results).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }]]);
      const skipped = db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId });
      skipped.noop = true;
      skipped.noopResult = 'not run';
      expect(await run(skipped)).toBe('not run');
      expect(await skipped.run(t.client, true)).toEqual([{ id: 1 }, { id: 2 }]);
      expect(sent).toEqual(Array(4).fill(0).map((_, i) =>
        `${i >= 2 ? `/* marked no-op: won't hit DB unless forced -> */ ` : ''}SELECT jsonb_build_object($1::text, "id") AS result FROM "accounts" WHERE ("owner_id" = $2) ORDER BY "id" ASC`));
    });

    it('cursor() reads it as before, as its one aggregate row', async () => {
      const read = async () => { const all: unknown[] = []; for await (const batch of db.cursor(t.client, db.select('accounts', { owner_id: 1 }, { columns: ['id'], order: byId }), { batchSize: 1 })) all.push(batch); return all; };
      const off = await read();
      db.setConfig({ topLevelSelectAsRows: true });
      expect([off, await read()]).toEqual([[[{ id: 1 }, { id: 2 }]], [[{ id: 1 }, { id: 2 }]]]);
    });
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

  it.each([{}, { selectExactlyOneChecksForSecondRow: false }])('selectExactlyOne silently takes the first of two rows under %j', async config => {
    const warning = vi.spyOn(process, 'emitWarning');
    try {
      db.setConfig(config);
      const first = db.selectExactlyOne('users', { manager_id: 1 }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } });
      expect(first.compile().values).toEqual(['id', 1, 1]);
      expect(await run(first)).toEqual({ id: 2 });
      expect(await run(db.selectOne('users', { id: 1 }, { lateral: first }))).toEqual({ id: 2 });
      expect(warning).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
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

  describe('characterization: withTies (#164)', () => {
    // documented, not fixed: user 1's two accounts tie on owner_id
    const
      byOwner = { columns: ['id'], order: { by: 'owner_id', direction: 'ASC' }, withTies: true } as const,
      owned = { owner_id: parent('id') },
      userIds = async (account: db.SQLFragment<any>) =>
        (await run(db.select('users', all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { account } }))).map((r: any) => r.id);

    it('at top level, Postgres sends every tie and run() gives one of them', async () => {
      expect((await t.client.query(db.selectOne('accounts', { owner_id: 1 }, byOwner).compile())).rows).toHaveLength(2);
      expect(await run(db.selectOne('accounts', { owner_id: 1 }, byOwner))).toEqual({ id: expect.any(Number) });
      expect(await run(db.selectExactlyOne('accounts', { owner_id: 1 }, byOwner))).toEqual({ id: expect.any(Number) });
    });

    it('in a lateral, the parent row comes once per tie', async () => {
      expect(await userIds(db.selectOne('accounts', owned, byOwner))).toEqual([1, 1, 2, 3]);
      expect(await userIds(db.selectExactlyOne('accounts', owned, byOwner))).toEqual([1, 1, 2, 3]);
      db.setConfig({ selectExactlyOneChecksForSecondRow: true });
      expect(await userIds(db.selectExactlyOne('accounts', owned, byOwner))).toEqual([1, 1, 2, 3]);
    });

    it('in a lateral, a nested select() keeps the ties in its array', async () => {
      expect((await run(db.select('users', all, {
        columns: ['id'], order: { by: 'id', direction: 'ASC' },
        lateral: { accounts: db.select('accounts', owned, { ...byOwner, limit: 1 }) },
      }))).map((r: any) => r.accounts.length)).toEqual([2, 1, 0]);
    });
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
    expect(await run(db.min('accounts', all, { columns: ['balance'] }))).toBe('0.00');
    expect(await run(db.max('accounts', all, { columns: ['balance'] }))).toBe('1500.50');
  });

  it('sum, avg, min, max without columns reject run() before any query is sent', async () => {
    // 6.6.1 sent `sum(*)`, which Postgres refuses (42883); this Error comes from compiling, so it has no code
    const sent: unknown[] = [];
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(run(db.sum('accounts', all))).rejects.toThrow("sum() needs one column to aggregate: pass columns: ['column']");
    await expect(run(db.avg('accounts', all, {}))).rejects.toThrow("avg() needs one column to aggregate: pass columns: ['column']");
    await expect(run(db.min('accounts', all, { alias: 'a' }))).rejects.toThrow("min() needs one column to aggregate: pass columns: ['column']");
    await expect(run(db.max('accounts', all, { columns: undefined }))).rejects.toThrow("max() needs one column to aggregate: pass columns: ['column']");
    await expect(run(db.sum('accounts', all))).rejects.not.toHaveProperty('code');
    expect(sent).toEqual([]);
  });

  it('several columns, or none, reject run() before any query is sent', async () => {
    // 6.6.1 sent `count("id", "mood")` and `count()`, which Postgres refuses (42883, 42809)
    const sent: unknown[] = [];
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(run(db.count('users', all, { columns: ['id', 'mood'] }))).rejects.toThrow('count() takes one column in columns, not 2 (leave columns out for count(*))');
    await expect(run(db.count('users', all, { columns: [] }))).rejects.toThrow('count() takes one column in columns, not 0 (leave columns out for count(*))');
    await expect(run(db.sum('accounts', all, { columns: ['balance', 'ratio'] }))).rejects.toThrow('sum() takes one column in columns, not 2');
    expect(sent).toEqual([]);
  });

  it('a string or another primitive as columns rejects run() before any query is sent, nested too', async () => {
    // 6.6.1 sent `count("0", "1")` for 'id' (42703) and `count()` for 42 (42809)
    const sent: unknown[] = [];
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(run(db.count('users', all, { columns: 'id' as any })))
      .rejects.toThrow(new Error("count() takes columns as an array, not string: pass columns: ['column'] (leave columns out for count(*))"));
    await expect(run(db.avg('accounts', all, { columns: 42 as any })))
      .rejects.toThrow(new Error("avg() takes columns as an array, not number: pass columns: ['column']"));
    await expect(run(db.select('users', all, { lateral: { top: db.max('accounts', { owner_id: parent('id') }, { columns: 'balance' as any }) } })))
      .rejects.toThrow(new Error("max() takes columns as an array, not string: pass columns: ['column']"));
    await expect(run(db.count('users', all, { columns: 'id' as any }))).rejects.not.toHaveProperty('code');
    expect(sent).toEqual([]);
  });

  it('characterization: an int8 or numeric result beyond 2^53 loses precision', async () => {
    // characterization: 9007199254740993 comes back as 9007199254740992
    expect(await run(db.sum('accounts', { id: 1 }, { columns: ['lifetime_ops'] }))).toBe(9007199254740992);
  });

  it('sum / avg / min / max return null on an empty set; count stays 0', async () => {
    const none = { id: -1 };
    expect(await run(db.sum('accounts', none, { columns: ['balance'] }))).toBeNull();
    expect(await run(db.avg('accounts', none, { columns: ['balance'] }))).toBeNull();
    expect(await run(db.max('accounts', none, { columns: ['balance'] }))).toBeNull();
    expect(await run(db.min('events', { kind: 'none' }, { columns: ['occurred_on'] }))).toBeNull();
    expect(await run(db.count('accounts', none))).toBe(0);
    // a set with rows: sum and avg still go through Number()
    expect(await run(db.sum('accounts', all, { columns: ['balance'] }))).toBe(1520.5);
    expect(await run(db.avg('accounts', all, { columns: ['ratio'] }))).toBe(0.875);
  });

  it('min / max give the value as pg parses it: a Date, a text, an int8 or numeric as a string', async () => {
    expect(await run(db.min('events', all, { columns: ['occurred_on'] }))).toEqual(new Date(2025, 5, 1));
    expect(await run(db.max('users', all, { columns: ['display_name'] }))).toBe('Cyd');
    expect(await run(db.max('accounts', all, { columns: ['lifetime_ops'] }))).toBe('9007199254740993');
    expect(await run(db.min('accounts', all, { columns: ['balance'] }))).toBe('0.00');
    expect(await run(db.max('accounts', all, { columns: ['ratio'] }))).toBe(1.25);
  });

  it('nested in a lateral, min / max come back as JSON, NULL as null', async () => {
    const query = () => db.select('users', all, {
      columns: ['display_name'], order: { by: 'display_name', direction: 'ASC' },
      lateral: {
        first: db.min('events', all, { columns: ['occurred_on'] }),
        top: db.max('accounts', { owner_id: parent('id') }, { columns: ['balance'] }),
      },
    });
    const expected = [
      { display_name: 'Ada', first: '2025-06-01', top: 1500.5 },
      { display_name: 'Bob', first: '2025-06-01', top: 0 },
      { display_name: 'Cyd', first: '2025-06-01', top: null },
    ];
    expect(await run(query())).toEqual(expected);
  });

  it('as an extra, min / max come back as JSON, NULL as null (#262)', async () => {
    // the types of test/types-opt-in: DateString, string and number (a numeric), or null
    const query = () => db.select('users', all, {
      columns: ['display_name'], order: { by: 'display_name', direction: 'ASC' },
      extras: {
        first: db.min('events', all, { columns: ['occurred_on'] }),
        name: db.max('users', all, { columns: ['display_name'] }),
        top: db.max('accounts', sql`${'owner_id'} = ${'users'}.${'id'}`, { columns: ['balance'] }),
      },
    });
    const expected = [
      { display_name: 'Ada', first: '2025-06-01', name: 'Cyd', top: 1500.5 },
      { display_name: 'Bob', first: '2025-06-01', name: 'Cyd', top: 0 },
      { display_name: 'Cyd', first: '2025-06-01', name: 'Cyd', top: null },
    ];
    expect(await run(query())).toEqual(expected);
  });

  it('passed through a single lateral, min / max come back as pg parses them from selectOne / selectExactlyOne, as JSON from select', async () => {
    // select() wraps its rows in jsonb_agg(), selectOne() and selectExactlyOne() hand the passed-through column over as it is
    const earliest = db.min('events', all, { columns: ['occurred_on'] });
    expect(await run(db.selectOne('users', all, { lateral: earliest }))).toEqual(new Date(2025, 5, 1));
    expect(await run(db.selectOne('users', { id: -1 }, { lateral: earliest }))).toBeUndefined();
    expect(await run(db.selectExactlyOne('users', { display_name: 'Ada' }, { lateral: earliest }))).toEqual(new Date(2025, 5, 1));
    expect(await run(db.select('users', all, { lateral: earliest }))).toEqual(['2025-06-01', '2025-06-01', '2025-06-01']);
  });

  it('passed through a selectOne / selectExactlyOne as an extra, min / max come back as JSON (#262)', async () => {
    const earliest = db.min('events', all, { columns: ['occurred_on'] }), top = db.max('accounts', all, { columns: ['balance'] });
    expect(await run(db.select('users', all, {
      columns: ['display_name'], order: { by: 'display_name', direction: 'ASC' }, limit: 1,
      extras: {
        firstAsExtra: db.selectExactlyOne('users', all, { lateral: earliest }),
        topAsExtra: db.selectOne('users', all, { lateral: top }),
      },
    }))).toEqual([{ display_name: 'Ada', firstAsExtra: '2025-06-01', topAsExtra: 1500.5 }]);
  });

  it('passed through a selectOne / selectExactlyOne nested in a lateral, min / max come back as JSON', async () => {
    const earliest = db.min('events', all, { columns: ['occurred_on'] }), top = db.max('accounts', all, { columns: ['balance'] });
    expect(await run(db.select('users', all, {
      columns: ['display_name'], order: { by: 'display_name', direction: 'ASC' }, limit: 1,
      lateral: {
        first: db.selectOne('users', all, { lateral: earliest }),
        top: db.selectExactlyOne('users', all, { lateral: top }),
      },
    }))).toEqual([{ display_name: 'Ada', first: '2025-06-01', top: 1500.5 }]);
    // passed through again: as it is by selectOne(), as JSON by select()
    const one = db.selectOne('users', all, { lateral: earliest });
    expect(await run(db.selectOne('users', all, { lateral: one }))).toEqual(new Date(2025, 5, 1));
    expect(await run(db.select('users', all, { lateral: one }))).toEqual(['2025-06-01', '2025-06-01', '2025-06-01']);
  });

  // #163: these return no row, where 6.6.1 read rows[0].result and rejected with
  // "TypeError: Cannot read properties of undefined (reading 'result')"; no row now reads as a NULL result
  type Where = Parameters<typeof db.count>[1];
  const noRow: [string, Where, NonNullable<Parameters<typeof db.count>[2]>][] = [
    ['a groupBy with no group', { id: -1 }, { groupBy: 'owner_id' }],
    ['a having that keeps none', all, { having: sql`false` }],
    ['offset: 1', all, { offset: 1 }],
    ['limit: 0', all, { limit: 0 }],
  ];
  const eachAggregate = async (where: Where, options: object) => {
    const outcome = (q: db.SQLFragment<any>) => run(q).catch((err: Error) => `${err.name}: ${err.message}`);
    return {
      count: await outcome(db.count('accounts', where, options)),
      sum: await outcome(db.sum('accounts', where, { ...options, columns: ['balance'] })),
      avg: await outcome(db.avg('accounts', where, { ...options, columns: ['balance'] })),
      min: await outcome(db.min('accounts', where, { ...options, columns: ['balance'] })),
      max: await outcome(db.max('accounts', where, { ...options, columns: ['balance'] })),
    };
  };

  it.each(noRow)('%s gives null, and 0 for count', async (_name, where, options) => {
    expect(await eachAggregate(where, options)).toEqual({ count: 0, sum: null, avg: null, min: null, max: null });
  });

  it('nested in a lateral, an aggregate whose query returns no row gives null', async () => {
    // the subquery is LEFT JOINed, so no row there is a NULL in jsonb_build_object(); unchanged from 6.6.1
    const query = () => db.select('users', { id: 1 }, {
      columns: ['id'],
      lateral: {
        n: db.count('accounts', { owner_id: parent('id') }, { having: sql`false` }),
        top: db.max('accounts', { owner_id: parent('id') }, { columns: ['balance'], offset: 1 }),
      },
    });
    expect(await run(query())).toEqual([{ id: 1, n: null, top: null }]);
  });

  it('characterization: nested, a count() with a groupBy and no group gives null, though typed number, as in 6.6.1 (#420)', async () => {
    // Cyd (id 3) has no account: the groupBy leaves no row, and LEFT JOIN LATERAL reads it as NULL; a plain count() gives 0
    const n = db.count('accounts', { owner_id: parent('id') }, { groupBy: 'owner_id' }),
      plain = db.count('accounts', { owner_id: parent('id') });
    expect(await run(db.select('users', all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { n, plain } })))
      .toEqual([{ id: 1, n: 2, plain: 2 }, { id: 2, n: 1, plain: 1 }, { id: 3, n: null, plain: 0 }]);
    expect(await run(db.selectOne('users', { id: 3 }, { columns: ['id'], lateral: { n } }))).toEqual({ id: 3, n: null });
    expect(await run(db.selectExactlyOne('users', { id: 3 }, { columns: ['id'], lateral: { n } }))).toEqual({ id: 3, n: null });
    // passed through as the single lateral, and as an extras value
    expect(await run(db.selectOne('users', { id: 3 }, { lateral: n }))).toBeNull();
    expect(await run(db.selectExactlyOne('users', { id: 3 }, { lateral: n }))).toBeNull();
    expect(await run(db.select('users', { id: 3 }, { lateral: n }))).toEqual([null]);
    expect(await run(db.selectOne('users', { id: 3 }, {
      columns: ['id'], extras: { n: db.count('accounts', sql`${'owner_id'} = ${'users'}.${'id'}`, { groupBy: 'owner_id' }) },
    }))).toEqual({ id: 3, n: null });
  });

  it.each(['selectOne', 'selectExactlyOne'] as const)('now() passed through %s() gives a Date', async outer => {
    const lateral = sql<db.SQL, Date>`SELECT now() AS result`;
    const at = await run(db[outer]('users', { id: 1 }, { lateral }));
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBe((await scalar('SELECT now() AS v')).getTime());
  });

  it('now() passed through select() gives a JSON string', async () => {
    const lateral = sql<db.SQL, Date>`SELECT now() AS result`;
    const stamp = await scalar('SELECT to_jsonb(now()) AS v');
    expect(typeof stamp).toBe('string');
    expect(await run(db.select('users', { id: 1 }, { lateral }))).toEqual([stamp]);
  });

  it.each(['selectOne', 'selectExactlyOne', 'select'] as const)('to_jsonb(now()) passed through %s() gives a JSON string', async outer => {
    const lateral = sql<db.SQL, string>`SELECT to_jsonb(now()) AS result`;
    const stamp = await scalar('SELECT to_jsonb(now()) AS v');
    expect(typeof stamp).toBe('string');
    if (outer === 'select') {
      expect(await run(db.select('users', { id: 1 }, { lateral }))).toEqual([stamp]);
    } else {
      expect(await run(db[outer]('users', { id: 1 }, { lateral }))).toBe(stamp);
    }
  });

  it('characterization: passed through selectOne() / selectExactlyOne(), count(), sum() and avg() come as pg parses a bigint or numeric, a string, though typed number, as in 6.6.1 (#470)', async () => {
    // the passed-through column is handed over as it is, not through the aggregate's Number(); select() and a
    // lateral map read it from JSON, a number (rounded beyond 2^53). Ada (id 1) has two accounts, Cyd (id 3) none
    const aggregates = {
      count: db.count('accounts', { owner_id: parent('id') }),
      sumInt: db.sum('accounts', { owner_id: parent('id') }, { columns: ['owner_id'] }),
      sumBigint: db.sum('accounts', { owner_id: parent('id') }, { columns: ['lifetime_ops'] }),
      sumNumeric: db.sum('accounts', { owner_id: parent('id') }, { columns: ['balance'] }),
      sumFloat8: db.sum('accounts', { owner_id: parent('id') }, { columns: ['ratio'] }),
      avgInt: db.avg('accounts', { owner_id: parent('id') }, { columns: ['owner_id'] }),
      avgNumeric: db.avg('accounts', { owner_id: parent('id') }, { columns: ['balance'] }),
    };
    const each = async (outer: (lateral: db.SQLFragment<any>) => db.SQLFragment<any>) => {
      const results: Record<string, unknown> = {};
      for (const [k, a] of Object.entries(aggregates)) results[k] = await run(outer(a));
      return results;
    };
    const asPg = {
      count: '2', sumInt: '2', sumBigint: '9007199254740993', sumNumeric: '1520.50', sumFloat8: 0.5,
      avgInt: '1.00000000000000000000', avgNumeric: '760.2500000000000000',
    };
    expect(await each(a => db.selectOne('users', { id: 1 }, { lateral: a }))).toEqual(asPg);
    expect(await each(a => db.selectExactlyOne('users', { id: 1 }, { lateral: a }))).toEqual(asPg);
    // passed through twice, still the string
    expect(await each(a => db.selectOne('users', { id: 1 }, { lateral: db.selectOne('users', { id: parent('id') }, { alias: 'u2', lateral: a }) }))).toEqual(asPg);
    // no row to aggregate: count() gives '0', the others null
    const noRow = { count: '0', sumInt: null, sumBigint: null, sumNumeric: null, sumFloat8: null, avgInt: null, avgNumeric: null };
    expect(await each(a => db.selectOne('users', { id: 3 }, { lateral: a }))).toEqual(noRow);
    expect(await each(a => db.selectExactlyOne('users', { id: 3 }, { lateral: a }))).toEqual(noRow);
    // under select() and in a lateral map, JSON numbers
    const asJson = { count: 2, sumInt: 2, sumBigint: 9007199254740992, sumNumeric: 1520.5, sumFloat8: 0.5, avgInt: 1, avgNumeric: 760.25 };
    expect(await each(a => db.select('users', { id: 1 }, { lateral: a }))).toEqual(Object.fromEntries(Object.entries(asJson).map(([k, v]) => [k, [v]])));
    // the outermost call decides: a selectOne() passing it through, under an outer select(), comes back as JSON
    expect(await each(a => db.select('users', { id: 1 }, { lateral: db.selectOne('users', { id: parent('id') }, { alias: 'u2', lateral: a }) })))
      .toEqual(Object.fromEntries(Object.entries(asJson).map(([k, v]) => [k, [v]])));
    expect(await each(a => db.selectOne('users', { id: 1 }, { columns: ['id'], lateral: { n: a } })))
      .toEqual(Object.fromEntries(Object.entries(asJson).map(([k, v]) => [k, { id: 1, n: v }])));
  });

  it('a passthru lateral rejects run() before any query is sent, nested too; a lateral map runs', async () => {
    // 6.6.1 sent `SELECT  AS result`, which Postgres refuses (42601)
    const sent: unknown[] = [], n = db.count('accounts', { owner_id: parent('id') });
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(run(db.count('users', all, { lateral: n })))
      .rejects.toThrow('count() cannot pass a lateral query through: nest it in the lateral of a select() instead');
    // a refused aggregate nested in a lateral, or as an extra, rejects the run() of the query around it
    await expect(run(db.select('users', all, { lateral: { n: db.max('accounts', { owner_id: parent('id') }) } })))
      .rejects.toThrow("max() needs one column to aggregate: pass columns: ['column']");
    await expect(run(db.selectOne('users', all, { extras: { s: db.sum('accounts', { owner_id: parent('id') }) } })))
      .rejects.toThrow("sum() needs one column to aggregate: pass columns: ['column']");
    expect(sent).toEqual([]);
    // the map is joined, its results not read
    expect(await run(db.count('users', all, { lateral: { n } }))).toBe(3);
  });
});

describe('aggregate migration warnings', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('runs the former warning cases silently', async () => {
    vi.resetModules();
    const warning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const fdb = await import('../../src/db');
    await fdb.avg('accounts', { id: -1 }, { columns: ['ratio'] }).run(t.client);
    await fdb.sum('accounts', fdb.all, { columns: ['balance'], limit: 0 }).run(t.client);
    await fdb.max('users', fdb.all, { columns: ['display_name'] }).run(t.client);
    await fdb.min('events', fdb.all, { columns: ['occurred_on'] }).run(t.client);
    await fdb.max('accounts', fdb.all, { columns: ['lifetime_ops'] }).run(t.client);
    await fdb.min('accounts', fdb.all, { columns: ['balance'] }).run(t.client);
    expect(warning).not.toHaveBeenCalled();
  });
});

describe('copy()', () => {
  /** What `q` and then `q.copy()` give once run, each in a savepoint rolled back after it. */
  const originalAndCopy = async (q: db.SQLFragment<any>) => {
    const results: unknown[] = [];
    for (const fragment of [q, q.copy()]) {
      await t.client.query('SAVEPOINT copy');
      results.push(await fragment.run(t.client).catch((e: unknown) => e));
      await t.client.query('ROLLBACK TO SAVEPOINT copy');
    }
    return results;
  };

  // Zapatos 6.6.1 resolved a copy to the raw rows (`[{ result: '3' }]` for count()), though typed as the shortcut's result (#263)
  it.each<[string, () => db.SQLFragment<any>, unknown]>([
    ['count', () => db.count('users', all), 3],
    ['count of no row', () => db.count('users', { id: -1 }), 0],
    ['sum', () => db.sum('accounts', all, { columns: ['balance'] }), 1520.5],
    ['avg', () => db.avg('accounts', all, { columns: ['ratio'] }), 0.875],
    ['min', () => db.min('accounts', all, { columns: ['balance'] }), '0.00'],
    ['max', () => db.max('accounts', all, { columns: ['balance'] }), '1500.50'],
    ['sum of no row', () => db.sum('accounts', { id: -1 }, { columns: ['balance'] }), null],
    ['min of a date', () => db.min('events', all, { columns: ['occurred_on'] }), new Date(2025, 5, 1)],
    ['max of an int8', () => db.max('accounts', all, { columns: ['lifetime_ops'] }), '9007199254740993'],
    ['select', () => db.select('users', { id: 3 }, { columns: ['display_name'] }), [{ display_name: 'Cyd' }]],
    ['selectOne', () => db.selectOne('users', { id: 3 }, { columns: ['display_name'] }), { display_name: 'Cyd' }],
    ['selectOne of no row', () => db.selectOne('users', { id: -1 }), undefined],
    ['selectExactlyOne', () => db.selectExactlyOne('users', { id: 3 }, { columns: ['display_name'] }), { display_name: 'Cyd' }],
    ['insert, one row', () => db.insert('users', { email: 'e@x.org', display_name: 'E' }, { returning: ['display_name'] }), { display_name: 'E' }],
    ['insert, an array', () => db.insert('users', [{ email: 'e@x.org', display_name: 'E' }], { returning: ['display_name'] }), [{ display_name: 'E' }]],
    ['upsert, one row', () => db.upsert('users', { email: 'e@x.org', display_name: 'E' }, 'email', { returning: ['display_name'] }), { display_name: 'E', $action: 'INSERT' }],
    ['upsert, an array', () => db.upsert('users', [{ email: 'e@x.org', display_name: 'E' }], 'email', { returning: ['display_name'] }), [{ display_name: 'E', $action: 'INSERT' }]],
    ['update', () => db.update('users', { mood: 'ok' }, { id: 3 }, { returning: ['display_name'] }), [{ display_name: 'Cyd' }]],
    ['deletes', () => db.deletes('memberships', { user_id: 2 }, { returning: ['org_code'] }), [{ org_code: 'acme-lyon' }]],
    ['truncate', () => db.truncate('extra.articles'), undefined],
  ])('a copy of %s, run, gives the result of the shortcut', async (_, make, expected) => {
    expect(await originalAndCopy(make())).toEqual([expected, expected]);
  });

  it('a copy of selectExactlyOne throws a NotExactlyOneError on no row, carrying the query it was copied from', async () => {
    const q = db.selectExactlyOne('users', { id: -1 });
    const [original, copied] = await originalAndCopy(q);
    expect(original).toBeInstanceOf(db.NotExactlyOneError);
    expect(copied).toBeInstanceOf(db.NotExactlyOneError);
    expect((copied as db.NotExactlyOneError).message).toBe('One result expected but none returned (hint: check `.query.compile()` on this Error)');
    expect((copied as db.NotExactlyOneError).query).toBe(q);
  });

  it('a copy of selectExactlyOne keeps LIMIT 1, so checks one row only, with selectExactlyOneChecksForSecondRow', async () => {
    // the copy compiles as a nested query does (#261): a second row is never asked for
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    const [original, copied] = await originalAndCopy(db.selectExactlyOne('users', { manager_id: 1 }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } }));
    expect((original as db.NotExactlyOneError).message).toBe('One result expected but more returned (hint: check `.query.compile()` on this Error)');
    expect(copied).toEqual({ id: 2 });
  });

  it('a copy of insert([]) still sends nothing and gives []', async () => {
    expect(await originalAndCopy(db.insert('users', []))).toEqual([[], []]);
  });
});

describe('a null row among others in upsert()', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('inserts a row of defaults, given updateColumns', async () => {
    // since #27 it threw a TypeError at the call; the null row is read as `{}`, as insert() reads it (#341)
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const rows = await db.upsert('extra.type_zoo', [{ c_text: 'x' }, null as any], 'id', { updateColumns: ['c_text'], returning: ['c_text'] }).run(t.client);
    expect(rows).toEqual([{ c_text: 'x', $action: 'INSERT' }, { c_text: null, $action: 'INSERT' }]);
    expect(emitWarning).not.toHaveBeenCalled();
  });
});

describe('a key added to Object.prototype beside several upsert() rows', () => {
  it('is no column: the existing value is kept on conflict', async () => {
    // master inserted it as DEFAULT and set it from EXCLUDED, so Bob's mood went from 'ok' to NULL; with
    // upsertRequiresSameKeys it threw "rows have different keys"
    const proto = Object.prototype as any;
    proto.mood = 'sad';
    try {
      await run(db.upsert('users', [{ email: 'bob@example.com', display_name: 'Bob 2' }, { email: 'dee@example.com', display_name: 'Dee' }], 'email'));
    } finally { delete proto.mood; }
    expect((await t.client.query(
      `SELECT email, display_name, mood FROM users WHERE email IN ('bob@example.com', 'dee@example.com') ORDER BY email`)).rows)
      .toEqual([{ email: 'bob@example.com', display_name: 'Bob 2', mood: 'ok' }, { email: 'dee@example.com', display_name: 'Dee', mood: null }]);
  });
});

describe('null as options, or as an options key', () => {
  it('null options run as no options in the read shortcuts, as in the writes', async () => {
    // Zapatos 6.6.1 ran selectOne() and selectExactlyOne() so, and threw a TypeError at the call in select() and count()
    expect(await run(db.selectOne('users', { id: 1 }, null as any))).toMatchObject({ id: 1, display_name: 'Ada' });
    expect(await run(db.selectExactlyOne('users', { id: 2 }, null as any))).toMatchObject({ id: 2, display_name: 'Bob' });
    expect((await run(db.select('users', all, null as any))).map((u: any) => u.display_name).sort()).toEqual(['Ada', 'Bob', 'Cyd']);
    expect(await run(db.count('users', all, null as any))).toBe(3);
    expect(await run(db.deletes('users', { id: 3 }, null as any))).toMatchObject([{ id: 3 }]);
  });

  it('returning: null or order: null rejects run() before any query', async () => {
    const sent: unknown[] = [];
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(run(db.update('users', { display_name: 'X' }, { id: 1 }, { returning: null as any })))
      .rejects.toThrow('`returning: null` has no meaning: for every column, leave `returning` out; for some, give an array of their names.');
    await expect(run(db.select('users', all, { order: null as any })))
      .rejects.toThrow('`order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them.');
    expect(sent).toEqual([]);
    expect(await scalar(`SELECT display_name AS v FROM users WHERE id = 1`)).toBe('Ada');
  });
});

describe('a shortcut as an insert(), upsert() or update() value, a scalar subquery (#656)', () => {
  // 6.6.1 wrote it bare, `VALUES (SELECT …)` and `ROW(SELECT …)`, which Postgres refuses (42601)
  const
    owner = sql`${'owner_id'} = ${'users'}.${'id'}`,
    ordered = { columns: ['balance'], order: { by: 'balance', direction: 'ASC' } } as const,
    zoo = 'extra.type_zoo' as any;

  it('stores what it gives in extras: an aggregate its value, a select its JSON', async () => {
    const row = await run(db.insert(zoo, {
      c_int8: db.count('accounts', all),
      c_numeric: db.sum('accounts', all, { columns: ['balance'] }),
      c_float8: db.avg('accounts', all, { columns: ['ratio'] }),
      c_varchar: db.min('users', all, { columns: ['display_name'] }),
      c_int4: db.max('users', all, { columns: ['id'] }).copy(),
      c_jsonb: db.select('accounts', { owner_id: 1 }, ordered),
      c_json: db.selectOne('accounts', { owner_id: 1 }, ordered),
      c_text: db.selectOne('accounts', { owner_id: 1 }, ordered),
      c_jsonb_domain: db.selectExactlyOne('accounts', { owner_id: 999 }, ordered),
    }));
    const maxId = await scalar('SELECT max(id) AS v FROM users');
    expect(row).toMatchObject({
      c_int8: 3, c_numeric: 1520.5, c_float8: 0.875, c_varchar: 'Ada', c_int4: maxId,
      c_jsonb: [{ balance: 20 }, { balance: 1500.5 }],
      c_json: { balance: 20 },
      // a text column takes the JSON's text
      c_text: '{"balance": 20.00}',
      // no row gives NULL: selectExactlyOne() does not throw there
      c_jsonb_domain: null,
    });
  });

  it('several rows, upsert() values and updateValues, update(), correlated with the row updated', async () => {
    const rows = await run(db.insert(zoo, [{ c_int8: db.count('accounts', all) }, { c_text: 'x' }]));
    expect(rows.map((r: any) => [r.c_int8, r.c_text])).toEqual([[3, null], [null, 'x']]);
    expect(await run(db.upsert('users', { email: 'new@example.com', display_name: 'New', manager_id: db.min('users', all, { columns: ['id'] }) }, 'email')))
      .toMatchObject({ email: 'new@example.com', manager_id: await scalar('SELECT min(id) AS v FROM users'), $action: 'INSERT' });
    expect(await run(db.upsert('users', { email: 'bob@example.com', display_name: 'Bob' }, 'email', { updateValues: { manager_id: db.count('accounts', owner) } })))
      .toMatchObject({ display_name: 'Bob', manager_id: 1, $action: 'UPDATE' });
    const updated = await run(db.update('users', { settings: db.select('accounts', owner, ordered) }, sql`TRUE`, { returning: ['display_name', 'settings'] }));
    expect(sortBy(updated, 'display_name')).toEqual([
      { display_name: 'Ada', settings: [{ balance: 20 }, { balance: 1500.5 }] },
      { display_name: 'Bob', settings: [{ balance: 0 }] },
      { display_name: 'Cyd', settings: [] },
      { display_name: 'New', settings: [] },
    ]);
  });

  it('more than one row is refused there, as in extras (21000)', async () => {
    expect((await fails(db.update('users', { manager_id: db.count('accounts', all, { groupBy: 'owner_id' }) }, { id: 3 }))).code).toBe('21000');
  });

  it('unchanged: a shortcut in parentheses in a sql fragment runs, bare in one and a write shortcut are refused (42601)', async () => {
    expect(await run(db.update('users', { manager_id: sql`(${db.count('accounts', all)})` }, { display_name: 'Cyd' }, { returning: ['manager_id'] })))
      .toEqual([{ manager_id: 3 }]);
    expect((await fails(db.update('users', { manager_id: sql`${db.count('accounts', all)} + 1` }, { display_name: 'Cyd' }))).code).toBe('42601');
    expect((await fails(db.update('users', { settings: db.deletes('accounts', { owner_id: 2 }) }, { display_name: 'Cyd' }))).code).toBe('42601');
  });
});

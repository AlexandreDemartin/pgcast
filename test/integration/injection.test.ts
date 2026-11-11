// Copyright (C) 2026 Alexandre Demartin
//
// What a hostile identifier achieves today, run against the fixture (compiled text:
// test/unit/injection.test.ts). Nothing is fixed here (chapter 2).
// Payloads stay harmless and inside this file's database: a SELECT, or the UPDATE
// below, undone by the ROLLBACK that ends each test (test/helpers/db.ts).
// pg sends a query with parameters through the extended protocol, which refuses
// several statements; a query without parameters goes through the simple protocol,
// which runs them all.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

const update = `UPDATE users SET display_name = 'injected' WHERE id = 1`;
const adaName = async () =>
  (await t.client.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = 1')).rows[0]!.display_name;

describe('values are data', () => {
  it('a hostile value in a Whereable is sent as a parameter', async () => {
    const q = db.select('users', { display_name: `Ada' OR '1' = '1` });
    expect(await q.run(t.client)).toEqual([]);
  });
});

describe('with parameters (extended protocol)', () => {
  it('characterization: a `"` in a Whereable key widens the filter', async () => {
    // characterization: `("id" IS NOT NULL OR "id" = $2)`: every row instead of none
    const q = db.select('users', { ['id" IS NOT NULL OR "id']: 0 } as any, { columns: ['id'], order: { by: 'id', direction: 'ASC' } });
    expect(q.compile().text).toContain(`WHERE ("id" IS NOT NULL OR "id" = $2)`);
    expect(await q.run(t.client)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('a second statement after a `"` in a string identifier is refused by pg', async () => {
    // `SELECT "display_name" FROM users; UPDATE …; SELECT "display_name" FROM "users" WHERE ("id" = $1)`
    const column = `display_name" FROM users; ${update}; SELECT "display_name`;
    const q = sql`SELECT ${column} FROM ${'users'} WHERE ${{ id: 1 }}`;
    expect(await pgError(t.client, () => q.run(t.client))).toMatchInlineSnapshot(`
      {
        "code": "42601",
        "message": "cannot insert multiple commands into a prepared statement",
      }
    `);
    expect(await adaName()).toBe('Ada');
  });

  it('characterization: a `"` in a param cast reads another expression', async () => {
    // characterization: `CAST($1 AS "text") || (SELECT …) || CAST('' AS "text")`, one statement
    const cast = `text") || (SELECT display_name FROM users WHERE id = 1) || CAST('' AS "text`;
    expect(await sql`SELECT ${param('x', cast)} AS v`.run(t.client)).toEqual([{ v: 'xAda' }]);
  });
});

describe('without parameters (simple protocol)', () => {
  it('characterization: a `"` in a string identifier runs a second statement', async () => {
    // characterization: `SELECT "display_name" FROM users; UPDATE …; SELECT "display_name" FROM "users"`
    const column = `display_name" FROM users; ${update}; SELECT "display_name`;
    await sql`SELECT ${column} FROM ${'users'}`.run(t.client);
    expect(await adaName()).toBe('injected');
  });

  it('characterization: a pre-quoted string identifier is raw and runs a second statement', async () => {
    // characterization: it starts and ends with `"`, so it is written as is
    const column = `"display_name" FROM users; ${update}; SELECT "display_name"`;
    await sql`SELECT ${column} FROM ${'users'}`.run(t.client);
    expect(await adaName()).toBe('injected');
  });

  it('characterization: lock.for is raw and runs a second statement', async () => {
    // characterization: `… FOR UPDATE) AS x; UPDATE …; SELECT (1) AS "sq_users"`; pg returns one
    // result per statement, so run() then throws, after the UPDATE has run
    const q = db.select('users', all, { lock: { for: `UPDATE) AS x; ${update}; SELECT (1` } } as any);
    expect(q.compile().values).toEqual([]);
    await expect(q.run(t.client)).rejects.toThrow(TypeError);
    expect(await adaName()).toBe('injected');
  });

  it('the ROLLBACK after each test undid the UPDATEs above', async () => {
    expect(await adaName()).toBe('Ada');
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// What a hostile identifier achieves today, run against the fixture (compiled text:
// test/unit/injection.test.ts). A test named `characterization:` is not fixed yet
// (chapter 2).
// Payloads stay harmless and inside this file's database: a SELECT, or the UPDATE
// below, undone by the ROLLBACK that ends each test (test/helpers/db.ts); each test
// that runs it reads the row again through another connection, which still sees 'Ada'.
// pg sends a query with parameters through the extended protocol, which refuses
// several statements; a query without parameters goes through the simple protocol,
// which runs them all.

import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { hostileCasts } from '../helpers/hostileCasts';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

const update = `UPDATE users SET display_name = 'injected' WHERE id = 1`;
const adaName = async (queryable: pg.ClientBase | pg.Pool = t.client) =>
  (await queryable.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = 1')).rows[0]!.display_name;
/** The UPDATE ran in this test's transaction, which another connection does not see. */
const expectInjectedHereOnly = async () => {
  expect(await adaName()).toBe('injected');
  expect(await adaName(t.pool)).toBe('Ada');
};

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

  it('no hostile cast reads anything: each is a missing type, a syntax error or a harmless name', async () => {
    // compiled text: test/unit/injection.test.ts; a row would show what the cast let through.
    // Rows: pg_catalog.int4, with whitespace around the dot as in 6.6.1; a comment between the parts
    // (commentBetween, lineCommentBetween) returned 1 under 6.6.1 and is now one missing type
    const outcomes: Record<string, unknown> = {};
    for (const [name, cast] of Object.entries(hostileCasts)) {
      await t.client.query('SAVEPOINT pgcast_cast');
      try {
        outcomes[name] = await sql`SELECT ${param('1', cast)} AS v`.run(t.client);
        await t.client.query('RELEASE SAVEPOINT pgcast_cast');
      } catch (err) {
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_cast');
        outcomes[name] = (err as { code?: string }).code;
      }
    }
    expect(outcomes).toMatchInlineSnapshot(`
      {
        "closes": "42704",
        "comment": "42704",
        "commentBetween": "42704",
        "dquote": "42704",
        "empty": "42601",
        "emptyLast": "42704",
        "emptyPart": "42704",
        "escaped": "42704",
        "leadingDot": "42704",
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

describe('without parameters (simple protocol)', () => {
  it('characterization: a `"` in a string identifier runs a second statement', async () => {
    // characterization: `SELECT "display_name" FROM users; UPDATE …; SELECT "display_name" FROM "users"`
    const column = `display_name" FROM users; ${update}; SELECT "display_name`;
    await sql`SELECT ${column} FROM ${'users'}`.run(t.client);
    await expectInjectedHereOnly();
  });

  it('characterization: a pre-quoted string identifier is raw and runs a second statement', async () => {
    // characterization: it starts and ends with `"`, so it is written as is
    const column = `"display_name" FROM users; ${update}; SELECT "display_name"`;
    await sql`SELECT ${column} FROM ${'users'}`.run(t.client);
    await expectInjectedHereOnly();
  });

  it('lock.for is checked before any query', async () => {
    expect(() => db.select('users', all, { lock: { for: `UPDATE) AS x; ${update}; SELECT (1` } } as any))
      .toThrow(`Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'UPDATE) AS x; ${update}; SELECT (1'`);
    expect(await adaName()).toBe('Ada');
  });

  it('the aggregate of select() is checked before any query', async () => {
    const aggregate = `count(*) FROM users; ${update}; SELECT count`;
    expect(() => db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate))
      .toThrow(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);
    expect(await adaName()).toBe('Ada');
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

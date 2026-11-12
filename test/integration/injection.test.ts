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

/** What each input gives as a column, a table and a Whereable key: its rows, or its error code. */
const identifierOutcomes = async (inputs: Record<string, string>) => {
  const outcomes: Record<string, unknown> = {};
  for (const [name, input] of Object.entries(inputs)) {
    for (const [where, q] of Object.entries({
      column: sql`SELECT ${input} FROM ${'users'}`,
      table: sql`SELECT 1 FROM ${input}`,
      key: sql`SELECT 1 FROM ${'users'} WHERE ${{ [input]: 1 }}`,
    })) {
      await t.client.query('SAVEPOINT pgcast_identifier');
      try {
        outcomes[`${name} ${where}`] = await q.run(t.client);
        await t.client.query('RELEASE SAVEPOINT pgcast_identifier');
      } catch (err) {
        await t.client.query('ROLLBACK TO SAVEPOINT pgcast_identifier');
        outcomes[`${name} ${where}`] = (err as { code?: string }).code;
      }
    }
  }
  return outcomes;
};

describe('values are data', () => {
  it('a hostile value in a Whereable is sent as a parameter', async () => {
    const q = db.select('users', { display_name: `Ada' OR '1' = '1` });
    expect(await q.run(t.client)).toEqual([]);
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
    // not through select(), which still writes its table name raw into "sq_<table>"
    expect(await sql`SELECT ${'my"col'} AS v FROM ${'my"table'} WHERE ${{ 'my"col': 1 }}`.run(t.client)).toEqual([{ v: 1 }]);
    expect(await sql`SELECT ${'my""col'} AS v FROM ${'my""table'} WHERE ${{ 'my""col': 1 }}`.run(t.client)).toEqual([{ v: 1 }]);
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
    // `\v` is whitespace from Postgres 17 (scan.l); before, a syntax error
    const { verticalTab, ...others } = outcomes;
    const { rows: [{ version }] } = await t.client.query("SELECT current_setting('server_version_num')::int AS version");
    expect(verticalTab).toEqual(version >= 170000 ? [{ v: 1 }] : '42601');
    expect(others).toMatchInlineSnapshot(`
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
    // compiled text: test/unit/injection.test.ts; each error is a name that does not exist, a syntax
    // error or a NUL refused by the protocol, and an error runs nothing after it
    expect(await identifierOutcomes({
      dquote: 'a"b', squote: "a'b", semicolon: 'a;b', dashes: 'a--b', comment: 'a/*b', dollar: 'a$1b',
      backslash: 'a\\b', nul: 'a\0b', dot: 'a.b',
      closes: `display_name" FROM users; ${update}; SELECT "display_name`,
      qualifiedCloses: `users"."display_name" FROM users; ${update}; SELECT "display_name`,
      escapedCloses: 'a"" OR TRUE OR ""b', qualifiedEscaped: 's.a"" OR TRUE OR ""b', escapedDot: 'a"."b',
      escapedNul: 'a""\0""b', escapedOdd: 'a"""b',
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
        "escapedNul column": "08P01",
        "escapedNul key": "08P01",
        "escapedNul table": "08P01",
        "escapedOdd column": "42703",
        "escapedOdd key": "42703",
        "escapedOdd table": "42P01",
        "nul column": "08P01",
        "nul key": "08P01",
        "nul table": "08P01",
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
      }
    `);
  });

  it('characterization: a pre-quoted string identifier is raw and runs a second statement', async () => {
    // characterization: it starts and ends with `"`, so it is written as is, even a lone `"`
    expect(await identifierOutcomes({ prequoted: '"a"', lone: '"' })).toMatchInlineSnapshot(`
      {
        "lone column": "42601",
        "lone key": "42601",
        "lone table": "42601",
        "prequoted column": "42703",
        "prequoted key": "42703",
        "prequoted table": "42P01",
      }
    `);
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

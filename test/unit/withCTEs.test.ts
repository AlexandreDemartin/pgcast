// Copyright (C) 2026 Alexandre Demartin
//
// withCTEs() (decision 010 § 2), compilation only: the `text` and `values` of the CTEs before each shortcut,
// the empty case, and what the result keeps of the main query. Run on the fixture:
// test/integration/withCTEs.test.ts; hostile names: test/unit/injection.test.ts.

import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, self, all } from '../../src/db';
import { resetConfig } from '../helpers/config';

afterEach(resetConfig);

const
  recent = sql`SELECT ${'id'} FROM ${'users'} WHERE ${'manager_id'} = ${param(1)}`,
  recentSQL = 'WITH "recent" AS (SELECT "id" FROM "users" WHERE "manager_id" = $1)',
  inRecent = { owner_id: sql`${self} IN (SELECT id FROM recent)` };

describe('withCTEs', () => {
  it('one CTE before count()', () => {
    expect(db.withCTEs({ recent }, db.count('accounts', inRecent)).compile()).toEqual({
      text: `${recentSQL} SELECT count(*) AS result FROM "accounts" WHERE (("owner_id" IN (SELECT id FROM recent)))`,
      values: [1],
    });
  });

  it('two CTEs, in the order of the object, the second reading the first', () => {
    const rich = sql`SELECT ${'owner_id'} FROM ${'accounts'} WHERE ${'owner_id'} IN (SELECT id FROM recent)`;
    expect(db.withCTEs({ recent, rich }, db.select('users', { id: sql`${self} IN (SELECT owner_id FROM rich)` }, { columns: ['id'] })).compile()).toEqual({
      text: `${recentSQL}, "rich" AS (SELECT "owner_id" FROM "accounts" WHERE "owner_id" IN (SELECT id FROM recent)) SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($2::text, "id") AS result FROM "users" WHERE (("id" IN (SELECT owner_id FROM rich)))) AS "sq_users"`,
      values: [1, 'id'],
    });
  });

  it('an integer key comes first, as Object.keys() gives it', () => {
    expect(db.withCTEs({ b: sql`SELECT 1`, 2: sql`SELECT 2`, a: sql`SELECT 3` }, sql`SELECT 4`).compile().text)
      .toBe('WITH "2" AS (SELECT 2), "b" AS (SELECT 1), "a" AS (SELECT 3) SELECT 4');
  });

  it('with no CTE, gives a copy of the query, its own SQL, a map built at run time included', () => {
    const query = db.selectOne('users', all), ctes: { [name: string]: db.SQLFragment } = {};
    for (const result of [db.withCTEs({}, query), db.withCTEs(ctes, query)]) {
      expect(result).not.toBe(query);
      expect(result.compile()).toEqual(query.compile());
      expect(result.runResultTransform).toBe(query.runResultTransform);
    }
    // an empty insert() stays a no-op, which sends nothing
    const empty = db.withCTEs({}, db.insert('users', []));
    expect([empty.noop, empty.noopResult, empty.compile().text]).toEqual([true, [], `/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "users" SELECT null WHERE false`]);
    ctes.recent = recent;
    expect(db.withCTEs(ctes, query).compile().text).toBe(`${recentSQL} SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $2`);
  });

  it('before each shortcut', () => {
    const before = (query: db.SQLFragment<any, any>) => db.withCTEs({ recent }, query).compile();
    expect({
      select: before(db.select('users', all)),
      selectOne: before(db.selectOne('users', all)),
      selectExactlyOne: before(db.selectExactlyOne('users', all)),
      count: before(db.count('users', all)),
      insert: before(db.insert('users', { email: 'eve@example.com', display_name: 'Eve' })),
      emptyInsert: before(db.insert('users', [])),
      emptyUpsert: before(db.upsert('users', [], 'email')),
    }).toEqual({
      select: { text: `${recentSQL} SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users") AS "sq_users"`, values: [1] },
      selectOne: { text: `${recentSQL} SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $2`, values: [1, 1] },
      selectExactlyOne: { text: `${recentSQL} SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $2`, values: [1, 1] },
      count: { text: `${recentSQL} SELECT count(*) AS result FROM "users"`, values: [1] },
      insert: { text: `${recentSQL} INSERT INTO "users" ("display_name", "email") VALUES ($2, $3) RETURNING to_jsonb("users".*) AS result`, values: [1, 'Eve', 'eve@example.com'] },
      // a no-op, an insert() or upsert() of no row, gives no row, from no table: the result is no no-op, so its CTEs run
      emptyInsert: { text: `${recentSQL} SELECT NULL::jsonb AS result WHERE false`, values: [1] },
      emptyUpsert: { text: `${recentSQL} SELECT NULL::jsonb AS result WHERE false`, values: [1] },
    });
  });

  it('a no-op as a CTE gives no row, a result column of none', () => {
    expect(db.withCTEs({ added: db.insert('users', []) }, sql`SELECT count(*) FROM added`).compile())
      .toEqual({ text: 'WITH "added" AS (SELECT NULL::jsonb AS result WHERE false) SELECT count(*) FROM added', values: [] });
  });

  it('selectExactlyOne() asks for a second row at the top level with selectExactlyOneChecksForSecondRow, as alone', () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    const one = db.selectExactlyOne('users', all);
    expect(db.withCTEs({ recent }, one).compile()).toEqual({
      text: `${recentSQL} SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $2`,
      values: [1, 2],
    });
    expect(db.withCTEs({}, one).compile()).toEqual({ text: 'SELECT to_jsonb("users".*) AS result FROM "users" LIMIT $1', values: [2] });
    // nested, LIMIT 1, as the shortcut nested; prepared on request, the name goes with the top-level text
    expect(db.select('accounts', all, { lateral: { u: db.withCTEs({ recent }, one) } }).compile().values).toEqual(['u', 1, 1]);
    expect(db.withCTEs({ recent }, one).prepared('one_with').compile()).toMatchObject({ values: [1, 2], name: 'one_with' });
  });

  it('a write shortcut as a CTE', () => {
    const eve = db.insert('users', { email: 'eve@example.com', display_name: 'Eve' }, { returning: ['id'] });
    expect(db.withCTEs({ eve }, db.select('users', all, { columns: ['display_name'] })).compile()).toEqual({
      text: `WITH "eve" AS (INSERT INTO "users" ("display_name", "email") VALUES ($1, $2) RETURNING jsonb_build_object($3::text, "id") AS result) SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($4::text, "display_name") AS result FROM "users") AS "sq_users"`,
      values: ['Eve', 'eve@example.com', 'id', 'display_name'],
    });
  });

  it('in parentheses as an extras value and as an insert() value, as the shortcut is', () => {
    expect(db.select('users', all, { extras: { n: db.withCTEs({ recent }, db.count('accounts', all)) } }).compile()).toEqual({
      text: `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, (WITH "recent" AS (SELECT "id" FROM "users" WHERE "manager_id" = $2) SELECT count(*) AS result FROM "accounts")) AS result FROM "users") AS "sq_users"`,
      values: ['n', 1],
    });
    const name = db.withCTEs({ recent }, db.selectOne('users', all, { columns: ['display_name'] }));
    expect(db.insert('users', { email: 'x@example.com', display_name: name as any }).compile()).toEqual({
      text: `INSERT INTO "users" ("display_name", "email") VALUES ((WITH "recent" AS (SELECT "id" FROM "users" WHERE "manager_id" = $1) SELECT jsonb_build_object($2::text, "display_name") AS result FROM "users" LIMIT $3), $4) RETURNING to_jsonb("users".*) AS result`,
      values: [1, 'display_name', 1, 'x@example.com'],
    });
    // a sql fragment as the main query is written as given, as the fragment itself is
    expect(db.select('users', all, { extras: { n: db.withCTEs({ recent }, sql`SELECT 1`) as db.SQLFragment<any> } }).compile().text)
      .toContain(`jsonb_build_object($1::text, ${recentSQL.replace('$1', '$2')} SELECT 1)`);
  });

  it('in a lateral, parent() in the main query and in a CTE naming the parent', () => {
    const mine = sql`SELECT ${'id'} FROM ${'accounts'} WHERE ${'owner_id'} = ${parent('id')}`;
    expect(db.select('users', all, { lateral: { n: db.withCTEs({ mine }, db.count('accounts', { owner_id: parent('id') })) } }).compile()).toEqual({
      text: `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_n".result) AS result FROM "users" LEFT JOIN LATERAL (WITH "mine" AS (SELECT "id" FROM "accounts" WHERE "owner_id" = "users"."id") SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_n" ON true) AS "sq_users"`,
      values: ['n'],
    });
  });

  it('a name is one identifier, its " doubled, never split on .', () => {
    expect(db.withCTEs({ Recent: sql`SELECT 1`, 'a.b': sql`SELECT 2`, '"q"': sql`SELECT 3` }, sql`SELECT 4`).compile().text)
      .toBe('WITH "Recent" AS (SELECT 1), "a.b" AS (SELECT 2), """q""" AS (SELECT 3) SELECT 4');
  });

  it('keeps what the main query carries: its transform, parentTable and select() mark; never a no-op', () => {
    const count = db.count('accounts', all), result = db.withCTEs({ recent }, count);
    expect(result).not.toBe(count);
    expect(result.runResultTransform).toBe(count.runResultTransform);
    expect(result['parenthesisedInExtras']).toBe(true);
    expect(db.withCTEs({ recent }, sql`SELECT 1`)['parenthesisedInExtras']).toBe(false);
    const nested = count.copy({ parentTable: 'u' });
    expect(db.withCTEs({ recent }, nested).parentTable).toBe('u');
    const empty = db.insert('users', []), emptyResult = db.withCTEs({ recent }, empty);
    expect([emptyResult.noop, emptyResult.noopResult]).toEqual([false, []]);
    // and so does a copy of the result
    const copied = result.copy();
    expect([copied.runResultTransform, copied['parenthesisedInExtras'], copied.compile().text])
      .toEqual([count.runResultTransform, true, result.compile().text]);
  });

  it('is never prepared, so a prepared main query or CTE keeps its name to its own text', () => {
    const query = db.count('accounts', all).prepared('accounts_count'), cte = sql`SELECT 1`.prepared('one');
    const result = db.withCTEs({ recent: cte }, query);
    expect(result.compile()).toEqual({ text: 'WITH "recent" AS (SELECT 1) SELECT count(*) AS result FROM "accounts"', values: [] });
    expect([result.preparedName, query.preparedName, cte.preparedName]).toEqual([undefined, 'accounts_count', 'one']);
    expect(query.compile()).toEqual({ text: 'SELECT count(*) AS result FROM "accounts"', values: [], name: 'accounts_count' });
    // prepared on request, under its own name
    expect(result.prepared('accounts_count_with').compile().name).toBe('accounts_count_with');
    // with no CTE, an unprepared copy too, so prepared() on it never renames the caller's query
    expect(db.withCTEs({}, query).compile()).toEqual({ text: 'SELECT count(*) AS result FROM "accounts"', values: [] });
    expect(db.withCTEs({}, query).prepared('accounts_count_none').compile().name).toBe('accounts_count_none');
    expect(query.compile().name).toBe('accounts_count');
  });
});

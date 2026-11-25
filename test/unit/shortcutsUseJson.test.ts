// Copyright (C) 2026 Alexandre Demartin
//
// shortcutsUseJson (decision 018 § 2) in select() and its kin, compilation only: each shape, on and off.
// Execution on the fixture, both ways: test/integration/shortcutsUseJson.test.ts.

import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, parent, all } from '../../src/db';
import { resetConfig } from '../helpers/config';

afterEach(resetConfig);

const
  on = <Q>(build: () => Q): Q => { db.setConfig({ shortcutsUseJson: true }); return build(); },
  off = <Q>(build: () => Q, value?: boolean): Q => { db.setConfig({ shortcutsUseJson: value } as db.NewConfig); return build(); },
  text = (q: db.SQLFragment<any, any>) => q.compile().text,
  order = { by: 'id', direction: 'ASC' } as const,
  accountsOf = (options = {}) => db.select('accounts', { owner_id: parent('id') }, { order, ...options }),
  count = () => db.count('accounts', { owner_id: parent('id') }),
  ofUser = { owner_id: sql`${db.self} = "users"."id"` };

/** Every shape of the reads, each a builder, so that it is built under the option as it stands. */
const shapes: Record<string, () => db.SQLFragment<any, any>> = {
  all: () => db.select('users', all),
  columns: () => db.select('users', all, { columns: ['id', 'email'] }),
  alias: () => db.select('users', all, { alias: 'u' }),
  distinctTrue: () => db.select('users', all, { distinct: true }),
  distinctTrueExtras: () => db.select('users', all, { distinct: true, extras: { upper: sql`upper(${'email'})` } }),
  distinctColumn: () => db.select('users', all, { distinct: 'mood' }),
  distinctExtras: () => db.select('users', all, {
    distinct: ['manager_id'], extras: { upper: sql`upper(${'display_name'})` },
    order: [{ by: 'manager_id', direction: 'ASC' }, { by: 'users.id' as any, direction: 'ASC' }, { by: sql`lower(${'display_name'})`, direction: 'ASC' }],
  }),
  distinctStringExtras: () => db.select('users', all, { distinct: 'mood', extras: { e: 'email' } }),
  groupBy: () => db.select('users', all, { columns: ['manager_id'], extras: { n: sql<db.SQL, number>`count(*)` }, groupBy: 'manager_id', having: sql`count(*) > 1` }),
  lateral: () => db.select('users', all, { order, lateral: { accounts: accountsOf() } }),
  lateralColumns: () => db.select('users', all, { columns: ['id', 'email'], order, lateral: { accounts: accountsOf({ columns: ['id'] }) } }),
  lateralAlias: () => db.select('users', all, { alias: 'u', lateral: { n: count() } }),
  lock: () => db.select('users', { id: 1 }, { lock: { for: 'UPDATE', of: 'users' }, lateral: { n: count() } }),
  noColumnsLateral: () => db.selectOne('users', { id: 1 }, { columns: [], lateral: { n: count() } }),
  passthrough: () => db.select('users', { id: 1 }, { lateral: db.selectOne('accounts', { owner_id: parent('id') }) }),
  selectOneExtras: () => db.selectOne('users', { id: 1 }, { extras: { latest: db.selectOne('accounts', ofUser, { order: { by: 'opened_on', direction: 'DESC' } }) } }),
  selectExactlyOne: () => db.selectExactlyOne('users', { id: 1 }, { extras: { e: 'email' } }),
  selectRows: () => db.selectRows('users', all, { extras: { e: 'email' } }),
  count: () => db.count('users', all),
  max: () => db.max('accounts', all, { columns: ['balance'] }),
  noopCTE: () => db.withCTEs({ none: db.insert('users', []) }, db.select('users', all)),
};

describe('shortcutsUseJson off', () => {
  it('false, or left out, gives the same SQL and values for every shape', () => {
    const compiled = (value?: boolean) => Object.fromEntries(Object.entries(shapes).map(([name, build]) => [name, off(build, value).compile()]));
    const leftOut = compiled();
    expect(leftOut.all.text).toBe(`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users") AS "sq_users"`);
    expect(compiled(false)).toEqual(leftOut);
  });

  it('a query keeps the SQL of the option as it stood at the call', () => {
    const before = shapes.lateral();
    db.setConfig({ shortcutsUseJson: true });
    expect(text(before)).toContain('jsonb_agg');
    const after = shapes.lateral();
    db.setConfig({ shortcutsUseJson: false });
    expect(text(after)).not.toContain('jsonb');
  });
});

describe('shortcutsUseJson on', () => {
  const compiled = (name: string) => on(shapes[name]).compile();

  it('every column, columns, alias: to_json, json_build_object and json_agg', () => {
    expect(compiled('all')).toEqual({ text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users") AS "sq_users"`, values: [] });
    expect(compiled('columns')).toEqual({ text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "id", $2::text, "email") AS result FROM "users") AS "sq_users"`, values: ['id', 'email'] });
    expect(compiled('alias').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("u".*) AS result FROM "users" AS "u") AS "sq_u"`);
  });

  it('distinct: true keeps the jsonb rows, merges included, under json_agg; distinct on columns builds json', () => {
    expect(compiled('distinctTrue').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("users".*) AS result FROM "users") AS "sq_users"`);
    expect(compiled('distinctTrueExtras')).toEqual({ text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("users".*) || jsonb_build_object($1::text, upper("email")) AS result FROM "users") AS "sq_users"`, values: ['upper'] });
    expect(compiled('distinctColumn').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("mood") to_json("users".*) AS result FROM "users") AS "sq_users"`);
  });

  it('every column with extras or a lateral map: to_json() of a row level, string order and distinct after the alias', () => {
    expect(compiled('lateral')).toEqual({
      text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "lateral_accounts".result AS "accounts" FROM "users" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") ORDER BY "id" ASC) AS "sq_accounts") AS "lateral_accounts" ON true ORDER BY "users"."id" ASC) AS "row_users") AS "sq_users"`,
      values: [],
    });
    expect(compiled('distinctExtras')).toEqual({
      text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_users".*) AS result FROM (SELECT DISTINCT ON ("users"."manager_id") "users".*, upper("display_name") AS "upper" FROM "users" ORDER BY "users"."manager_id" ASC, "users"."id" ASC, lower("display_name") ASC) AS "row_users") AS "sq_users"`,
      values: [],
    });
    expect(compiled('distinctStringExtras').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_users".*) AS result FROM (SELECT DISTINCT ON ("users"."mood") "users".*, "email" AS "e" FROM "users") AS "row_users") AS "sq_users"`);
    expect(compiled('lateralAlias').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_u".*) AS result FROM (SELECT "u".*, "lateral_n".result AS "n" FROM "users" AS "u" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "u"."id")) AS "lateral_n" ON true) AS "row_u") AS "sq_u"`);
    expect(compiled('lock')).toEqual({
      text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "lateral_n".result AS "n" FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_n" ON true WHERE ("id" = $1) FOR UPDATE OF "users") AS "row_users") AS "sq_users"`,
      values: [1],
    });
  });

  it('columns with extras or a lateral map: one json_build_object(), keys still parameters', () => {
    expect(compiled('lateralColumns')).toEqual({
      text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "id", $2::text, "email", $3::text, "lateral_accounts".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($4::text, "id") AS result FROM "accounts" WHERE ("owner_id" = "users"."id") ORDER BY "id" ASC) AS "sq_accounts") AS "lateral_accounts" ON true ORDER BY "id" ASC) AS "sq_users"`,
      values: ['id', 'email', 'accounts', 'id'],
    });
    expect(compiled('groupBy')).toEqual({
      text: `SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "manager_id", $2::text, count(*)) AS result FROM "users" GROUP BY "manager_id" HAVING count(*) > 1) AS "sq_users"`,
      values: ['manager_id', 'n'],
    });
    expect(compiled('noColumnsLateral')).toEqual({
      text: `SELECT json_build_object($1::text, "lateral_n".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_n" ON true WHERE ("id" = $2) LIMIT $3`,
      values: ['n', 1, 1],
    });
  });

  it('selectOne(), selectExactlyOne() and selectRows(): the row level alone', () => {
    expect(compiled('selectOneExtras')).toEqual({
      text: `SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE (("owner_id" = "users"."id")) ORDER BY "opened_on" DESC LIMIT $1) AS "latest" FROM "users" WHERE ("id" = $2) LIMIT $3) AS "row_users"`,
      values: [1, 1, 1],
    });
    expect(compiled('selectRows').text).toBe(`SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "email" AS "e" FROM "users") AS "row_users"`);
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    const exactlyOne = compiled('selectExactlyOne');
    expect(exactlyOne).toEqual({ text: `SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "email" AS "e" FROM "users" WHERE ("id" = $1) LIMIT $2) AS "row_users"`, values: [1, 2] });
    expect(sql`SELECT ${on(shapes.selectExactlyOne)}`.compile().values).toEqual([1, 1]);
  });

  it('a passed-through lateral, the aggregates and withCTEs()', () => {
    expect(compiled('passthrough').text).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT "lateral_passthru".result AS result FROM "users" LEFT JOIN LATERAL (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $1) AS "lateral_passthru" ON true WHERE ("id" = $2)) AS "sq_users"`);
    expect(compiled('count')).toEqual(off(shapes.count).compile());
    expect(compiled('max')).toEqual(off(shapes.max).compile());
    expect(compiled('noopCTE').text).toBe(`WITH "none" AS (SELECT NULL::json AS result WHERE false) SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users") AS "sq_users"`);
  });

  it('distinct: true over a passed-through lateral: to_jsonb() of a json child alone', () => {
    const owner = () => db.selectOne('users', { id: parent('owner_id') });
    expect(text(on(() => db.select('accounts', all, { distinct: true, lateral: owner() })))).toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result FROM "accounts" LEFT JOIN LATERAL (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = "accounts"."owner_id") LIMIT $1) AS "lateral_passthru" ON true) AS "sq_accounts"`);
    expect(text(on(() => db.selectOne('accounts', all, { distinct: true, lateral: db.select('users', { id: parent('owner_id') }) }))))
      .toBe(`SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result FROM "accounts" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = "accounts"."owner_id")) AS "sq_users") AS "lateral_passthru" ON true LIMIT $1`);
    // a passed-through child of a passed-through child: json too
    expect(text(on(() => db.select('accounts', all, { distinct: true, lateral: db.selectOne('users', { id: parent('owner_id') }, { lateral: db.selectOne('accounts', { owner_id: parent('id') }) }) }))))
      .toContain('SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result');
    // a copy() or withCTEs() child stands for the shortcut: json too
    for (const child of [on(owner).copy(), db.withCTEs({ s: sql`SELECT 1` }, on(owner)), db.withCTEs({}, on(owner))]) {
      expect(text(on(() => db.select('accounts', all, { distinct: true, lateral: child })))).toContain('SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result');
    }
    // a child of another kind keeps its type: an aggregate, a child built with the option off and its copy, a
    // distinct child, and a sql child given a shortcut's transform, the caller's SQL
    const borrowed = Object.assign(sql`SELECT 1 AS result`, { runResultTransform: on(owner).runResultTransform });
    for (const child of [db.count('accounts', { owner_id: parent('id') }), off(owner), off(owner).copy(), on(() => db.selectOne('users', { id: parent('owner_id') }, { distinct: true })), borrowed]) {
      expect(text(on(() => db.selectOne('users', all, { distinct: true, lateral: child })))).toContain('SELECT DISTINCT "lateral_passthru".result AS result');
    }
    // without distinct, or with distinct on columns, the child's json is kept
    expect(text(on(() => db.select('accounts', all, { distinct: 'owner_id', lateral: owner() })))).toContain('SELECT DISTINCT ON ("owner_id") "lateral_passthru".result AS result');
    expect(text(off(() => db.select('accounts', all, { distinct: true, lateral: owner() })))).toContain('SELECT DISTINCT "lateral_passthru".result AS result');
  });

  it('a key equal to a column is written twice, columns first, as || merges them', () => {
    expect(text(on(() => db.select('users', all, { extras: { email: sql`upper(${'email'})` }, order: { by: 'email', direction: 'ASC' } }))))
      .toBe(`SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, upper("email") AS "email" FROM "users" ORDER BY "users"."email" ASC) AS "row_users") AS "sq_users"`);
  });
});

describe('shortcutsUseJson: keys a row level cannot alias, and more keys than json_build_object() takes', () => {
  const
    failure = (q: db.SQLFragment<any, any>) => { try { q.compile(); return 'compiled'; } catch (err) { return (err as Error).message; } },
    beside = (key: string) => ({
      extras: failure(on(() => db.select('users', all, { extras: { [key]: 'email' } }))),
      lateral: failure(on(() => db.select('users', all, { lateral: { [key]: count() } }))),
      columns: failure(on(() => db.select('users', all, { columns: ['id'], extras: { [key]: 'email' } }))),
    });

  it('an empty key, a NUL and over 63 bytes in UTF-8 are refused beside every column, not beside columns', () => {
    const refused = (key: string, problem: string) => `The key ${JSON.stringify(key)} cannot be a column alias, which \`shortcutsUseJson\` makes of an \`extras\` or \`lateral\` key beside every column: ${problem}. Give \`columns\`, whose keys stay parameters, or set \`shortcutsUseJson: false\`.`;
    expect(beside('')).toEqual({ extras: refused('', 'it is empty'), lateral: refused('', 'it is empty'), columns: 'compiled' });
    expect(beside('a\0b')).toEqual({ extras: refused('a\0b', 'it holds a NUL'), lateral: refused('a\0b', 'it holds a NUL'), columns: 'compiled' });
    expect(beside('x'.repeat(64)).extras).toBe(refused('x'.repeat(64), "it takes 64 bytes in UTF-8, over Postgres's 63"));
    expect(beside('é'.repeat(32)).lateral).toBe(refused('é'.repeat(32), "it takes 64 bytes in UTF-8, over Postgres's 63"));
    expect(beside('x'.repeat(63))).toEqual({ extras: 'compiled', lateral: 'compiled', columns: 'compiled' });
    expect(beside('é'.repeat(31) + 'x')).toEqual({ extras: 'compiled', lateral: 'compiled', columns: 'compiled' });
    expect(refused('a\0b', 'it holds a NUL')).toContain('"a\\u0000b"');
  });

  it('a key is one quoted identifier, every " doubled, never split on .', () => {
    expect(text(on(() => db.selectRows('users', all, { extras: { 'a"b': 'id', 'a""b': 'id', 'a.b': 'id', 'année 🎬': 'id' } }))))
      .toBe(`SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "id" AS "a""b", "id" AS "a""""b", "id" AS "a.b", "id" AS "année 🎬" FROM "users") AS "row_users"`);
  });

  it('over 50 keys in one json_build_object(), columns, extras and lateral keys together, is refused as the query compiles', () => {
    const
      extras = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'id'])),
      laterals = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i}`, count()])),
      refused = (keys: number) => `\`shortcutsUseJson\` builds this row with one \`json_build_object()\`, which Postgres limits to 100 arguments: its ${keys} keys (columns, extras and lateral keys together) take ${keys * 2}. Give 50 keys at most, or set \`shortcutsUseJson: false\`, under which columns, extras and lateral keys take one \`jsonb_build_object()\` each.`;
    expect(failure(on(() => db.select('users', all, { columns: ['id', 'email'], extras: extras(24), lateral: laterals(24) })))).toBe('compiled');
    expect(failure(on(() => db.select('users', all, { columns: ['id', 'email'], extras: extras(25), lateral: laterals(24) })))).toBe(refused(51));
    expect(failure(on(() => db.selectOne('users', all, { columns: [], extras: extras(51) })))).toBe(refused(51));
    // every column, keys as aliases: no limit of the kind
    expect(failure(on(() => db.select('users', all, { extras: extras(60) })))).toBe('compiled');
    // off: each part its own jsonb_build_object()
    expect(failure(off(() => db.select('users', all, { columns: ['id', 'email'], extras: extras(25), lateral: laterals(24) })))).toBe('compiled');
  });
});

describe('shortcutsUseJson with topLevelSelectAsRows (note 018 § 3)', () => {
  const
    both = <Q>(build: () => Q): Q => { db.setConfig({ shortcutsUseJson: true, topLevelSelectAsRows: true }); return build(); },
    jsonAlone = <Q>(build: () => Q): Q => { db.setConfig({ shortcutsUseJson: true, topLevelSelectAsRows: false }); return build(); },
    owner = () => db.selectOne('users', { id: parent('owner_id') }),
    compiledText = (build: () => db.SQLFragment<any, any>) => both(build).compile().text,
    aggregated = (rows: string, alias: string) => `SELECT coalesce(json_agg(result), '[]') AS result FROM (${rows}) AS "sq_${alias}"`;

  it('select() on its own: selectRows()\'s query, its rows built with to_json', () => {
    expect(both(() => db.select('accounts', { owner_id: 1 }, { order })).compile()).toEqual({
      text: 'SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = $1) ORDER BY "id" ASC',
      values: [1],
    });
    // each select() shape but the passed-through lateral: the rows query that json_agg wraps with the json option alone
    for (const name of ['all', 'columns', 'distinctColumn', 'distinctExtras', 'distinctStringExtras', 'groupBy', 'lateral', 'lateralColumns', 'lock']) {
      const rows = both(shapes[name]).compile(), json = jsonAlone(shapes[name]).compile();
      expect(json, name).toEqual({ text: aggregated(rows.text, 'users'), values: rows.values });
    }
    const rows = both(shapes.lateralAlias).compile();
    expect(jsonAlone(shapes.lateralAlias).compile()).toEqual({ text: aggregated(rows.text, 'u'), values: rows.values });
  });

  it('a lateral map: the parent\'s rows are to_json() of a row level, each lateral select() its json_agg', () => {
    expect(both(shapes.lateral).compile()).toEqual({
      text: `SELECT to_json("row_users".*) AS result FROM (SELECT "users".*, "lateral_accounts".result AS "accounts" FROM "users" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") ORDER BY "id" ASC) AS "sq_accounts") AS "lateral_accounts" ON true ORDER BY "users"."id" ASC) AS "row_users"`,
      values: [],
    });
    expect(both(() => db.select('users', all, { columns: ['id'], lateral: { accounts: db.select('accounts', { owner_id: parent('id') }) } })).compile()).toEqual({
      text: `SELECT json_build_object($1::text, "id", $2::text, "lateral_accounts".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "sq_accounts") AS "lateral_accounts" ON true`,
      values: ['id', 'accounts'],
    });
  });

  it('withCTEs(): the main query its rows, a CTE its json_agg', () => {
    expect(both(() => db.withCTEs({ s: db.select('users', { id: 1 }) }, db.select('accounts', { owner_id: 1 }, { order }))).compile()).toEqual({
      text: `WITH "s" AS (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = $1)) AS "sq_users") SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = $2) ORDER BY "id" ASC`,
      values: [1, 1],
    });
  });

  it('a single lateral passed through is converted with to_json above the rows query, as json_agg() converts it', () => {
    expect(both(() => db.select('users', all, { order, lateral: db.selectOne('accounts', { owner_id: parent('id') }, { order }) })).compile()).toEqual({
      text: `SELECT to_json(result) AS result FROM (SELECT "lateral_passthru".result AS result FROM "users" LEFT JOIN LATERAL (SELECT to_json("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") ORDER BY "id" ASC LIMIT $1) AS "lateral_passthru" ON true ORDER BY "id" ASC) AS "sq_users"`,
      values: [1],
    });
    // a count() child: the bigint converted as json_agg() converts it
    expect(both(() => db.select('users', all, { lateral: count() })).compile().text)
      .toBe(`SELECT to_json(result) AS result FROM (SELECT "lateral_passthru".result AS result FROM "users" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id")) AS "lateral_passthru" ON true) AS "sq_users"`);
  });

  it('distinct: true keeps its jsonb rows, a json child compared as jsonb', () => {
    expect(compiledText(() => db.select('users', all, { distinct: true }))).toBe('SELECT DISTINCT to_jsonb("users".*) AS result FROM "users"');
    expect(compiledText(shapes.distinctTrueExtras)).toBe('SELECT DISTINCT to_jsonb("users".*) || jsonb_build_object($1::text, upper("email")) AS result FROM "users"');
    expect(compiledText(() => db.select('accounts', all, { distinct: true, lateral: owner() })))
      .toBe(`SELECT to_json(result) AS result FROM (SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result FROM "accounts" LEFT JOIN LATERAL (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = "accounts"."owner_id") LIMIT $1) AS "lateral_passthru" ON true) AS "sq_accounts"`);
    // a select() child stays nested, its json_agg marked json
    expect(compiledText(() => db.select('accounts', all, { distinct: true, lateral: db.select('users', { id: parent('owner_id') }) })))
      .toBe(`SELECT to_json(result) AS result FROM (SELECT DISTINCT to_jsonb("lateral_passthru".result) AS result FROM "accounts" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = "accounts"."owner_id")) AS "sq_users") AS "lateral_passthru" ON true) AS "sq_accounts"`);
  });
});

describe('shortcutsUseJson in the writes\' RETURNING (note 018 § 2)', () => {
  const
    row = { email: 'a@example.com', display_name: 'A' },
    upper = { upper: sql`upper(${'display_name'})` },
    insertSQL = 'INSERT INTO "users" ("display_name", "email") VALUES ($1, $2)',
    upsertSQL = `${insertSQL} ON CONFLICT ("email") DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name")`,
    action = `CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END`,
    writes: Record<string, () => db.SQLFragment<any, any>> = {
      insert: () => db.insert('users', row),
      insertMany: () => db.insert('users', [row, row]),
      insertReturning: () => db.insert('users', row, { returning: ['id', 'email'] }),
      insertExtras: () => db.insert('users', row, { extras: upper }),
      insertNoExtras: () => db.insert('users', row, { extras: {} }),
      insertReturningExtras: () => db.insert('users', row, { returning: ['id'], extras: upper }),
      insertQueryExtras: () => db.insert('users', row, { extras: { n: db.count('accounts', { owner_id: sql`${db.self} = "users"."id"` }) } }),
      insertQualified: () => db.insert('extra.type_zoo', { c_int4: 1 }, { extras: { j: 'c_json' } }),
      upsert: () => db.upsert('users', row, 'email'),
      upsertReturning: () => db.upsert('users', row, 'email', { returning: ['id'] }),
      upsertReturningNone: () => db.upsert('users', row, 'email', { returning: [] }),
      upsertExtras: () => db.upsert('users', row, 'email', { extras: upper }),
      upsertReturningExtras: () => db.upsert('users', row, 'email', { returning: ['id'], extras: upper }),
      upsertSuppress: () => db.upsert('users', row, 'email', { reportAction: 'suppress' }),
      upsertSuppressExtras: () => db.upsert('users', row, 'email', { reportAction: 'suppress', extras: upper }),
      upsertDoNothing: () => db.upsert('users', row, 'email', { updateColumns: db.doNothing }),
      update: () => db.update('users', { display_name: 'B' }, { id: 1 }),
      updateExtras: () => db.update('users', { display_name: 'B' }, { id: 1 }, { extras: upper }),
      updateReturning: () => db.update('users', { display_name: 'B' }, { id: 1 }, { returning: ['id'], extras: upper }),
      deletes: () => db.deletes('accounts', { id: 1 }),
      deletesExtras: () => db.deletes('accounts', { id: 1 }, { extras: { twice: sql`${'balance'} * 2` } }),
      deletesReturning: () => db.deletes('accounts', { id: 1 }, { returning: ['id'] }),
      insertNoop: () => db.insert('users', []),
      upsertNoop: () => db.upsert('users', [], 'email'),
      cte: () => db.withCTEs({ w: db.insert('users', row, { extras: upper }) }, db.select('users', all)),
      cteMain: () => db.withCTEs({ s: db.select('users', { id: 1 }) }, db.upsert('users', row, 'email')),
      cteNoop: () => db.withCTEs({ none: db.insert('users', []), nothing: db.upsert('users', [], 'email') }, db.deletes('accounts', { id: 1 })),
      cteNoopMain: () => db.withCTEs({ s: db.select('users', { id: 1 }) }, db.insert('users', [])),
      inSql: () => sql`WITH "w" AS (${db.update('users', { display_name: 'B' }, { id: 1 }, { extras: upper })}) SELECT result FROM "w"`,
    };

  it('off: false, or left out, gives master\'s SQL and values for every write', () => {
    const compiled = (value?: boolean) => Object.fromEntries(Object.entries(writes).map(([name, build]) => [name, off(build, value).compile()]));
    const leftOut = compiled();
    expect(leftOut.insertExtras.text).toBe(`${insertSQL} RETURNING to_jsonb("users".*) || jsonb_build_object($3::text, upper("display_name")) AS result`);
    expect(leftOut.upsertReturningExtras).toEqual({
      text: `${upsertSQL} RETURNING jsonb_build_object($3::text, "id") || jsonb_build_object($4::text, upper("display_name")) || jsonb_build_object('$action', ${action}) AS result`,
      values: ['A', 'a@example.com', 'id', 'upper'],
    });
    expect(leftOut.cteNoop.text).toBe(`WITH "none" AS (SELECT NULL::jsonb AS result WHERE false), "nothing" AS (SELECT NULL::jsonb AS result WHERE false) DELETE FROM "accounts" WHERE ("id" = $1) RETURNING to_jsonb("accounts".*) AS result`);
    expect(compiled(false)).toEqual(leftOut);
  });

  const compiled = (name: string) => on(writes[name]).compile();

  it('every column: to_json(); with extras or $action, to_json() of a scalar subquery\'s row, its keys aliases', () => {
    expect(compiled('insert')).toEqual({ text: `${insertSQL} RETURNING to_json("users".*) AS result`, values: ['A', 'a@example.com'] });
    expect(compiled('insertMany').text).toBe('INSERT INTO "users" ("display_name", "email") VALUES ($1, $2), ($3, $4) RETURNING to_json("users".*) AS result');
    expect(compiled('insertNoExtras').text).toBe(`${insertSQL} RETURNING to_json("users".*) AS result`);
    expect(compiled('insertExtras')).toEqual({
      text: `${insertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper") AS "row_users") AS result`,
      values: ['A', 'a@example.com'],
    });
    expect(compiled('insertQueryExtras').text).toBe(`${insertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, (SELECT count(*) AS result FROM "accounts" WHERE (("owner_id" = "users"."id"))) AS "n") AS "row_users") AS result`);
    expect(compiled('insertQualified').text).toBe(`INSERT INTO "extra"."type_zoo" ("c_int4") VALUES ($1) RETURNING (SELECT to_json("row_extra.type_zoo".*) FROM (SELECT "extra"."type_zoo".*, "c_json" AS "j") AS "row_extra.type_zoo") AS result`);
    expect(compiled('upsert')).toEqual({
      text: `${upsertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, ${action} AS "$action") AS "row_users") AS result`,
      values: ['A', 'a@example.com'],
    });
    expect(compiled('upsertExtras').text).toBe(`${upsertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper", ${action} AS "$action") AS "row_users") AS result`);
    expect(compiled('upsertSuppress').text).toBe(`${upsertSQL} RETURNING to_json("users".*) AS result`);
    expect(compiled('upsertSuppressExtras').text).toBe(`${upsertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper") AS "row_users") AS result`);
    expect(compiled('upsertDoNothing').text).toBe(`${insertSQL} ON CONFLICT ("email") DO NOTHING RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, ${action} AS "$action") AS "row_users") AS result`);
    expect(compiled('update')).toEqual({ text: 'UPDATE "users" SET ("display_name") = ROW($1) WHERE ("id" = $2) RETURNING to_json("users".*) AS result', values: ['B', 1] });
    expect(compiled('updateExtras').text).toBe('UPDATE "users" SET ("display_name") = ROW($1) WHERE ("id" = $2) RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper") AS "row_users") AS result');
    expect(compiled('deletes').text).toBe('DELETE FROM "accounts" WHERE ("id" = $1) RETURNING to_json("accounts".*) AS result');
    expect(compiled('deletesExtras')).toEqual({
      text: 'DELETE FROM "accounts" WHERE ("id" = $1) RETURNING (SELECT to_json("row_accounts".*) FROM (SELECT "accounts".*, "balance" * 2 AS "twice") AS "row_accounts") AS result',
      values: [1],
    });
  });

  it('returning: one json_build_object(), extras and $action included, keys still parameters', () => {
    expect(compiled('insertReturning')).toEqual({ text: `${insertSQL} RETURNING json_build_object($3::text, "id", $4::text, "email") AS result`, values: ['A', 'a@example.com', 'id', 'email'] });
    expect(compiled('insertReturningExtras')).toEqual({ text: `${insertSQL} RETURNING json_build_object($3::text, "id", $4::text, upper("display_name")) AS result`, values: ['A', 'a@example.com', 'id', 'upper'] });
    expect(compiled('upsertReturning')).toEqual({ text: `${upsertSQL} RETURNING json_build_object($3::text, "id", '$action', ${action}) AS result`, values: ['A', 'a@example.com', 'id'] });
    expect(compiled('upsertReturningNone').text).toBe(`${upsertSQL} RETURNING json_build_object('$action', ${action}) AS result`);
    expect(compiled('upsertReturningExtras')).toEqual({
      text: `${upsertSQL} RETURNING json_build_object($3::text, "id", $4::text, upper("display_name"), '$action', ${action}) AS result`,
      values: ['A', 'a@example.com', 'id', 'upper'],
    });
    expect(compiled('updateReturning').text).toBe('UPDATE "users" SET ("display_name") = ROW($1) WHERE ("id" = $2) RETURNING json_build_object($3::text, "id", $4::text, upper("display_name")) AS result');
    expect(compiled('deletesReturning').text).toBe('DELETE FROM "accounts" WHERE ("id" = $1) RETURNING json_build_object($2::text, "id") AS result');
  });

  it('a key equal to a column, or to $action, is written twice, in the order || merges them', () => {
    expect(text(on(() => db.upsert('users', row, 'email', { extras: { email: sql`upper(${'email'})`, $action: sql`'x'` } }))))
      .toBe(`${upsertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("email") AS "email", 'x' AS "$action", ${action} AS "$action") AS "row_users") AS result`);
    expect(text(on(() => db.upsert('users', row, 'email', { returning: ['email'], extras: { $action: sql`'x'` } }))))
      .toBe(`${upsertSQL} RETURNING json_build_object($3::text, "email", $4::text, 'x', '$action', ${action}) AS result`);
  });

  it('the no-op forms keep their SQL; as a CTE, a no-op is SELECT NULL::json', () => {
    expect(compiled('insertNoop')).toEqual(off(writes.insertNoop).compile());
    expect(compiled('upsertNoop')).toEqual(off(writes.upsertNoop).compile());
    expect(compiled('cteNoop').text).toBe('WITH "none" AS (SELECT NULL::json AS result WHERE false), "nothing" AS (SELECT NULL::json AS result WHERE false) DELETE FROM "accounts" WHERE ("id" = $1) RETURNING to_json("accounts".*) AS result');
    expect(compiled('cteNoopMain').text).toBe(`WITH "s" AS (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = $1)) AS "sq_users") SELECT NULL::json AS result WHERE false`);
  });

  it('as a CTE, as the main query of withCTEs() and in a sql template: the same RETURNING', () => {
    expect(compiled('cte').text).toBe(`WITH "w" AS (${insertSQL} RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper") AS "row_users") AS result) SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users") AS "sq_users"`);
    expect(compiled('cteMain').text).toBe(`WITH "s" AS (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("users".*) AS result FROM "users" WHERE ("id" = $1)) AS "sq_users") INSERT INTO "users" ("display_name", "email") VALUES ($2, $3) ON CONFLICT ("email") DO UPDATE SET ("email", "display_name") = ROW(EXCLUDED."email", EXCLUDED."display_name") RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, ${action} AS "$action") AS "row_users") AS result`);
    expect(compiled('inSql').text).toBe('WITH "w" AS (UPDATE "users" SET ("display_name") = ROW($1) WHERE ("id" = $2) RETURNING (SELECT to_json("row_users".*) FROM (SELECT "users".*, upper("display_name") AS "upper") AS "row_users") AS result) SELECT result FROM "w"');
  });

  it('returning: null and extras: null throw as the query compiles, as off', () => {
    const failure = (q: db.SQLFragment<any, any>) => { try { q.compile(); return 'compiled'; } catch (err) { return (err as Error).message; } };
    for (const build of [
      () => db.insert('users', row, { returning: null, extras: null } as any),
      () => db.upsert('users', row, 'email', { extras: null } as any),
      () => db.update('users', { display_name: 'B' }, { id: 1 }, { returning: null } as any),
      () => db.deletes('accounts', { id: 1 }, { returning: ['id'], extras: null } as any),
    ]) expect(failure(on(build))).toBe(failure(off(build)));
    expect(failure(on(() => db.insert('users', [], { returning: null } as any)))).toBe('compiled');
  });

  it('a key a row cannot alias is refused beside every column, not beside returning; over 50 keys, $action included, too', () => {
    const
      failure = (q: db.SQLFragment<any, any>) => { try { q.compile(); return 'compiled'; } catch (err) { return (err as Error).message; } },
      refused = (key: string, problem: string) => `The key ${JSON.stringify(key)} cannot be a column alias, which \`shortcutsUseJson\` makes of an \`extras\` key beside every column: ${problem}. Give \`returning\`, whose keys stay parameters, or set \`shortcutsUseJson: false\`.`,
      extras = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'id'])),
      tooMany = (keys: number) => `\`shortcutsUseJson\` builds this row with one \`json_build_object()\`, which Postgres limits to 100 arguments: its ${keys} keys (\`returning\`, \`extras\` and \`$action\` together) take ${keys * 2}. Give 50 keys at most, or set \`shortcutsUseJson: false\`, under which \`returning\`, \`extras\` and \`$action\` take one \`jsonb_build_object()\` each.`;
    expect(failure(on(() => db.insert('users', row, { extras: { '': 'id' } })))).toBe(refused('', 'it is empty'));
    expect(failure(on(() => db.update('users', { display_name: 'B' }, { id: 1 }, { extras: { 'a\0b': 'id' } })))).toBe(refused('a\0b', 'it holds a NUL'));
    expect(failure(on(() => db.upsert('users', row, 'email', { extras: { ['x'.repeat(64)]: 'id' } })))).toBe(refused('x'.repeat(64), "it takes 64 bytes in UTF-8, over Postgres's 63"));
    expect(failure(on(() => db.deletes('accounts', { id: 1 }, { extras: { ['x'.repeat(63)]: 'id' } })))).toBe('compiled');
    expect(failure(on(() => db.insert('users', row, { returning: ['id'], extras: { '': 'id' } })))).toBe('compiled');
    expect(failure(on(() => db.upsert('users', row, 'email', { returning: ['id'], extras: extras(48) })))).toBe('compiled');
    expect(failure(on(() => db.upsert('users', row, 'email', { returning: ['id'], extras: extras(49) })))).toBe(tooMany(51));
    expect(failure(on(() => db.insert('users', row, { returning: ['id'], extras: extras(49) })))).toBe('compiled');
    expect(failure(on(() => db.upsert('users', row, 'email', { extras: extras(60) })))).toBe('compiled');
    expect(failure(off(() => db.upsert('users', row, 'email', { returning: ['id'], extras: extras(49) })))).toBe('compiled');
  });
});

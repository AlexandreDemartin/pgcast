// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of every entry point of src/db/core.ts, shortcuts.ts and
// transaction.ts that writes a caller's string into the SQL text, under hostile
// inputs (skill sql-safety). Compilation only: each snapshot maps an input to the
// `text` it gives, or to the error it throws. What the text achieves once run:
// test/integration/injection.test.ts. A test named `characterization:` is not
// fixed yet (chapter 2).
// Inputs are cast to `any`: at run time they may come from untyped data (req.body).

import { describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, cols, vals, all } from '../../src/db';
import { hostileCasts } from '../helpers/hostileCasts';

const hostile = {
  dquote: 'a"b',
  squote: "a'b",
  semicolon: 'a;b',
  dashes: 'a--b',
  comment: 'a/*b',
  dollar: 'a$1b',
  backslash: 'a\\b',
  nul: 'a\0b',
  prequoted: '"a"',
  dot: 'a.b',
  lone: '"',
};

const visible = (text: string) =>
  text.replace(/\0/g, '<NUL>').replace(/\r/g, '<CR>').replace(/\f/g, '<FF>').replace(/\v/g, '<VT>');

/** The compiled text for each hostile input, or the error thrown; NUL, CR, FF and VT are shown as <NUL>, <CR>, <FF>, <VT>. */
const matrix = (build: (input: any) => db.SQLFragment<any, any>, inputs: Record<string, string> = hostile) =>
  Object.fromEntries(Object.entries(inputs).map(([name, input]) => {
    try {
      return [name, visible(build(input).compile().text)];
    } catch (err) {
      return [name, visible(`throws: ${(err as Error).message}`)];
    }
  }));

describe('identifiers', () => {
  it('characterization: a string (Table, Column): `"` is not doubled, a pre-quoted string is raw', () => {
    // characterization: `a"b` gives `"a"b"`: the quote closes the identifier; `.` is the only
    // character rewritten (`"a"."b"`); `"` alone starts and ends with `"`, so it is written raw
    expect(matrix(v => sql`SELECT ${v}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "a\\b"",
        "comment": "SELECT "a/*b"",
        "dashes": "SELECT "a--b"",
        "dollar": "SELECT "a$1b"",
        "dot": "SELECT "a"."b"",
        "dquote": "SELECT "a"b"",
        "lone": "SELECT "",
        "nul": "SELECT "a<NUL>b"",
        "prequoted": "SELECT "a"",
        "semicolon": "SELECT "a;b"",
        "squote": "SELECT "a'b"",
      }
    `);
  });

  it('characterization: Whereable keys', () => {
    expect(matrix(v => sql`WHERE ${{ [v]: 1 }}`)).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE ("a\\b" = $1)",
        "comment": "WHERE ("a/*b" = $1)",
        "dashes": "WHERE ("a--b" = $1)",
        "dollar": "WHERE ("a$1b" = $1)",
        "dot": "WHERE ("a"."b" = $1)",
        "dquote": "WHERE ("a"b" = $1)",
        "lone": "WHERE (" = $1)",
        "nul": "WHERE ("a<NUL>b" = $1)",
        "prequoted": "WHERE ("a" = $1)",
        "semicolon": "WHERE ("a;b" = $1)",
        "squote": "WHERE ("a'b" = $1)",
      }
    `);
  });

  it('characterization: cols / vals keys', () => {
    expect(matrix(v => sql`(${cols({ [v]: 1 })}) VALUES (${vals({ [v]: 1 })})`)).toMatchInlineSnapshot(`
      {
        "backslash": "("a\\b") VALUES ($1)",
        "comment": "("a/*b") VALUES ($1)",
        "dashes": "("a--b") VALUES ($1)",
        "dollar": "("a$1b") VALUES ($1)",
        "dot": "("a"."b") VALUES ($1)",
        "dquote": "("a"b") VALUES ($1)",
        "lone": "(") VALUES ($1)",
        "nul": "("a<NUL>b") VALUES ($1)",
        "prequoted": "("a") VALUES ($1)",
        "semicolon": "("a;b") VALUES ($1)",
        "squote": "("a'b") VALUES ($1)",
      }
    `);
  });

  it('characterization: cols of an array', () => {
    expect(matrix(v => sql`SELECT ${cols([v])}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "a\\b"",
        "comment": "SELECT "a/*b"",
        "dashes": "SELECT "a--b"",
        "dollar": "SELECT "a$1b"",
        "dot": "SELECT "a"."b"",
        "dquote": "SELECT "a"b"",
        "lone": "SELECT "",
        "nul": "SELECT "a<NUL>b"",
        "prequoted": "SELECT "a"",
        "semicolon": "SELECT "a;b"",
        "squote": "SELECT "a'b"",
      }
    `);
  });
  it('characterization: the column of parent()', () => {
    expect(matrix(v => sql`WHERE ${{ owner_id: db.parent(v) }}`.copy({ parentTable: 'users' }))).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE ("owner_id" = "users"."a\\b")",
        "comment": "WHERE ("owner_id" = "users"."a/*b")",
        "dashes": "WHERE ("owner_id" = "users"."a--b")",
        "dollar": "WHERE ("owner_id" = "users"."a$1b")",
        "dot": "WHERE ("owner_id" = "users"."a"."b")",
        "dquote": "WHERE ("owner_id" = "users"."a"b")",
        "lone": "WHERE ("owner_id" = "users".")",
        "nul": "WHERE ("owner_id" = "users"."a<NUL>b")",
        "prequoted": "WHERE ("owner_id" = "users"."a")",
        "semicolon": "WHERE ("owner_id" = "users"."a;b")",
        "squote": "WHERE ("owner_id" = "users"."a'b")",
      }
    `);
  });
});

describe('values stay parameters', () => {
  it('vals values, Whereable values and extras keys are sent as $n', () => {
    for (const input of Object.values(hostile)) {
      expect(sql`${vals({ a: input })}`.compile()).toEqual({ text: '$1', values: [input] });
      expect(sql`${{ a: input }}`.compile()).toEqual({ text: '("a" = $1)', values: [input] });
      const extras = db.select('users', all, { extras: { [input]: sql`1` } } as any).compile();
      expect(extras.values).toEqual([input]);
      expect(db.conditions.fromNow(1, input as any).compile()).toEqual({ text: 'now() + $1', values: [`1 ${input}`] });
    }
  });
});

describe('shortcut arguments', () => {
  it('characterization: the table name, also written raw into "sq_<table>" by select', () => {
    expect(matrix(v => db.select(v, all))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a\\b".*) AS result FROM "a\\b") AS "sq_a\\b"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a/*b".*) AS result FROM "a/*b") AS "sq_a/*b"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a--b".*) AS result FROM "a--b") AS "sq_a--b"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a$1b".*) AS result FROM "a$1b") AS "sq_a$1b"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"."b".*) AS result FROM "a"."b") AS "sq_a.b"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"b".*) AS result FROM "a"b") AS "sq_a"b"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb(".*) AS result FROM ") AS "sq_""",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a<NUL>b".*) AS result FROM "a<NUL>b") AS "sq_a<NUL>b"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a".*) AS result FROM "a") AS "sq_"a""",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a;b".*) AS result FROM "a;b") AS "sq_a;b"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a'b".*) AS result FROM "a'b") AS "sq_a'b"",
      }
    `);
    // insert, update, upsert and truncate write it the same way, without "sq_"
    expect(matrix(v => db.deletes(v, { id: 1 } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "DELETE FROM "a\\b" WHERE ("id" = $1) RETURNING to_jsonb("a\\b".*) AS result",
        "comment": "DELETE FROM "a/*b" WHERE ("id" = $1) RETURNING to_jsonb("a/*b".*) AS result",
        "dashes": "DELETE FROM "a--b" WHERE ("id" = $1) RETURNING to_jsonb("a--b".*) AS result",
        "dollar": "DELETE FROM "a$1b" WHERE ("id" = $1) RETURNING to_jsonb("a$1b".*) AS result",
        "dot": "DELETE FROM "a"."b" WHERE ("id" = $1) RETURNING to_jsonb("a"."b".*) AS result",
        "dquote": "DELETE FROM "a"b" WHERE ("id" = $1) RETURNING to_jsonb("a"b".*) AS result",
        "lone": "DELETE FROM " WHERE ("id" = $1) RETURNING to_jsonb(".*) AS result",
        "nul": "DELETE FROM "a<NUL>b" WHERE ("id" = $1) RETURNING to_jsonb("a<NUL>b".*) AS result",
        "prequoted": "DELETE FROM "a" WHERE ("id" = $1) RETURNING to_jsonb("a".*) AS result",
        "semicolon": "DELETE FROM "a;b" WHERE ("id" = $1) RETURNING to_jsonb("a;b".*) AS result",
        "squote": "DELETE FROM "a'b" WHERE ("id" = $1) RETURNING to_jsonb("a'b".*) AS result",
      }
    `);
  });

  it('the aggregate of select() in Numeric mode is checked at run time', () => {
    // count(), sum(), avg(), min() and max() pass a constant; select() itself is public;
    // `a.b`, `"a"` and `a$1b` are function names, written as before
    expect(matrix(v => db.select('users', all, {}, db.SelectResultMode.Numeric, v))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a\\b'",
        "comment": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a/*b'",
        "dashes": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a--b'",
        "dollar": "SELECT a$1b(*) AS result FROM "users"",
        "dot": "SELECT a.b(*) AS result FROM "users"",
        "dquote": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a"b'",
        "lone": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '"'",
        "nul": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a<NUL>b'",
        "prequoted": "SELECT "a"(*) AS result FROM "users"",
        "semicolon": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a;b'",
        "squote": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a'b'",
      }
    `);
  });

  it('a function name as the aggregate, as Postgres lexes one, is written as before', () => {
    const numeric = (aggregate?: string) => db.select('users', all, { columns: ['id'] }, db.SelectResultMode.Numeric, aggregate).compile().text;
    expect(numeric(undefined)).toBe('SELECT count("id") AS result FROM "users"');  // the default, also without strictNullChecks
    expect(numeric('my_agg2')).toBe('SELECT my_agg2("id") AS result FROM "users"');
    expect(numeric('_médiane')).toBe('SELECT _médiane("id") AS result FROM "users"');
    expect(numeric('"MyAgg"')).toBe('SELECT "MyAgg"("id") AS result FROM "users"');
    expect(numeric('pg_catalog.count')).toBe('SELECT pg_catalog.count("id") AS result FROM "users"');
    expect(numeric('"Stats"."MyAgg"')).toBe('SELECT "Stats"."MyAgg"("id") AS result FROM "users"');
    expect(numeric('my$agg')).toBe('SELECT my$agg("id") AS result FROM "users"');
    expect(numeric('a$1b')).toBe('SELECT a$1b("id") AS result FROM "users"');
    expect(numeric('e\u0301tendue')).toBe('SELECT e\u0301tendue("id") AS result FROM "users"');  // NFD
    expect(numeric('"my agg"')).toBe('SELECT "my agg"("id") AS result FROM "users"');
    expect(numeric('"a""b"')).toBe('SELECT "a""b"("id") AS result FROM "users"');
    expect(numeric('"Stats-2024"')).toBe('SELECT "Stats-2024"("id") AS result FROM "users"');
    expect(numeric(' count')).toBe('SELECT  count("id") AS result FROM "users"');
    expect(numeric('count\n')).toBe('SELECT count\n("id") AS result FROM "users"');
    expect(numeric('my_db.pg_catalog.count')).toBe('SELECT my_db.pg_catalog.count("id") AS result FROM "users"');
    expect(numeric('pg_catalog . count')).toBe('SELECT pg_catalog . count("id") AS result FROM "users"');
    expect(numeric('U&"c\\006Funt"')).toBe('SELECT U&"c\\006Funt"("id") AS result FROM "users"');
    expect(numeric('u&"c\\006Funt"')).toBe('SELECT u&"c\\006Funt"("id") AS result FROM "users"');
  });

  it('a null aggregate is written as null, as in 6.6.1', () => {
    // RegExp.test(null) tests the string 'null', a valid name; Postgres refuses the SQL, as before
    expect(db.select('users', all, { columns: ['id'] }, db.SelectResultMode.Numeric, null as any).compile().text)
      .toBe('SELECT null("id") AS result FROM "users"');
  });

  it('the aggregate of select() is ignored, as before, outside Numeric mode', () => {
    expect(db.select('users', all, {}, db.SelectResultMode.Many, 'a;b').compile().text)
      .toBe(db.select('users', all).compile().text);
  });

  it('an aggregate that is not a function name throws', () => {
    const numeric = (aggregate: any) => () => db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate);
    for (const aggregate of ['', '1count', '$a', 'a.b.c.d', 'a.', '.a', 'a..b', 'a. .b', 'U&""', 'U& "a"', '&"a"', '""', '"a', 'a"', '"a"b"', '"a\0b"', 'count(*) FROM users; SELECT count', 'a b', 'a\nb', 'count\n;'])
      expect(numeric(aggregate), aggregate).toThrow(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);
  });

  it('an aggregate check stays fast on a long run of spaces', () => {
    // a non-ASCII space is a letter to Postgres, so `\u00a0count` is one name and `\u00a0"a"` is two
    const numeric = (aggregate: string) => () => db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate);
    expect(numeric('\u00a0count')).not.toThrow();
    expect(numeric('\u00a0"a"')).toThrow();
    for (const aggregate of ['\u00a0'.repeat(100_000) + ';', ' '.repeat(100_000) + ';', `a${' '.repeat(100_000)}.${' '.repeat(100_000)};`])
      expect(numeric(aggregate)).toThrow('Aggregate must be a function name');
  });

  it('a U& quoted aggregate with a UESCAPE clause throws', () => {
    // valid in 6.6.1, but not a name alone: `U&"c!006Funt" UESCAPE '!'`
    for (const aggregate of [`U&"c!006Funt" UESCAPE '!'`, `U&"c!006Funt"UESCAPE'!'`])
      expect(() => db.select('users', all, {}, db.SelectResultMode.Numeric, aggregate), aggregate)
        .toThrow(`Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '${aggregate}'`);
  });

  it('characterization: upsert values keys, also written after EXCLUDED.', () => {
    expect(matrix(v => db.upsert('users', { [v]: 1 } as any, 'email'))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("a\\b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(EXCLUDED."a\\b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("a/*b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(EXCLUDED."a/*b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("a--b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(EXCLUDED."a--b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("a$1b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(EXCLUDED."a$1b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("a"."b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(EXCLUDED."a"."b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("a"b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"b") = ROW(EXCLUDED."a"b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" (") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET (") = ROW(EXCLUDED.") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("a<NUL>b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(EXCLUDED."a<NUL>b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("a") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(EXCLUDED."a") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("a;b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(EXCLUDED."a;b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("a'b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(EXCLUDED."a'b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });

  it('characterization: upsert conflict columns', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, v))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a\\b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a/*b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a--b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a$1b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"."b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT (") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a<NUL>b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a;b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a'b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });

  it('characterization: upsert constraint()', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, db.constraint(v)))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a\\b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a/*b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a--b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a$1b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"."b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT " DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a<NUL>b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a;b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a'b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });
});

describe('shortcut options', () => {
  it('characterization: columns', () => {
    expect(matrix(v => db.select('users', all, { columns: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a\\b") AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a/*b") AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a--b") AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a$1b") AS result FROM "users") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"."b") AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"b") AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, ") AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a<NUL>b") AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a") AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a;b") AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a'b") AS result FROM "users") AS "sq_users"",
      }
    `);
  });

  it('characterization: returning', () => {
    // insert, update and upsert build it the same way (SQLForColumnsOfTable)
    expect(matrix(v => db.deletes('users', { id: 1 }, { returning: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a\\b") AS result",
        "comment": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a/*b") AS result",
        "dashes": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a--b") AS result",
        "dollar": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a$1b") AS result",
        "dot": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"."b") AS result",
        "dquote": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"b") AS result",
        "lone": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, ") AS result",
        "nul": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a<NUL>b") AS result",
        "prequoted": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a") AS result",
        "semicolon": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a;b") AS result",
        "squote": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a'b") AS result",
      }
    `);
  });

  it('characterization: order.by', () => {
    expect(matrix(v => db.select('users', all, { order: { by: v, direction: 'ASC' } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a\\b" ASC) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a/*b" ASC) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a--b" ASC) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a$1b" ASC) AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"."b" ASC) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"b" ASC) AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY " ASC) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a<NUL>b" ASC) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a" ASC) AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a;b" ASC) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a'b" ASC) AS "sq_users"",
      }
    `);
  });

  it('characterization: upsert updateColumns, written after EXCLUDED.', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(EXCLUDED."a\\b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(EXCLUDED."a/*b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(EXCLUDED."a--b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(EXCLUDED."a$1b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(EXCLUDED."a"."b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"b") = ROW(EXCLUDED."a"b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET (") = ROW(EXCLUDED.") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(EXCLUDED."a<NUL>b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(EXCLUDED."a") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(EXCLUDED."a;b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(EXCLUDED."a'b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
    // with noNullUpdateColumns, the same column is also written after the table name
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [v], noNullUpdateColumns: all } as any)))
      .toMatchInlineSnapshot(`
        {
          "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(CASE WHEN EXCLUDED."a\\b" IS NULL THEN "users"."a\\b" ELSE EXCLUDED."a\\b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(CASE WHEN EXCLUDED."a/*b" IS NULL THEN "users"."a/*b" ELSE EXCLUDED."a/*b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(CASE WHEN EXCLUDED."a--b" IS NULL THEN "users"."a--b" ELSE EXCLUDED."a--b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(CASE WHEN EXCLUDED."a$1b" IS NULL THEN "users"."a$1b" ELSE EXCLUDED."a$1b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(CASE WHEN EXCLUDED."a"."b" IS NULL THEN "users"."a"."b" ELSE EXCLUDED."a"."b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"b") = ROW(CASE WHEN EXCLUDED."a"b" IS NULL THEN "users"."a"b" ELSE EXCLUDED."a"b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET (") = ROW(CASE WHEN EXCLUDED." IS NULL THEN "users"." ELSE EXCLUDED." END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(CASE WHEN EXCLUDED."a<NUL>b" IS NULL THEN "users"."a<NUL>b" ELSE EXCLUDED."a<NUL>b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(CASE WHEN EXCLUDED."a" IS NULL THEN "users"."a" ELSE EXCLUDED."a" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(CASE WHEN EXCLUDED."a;b" IS NULL THEN "users"."a;b" ELSE EXCLUDED."a;b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(CASE WHEN EXCLUDED."a'b" IS NULL THEN "users"."a'b" ELSE EXCLUDED."a'b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        }
      `);
  });

  it('characterization: upsert updateValues keys, and string values compiled as identifiers', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [], updateValues: { [v]: sql`1` } } as any)))
      .toMatchInlineSnapshot(`
        {
          "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET (") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        }
      `);
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [], updateValues: { mood: v } } as any)))
      .toMatchInlineSnapshot(`
        {
          "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a\\b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a/*b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a--b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a$1b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a"."b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a"b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW(") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a<NUL>b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a;b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW("a'b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        }
      `);
  });

  it('characterization: extras keys', () => {
    expect(matrix(v => db.select('users', all, { extras: { [v]: sql`1` } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
      }
    `);
  });

  it('characterization: lateral keys are written raw into "lateral_<key>"', () => {
    const sub = db.selectOne('accounts', { owner_id: db.parent('id') });
    expect(matrix(v => db.select('users', all, { lateral: { [v]: sub } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a\\b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a\\b" ON true) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a/*b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a/*b" ON true) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a--b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a--b" ON true) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a$1b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a$1b" ON true) AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a.b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a.b" ON true) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a"b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a"b" ON true) AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_"".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_"" ON true) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a<NUL>b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a<NUL>b" ON true) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_"a"".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_"a"" ON true) AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a;b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a;b" ON true) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a'b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a'b" ON true) AS "sq_users"",
      }
    `);
  });

  it('characterization: alias, also written raw into "sq_<alias>"', () => {
    expect(matrix(v => db.select('users', all, { alias: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a\\b".*) AS result FROM "users" AS "a\\b") AS "sq_a\\b"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a/*b".*) AS result FROM "users" AS "a/*b") AS "sq_a/*b"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a--b".*) AS result FROM "users" AS "a--b") AS "sq_a--b"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a$1b".*) AS result FROM "users" AS "a$1b") AS "sq_a$1b"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"."b".*) AS result FROM "users" AS "a"."b") AS "sq_a.b"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"b".*) AS result FROM "users" AS "a"b") AS "sq_a"b"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb(".*) AS result FROM "users" AS ") AS "sq_""",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a<NUL>b".*) AS result FROM "users" AS "a<NUL>b") AS "sq_a<NUL>b"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a".*) AS result FROM "users" AS "a") AS "sq_"a""",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a;b".*) AS result FROM "users" AS "a;b") AS "sq_a;b"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a'b".*) AS result FROM "users" AS "a'b") AS "sq_a'b"",
      }
    `);
  });

  it('order.direction and order.nulls are checked at run time', () => {
    expect(matrix(v => db.select('users', all, { order: { by: 'id', direction: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Direction must be ASC/DESC, not 'a\\b'",
        "comment": "throws: Direction must be ASC/DESC, not 'a/*b'",
        "dashes": "throws: Direction must be ASC/DESC, not 'a--b'",
        "dollar": "throws: Direction must be ASC/DESC, not 'a$1b'",
        "dot": "throws: Direction must be ASC/DESC, not 'a.b'",
        "dquote": "throws: Direction must be ASC/DESC, not 'a"b'",
        "lone": "throws: Direction must be ASC/DESC, not '"'",
        "nul": "throws: Direction must be ASC/DESC, not 'a<NUL>b'",
        "prequoted": "throws: Direction must be ASC/DESC, not '"a"'",
        "semicolon": "throws: Direction must be ASC/DESC, not 'a;b'",
        "squote": "throws: Direction must be ASC/DESC, not 'a'b'",
      }
    `);
    expect(matrix(v => db.select('users', all, { order: { by: 'id', direction: 'ASC', nulls: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Nulls must be FIRST/LAST/undefined, not 'a\\b'",
        "comment": "throws: Nulls must be FIRST/LAST/undefined, not 'a/*b'",
        "dashes": "throws: Nulls must be FIRST/LAST/undefined, not 'a--b'",
        "dollar": "throws: Nulls must be FIRST/LAST/undefined, not 'a$1b'",
        "dot": "throws: Nulls must be FIRST/LAST/undefined, not 'a.b'",
        "dquote": "throws: Nulls must be FIRST/LAST/undefined, not 'a"b'",
        "lone": "throws: Nulls must be FIRST/LAST/undefined, not '"'",
        "nul": "throws: Nulls must be FIRST/LAST/undefined, not 'a<NUL>b'",
        "prequoted": "throws: Nulls must be FIRST/LAST/undefined, not '"a"'",
        "semicolon": "throws: Nulls must be FIRST/LAST/undefined, not 'a;b'",
        "squote": "throws: Nulls must be FIRST/LAST/undefined, not 'a'b'",
      }
    `);
  });

  it('lock.for and lock.wait are checked at run time', () => {
    expect(matrix(v => db.select('users', all, { lock: { for: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a\\b'",
        "comment": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a/*b'",
        "dashes": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a--b'",
        "dollar": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a$1b'",
        "dot": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a.b'",
        "dquote": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a"b'",
        "lone": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"'",
        "nul": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a<NUL>b'",
        "prequoted": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"a"'",
        "semicolon": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a;b'",
        "squote": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a'b'",
      }
    `);
    expect(matrix(v => db.select('users', all, { lock: { for: 'UPDATE', wait: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a\\b'",
        "comment": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a/*b'",
        "dashes": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a--b'",
        "dollar": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a$1b'",
        "dot": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a.b'",
        "dquote": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a"b'",
        "lone": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"'",
        "nul": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a<NUL>b'",
        "prequoted": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"a"'",
        "semicolon": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a;b'",
        "squote": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a'b'",
      }
    `);
  });

  it('characterization: lock.of', () => {
    expect(matrix(v => db.select('users', all, { lock: { for: 'UPDATE', of: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a\\b") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a/*b") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a--b") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a$1b") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"."b") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"b") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF ") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a'b") AS "sq_users"",
      }
    `);
  });

  it('truncate options are checked at run time', () => {
    expect(matrix(v => db.truncate('users', v))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a\\b'",
        "comment": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a/*b'",
        "dashes": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a--b'",
        "dollar": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a$1b'",
        "dot": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a.b'",
        "dquote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"b'",
        "lone": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"'",
        "nul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a<NUL>b'",
        "prequoted": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"'",
        "semicolon": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a;b'",
        "squote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a'b'",
      }
    `);
    expect(matrix(v => db.truncate('users', 'RESTART IDENTITY', v))).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a\\b'",
        "comment": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a/*b'",
        "dashes": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a--b'",
        "dollar": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a$1b'",
        "dot": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a.b'",
        "dquote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"b'",
        "lone": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"'",
        "nul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a<NUL>b'",
        "prequoted": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"'",
        "semicolon": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a;b'",
        "squote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a'b'",
      }
    `);
  });

  it('characterization: distinct and groupBy', () => {
    expect(matrix(v => db.select('users', all, { distinct: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a\\b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a/*b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a--b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a$1b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"."b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON (") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a<NUL>b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a;b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a'b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
      }
    `);
    expect(matrix(v => db.select('users', all, { groupBy: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a\\b") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a/*b") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a--b") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a$1b") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"."b") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"b") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY ") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a'b") AS "sq_users"",
      }
    `);
  });
});

describe('param cast', () => {
  it('the cast type is one quoted identifier: `"` is doubled', () => {
    // as quote_ident: `a"b` gives `"a""b"`; a pre-quoted type is quoted again, not written raw
    expect(matrix(v => sql`SELECT ${param(1, v)}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT CAST($1 AS "a\\b")",
        "comment": "SELECT CAST($1 AS "a/*b")",
        "dashes": "SELECT CAST($1 AS "a--b")",
        "dollar": "SELECT CAST($1 AS "a$1b")",
        "dot": "SELECT CAST($1 AS "a.b")",
        "dquote": "SELECT CAST($1 AS "a""b")",
        "lone": "SELECT CAST($1 AS """")",
        "nul": "SELECT CAST($1 AS "a<NUL>b")",
        "prequoted": "SELECT CAST($1 AS """a""")",
        "semicolon": "SELECT CAST($1 AS "a;b")",
        "squote": "SELECT CAST($1 AS "a'b")",
      }
    `);
  });

  it('a cast that closes its quotes compiles to one type name, and its values are untouched', () => {
    const q = sql`SELECT ${param(1, 'int4") || (SELECT secret FROM t) || ("int4')}`.compile();
    expect(q.text).toBe('SELECT CAST($1 AS "int4"") || (SELECT secret FROM t) || (""int4")');
    expect(q.values).toEqual([1]);
  });

  it('a cast is written as is only if it is well-formed once quoted', () => {
    // `"${cast}"` passes as is only as quoted identifiers without NUL joined by `.`, with whitespace
    // around it but no comment (qualified, threeParts, escaped, leadingDot, newlineInside, newlineOutside,
    // spacesAroundDot, tabsAroundDot, otherSpaces, verticalTab); any other cast is one identifier, `"` doubled
    expect(matrix(v => sql`SELECT ${param(1, v)}`, hostileCasts)).toMatchInlineSnapshot(`
      {
        "closes": "SELECT CAST($1 AS "int4"") || (SELECT display_name FROM users WHERE id = 1) || (""int4")",
        "comment": "SELECT CAST($1 AS "int4""/*.""*/""int4")",
        "commentBetween": "SELECT CAST($1 AS "pg_catalog""/**/.""int4")",
        "dquote": "SELECT CAST($1 AS "a""b")",
        "empty": "SELECT CAST($1 AS "")",
        "emptyLast": "SELECT CAST($1 AS "pg_catalog"".""")",
        "emptyPart": "SELECT CAST($1 AS "pg_catalog""..""int4")",
        "escaped": "SELECT CAST($1 AS "int4""")",
        "leadingDot": "SELECT CAST($1 AS ".int4")",
        "lineCommentBetween": "SELECT CAST($1 AS "pg_catalog""--
      .""int4")",
        "lone": "SELECT CAST($1 AS """")",
        "newlineInside": "SELECT CAST($1 AS "in
      t4")",
        "newlineOutside": "SELECT CAST($1 AS "pg_catalog"
      ."int4")",
        "nul": "SELECT CAST($1 AS "a<NUL>b")",
        "nulQualified": "SELECT CAST($1 AS "pg_catalog"".""in<NUL>t4")",
        "oddQuotes": "SELECT CAST($1 AS "int4""""""")",
        "operator": "SELECT CAST($1 AS "int4"" || ""int4")",
        "otherSpaces": "SELECT CAST($1 AS "pg_catalog"<CR>
      <FF>."int4")",
        "prequoted": "SELECT CAST($1 AS """a""")",
        "qualified": "SELECT CAST($1 AS "pg_catalog"."int4")",
        "qualifiedCloses": "SELECT CAST($1 AS "pg_catalog"".""int4"") || (SELECT display_name FROM users WHERE id = 1) || (""int4")",
        "spacesAroundDot": "SELECT CAST($1 AS "pg_catalog" . "int4")",
        "tabsAroundDot": "SELECT CAST($1 AS "pg_catalog"	.	"int4")",
        "threeParts": "SELECT CAST($1 AS "x"."pg_catalog"."int4")",
        "trailingDot": "SELECT CAST($1 AS "pg_catalog"".")",
        "verticalTab": "SELECT CAST($1 AS "pg_catalog"<VT>."int4")",
      }
    `);
  });

  it('a cast check stays fast on a long run of spaces around a dot', () => {
    const cast = `pg_catalog"${' '.repeat(100_000)}.${' '.repeat(100_000)}x`;
    expect(sql`${param(1, cast)}`.compile().text).toBe(`CAST($1 AS "pg_catalog""${' '.repeat(100_000)}.${' '.repeat(100_000)}x")`);
  });
});

describe('transaction', () => {
  it('the isolation level is checked before any query', async () => {
    const queryable = { connect: vi.fn(), query: vi.fn() };
    const results = await Promise.all(Object.entries(hostile).map(async ([name, input]) => {
      try {
        await db.transaction(queryable as any, input as any, async () => null);
        return [name, 'resolves'];
      } catch (err) {
        return [name, visible(`throws: ${(err as Error).message}`)];
      }
    }));
    expect(Object.fromEntries(results)).toMatchInlineSnapshot(`
      {
        "backslash": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a\\b'",
        "comment": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a/*b'",
        "dashes": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a--b'",
        "dollar": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a$1b'",
        "dot": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a.b'",
        "dquote": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a"b'",
        "lone": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"'",
        "nul": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a<NUL>b'",
        "prequoted": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"a"'",
        "semicolon": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a;b'",
        "squote": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a'b'",
      }
    `);
    expect(queryable.connect).not.toHaveBeenCalled();
    expect(queryable.query).not.toHaveBeenCalled();
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of every entry point of src/db/core.ts and src/db/shortcuts.ts
// that writes a caller's string into the SQL text, under hostile inputs (skill
// sql-safety). Compilation only: each snapshot maps an input to the `text` it gives,
// or to the error it throws. What the text achieves once run:
// test/integration/injection.test.ts. Nothing here is fixed (chapter 2).
// Inputs are cast to `any`: at run time they may come from untyped data (req.body).

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, cols, vals, all } from '../../src/db';

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
};

const visible = (text: string) => text.replace(/\0/g, '<NUL>');

/** The compiled text for each hostile input, or the error thrown; a NUL byte is shown as <NUL>. */
const matrix = (build: (input: any) => db.SQLFragment<any, any>) =>
  Object.fromEntries(Object.entries(hostile).map(([name, input]) => {
    try {
      return [name, visible(build(input).compile().text)];
    } catch (err) {
      return [name, visible(`throws: ${(err as Error).message}`)];
    }
  }));

describe('identifiers', () => {
  it('characterization: a string (Table, Column): `"` is not doubled, a pre-quoted string is raw', () => {
    // characterization: `a"b` gives `"a"b"`: the quote closes the identifier
    expect(matrix(v => sql`SELECT ${v}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "a\\b"",
        "comment": "SELECT "a/*b"",
        "dashes": "SELECT "a--b"",
        "dollar": "SELECT "a$1b"",
        "dquote": "SELECT "a"b"",
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
        "dquote": "WHERE ("a"b" = $1)",
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
        "dquote": "("a"b") VALUES ($1)",
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
        "dquote": "SELECT "a"b"",
        "nul": "SELECT "a<NUL>b"",
        "prequoted": "SELECT "a"",
        "semicolon": "SELECT "a;b"",
        "squote": "SELECT "a'b"",
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
    }
  });
});

describe('shortcut options', () => {
  it('characterization: extras keys', () => {
    expect(matrix(v => db.select('users', all, { extras: { [v]: sql`1` } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
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
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a"b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a"b" ON true) AS "sq_users"",
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
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"b".*) AS result FROM "users" AS "a"b") AS "sq_a"b"",
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
        "dquote": "throws: Direction must be ASC/DESC, not 'a"b'",
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
        "dquote": "throws: Nulls must be FIRST/LAST/undefined, not 'a"b'",
        "nul": "throws: Nulls must be FIRST/LAST/undefined, not 'a<NUL>b'",
        "prequoted": "throws: Nulls must be FIRST/LAST/undefined, not '"a"'",
        "semicolon": "throws: Nulls must be FIRST/LAST/undefined, not 'a;b'",
        "squote": "throws: Nulls must be FIRST/LAST/undefined, not 'a'b'",
      }
    `);
  });

  it('characterization: lock.for and lock.wait are written raw', () => {
    expect(matrix(v => db.select('users', all, { lock: { for: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a\\b) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a/*b) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a--b) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a$1b) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a"b) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a<NUL>b) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a;b) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR a'b) AS "sq_users"",
      }
    `);
    expect(matrix(v => db.select('users', all, { lock: { for: 'UPDATE', wait: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a\\b) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a/*b) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a--b) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a$1b) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a"b) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a<NUL>b) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a;b) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE a'b) AS "sq_users"",
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
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"b") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a'b") AS "sq_users"",
      }
    `);
  });

  it('characterization: truncate options are written raw', () => {
    expect(matrix(v => db.truncate('users', v))).toMatchInlineSnapshot(`
      {
        "backslash": "TRUNCATE "users" a\\b",
        "comment": "TRUNCATE "users" a/*b",
        "dashes": "TRUNCATE "users" a--b",
        "dollar": "TRUNCATE "users" a$1b",
        "dquote": "TRUNCATE "users" a"b",
        "nul": "TRUNCATE "users" a<NUL>b",
        "prequoted": "TRUNCATE "users" "a"",
        "semicolon": "TRUNCATE "users" a;b",
        "squote": "TRUNCATE "users" a'b",
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
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
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
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"b") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a'b") AS "sq_users"",
      }
    `);
  });
});

describe('param cast', () => {
  it('characterization: the cast type is quoted without doubling `"`', () => {
    expect(matrix(v => sql`SELECT ${param(1, v)}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT CAST($1 AS "a\\b")",
        "comment": "SELECT CAST($1 AS "a/*b")",
        "dashes": "SELECT CAST($1 AS "a--b")",
        "dollar": "SELECT CAST($1 AS "a$1b")",
        "dquote": "SELECT CAST($1 AS "a"b")",
        "nul": "SELECT CAST($1 AS "a<NUL>b")",
        "prequoted": "SELECT CAST($1 AS ""a"")",
        "semicolon": "SELECT CAST($1 AS "a;b")",
        "squote": "SELECT CAST($1 AS "a'b")",
      }
    `);
  });
});

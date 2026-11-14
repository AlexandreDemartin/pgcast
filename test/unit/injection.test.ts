// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of every entry point of src/db/core.ts, shortcuts.ts and
// transaction.ts that writes a caller's string into the SQL text, under hostile
// inputs (skill sql-safety). Compilation only: each snapshot maps an input to the
// `text` it gives, or to the error it throws. What the text achieves once run:
// test/integration/injection.test.ts. A test named `characterization:` is not
// fixed yet (chapter 2).
// Inputs are cast to `any`: at run time they may come from untyped data (req.body).

import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, cols, vals, all } from '../../src/db';
import { builtinObjects } from '../helpers/builtinObjects';
import { nonArrayLists } from '../helpers/nonArrayLists';
import { resetConfig } from '../helpers/config';
import { hostileArrayCasts, hostileCasts } from '../helpers/hostileCasts';

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
  // each of these already reads as quoted names once wrapped in `"`, so it is written as is (as in
  // 6.6.1), and must stay quoted names; a NUL or an odd run of `"` is not, so it is doubled
  escapedCloses: 'a"" OR TRUE OR ""b',
  qualifiedEscaped: 's.a"" OR TRUE OR ""b',
  escapedDot: 'a"."b',
  escapedNul: 'a""\0""b',
  escapedOdd: 'a"""b',
  // a string that starts and ends with `"` is written as is only if it is a well-formed quoted name,
  // which stays one name (prequotedEscaped); otherwise it is quoted as above (prequotedEmpty, prequotedCloses)
  prequotedEscaped: '"a"" OR TRUE OR ""b"',
  prequotedEmpty: '""',
  prequotedCloses: '"a" OR TRUE OR "b"',
  // after its first part, such a name may go on with unquoted or `U&` quoted parts, and stays names
  // (mixedEscaped; unicodeEscaped, where `\0022` is a `"` inside the name); a `\` does not escape the `"`
  // that ends a `U&` part (unicodeCloses), and a `UESCAPE` clause is not a name (uescape)
  mixedEscaped: '"s".a$1."b"" OR TRUE OR ""c"',
  unicodeEscaped: '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"',
  unicodeCloses: '"s".U&"a\\" OR TRUE OR \\"b"',
  uescape: `"s".U&"a" UESCAPE '!' || "b"`,
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
  it('a string (Table, Column): `"` is doubled, a well-formed quoted name is written as is', () => {
    // `a"b` gives `"a""b"`, one identifier, and `.` still splits (`"a"."b"`); `"a"` is written as is,
    // but `"` alone is not a quoted name, so it is one identifier `"`, here and in every matrix below
    expect(matrix(v => sql`SELECT ${v}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "a\\b"",
        "comment": "SELECT "a/*b"",
        "dashes": "SELECT "a--b"",
        "dollar": "SELECT "a$1b"",
        "dot": "SELECT "a"."b"",
        "dquote": "SELECT "a""b"",
        "escapedCloses": "SELECT "a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT "a"".""b"",
        "escapedNul": "SELECT "a""""<NUL>""""b"",
        "escapedOdd": "SELECT "a""""""b"",
        "lone": "SELECT """"",
        "mixedEscaped": "SELECT "s".a$1."b"" OR TRUE OR ""c"",
        "nul": "SELECT "a<NUL>b"",
        "prequoted": "SELECT "a"",
        "prequotedCloses": "SELECT """a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT """"",
        "prequotedEscaped": "SELECT "a"" OR TRUE OR ""b"",
        "qualifiedEscaped": "SELECT "s"."a"" OR TRUE OR ""b"",
        "semicolon": "SELECT "a;b"",
        "squote": "SELECT "a'b"",
        "uescape": "SELECT """s"""."U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT """s"""."U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT "s".U&"a\\0022"" OR TRUE OR ""\\0022b"",
      }
    `);
  });

  it('a string that closes its quotes compiles to one identifier, and its values are untouched', () => {
    // 6.6.1: `WHERE ("a" = "a" OR TRUE OR "a" = $1)`, every row
    const where = sql`WHERE ${{ ['a" = "a" OR TRUE OR "a']: 1 }}`.compile();
    expect(where).toEqual({ text: 'WHERE ("a"" = ""a"" OR TRUE OR ""a" = $1)', values: [1] });
    // 6.6.1: `SELECT "a" FROM t; DROP TABLE t; SELECT "a" FROM "t"`, three statements
    expect(sql`SELECT ${'a" FROM t; DROP TABLE t; SELECT "a'} FROM ${'t'}`.compile())
      .toEqual({ text: 'SELECT "a"" FROM t; DROP TABLE t; SELECT ""a" FROM "t"', values: [] });
    // the quotes are doubled before the split on `.`
    expect(sql`${'s"."t" WHERE true; --.c'}`.compile().text).toBe('"s"""."""t"" WHERE true; --"."c"');
  });

  it('a string identifier check stays fast on a long run of doubled quotes', () => {
    const name = `${'a"".'.repeat(100_000)}"`;
    expect(sql`${name}`.compile().text).toBe(`"${name.replace(/"/g, '""').replace(/[.]/g, '"."')}"`);
    // and on a long string that starts and ends with `"` but is not a quoted name
    const prequoted = `"${'a" . "'.repeat(100_000)}" x"`;
    expect(sql`${prequoted}`.compile().text).toBe(`"${prequoted.replace(/"/g, '""').replace(/[.]/g, '"."')}"`);
    // and on a long run of unquoted and `U&` quoted parts that ends in something else
    const mixed = `"a"${' . b$ . U&"c"'.repeat(100_000)} x"`;
    expect(sql`${mixed}`.compile().text).toBe(`"${mixed.replace(/"/g, '""').replace(/[.]/g, '"."')}"`);
  });

  it('Whereable keys', () => {
    expect(matrix(v => sql`WHERE ${{ [v]: 1 }}`)).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE ("a\\b" = $1)",
        "comment": "WHERE ("a/*b" = $1)",
        "dashes": "WHERE ("a--b" = $1)",
        "dollar": "WHERE ("a$1b" = $1)",
        "dot": "WHERE ("a"."b" = $1)",
        "dquote": "WHERE ("a""b" = $1)",
        "escapedCloses": "WHERE ("a"" OR TRUE OR ""b" = $1)",
        "escapedDot": "WHERE ("a"".""b" = $1)",
        "escapedNul": "WHERE ("a""""<NUL>""""b" = $1)",
        "escapedOdd": "WHERE ("a""""""b" = $1)",
        "lone": "WHERE ("""" = $1)",
        "mixedEscaped": "WHERE ("s".a$1."b"" OR TRUE OR ""c" = $1)",
        "nul": "WHERE ("a<NUL>b" = $1)",
        "prequoted": "WHERE ("a" = $1)",
        "prequotedCloses": "WHERE ("""a"" OR TRUE OR ""b""" = $1)",
        "prequotedEmpty": "WHERE ("""" = $1)",
        "prequotedEscaped": "WHERE ("a"" OR TRUE OR ""b" = $1)",
        "qualifiedEscaped": "WHERE ("s"."a"" OR TRUE OR ""b" = $1)",
        "semicolon": "WHERE ("a;b" = $1)",
        "squote": "WHERE ("a'b" = $1)",
        "uescape": "WHERE ("""s"""."U&""a"" UESCAPE '!' || ""b""" = $1)",
        "unicodeCloses": "WHERE ("""s"""."U&""a\\"" OR TRUE OR \\""b""" = $1)",
        "unicodeEscaped": "WHERE ("s".U&"a\\0022"" OR TRUE OR ""\\0022b" = $1)",
      }
    `);
  });

  it('cols / vals keys', () => {
    expect(matrix(v => sql`(${cols({ [v]: 1 })}) VALUES (${vals({ [v]: 1 })})`)).toMatchInlineSnapshot(`
      {
        "backslash": "("a\\b") VALUES ($1)",
        "comment": "("a/*b") VALUES ($1)",
        "dashes": "("a--b") VALUES ($1)",
        "dollar": "("a$1b") VALUES ($1)",
        "dot": "("a"."b") VALUES ($1)",
        "dquote": "("a""b") VALUES ($1)",
        "escapedCloses": "("a"" OR TRUE OR ""b") VALUES ($1)",
        "escapedDot": "("a"".""b") VALUES ($1)",
        "escapedNul": "("a""""<NUL>""""b") VALUES ($1)",
        "escapedOdd": "("a""""""b") VALUES ($1)",
        "lone": "("""") VALUES ($1)",
        "mixedEscaped": "("s".a$1."b"" OR TRUE OR ""c") VALUES ($1)",
        "nul": "("a<NUL>b") VALUES ($1)",
        "prequoted": "("a") VALUES ($1)",
        "prequotedCloses": "("""a"" OR TRUE OR ""b""") VALUES ($1)",
        "prequotedEmpty": "("""") VALUES ($1)",
        "prequotedEscaped": "("a"" OR TRUE OR ""b") VALUES ($1)",
        "qualifiedEscaped": "("s"."a"" OR TRUE OR ""b") VALUES ($1)",
        "semicolon": "("a;b") VALUES ($1)",
        "squote": "("a'b") VALUES ($1)",
        "uescape": "("""s"""."U&""a"" UESCAPE '!' || ""b""") VALUES ($1)",
        "unicodeCloses": "("""s"""."U&""a\\"" OR TRUE OR \\""b""") VALUES ($1)",
        "unicodeEscaped": "("s".U&"a\\0022"" OR TRUE OR ""\\0022b") VALUES ($1)",
      }
    `);
  });

  it('cols of an array', () => {
    expect(matrix(v => sql`SELECT ${cols([v])}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "a\\b"",
        "comment": "SELECT "a/*b"",
        "dashes": "SELECT "a--b"",
        "dollar": "SELECT "a$1b"",
        "dot": "SELECT "a"."b"",
        "dquote": "SELECT "a""b"",
        "escapedCloses": "SELECT "a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT "a"".""b"",
        "escapedNul": "SELECT "a""""<NUL>""""b"",
        "escapedOdd": "SELECT "a""""""b"",
        "lone": "SELECT """"",
        "mixedEscaped": "SELECT "s".a$1."b"" OR TRUE OR ""c"",
        "nul": "SELECT "a<NUL>b"",
        "prequoted": "SELECT "a"",
        "prequotedCloses": "SELECT """a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT """"",
        "prequotedEscaped": "SELECT "a"" OR TRUE OR ""b"",
        "qualifiedEscaped": "SELECT "s"."a"" OR TRUE OR ""b"",
        "semicolon": "SELECT "a;b"",
        "squote": "SELECT "a'b"",
        "uescape": "SELECT """s"""."U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT """s"""."U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT "s".U&"a\\0022"" OR TRUE OR ""\\0022b"",
      }
    `);
  });
  it('the column of parent()', () => {
    expect(matrix(v => sql`WHERE ${{ owner_id: db.parent(v) }}`.copy({ parentTable: 'users' }))).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE ("owner_id" = "users"."a\\b")",
        "comment": "WHERE ("owner_id" = "users"."a/*b")",
        "dashes": "WHERE ("owner_id" = "users"."a--b")",
        "dollar": "WHERE ("owner_id" = "users"."a$1b")",
        "dot": "WHERE ("owner_id" = "users"."a"."b")",
        "dquote": "WHERE ("owner_id" = "users"."a""b")",
        "escapedCloses": "WHERE ("owner_id" = "users"."a"" OR TRUE OR ""b")",
        "escapedDot": "WHERE ("owner_id" = "users"."a"".""b")",
        "escapedNul": "WHERE ("owner_id" = "users"."a""""<NUL>""""b")",
        "escapedOdd": "WHERE ("owner_id" = "users"."a""""""b")",
        "lone": "WHERE ("owner_id" = "users"."""")",
        "mixedEscaped": "WHERE ("owner_id" = "users"."s".a$1."b"" OR TRUE OR ""c")",
        "nul": "WHERE ("owner_id" = "users"."a<NUL>b")",
        "prequoted": "WHERE ("owner_id" = "users"."a")",
        "prequotedCloses": "WHERE ("owner_id" = "users"."""a"" OR TRUE OR ""b""")",
        "prequotedEmpty": "WHERE ("owner_id" = "users"."""")",
        "prequotedEscaped": "WHERE ("owner_id" = "users"."a"" OR TRUE OR ""b")",
        "qualifiedEscaped": "WHERE ("owner_id" = "users"."s"."a"" OR TRUE OR ""b")",
        "semicolon": "WHERE ("owner_id" = "users"."a;b")",
        "squote": "WHERE ("owner_id" = "users"."a'b")",
        "uescape": "WHERE ("owner_id" = "users"."""s"""."U&""a"" UESCAPE '!' || ""b""")",
        "unicodeCloses": "WHERE ("owner_id" = "users"."""s"""."U&""a\\"" OR TRUE OR \\""b""")",
        "unicodeEscaped": "WHERE ("owner_id" = "users"."s".U&"a\\0022"" OR TRUE OR ""\\0022b")",
      }
    `);
  });

  it('the column of parent() in isIn, quoted as a Whereable value quotes it', () => {
    // the same text inside `IN (…)`: no new interpolated input (#107)
    expect(matrix(v => sql`WHERE ${{ owner_id: db.conditions.isIn([db.parent(v)]) }}`.copy({ parentTable: 'users' }))).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE (("owner_id" IN ("users"."a\\b")))",
        "comment": "WHERE (("owner_id" IN ("users"."a/*b")))",
        "dashes": "WHERE (("owner_id" IN ("users"."a--b")))",
        "dollar": "WHERE (("owner_id" IN ("users"."a$1b")))",
        "dot": "WHERE (("owner_id" IN ("users"."a"."b")))",
        "dquote": "WHERE (("owner_id" IN ("users"."a""b")))",
        "escapedCloses": "WHERE (("owner_id" IN ("users"."a"" OR TRUE OR ""b")))",
        "escapedDot": "WHERE (("owner_id" IN ("users"."a"".""b")))",
        "escapedNul": "WHERE (("owner_id" IN ("users"."a""""<NUL>""""b")))",
        "escapedOdd": "WHERE (("owner_id" IN ("users"."a""""""b")))",
        "lone": "WHERE (("owner_id" IN ("users"."""")))",
        "mixedEscaped": "WHERE (("owner_id" IN ("users"."s".a$1."b"" OR TRUE OR ""c")))",
        "nul": "WHERE (("owner_id" IN ("users"."a<NUL>b")))",
        "prequoted": "WHERE (("owner_id" IN ("users"."a")))",
        "prequotedCloses": "WHERE (("owner_id" IN ("users"."""a"" OR TRUE OR ""b""")))",
        "prequotedEmpty": "WHERE (("owner_id" IN ("users"."""")))",
        "prequotedEscaped": "WHERE (("owner_id" IN ("users"."a"" OR TRUE OR ""b")))",
        "qualifiedEscaped": "WHERE (("owner_id" IN ("users"."s"."a"" OR TRUE OR ""b")))",
        "semicolon": "WHERE (("owner_id" IN ("users"."a;b")))",
        "squote": "WHERE (("owner_id" IN ("users"."a'b")))",
        "uescape": "WHERE (("owner_id" IN ("users"."""s"""."U&""a"" UESCAPE '!' || ""b""")))",
        "unicodeCloses": "WHERE (("owner_id" IN ("users"."""s"""."U&""a\\"" OR TRUE OR \\""b""")))",
        "unicodeEscaped": "WHERE (("owner_id" IN ("users"."s".U&"a\\0022"" OR TRUE OR ""\\0022b")))",
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

describe('raw, cols and vals as a filter value', () => {
  it('raw(input) as a Whereable value, in isIn or in eq throws, and is never written into the text', () => {
    // 6.6.1 sent it as JSON, so raw(input) there was a parameter by accident; compiling it as SQL would make
    // it an injection, so it throws before any text is returned (#108)
    for (const build of [
      (v: string) => sql`WHERE ${{ display_name: db.raw(v) }}`,
      (v: string) => sql`WHERE ${{ display_name: db.conditions.isIn([db.raw(v)]) }}`,
      (v: string) => sql`WHERE ${{ display_name: db.conditions.eq(db.raw(v)) }}`,
      (v: string) => db.deletes('users', { display_name: db.conditions.isNotIn([db.raw(v)]) }),
    ]) {
      expect(new Set(Object.values(matrix(build)).map(text => text.startsWith('throws: ')))).toEqual(new Set([true]));
    }
  });
});

describe('raw, cols and vals as a write value', () => {
  it('raw(input) as an insert(), upsert() or update() value, or in vals({…}), throws, and is never written into the text', () => {
    // 6.6.1 sent it as JSON, so raw(input) there was a parameter by accident; compiling it as SQL would make
    // it an injection, so it throws before any text is returned (#259)
    const asValue = 'throws: `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value: to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`.';
    const builds = {
      insert: (v: string) => db.insert('users', { email: 'x', display_name: db.raw(v) }),
      insertRows: (v: string) => db.insert('users', [{ email: 'x', display_name: 'X' }, { email: 'y', display_name: db.raw(v) }]),
      upsert: (v: string) => db.upsert('users', { email: 'x', display_name: db.raw(v) }, 'email'),
      update: (v: string) => db.update('users', { display_name: db.raw(v) }, { id: 1 }),
      sql: (v: string) => sql`INSERT INTO ${'users'} (${cols({ display_name: 1 })}) VALUES (${vals({ display_name: db.raw(v) })})`,
      nested: (v: string) => sql`SELECT ${vals({ a: db.raw(v) })}`.copy({ parentTable: 'users' }),
    };
    expect(Object.fromEntries(Object.entries(builds).map(([name, build]) => [name, new Set(Object.values(matrix(build)))])))
      .toEqual(Object.fromEntries(Object.keys(builds).map(name => [name, new Set([asValue])])));
  });

  it('the column of parent() in vals({…}), quoted as a Whereable value quotes it', () => {
    // the same text as { owner_id: parent(v) }; with no column, its vals({…}) key reaches the text instead (below, #259)
    expect(matrix(v => sql`SELECT ${vals({ a: db.parent(v) })}`.copy({ parentTable: 'users' }))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "users"."a\\b"",
        "comment": "SELECT "users"."a/*b"",
        "dashes": "SELECT "users"."a--b"",
        "dollar": "SELECT "users"."a$1b"",
        "dot": "SELECT "users"."a"."b"",
        "dquote": "SELECT "users"."a""b"",
        "escapedCloses": "SELECT "users"."a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT "users"."a"".""b"",
        "escapedNul": "SELECT "users"."a""""<NUL>""""b"",
        "escapedOdd": "SELECT "users"."a""""""b"",
        "lone": "SELECT "users".""""",
        "mixedEscaped": "SELECT "users"."s".a$1."b"" OR TRUE OR ""c"",
        "nul": "SELECT "users"."a<NUL>b"",
        "prequoted": "SELECT "users"."a"",
        "prequotedCloses": "SELECT "users"."""a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT "users".""""",
        "prequotedEscaped": "SELECT "users"."a"" OR TRUE OR ""b"",
        "qualifiedEscaped": "SELECT "users"."s"."a"" OR TRUE OR ""b"",
        "semicolon": "SELECT "users"."a;b"",
        "squote": "SELECT "users"."a'b"",
        "uescape": "SELECT "users"."""s"""."U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT "users"."""s"""."U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT "users"."s".U&"a\\0022"" OR TRUE OR ""\\0022b"",
      }
    `);
  });

  it('the key of vals({…}) given parent() with no column, quoted as the key of { [k]: parent() } is', () => {
    // a new interpolated input: the key reaches the text as the parent column, as a Whereable key does (#259)
    expect(matrix(v => sql`SELECT ${vals({ [v]: db.parent() })}`.copy({ parentTable: 'users' }))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT "users"."a\\b"",
        "comment": "SELECT "users"."a/*b"",
        "dashes": "SELECT "users"."a--b"",
        "dollar": "SELECT "users"."a$1b"",
        "dot": "SELECT "users"."a"."b"",
        "dquote": "SELECT "users"."a""b"",
        "escapedCloses": "SELECT "users"."a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT "users"."a"".""b"",
        "escapedNul": "SELECT "users"."a""""<NUL>""""b"",
        "escapedOdd": "SELECT "users"."a""""""b"",
        "lone": "SELECT "users".""""",
        "mixedEscaped": "SELECT "users"."s".a$1."b"" OR TRUE OR ""c"",
        "nul": "SELECT "users"."a<NUL>b"",
        "prequoted": "SELECT "users"."a"",
        "prequotedCloses": "SELECT "users"."""a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT "users".""""",
        "prequotedEscaped": "SELECT "users"."a"" OR TRUE OR ""b"",
        "qualifiedEscaped": "SELECT "users"."s"."a"" OR TRUE OR ""b"",
        "semicolon": "SELECT "users"."a;b"",
        "squote": "SELECT "users"."a'b"",
        "uescape": "SELECT "users"."""s"""."U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT "users"."""s"""."U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT "users"."s".U&"a\\0022"" OR TRUE OR ""\\0022b"",
      }
    `);
  });
});

describe('a Parameter in a Whereable or in vals of an array', () => {
  it('its cast compiles as in sql`${param(x, cast)}`, in a Whereable, isIn and vals', () => {
    for (const cast of [...Object.values(hostile), ...Object.values(hostileCasts), ...Object.values(hostileArrayCasts)]) {
      const alone = sql`${param(1, cast)}`.compile().text;
      expect(sql`${{ display_name: param(1, cast) }}`.compile()).toEqual({ text: `("display_name" = ${alone})`, values: [1] });
      expect(sql`${{ display_name: db.conditions.isIn([param(1, cast)]) }}`.compile())
        .toEqual({ text: `(("display_name" IN (${alone})))`, values: [1] });
      expect(sql`${vals([param(1, cast), 2])}`.compile()).toEqual({ text: `${alone}, $2`, values: [1, 2] });
    }
  });

  it('a cast that closes its quotes stays one type name in a Whereable', () => {
    const q = sql`${{ display_name: param('Ada', 'text") OR TRUE OR ("text') }}`.compile();
    expect(q.text).toBe('("display_name" = CAST($1 AS "text"") OR TRUE OR (""text"))');
    expect(q.values).toEqual(['Ada']);
  });

  it('a hostile value stays a value, and a hostile key is quoted as with a plain value', () => {
    for (const input of Object.values(hostile)) {
      expect(sql`${{ a: param(input) }}`.compile()).toEqual({ text: '("a" = $1)', values: [input] });
      expect(sql`${vals([param(input)])}`.compile()).toEqual({ text: '$1', values: [input] });
      expect(sql`${{ [input]: param(1) }}`.compile()).toEqual(sql`${{ [input]: 1 }}`.compile());
    }
  });
});

describe('null, and parent() with no column', () => {
  const parentMessage = "`db.parent()` with no column has no meaning here: name the column, `db.parent('id')`, or give it as the value of a Whereable or `vals({…})` key, whose column it then takes.";

  it('a hostile parent table given parent() with no column throws, and none of it reaches the text', () => {
    // 6.6.1 wrote the quoted table and its `.` before throwing on `undefined` (R58)
    for (const input of Object.values(hostile)) {
      const result = { text: '', values: [] };
      expect(() => sql`SELECT ${db.parent()}`.copy({ parentTable: input }).compile(result)).toThrow(parentMessage);
      expect(result).toEqual({ text: 'SELECT ', values: [] });
    }
  });

  it('a hostile parent table given { id: parent() } stays one quoted name, as before', () => {
    expect(matrix(v => sql`WHERE ${{ id: db.parent() }}`.copy({ parentTable: v }))).toMatchInlineSnapshot(`
      {
        "backslash": "WHERE ("id" = "a\\b"."id")",
        "comment": "WHERE ("id" = "a/*b"."id")",
        "dashes": "WHERE ("id" = "a--b"."id")",
        "dollar": "WHERE ("id" = "a$1b"."id")",
        "dot": "WHERE ("id" = "a"."b"."id")",
        "dquote": "WHERE ("id" = "a""b"."id")",
        "escapedCloses": "WHERE ("id" = "a"" OR TRUE OR ""b"."id")",
        "escapedDot": "WHERE ("id" = "a"".""b"."id")",
        "escapedNul": "WHERE ("id" = "a""""<NUL>""""b"."id")",
        "escapedOdd": "WHERE ("id" = "a""""""b"."id")",
        "lone": "WHERE ("id" = """"."id")",
        "mixedEscaped": "WHERE ("id" = "s".a$1."b"" OR TRUE OR ""c"."id")",
        "nul": "WHERE ("id" = "a<NUL>b"."id")",
        "prequoted": "WHERE ("id" = "a"."id")",
        "prequotedCloses": "WHERE ("id" = """a"" OR TRUE OR ""b"""."id")",
        "prequotedEmpty": "WHERE ("id" = """"."id")",
        "prequotedEscaped": "WHERE ("id" = "a"" OR TRUE OR ""b"."id")",
        "qualifiedEscaped": "WHERE ("id" = "s"."a"" OR TRUE OR ""b"."id")",
        "semicolon": "WHERE ("id" = "a;b"."id")",
        "squote": "WHERE ("id" = "a'b"."id")",
        "uescape": "WHERE ("id" = """s"""."U&""a"" UESCAPE '!' || ""b"""."id")",
        "unicodeCloses": "WHERE ("id" = """s"""."U&""a\\"" OR TRUE OR \\""b"""."id")",
        "unicodeEscaped": "WHERE ("id" = "s".U&"a\\0022"" OR TRUE OR ""\\0022b"."id")",
      }
    `);
  });

  it('a hostile key given null stays one quoted name, and null one parameter, as before', () => {
    for (const input of Object.values(hostile)) {
      expect(sql`${{ [input]: null }}`.compile()).toEqual({ ...sql`${{ [input]: 1 }}`.compile(), values: [null] });
      expect(sql`${vals({ [input]: null })}`.compile()).toEqual({ text: '$1', values: [null] });
    }
  });
});

describe('shortcut arguments', () => {
  it('the table name is one identifier in "sq_<table>" too: `"` is doubled, `.` does not split', () => {
    // 6.6.1: `AS "sq_my"table"`, a syntax error; a table name 6.6.1 already wrote as one quoted
    // name (`my""table`, a hand-escaped `my"table`) is written as before
    expect(db.select('my"table', all).compile().text).toBe(`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("my""table".*) AS result FROM "my""table") AS "sq_my""table"`);
    expect(db.select('my""table', all).compile().text).toBe(`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("my""table".*) AS result FROM "my""table") AS "sq_my""table"`);
    expect(matrix(v => db.select(v, all))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a\\b".*) AS result FROM "a\\b") AS "sq_a\\b"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a/*b".*) AS result FROM "a/*b") AS "sq_a/*b"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a--b".*) AS result FROM "a--b") AS "sq_a--b"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a$1b".*) AS result FROM "a$1b") AS "sq_a$1b"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"."b".*) AS result FROM "a"."b") AS "sq_a.b"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""b".*) AS result FROM "a""b") AS "sq_a""b"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"" OR TRUE OR ""b".*) AS result FROM "a"" OR TRUE OR ""b") AS "sq_a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"".""b".*) AS result FROM "a"".""b") AS "sq_a"".""b"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""""<NUL>""""b".*) AS result FROM "a""""<NUL>""""b") AS "sq_a""""<NUL>""""b"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""""""b".*) AS result FROM "a""""""b") AS "sq_a""""""b"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""".*) AS result FROM """") AS "sq_"""",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s".a$1."b"" OR TRUE OR ""c".*) AS result FROM "s".a$1."b"" OR TRUE OR ""c") AS "sq_""s"".a$1.""b"""" OR TRUE OR """"c"""",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a<NUL>b".*) AS result FROM "a<NUL>b") AS "sq_a<NUL>b"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a".*) AS result FROM "a") AS "sq_""a"""",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""a"" OR TRUE OR ""b""".*) AS result FROM """a"" OR TRUE OR ""b""") AS "sq_""a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""".*) AS result FROM """") AS "sq_"""",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"" OR TRUE OR ""b".*) AS result FROM "a"" OR TRUE OR ""b") AS "sq_""a"""" OR TRUE OR """"b"""",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s"."a"" OR TRUE OR ""b".*) AS result FROM "s"."a"" OR TRUE OR ""b") AS "sq_s.a"" OR TRUE OR ""b"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a;b".*) AS result FROM "a;b") AS "sq_a;b"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a'b".*) AS result FROM "a'b") AS "sq_a'b"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""s"""."U&""a"" UESCAPE '!' || ""b""".*) AS result FROM """s"""."U&""a"" UESCAPE '!' || ""b""") AS "sq_""s"".U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""s"""."U&""a\\"" OR TRUE OR \\""b""".*) AS result FROM """s"""."U&""a\\"" OR TRUE OR \\""b""") AS "sq_""s"".U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s".U&"a\\0022"" OR TRUE OR ""\\0022b".*) AS result FROM "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS "sq_""s"".U&""a\\0022"""" OR TRUE OR """"\\0022b"""",
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
        "dquote": "DELETE FROM "a""b" WHERE ("id" = $1) RETURNING to_jsonb("a""b".*) AS result",
        "escapedCloses": "DELETE FROM "a"" OR TRUE OR ""b" WHERE ("id" = $1) RETURNING to_jsonb("a"" OR TRUE OR ""b".*) AS result",
        "escapedDot": "DELETE FROM "a"".""b" WHERE ("id" = $1) RETURNING to_jsonb("a"".""b".*) AS result",
        "escapedNul": "DELETE FROM "a""""<NUL>""""b" WHERE ("id" = $1) RETURNING to_jsonb("a""""<NUL>""""b".*) AS result",
        "escapedOdd": "DELETE FROM "a""""""b" WHERE ("id" = $1) RETURNING to_jsonb("a""""""b".*) AS result",
        "lone": "DELETE FROM """" WHERE ("id" = $1) RETURNING to_jsonb("""".*) AS result",
        "mixedEscaped": "DELETE FROM "s".a$1."b"" OR TRUE OR ""c" WHERE ("id" = $1) RETURNING to_jsonb("s".a$1."b"" OR TRUE OR ""c".*) AS result",
        "nul": "DELETE FROM "a<NUL>b" WHERE ("id" = $1) RETURNING to_jsonb("a<NUL>b".*) AS result",
        "prequoted": "DELETE FROM "a" WHERE ("id" = $1) RETURNING to_jsonb("a".*) AS result",
        "prequotedCloses": "DELETE FROM """a"" OR TRUE OR ""b""" WHERE ("id" = $1) RETURNING to_jsonb("""a"" OR TRUE OR ""b""".*) AS result",
        "prequotedEmpty": "DELETE FROM """" WHERE ("id" = $1) RETURNING to_jsonb("""".*) AS result",
        "prequotedEscaped": "DELETE FROM "a"" OR TRUE OR ""b" WHERE ("id" = $1) RETURNING to_jsonb("a"" OR TRUE OR ""b".*) AS result",
        "qualifiedEscaped": "DELETE FROM "s"."a"" OR TRUE OR ""b" WHERE ("id" = $1) RETURNING to_jsonb("s"."a"" OR TRUE OR ""b".*) AS result",
        "semicolon": "DELETE FROM "a;b" WHERE ("id" = $1) RETURNING to_jsonb("a;b".*) AS result",
        "squote": "DELETE FROM "a'b" WHERE ("id" = $1) RETURNING to_jsonb("a'b".*) AS result",
        "uescape": "DELETE FROM """s"""."U&""a"" UESCAPE '!' || ""b""" WHERE ("id" = $1) RETURNING to_jsonb("""s"""."U&""a"" UESCAPE '!' || ""b""".*) AS result",
        "unicodeCloses": "DELETE FROM """s"""."U&""a\\"" OR TRUE OR \\""b""" WHERE ("id" = $1) RETURNING to_jsonb("""s"""."U&""a\\"" OR TRUE OR \\""b""".*) AS result",
        "unicodeEscaped": "DELETE FROM "s".U&"a\\0022"" OR TRUE OR ""\\0022b" WHERE ("id" = $1) RETURNING to_jsonb("s".U&"a\\0022"" OR TRUE OR ""\\0022b".*) AS result",
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
        "escapedCloses": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a"."b'",
        "escapedNul": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a""<NUL>""b'",
        "escapedOdd": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a"""b'",
        "lone": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '"'",
        "mixedEscaped": "SELECT "s".a$1."b"" OR TRUE OR ""c"(*) AS result FROM "users"",
        "nul": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a<NUL>b'",
        "prequoted": "SELECT "a"(*) AS result FROM "users"",
        "prequotedCloses": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '""'",
        "prequotedEscaped": "SELECT "a"" OR TRUE OR ""b"(*) AS result FROM "users"",
        "qualifiedEscaped": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a;b'",
        "squote": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not 'a'b'",
        "uescape": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "SELECT "s".U&"a\\0022"" OR TRUE OR ""\\0022b"(*) AS result FROM "users"",
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

  it('upsert values keys, also written after EXCLUDED.', () => {
    expect(matrix(v => db.upsert('users', { [v]: 1 } as any, 'email'))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("a\\b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(EXCLUDED."a\\b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("a/*b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(EXCLUDED."a/*b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("a--b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(EXCLUDED."a--b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("a$1b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(EXCLUDED."a$1b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("a"."b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(EXCLUDED."a"."b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("a""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""b") = ROW(EXCLUDED."a""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedCloses": "INSERT INTO "users" ("a"" OR TRUE OR ""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(EXCLUDED."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedDot": "INSERT INTO "users" ("a"".""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"".""b") = ROW(EXCLUDED."a"".""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedNul": "INSERT INTO "users" ("a""""<NUL>""""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""<NUL>""""b") = ROW(EXCLUDED."a""""<NUL>""""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedOdd": "INSERT INTO "users" ("a""""""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""""b") = ROW(EXCLUDED."a""""""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("""") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(EXCLUDED."""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "mixedEscaped": "INSERT INTO "users" ("s".a$1."b"" OR TRUE OR ""c") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".a$1."b"" OR TRUE OR ""c") = ROW(EXCLUDED."s".a$1."b"" OR TRUE OR ""c") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("a<NUL>b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(EXCLUDED."a<NUL>b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("a") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(EXCLUDED."a") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedCloses": "INSERT INTO "users" ("""a"" OR TRUE OR ""b""") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""a"" OR TRUE OR ""b""") = ROW(EXCLUDED."""a"" OR TRUE OR ""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEmpty": "INSERT INTO "users" ("""") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(EXCLUDED."""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEscaped": "INSERT INTO "users" ("a"" OR TRUE OR ""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(EXCLUDED."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "qualifiedEscaped": "INSERT INTO "users" ("s"."a"" OR TRUE OR ""b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s"."a"" OR TRUE OR ""b") = ROW(EXCLUDED."s"."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("a;b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(EXCLUDED."a;b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("a'b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(EXCLUDED."a'b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "uescape": "INSERT INTO "users" ("""s"""."U&""a"" UESCAPE '!' || ""b""") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a"" UESCAPE '!' || ""b""") = ROW(EXCLUDED."""s"""."U&""a"" UESCAPE '!' || ""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeCloses": "INSERT INTO "users" ("""s"""."U&""a\\"" OR TRUE OR \\""b""") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a\\"" OR TRUE OR \\""b""") = ROW(EXCLUDED."""s"""."U&""a\\"" OR TRUE OR \\""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeEscaped": "INSERT INTO "users" ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") = ROW(EXCLUDED."s".U&"a\\0022"" OR TRUE OR ""\\0022b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });

  it('upsert conflict columns', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, v))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a\\b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a/*b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a--b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a$1b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"."b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"" OR TRUE OR ""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedDot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"".""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedNul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a""""<NUL>""""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedOdd": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a""""""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("""") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "mixedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("s".a$1."b"" OR TRUE OR ""c") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a<NUL>b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("""a"" OR TRUE OR ""b""") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEmpty": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("""") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a"" OR TRUE OR ""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "qualifiedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("s"."a"" OR TRUE OR ""b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a;b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("a'b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "uescape": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("""s"""."U&""a"" UESCAPE '!' || ""b""") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("""s"""."U&""a\\"" OR TRUE OR \\""b""") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });

  it('upsert constraint()', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, db.constraint(v)))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a\\b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a/*b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a--b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a$1b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"."b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"" OR TRUE OR ""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedDot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"".""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedNul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a""""<NUL>""""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedOdd": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a""""""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT """" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "mixedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "s".a$1."b"" OR TRUE OR ""c" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a<NUL>b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT """a"" OR TRUE OR ""b""" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEmpty": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT """" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a"" OR TRUE OR ""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "qualifiedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "s"."a"" OR TRUE OR ""b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a;b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "a'b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "uescape": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT """s"""."U&""a"" UESCAPE '!' || ""b""" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT """s"""."U&""a\\"" OR TRUE OR \\""b""" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ON CONSTRAINT "s".U&"a\\0022"" OR TRUE OR ""\\0022b" DO UPDATE SET ("email") = ROW(EXCLUDED."email") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
      }
    `);
  });
});

describe('shortcut options', () => {
  it('columns', () => {
    expect(matrix(v => db.select('users', all, { columns: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a\\b") AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a/*b") AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a--b") AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a$1b") AS result FROM "users") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"."b") AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a""b") AS result FROM "users") AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"" OR TRUE OR ""b") AS result FROM "users") AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"".""b") AS result FROM "users") AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a""""<NUL>""""b") AS result FROM "users") AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a""""""b") AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, """") AS result FROM "users") AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "s".a$1."b"" OR TRUE OR ""c") AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a<NUL>b") AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a") AS result FROM "users") AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, """a"" OR TRUE OR ""b""") AS result FROM "users") AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, """") AS result FROM "users") AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a"" OR TRUE OR ""b") AS result FROM "users") AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "s"."a"" OR TRUE OR ""b") AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a;b") AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "a'b") AS result FROM "users") AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, """s"""."U&""a"" UESCAPE '!' || ""b""") AS result FROM "users") AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, """s"""."U&""a\\"" OR TRUE OR \\""b""") AS result FROM "users") AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS result FROM "users") AS "sq_users"",
      }
    `);
  });

  it('returning', () => {
    // insert, update and upsert build it the same way (SQLForColumnsOfTable)
    expect(matrix(v => db.deletes('users', { id: 1 }, { returning: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a\\b") AS result",
        "comment": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a/*b") AS result",
        "dashes": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a--b") AS result",
        "dollar": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a$1b") AS result",
        "dot": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"."b") AS result",
        "dquote": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a""b") AS result",
        "escapedCloses": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"" OR TRUE OR ""b") AS result",
        "escapedDot": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"".""b") AS result",
        "escapedNul": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a""""<NUL>""""b") AS result",
        "escapedOdd": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a""""""b") AS result",
        "lone": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, """") AS result",
        "mixedEscaped": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "s".a$1."b"" OR TRUE OR ""c") AS result",
        "nul": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a<NUL>b") AS result",
        "prequoted": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a") AS result",
        "prequotedCloses": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, """a"" OR TRUE OR ""b""") AS result",
        "prequotedEmpty": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, """") AS result",
        "prequotedEscaped": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a"" OR TRUE OR ""b") AS result",
        "qualifiedEscaped": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "s"."a"" OR TRUE OR ""b") AS result",
        "semicolon": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a;b") AS result",
        "squote": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "a'b") AS result",
        "uescape": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, """s"""."U&""a"" UESCAPE '!' || ""b""") AS result",
        "unicodeCloses": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, """s"""."U&""a\\"" OR TRUE OR \\""b""") AS result",
        "unicodeEscaped": "DELETE FROM "users" WHERE ("id" = $1) RETURNING jsonb_build_object($2::text, "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS result",
      }
    `);
  });

  it('order.by', () => {
    expect(matrix(v => db.select('users', all, { order: { by: v, direction: 'ASC' } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a\\b" ASC) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a/*b" ASC) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a--b" ASC) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a$1b" ASC) AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"."b" ASC) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a""b" ASC) AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"" OR TRUE OR ""b" ASC) AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"".""b" ASC) AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a""""<NUL>""""b" ASC) AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a""""""b" ASC) AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY """" ASC) AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "s".a$1."b"" OR TRUE OR ""c" ASC) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a<NUL>b" ASC) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a" ASC) AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY """a"" OR TRUE OR ""b""" ASC) AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY """" ASC) AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a"" OR TRUE OR ""b" ASC) AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "s"."a"" OR TRUE OR ""b" ASC) AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a;b" ASC) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "a'b" ASC) AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY """s"""."U&""a"" UESCAPE '!' || ""b""" ASC) AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY """s"""."U&""a\\"" OR TRUE OR \\""b""" ASC) AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" ORDER BY "s".U&"a\\0022"" OR TRUE OR ""\\0022b" ASC) AS "sq_users"",
      }
    `);
  });

  it('upsert updateColumns, written after EXCLUDED.', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [v] } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(EXCLUDED."a\\b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(EXCLUDED."a/*b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(EXCLUDED."a--b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(EXCLUDED."a$1b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(EXCLUDED."a"."b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""b") = ROW(EXCLUDED."a""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(EXCLUDED."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedDot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"".""b") = ROW(EXCLUDED."a"".""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedNul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""<NUL>""""b") = ROW(EXCLUDED."a""""<NUL>""""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "escapedOdd": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""""b") = ROW(EXCLUDED."a""""""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(EXCLUDED."""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "mixedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".a$1."b"" OR TRUE OR ""c") = ROW(EXCLUDED."s".a$1."b"" OR TRUE OR ""c") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(EXCLUDED."a<NUL>b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(EXCLUDED."a") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""a"" OR TRUE OR ""b""") = ROW(EXCLUDED."""a"" OR TRUE OR ""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEmpty": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(EXCLUDED."""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "prequotedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(EXCLUDED."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "qualifiedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s"."a"" OR TRUE OR ""b") = ROW(EXCLUDED."s"."a"" OR TRUE OR ""b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(EXCLUDED."a;b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(EXCLUDED."a'b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "uescape": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a"" UESCAPE '!' || ""b""") = ROW(EXCLUDED."""s"""."U&""a"" UESCAPE '!' || ""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a\\"" OR TRUE OR \\""b""") = ROW(EXCLUDED."""s"""."U&""a\\"" OR TRUE OR \\""b""") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        "unicodeEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") = ROW(EXCLUDED."s".U&"a\\0022"" OR TRUE OR ""\\0022b") RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
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
          "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""b") = ROW(CASE WHEN EXCLUDED."a""b" IS NULL THEN "users"."a""b" ELSE EXCLUDED."a""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(CASE WHEN EXCLUDED."a"" OR TRUE OR ""b" IS NULL THEN "users"."a"" OR TRUE OR ""b" ELSE EXCLUDED."a"" OR TRUE OR ""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedDot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"".""b") = ROW(CASE WHEN EXCLUDED."a"".""b" IS NULL THEN "users"."a"".""b" ELSE EXCLUDED."a"".""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedNul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""<NUL>""""b") = ROW(CASE WHEN EXCLUDED."a""""<NUL>""""b" IS NULL THEN "users"."a""""<NUL>""""b" ELSE EXCLUDED."a""""<NUL>""""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedOdd": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""""b") = ROW(CASE WHEN EXCLUDED."a""""""b" IS NULL THEN "users"."a""""""b" ELSE EXCLUDED."a""""""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(CASE WHEN EXCLUDED."""" IS NULL THEN "users"."""" ELSE EXCLUDED."""" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "mixedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".a$1."b"" OR TRUE OR ""c") = ROW(CASE WHEN EXCLUDED."s".a$1."b"" OR TRUE OR ""c" IS NULL THEN "users"."s".a$1."b"" OR TRUE OR ""c" ELSE EXCLUDED."s".a$1."b"" OR TRUE OR ""c" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(CASE WHEN EXCLUDED."a<NUL>b" IS NULL THEN "users"."a<NUL>b" ELSE EXCLUDED."a<NUL>b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(CASE WHEN EXCLUDED."a" IS NULL THEN "users"."a" ELSE EXCLUDED."a" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""a"" OR TRUE OR ""b""") = ROW(CASE WHEN EXCLUDED."""a"" OR TRUE OR ""b""" IS NULL THEN "users"."""a"" OR TRUE OR ""b""" ELSE EXCLUDED."""a"" OR TRUE OR ""b""" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedEmpty": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(CASE WHEN EXCLUDED."""" IS NULL THEN "users"."""" ELSE EXCLUDED."""" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(CASE WHEN EXCLUDED."a"" OR TRUE OR ""b" IS NULL THEN "users"."a"" OR TRUE OR ""b" ELSE EXCLUDED."a"" OR TRUE OR ""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "qualifiedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s"."a"" OR TRUE OR ""b") = ROW(CASE WHEN EXCLUDED."s"."a"" OR TRUE OR ""b" IS NULL THEN "users"."s"."a"" OR TRUE OR ""b" ELSE EXCLUDED."s"."a"" OR TRUE OR ""b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(CASE WHEN EXCLUDED."a;b" IS NULL THEN "users"."a;b" ELSE EXCLUDED."a;b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(CASE WHEN EXCLUDED."a'b" IS NULL THEN "users"."a'b" ELSE EXCLUDED."a'b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "uescape": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a"" UESCAPE '!' || ""b""") = ROW(CASE WHEN EXCLUDED."""s"""."U&""a"" UESCAPE '!' || ""b""" IS NULL THEN "users"."""s"""."U&""a"" UESCAPE '!' || ""b""" ELSE EXCLUDED."""s"""."U&""a"" UESCAPE '!' || ""b""" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "unicodeCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a\\"" OR TRUE OR \\""b""") = ROW(CASE WHEN EXCLUDED."""s"""."U&""a\\"" OR TRUE OR \\""b""" IS NULL THEN "users"."""s"""."U&""a\\"" OR TRUE OR \\""b""" ELSE EXCLUDED."""s"""."U&""a\\"" OR TRUE OR \\""b""" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "unicodeEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") = ROW(CASE WHEN EXCLUDED."s".U&"a\\0022"" OR TRUE OR ""\\0022b" IS NULL THEN "users"."s".U&"a\\0022"" OR TRUE OR ""\\0022b" ELSE EXCLUDED."s".U&"a\\0022"" OR TRUE OR ""\\0022b" END) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        }
      `);
  });

  it('upsert updateValues keys are identifiers, and string values are parameters', () => {
    expect(matrix(v => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [], updateValues: { [v]: sql`1` } } as any)))
      .toMatchInlineSnapshot(`
        {
          "backslash": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a\\b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "comment": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a/*b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dashes": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a--b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dollar": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a$1b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"."b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "dquote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedDot": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"".""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedNul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""<NUL>""""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "escapedOdd": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a""""""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "lone": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "mixedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".a$1."b"" OR TRUE OR ""c") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "nul": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a<NUL>b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequoted": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""a"" OR TRUE OR ""b""") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedEmpty": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "prequotedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a"" OR TRUE OR ""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "qualifiedEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s"."a"" OR TRUE OR ""b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "semicolon": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a;b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "squote": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("a'b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "uescape": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a"" UESCAPE '!' || ""b""") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "unicodeCloses": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("""s"""."U&""a\\"" OR TRUE OR \\""b""") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
          "unicodeEscaped": "INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") = ROW(1) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result",
        }
      `);
    // a value never reaches the text: each is the second parameter, as it is
    for (const [name, v] of Object.entries(hostile)) {
      const q = db.upsert('users', { email: 'x' }, 'email', { updateColumns: [], updateValues: { mood: v } } as any).compile();
      expect(q.text, name).toBe(`INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET ("mood") = ROW($2) RETURNING to_jsonb("users".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result`);
      expect(q.values, name).toEqual(['x', v]);
    }
    // in an array with a fragment, a string is an identifier, quoted as in a sql template
    const upsertMood = (mood: any) => db.upsert('users', { email: 'x' }, 'email', { updateColumns: [], updateValues: { mood } } as any).compile();
    for (const [name, v] of Object.entries(hostile)) {
      expect(upsertMood([sql`lower(`, v, sql`)`]), name).toEqual(upsertMood(sql`lower(${v})`));
    }
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
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, 1) AS result FROM "users") AS "sq_users"",
      }
    `);
  });

  it('a lateral key is one identifier in "lateral_<key>": `"` is doubled, `.` does not split', () => {
    const sub = db.selectOne('accounts', { owner_id: db.parent('id') });
    // 6.6.1: `"lateral_x" ON true) AS …` in both places; the key itself is a parameter, as before
    const key = 'x" ON true) AS "y';
    expect(db.select('users', all, { lateral: { [key]: sub } } as any).compile()).toEqual({
      text: `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_x"" ON true) AS ""y".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_x"" ON true) AS ""y" ON true) AS "sq_users"`,
      values: [key, 1],
    });
    // as for a string identifier, `a""b` reads as a hand-escaped `a"b`: the two keys get the same alias,
    // which Postgres refuses (42712) if both are given
    const pair = db.select('users', all, { lateral: { 'a"b': sub, 'a""b': sub } } as any).compile().text;
    expect(pair.match(/AS "lateral_a""b" ON true/g)).toHaveLength(2);
    expect(matrix(v => db.select('users', all, { lateral: { [v]: sub } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a\\b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a\\b" ON true) AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a/*b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a/*b" ON true) AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a--b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a--b" ON true) AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a$1b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a$1b" ON true) AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a.b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a.b" ON true) AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a""b" ON true) AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a"" OR TRUE OR ""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a"" OR TRUE OR ""b" ON true) AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a"".""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a"".""b" ON true) AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a""""<NUL>""""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a""""<NUL>""""b" ON true) AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a""""""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a""""""b" ON true) AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""" ON true) AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""s"".a$1.""b"""" OR TRUE OR """"c""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""s"".a$1.""b"""" OR TRUE OR """"c""" ON true) AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a<NUL>b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a<NUL>b" ON true) AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""a""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""a""" ON true) AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""a"" OR TRUE OR ""b""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""a"" OR TRUE OR ""b""" ON true) AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""" ON true) AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""a"""" OR TRUE OR """"b""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""a"""" OR TRUE OR """"b""" ON true) AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_s.a"" OR TRUE OR ""b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_s.a"" OR TRUE OR ""b" ON true) AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a;b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a;b" ON true) AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_a'b".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_a'b" ON true) AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""s"".U&""a"" UESCAPE '!' || ""b""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""s"".U&""a"" UESCAPE '!' || ""b""" ON true) AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""s"".U&""a\\"" OR TRUE OR \\""b""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""s"".U&""a\\"" OR TRUE OR \\""b""" ON true) AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) || jsonb_build_object($1::text, "lateral_""s"".U&""a\\0022"""" OR TRUE OR """"\\0022b""".result) AS result FROM "users" LEFT JOIN LATERAL (SELECT to_jsonb("accounts".*) AS result FROM "accounts" WHERE ("owner_id" = "users"."id") LIMIT $2) AS "lateral_""s"".U&""a\\0022"""" OR TRUE OR """"\\0022b""" ON true) AS "sq_users"",
      }
    `);
  });

  it('the alias is one identifier in "sq_<alias>" too: `"` is doubled, `.` does not split', () => {
    // `AS "sq_u"; DROP TABLE users; --"`; 6.6.1: a syntax error; since #74: a second statement that ran
    expect(db.select('users', all, { alias: 'u"; DROP TABLE users; --' } as any).compile().text)
      .toBe(`SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("u""; DROP TABLE users; --".*) AS result FROM "users" AS "u""; DROP TABLE users; --") AS "sq_u""; DROP TABLE users; --"`);
    expect(matrix(v => db.select('users', all, { alias: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a\\b".*) AS result FROM "users" AS "a\\b") AS "sq_a\\b"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a/*b".*) AS result FROM "users" AS "a/*b") AS "sq_a/*b"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a--b".*) AS result FROM "users" AS "a--b") AS "sq_a--b"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a$1b".*) AS result FROM "users" AS "a$1b") AS "sq_a$1b"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"."b".*) AS result FROM "users" AS "a"."b") AS "sq_a.b"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""b".*) AS result FROM "users" AS "a""b") AS "sq_a""b"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"" OR TRUE OR ""b".*) AS result FROM "users" AS "a"" OR TRUE OR ""b") AS "sq_a"" OR TRUE OR ""b"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"".""b".*) AS result FROM "users" AS "a"".""b") AS "sq_a"".""b"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""""<NUL>""""b".*) AS result FROM "users" AS "a""""<NUL>""""b") AS "sq_a""""<NUL>""""b"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a""""""b".*) AS result FROM "users" AS "a""""""b") AS "sq_a""""""b"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""".*) AS result FROM "users" AS """") AS "sq_"""",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s".a$1."b"" OR TRUE OR ""c".*) AS result FROM "users" AS "s".a$1."b"" OR TRUE OR ""c") AS "sq_""s"".a$1.""b"""" OR TRUE OR """"c"""",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a<NUL>b".*) AS result FROM "users" AS "a<NUL>b") AS "sq_a<NUL>b"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a".*) AS result FROM "users" AS "a") AS "sq_""a"""",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""a"" OR TRUE OR ""b""".*) AS result FROM "users" AS """a"" OR TRUE OR ""b""") AS "sq_""a"" OR TRUE OR ""b"""",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""".*) AS result FROM "users" AS """") AS "sq_"""",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a"" OR TRUE OR ""b".*) AS result FROM "users" AS "a"" OR TRUE OR ""b") AS "sq_""a"""" OR TRUE OR """"b"""",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s"."a"" OR TRUE OR ""b".*) AS result FROM "users" AS "s"."a"" OR TRUE OR ""b") AS "sq_s.a"" OR TRUE OR ""b"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a;b".*) AS result FROM "users" AS "a;b") AS "sq_a;b"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("a'b".*) AS result FROM "users" AS "a'b") AS "sq_a'b"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""s"""."U&""a"" UESCAPE '!' || ""b""".*) AS result FROM "users" AS """s"""."U&""a"" UESCAPE '!' || ""b""") AS "sq_""s"".U&""a"" UESCAPE '!' || ""b"""",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("""s"""."U&""a\\"" OR TRUE OR \\""b""".*) AS result FROM "users" AS """s"""."U&""a\\"" OR TRUE OR \\""b""") AS "sq_""s"".U&""a\\"" OR TRUE OR \\""b"""",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("s".U&"a\\0022"" OR TRUE OR ""\\0022b".*) AS result FROM "users" AS "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS "sq_""s"".U&""a\\0022"""" OR TRUE OR """"\\0022b"""",
      }
    `);
  });

  it('an alias check stays fast on a long run of doubled quotes', () => {
    const alias = `${'a""'.repeat(100_000)}"`;
    expect(db.select('users', all, { alias } as any).compile().text).toContain(`AS "sq_${alias.replace(/"/g, '""')}"`);
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
        "escapedCloses": "throws: Direction must be ASC/DESC, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Direction must be ASC/DESC, not 'a"."b'",
        "escapedNul": "throws: Direction must be ASC/DESC, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Direction must be ASC/DESC, not 'a"""b'",
        "lone": "throws: Direction must be ASC/DESC, not '"'",
        "mixedEscaped": "throws: Direction must be ASC/DESC, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Direction must be ASC/DESC, not 'a<NUL>b'",
        "prequoted": "throws: Direction must be ASC/DESC, not '"a"'",
        "prequotedCloses": "throws: Direction must be ASC/DESC, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Direction must be ASC/DESC, not '""'",
        "prequotedEscaped": "throws: Direction must be ASC/DESC, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Direction must be ASC/DESC, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Direction must be ASC/DESC, not 'a;b'",
        "squote": "throws: Direction must be ASC/DESC, not 'a'b'",
        "uescape": "throws: Direction must be ASC/DESC, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Direction must be ASC/DESC, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Direction must be ASC/DESC, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
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
        "escapedCloses": "throws: Nulls must be FIRST/LAST/undefined, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Nulls must be FIRST/LAST/undefined, not 'a"."b'",
        "escapedNul": "throws: Nulls must be FIRST/LAST/undefined, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Nulls must be FIRST/LAST/undefined, not 'a"""b'",
        "lone": "throws: Nulls must be FIRST/LAST/undefined, not '"'",
        "mixedEscaped": "throws: Nulls must be FIRST/LAST/undefined, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Nulls must be FIRST/LAST/undefined, not 'a<NUL>b'",
        "prequoted": "throws: Nulls must be FIRST/LAST/undefined, not '"a"'",
        "prequotedCloses": "throws: Nulls must be FIRST/LAST/undefined, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Nulls must be FIRST/LAST/undefined, not '""'",
        "prequotedEscaped": "throws: Nulls must be FIRST/LAST/undefined, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Nulls must be FIRST/LAST/undefined, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Nulls must be FIRST/LAST/undefined, not 'a;b'",
        "squote": "throws: Nulls must be FIRST/LAST/undefined, not 'a'b'",
        "uescape": "throws: Nulls must be FIRST/LAST/undefined, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Nulls must be FIRST/LAST/undefined, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Nulls must be FIRST/LAST/undefined, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
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
        "escapedCloses": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a"."b'",
        "escapedNul": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a"""b'",
        "lone": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"'",
        "mixedEscaped": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a<NUL>b'",
        "prequoted": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"a"'",
        "prequotedCloses": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '""'",
        "prequotedEscaped": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a;b'",
        "squote": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'a'b'",
        "uescape": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
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
        "escapedCloses": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a"."b'",
        "escapedNul": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a"""b'",
        "lone": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"'",
        "mixedEscaped": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a<NUL>b'",
        "prequoted": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"a"'",
        "prequotedCloses": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '""'",
        "prequotedEscaped": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a;b'",
        "squote": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not 'a'b'",
        "uescape": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
      }
    `);
  });

  it('lock.of', () => {
    expect(matrix(v => db.select('users', all, { lock: { for: 'UPDATE', of: v } } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a\\b") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a/*b") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a--b") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a$1b") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"."b") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a""b") AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"" OR TRUE OR ""b") AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"".""b") AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a""""<NUL>""""b") AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a""""""b") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF """") AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "s".a$1."b"" OR TRUE OR ""c") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a") AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF """a"" OR TRUE OR ""b""") AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF """") AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a"" OR TRUE OR ""b") AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "s"."a"" OR TRUE OR ""b") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "a'b") AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF """s"""."U&""a"" UESCAPE '!' || ""b""") AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF """s"""."U&""a\\"" OR TRUE OR \\""b""") AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" FOR UPDATE OF "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS "sq_users"",
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
        "escapedCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"."b'",
        "escapedNul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"""b'",
        "lone": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"'",
        "mixedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a<NUL>b'",
        "prequoted": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"'",
        "prequotedCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '""'",
        "prequotedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a;b'",
        "squote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a'b'",
        "uescape": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
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
        "escapedCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"."b'",
        "escapedNul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a""<NUL>""b'",
        "escapedOdd": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a"""b'",
        "lone": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"'",
        "mixedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a<NUL>b'",
        "prequoted": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"'",
        "prequotedCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '""'",
        "prequotedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a;b'",
        "squote": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not 'a'b'",
        "uescape": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
      }
    `);
  });

  it('distinct and groupBy', () => {
    expect(matrix(v => db.select('users', all, { distinct: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a\\b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a/*b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a--b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a$1b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"."b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"" OR TRUE OR ""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"".""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a""""<NUL>""""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a""""""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("""") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("s".a$1."b"" OR TRUE OR ""c") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a<NUL>b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("""a"" OR TRUE OR ""b""") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("""") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a"" OR TRUE OR ""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("s"."a"" OR TRUE OR ""b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a;b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("a'b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("""s"""."U&""a"" UESCAPE '!' || ""b""") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("""s"""."U&""a\\"" OR TRUE OR \\""b""") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT ON ("s".U&"a\\0022"" OR TRUE OR ""\\0022b") to_jsonb("users".*) AS result FROM "users") AS "sq_users"",
      }
    `);
    expect(matrix(v => db.select('users', all, { groupBy: v } as any))).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a\\b") AS "sq_users"",
        "comment": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a/*b") AS "sq_users"",
        "dashes": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a--b") AS "sq_users"",
        "dollar": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a$1b") AS "sq_users"",
        "dot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"."b") AS "sq_users"",
        "dquote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a""b") AS "sq_users"",
        "escapedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"" OR TRUE OR ""b") AS "sq_users"",
        "escapedDot": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"".""b") AS "sq_users"",
        "escapedNul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a""""<NUL>""""b") AS "sq_users"",
        "escapedOdd": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a""""""b") AS "sq_users"",
        "lone": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY """") AS "sq_users"",
        "mixedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "s".a$1."b"" OR TRUE OR ""c") AS "sq_users"",
        "nul": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a<NUL>b") AS "sq_users"",
        "prequoted": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a") AS "sq_users"",
        "prequotedCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY """a"" OR TRUE OR ""b""") AS "sq_users"",
        "prequotedEmpty": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY """") AS "sq_users"",
        "prequotedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a"" OR TRUE OR ""b") AS "sq_users"",
        "qualifiedEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "s"."a"" OR TRUE OR ""b") AS "sq_users"",
        "semicolon": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a;b") AS "sq_users"",
        "squote": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "a'b") AS "sq_users"",
        "uescape": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY """s"""."U&""a"" UESCAPE '!' || ""b""") AS "sq_users"",
        "unicodeCloses": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY """s"""."U&""a\\"" OR TRUE OR \\""b""") AS "sq_users"",
        "unicodeEscaped": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("users".*) AS result FROM "users" GROUP BY "s".U&"a\\0022"" OR TRUE OR ""\\0022b") AS "sq_users"",
      }
    `);
  });
});

describe('a built-in object as a Whereable', () => {
  // a built-in has no own enumerable key, or only index keys: 6.6.1 compiled it to TRUE, every row,
  // or to ("0" = $1 …); each now throws while compiling, before any query (#170)
  const outcomes = (build: (x: any) => db.SQLFragment<any, any>) =>
    Object.fromEntries(Object.entries(builtinObjects()).map(([name, x]) => {
      try {
        return [name, build(x).compile().text];
      } catch (err) {
        return [name, `throws: ${(err as Error).message}`];
      }
    }));

  it('throws, saying what to do', () => {
    expect(() => sql`DELETE FROM ${'users'} WHERE ${new Date(0) as any}`.compile()).toThrowErrorMatchingInlineSnapshot(`[Error: A built-in \`Date\` has no meaning as a Whereable (a filter): it would compile to its own enumerable keys, and to \`TRUE\`, every row, when it has none. To compare with a value, give it as \`db.param(…)\`; to filter, give a plain object (\`{ column: value }\`); await a \`Promise\` first.]`);
  });

  it('throws for a built-in with own enumerable keys too', () => {
    // 6.6.1 compiled its keys, a filter that type-checks: ("id" = $1); still refused, as a built-in
    expect(() => sql`DELETE FROM ${'users'} WHERE ${Object.assign(new Date(0), { id: 1 })}`.compile())
      .toThrow('A built-in `Date` has no meaning as a Whereable (a filter)');
  });

  it('throws for each built-in, through sql, a condition, the where of each shortcut and the having of select() and count()', () => {
    const
      expected = (name: string) => `throws: A built-in \`${name}\` has no meaning as a Whereable (a filter)`,
      entryPoints: Record<string, (x: any) => db.SQLFragment<any, any>> = {
        sql: x => sql`DELETE FROM ${'users'} WHERE ${x}`,
        arrayItem: x => sql`SELECT 1 WHERE ${[x]}`,
        and: x => sql`SELECT 1 WHERE ${db.conditions.and({ id: 1 }, x)}`,
        or: x => sql`SELECT 1 WHERE ${db.conditions.or({ id: 1 }, x)}`,
        not: x => sql`SELECT 1 WHERE ${db.conditions.not(x)}`,
        select: x => db.select('users', x),
        selectOne: x => db.selectOne('users', x),
        count: x => db.count('users', x),
        update: x => db.update('users', { display_name: 'Ada' }, x),
        deletes: x => db.deletes('users', x),
        lateral: x => db.select('users', all, { lateral: { orgs: db.select('orgs', x) } }),
        having: x => db.select('accounts', all, { columns: ['owner_id'], groupBy: 'owner_id', having: x }),
        countHaving: x => db.count('accounts', all, { groupBy: 'owner_id', having: x }),
      };
    for (const [entryPoint, build] of Object.entries(entryPoints))
      for (const [name, outcome] of Object.entries(outcomes(build)))
        expect(outcome.startsWith(expected(name)), `${entryPoint} ${name}: ${outcome}`).toBe(true);
  });

  it('a plain object, a null-prototype object, a class instance and a built-in value compile as before', () => {
    // a class instance is never refused, even of a class that extends a built-in: its own keys, as in 6.6.1;
    // nor is a built-in of another realm (a vm context), whose prototype is not this realm's
    class Premiere extends Date {}
    class FilmError extends Error { id = 1; }
    // ES2021: not in the lib's ES2019 types
    class FilmErrors extends ((globalThis as any).AggregateError as new (errors: unknown[], message: string) => Error) {}
    class Frames extends Uint8Array {}
    // the type of Buffer gives no constructor to extend
    class Reel extends (Buffer as any) {}
    class Still extends DataView<ArrayBuffer> {}
    class Watch extends ((globalThis as any).WeakRef as new (target: object) => object) { id = 1; }
    class Cleanup extends ((globalThis as any).FinalizationRegistry as new (callback: () => void) => object) {}
    class Shared extends SharedArrayBuffer {}
    const kept: Record<string, any> = {
      plain: { display_name: 'Ada' },
      empty: {},
      nullPrototype: Object.assign(Object.create(null), { display_name: 'Ada' }),
      classInstance: new (class { display_name = 'Ada'; })(),
      classWithoutOwnKeys: new (class { get display_name() { return 'Ada'; } })(),
      subclassOfDate: new Premiere(0),
      subclassOfError: new FilmError('x'),
      subclassOfAggregateError: new FilmErrors([], 'x'),
      subclassOfTypedArray: new Frames(1),
      subclassOfTypedArrayEmpty: new Frames(0),
      subclassOfBuffer: Object.setPrototypeOf(Buffer.from('id'), Reel.prototype),  // new Buffer() returns a Buffer
      subclassOfDataView: new Still(new ArrayBuffer(1)),
      subclassOfWeakRef: new Watch({}),
      subclassOfFinalizationRegistry: new Cleanup(() => {}),
      subclassOfSharedArrayBuffer: new Shared(1),
      otherRealmDate: runInNewContext('new Date(0)'),
      builtinValues: { created_at: new Date(0), tags: new Set(['a']), settings: new Map(), photo: Buffer.from('a') },
      array: [{ id: 1 }, sql` AND TRUE`],
    };
    expect({
      ...Object.fromEntries(Object.entries(kept).map(([name, x]) => [name, sql`DELETE FROM ${'users'} WHERE ${x}`.compile()])),
      param: sql`DELETE FROM ${'users'} WHERE ${'created_at'} < ${param(new Date(0))}`.compile(),
    }).toMatchInlineSnapshot(`
      {
        "array": {
          "text": "DELETE FROM "users" WHERE ("id" = $1) AND TRUE",
          "values": [
            1,
          ],
        },
        "builtinValues": {
          "text": "DELETE FROM "users" WHERE ("created_at" = $1 AND "photo" = $2 AND "settings" = $3 AND "tags" = $4)",
          "values": [
            1970-01-01T00:00:00.000Z,
            {
              "data": [
                97,
              ],
              "type": "Buffer",
            },
            Map {},
            Set {
              "a",
            },
          ],
        },
        "classInstance": {
          "text": "DELETE FROM "users" WHERE ("display_name" = $1)",
          "values": [
            "Ada",
          ],
        },
        "classWithoutOwnKeys": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "empty": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "nullPrototype": {
          "text": "DELETE FROM "users" WHERE ("display_name" = $1)",
          "values": [
            "Ada",
          ],
        },
        "otherRealmDate": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "param": {
          "text": "DELETE FROM "users" WHERE "created_at" < $1",
          "values": [
            1970-01-01T00:00:00.000Z,
          ],
        },
        "plain": {
          "text": "DELETE FROM "users" WHERE ("display_name" = $1)",
          "values": [
            "Ada",
          ],
        },
        "subclassOfAggregateError": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfBuffer": {
          "text": "DELETE FROM "users" WHERE ("0" = $1 AND "1" = $2)",
          "values": [
            105,
            100,
          ],
        },
        "subclassOfDataView": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfDate": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfError": {
          "text": "DELETE FROM "users" WHERE ("id" = $1)",
          "values": [
            1,
          ],
        },
        "subclassOfFinalizationRegistry": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfSharedArrayBuffer": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfTypedArray": {
          "text": "DELETE FROM "users" WHERE ("0" = $1)",
          "values": [
            0,
          ],
        },
        "subclassOfTypedArrayEmpty": {
          "text": "DELETE FROM "users" WHERE TRUE",
          "values": [],
        },
        "subclassOfWeakRef": {
          "text": "DELETE FROM "users" WHERE ("id" = $1)",
          "values": [
            1,
          ],
        },
      }
    `);
  });

  it('a subclass of DisposableStack or AsyncDisposableStack compiles as before, where the runtime has them', () => {
    // Node 24 and later; 6.6.1 compiled an instance with no own enumerable key to TRUE
    for (const name of ['DisposableStack', 'AsyncDisposableStack'].filter(name => name in globalThis)) {
      const Stack = class extends ((globalThis as any)[name] as new () => object) {};
      expect(sql`DELETE FROM ${'users'} WHERE ${new Stack()}`.compile(), name).toEqual({ text: 'DELETE FROM "users" WHERE TRUE', values: [] });
    }
  });

  it('throws for each ECMA-262 global constructor the runtime has, or keeps it for a reason', () => {
    // the hand-written list missed built-ins three times (#250, #416, #426): an object with each one's
    // prototype is refused, on each Node of the CI matrix, unless kept below
    const
      constructors = [
        'AggregateError', 'Array', 'ArrayBuffer', 'AsyncDisposableStack', 'BigInt', 'BigInt64Array', 'BigUint64Array',
        'Boolean', 'DataView', 'Date', 'DisposableStack', 'Error', 'EvalError', 'FinalizationRegistry', 'Float16Array',
        'Float32Array', 'Float64Array', 'Function', 'Int8Array', 'Int16Array', 'Int32Array', 'Iterator', 'Map', 'Number',
        'Object', 'Promise', 'Proxy', 'RangeError', 'ReferenceError', 'RegExp', 'Set', 'SharedArrayBuffer', 'String',
        'SuppressedError', 'Symbol', 'SyntaxError', 'TypeError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array',
        'Uint32Array', 'URIError', 'WeakMap', 'WeakRef', 'WeakSet',
      ],
      kept: Record<string, string> = {
        Object: 'a plain object is the filter itself',
        Array: 'an array compiles as its items; Object.create(Array.prototype) is no array',
        Function: 'a function is no object here, and throws as an alien value',
        Proxy: 'it has no prototype, and a proxy compiles as its target',
      },
      outcome = (name: string) => {
        const C = (globalThis as any)[name];
        if (kept[name]) return C.prototype === undefined ? 'kept' :
          sql`SELECT 1 WHERE ${Object.create(C.prototype)}`.compile().text === 'SELECT 1 WHERE TRUE' ? 'kept' : 'kept, but no longer TRUE';
        try {
          return `compiles: ${sql`SELECT 1 WHERE ${Object.create(C.prototype)}`.compile().text}`;
        } catch (err) {
          return (err as Error).message.startsWith(`A built-in \`${name}\` has no meaning as a Whereable`) ? 'throws' : (err as Error).message;
        }
      };
    expect(constructors.filter(name => name in globalThis).map(name => [name, outcome(name)])
      .filter(([name, x]) => x !== (kept[name] ? 'kept' : 'throws'))).toEqual([]);
  });

  it('a host iterator throws too, through the prototype chain, and a host object compiles as before', () => {
    // not ECMA-262 (#416 kept host objects out), but URLSearchParams' and Intl's iterators inherit %IteratorPrototype%
    const
      // ES2022: not in the lib's ES2019 types
      Segmenter = (Intl as any).Segmenter as new () => { segment(s: string): Iterable<unknown> },
      outcome = (x: object) => {
        try {
          return sql`DELETE FROM ${'users'} WHERE ${x}`.compile().text;
        } catch (err) {
          return `throws: ${/^A built-in `([^`]*)` has no meaning as a Whereable/.exec((err as Error).message)?.[1] ?? (err as Error).message}`;
        }
      },
      every = 'DELETE FROM "users" WHERE TRUE';
    expect(Object.fromEntries(Object.entries({
      urlSearchParamsIterator: new URLSearchParams('id=1').entries(),
      segmentsIterator: new Segmenter().segment('id')[Symbol.iterator](),
      url: new URL('https://example.com/'),
      urlSearchParams: new URLSearchParams('id=1'),
      blob: new Blob([]),
      headers: new Headers(),
      abortController: new AbortController(),
    }).map(([name, x]) => [name, outcome(x as object)]))).toEqual({
      urlSearchParamsIterator: 'throws: URLSearchParams Iterator',
      segmentsIterator: 'throws: Segmenter String Iterator',
      url: every,
      urlSearchParams: every,
      blob: every,
      headers: every,
      abortController: every,
    });
  });

  it('an iterator with own keys, of another realm or a mere iterable compiles as before', () => {
    // 6.6.1 compiled each to its own enumerable keys; only an iterator of this realm with none is refused
    class Reels { *[Symbol.iterator]() { yield 1; } }
    expect(Object.fromEntries(Object.entries({
      generatorWithOwnKey: Object.assign((function* () { yield 1; })(), { id: 1 }),
      iteratorWithOwnKey: Object.assign([1].values(), { id: 1 }),
      otherRealmIterator: runInNewContext('[1].values()'),
      otherRealmGenerator: runInNewContext('(function* () {})()'),
      iterable: new Reels(),
      iteratorLike: { next: 1 },
    }).map(([name, x]) => [name, sql`DELETE FROM ${'users'} WHERE ${x}`.compile()]))).toEqual({
      generatorWithOwnKey: { text: 'DELETE FROM "users" WHERE ("id" = $1)', values: [1] },
      iteratorWithOwnKey: { text: 'DELETE FROM "users" WHERE ("id" = $1)', values: [1] },
      otherRealmIterator: { text: 'DELETE FROM "users" WHERE TRUE', values: [] },
      otherRealmGenerator: { text: 'DELETE FROM "users" WHERE TRUE', values: [] },
      iterable: { text: 'DELETE FROM "users" WHERE TRUE', values: [] },
      iteratorLike: { text: 'DELETE FROM "users" WHERE ("next" = $1)', values: [1] },
    });
  });

  it('a subclass of Iterator compiles its own keys as before, and throws with none, where the runtime has it', () => {
    // Node 22 and later. With own keys, a class instance is a filter (#170); with none it was TRUE, and the
    // prototype chain cannot tell it from a built-in iterator (each generator function has its own prototype)
    const Iterator = (globalThis as any).Iterator as (new () => object) | undefined;
    if (!Iterator) return;
    class Ids extends Iterator { id = 1; next() { return { done: true, value: undefined }; } }
    class Empty extends Iterator { next() { return { done: true, value: undefined }; } }
    expect(sql`DELETE FROM ${'users'} WHERE ${new Ids()}`.compile()).toEqual({ text: 'DELETE FROM "users" WHERE ("id" = $1)', values: [1] });
    expect(() => sql`DELETE FROM ${'users'} WHERE ${new Empty()}`.compile()).toThrow('A built-in `Iterator` has no meaning as a Whereable (a filter)');
  });
});

describe('a list that is not an array in isIn() and isNotIn()', () => {
  // 6.6.1 read `a.length`: an iterable has none, so isNotIn() compiled to `true`, every row, and isIn() to
  // `false`; an array-like or a string gave its keys' values, null and undefined a TypeError at the call (#235)
  const lists = { isIn: db.conditions.isIn, isNotIn: db.conditions.isNotIn };
  const entryPoints: Record<string, (c: db.SQL) => db.SQLFragment<any, any>> = {
    deletes: c => db.deletes('users', { id: c }),
    select: c => db.select('users', { id: c }),
    update: c => db.update('users', { display_name: 'Ada' }, { id: c }),
    and: c => db.deletes('users', db.conditions.and({ display_name: 'Ada' }, { id: c })),
    or: c => db.deletes('users', db.conditions.or({ display_name: 'Ada' }, { id: c })),
    not: c => db.deletes('users', db.conditions.not({ id: c })),
    // copy() makes a fragment from the literals and expressions: a refusal must sit in them, not in compile
    copy: c => db.deletes('users', { id: (c as db.SQLFragment<any, any>).copy() }),
    copyInNot: c => db.deletes('users', db.conditions.not({ id: (c as db.SQLFragment<any, any>).copy() })),
    queryCopy: c => db.deletes('users', { id: c }).copy(),
  };
  // one value in place of the list is wrapped, not spread: `[...'5']` would split a string again
  const message = (fn: string, kind: string) => ['string', 'null', 'undefined'].includes(kind) ?
    `\`${fn}()\` takes an array, not \`${kind}\`: for one value, write \`${fn}([value])\`.` :
    `\`${fn}()\` takes an array, not \`${kind}\`: make one with \`${fn}([...values])\`, or \`Array.from(values)\` for an array-like object.`;

  it('throws for each kind, in isIn() and isNotIn(), through deletes, select and update, nested in and(), or() and not(), and copied', () => {
    const outcomes: string[] = [];
    for (const [fn, list] of Object.entries(lists))
      for (const [entryPoint, build] of Object.entries(entryPoints))
        for (const [kind, x] of Object.entries(nonArrayLists())) {
          let outcome: string;
          try {
            const condition = list(x as any);
            try { outcome = build(condition).compile().text; } catch (err) { outcome = (err as Error).message; }
          } catch (err) {
            outcome = `throws at the call: ${(err as Error).message}`;
          }
          if (outcome !== message(fn, kind)) outcomes.push(`${fn} ${entryPoint} ${kind}: ${outcome}`);
        }
    expect(outcomes).toEqual([]);
  });

  it('an array, empty, frozen or readonly, compiles as before', () => {
    const ids: readonly number[] = [1, 2];
    const show = (c: db.SQL) => db.deletes('users', { id: c }).compile();
    expect({
      isIn: show(db.conditions.isIn([1, 2])),
      isInEmpty: show(db.conditions.isIn([])),
      isInFrozen: show(db.conditions.isIn(Object.freeze([1, 2]))),
      isNotInReadonly: show(db.conditions.isNotIn(ids)),
      isNotInEmpty: show(db.conditions.isNotIn([])),
    }).toMatchInlineSnapshot(`
      {
        "isIn": {
          "text": "DELETE FROM "users" WHERE (("id" IN ($1, $2))) RETURNING to_jsonb("users".*) AS result",
          "values": [
            1,
            2,
          ],
        },
        "isInEmpty": {
          "text": "DELETE FROM "users" WHERE ((false)) RETURNING to_jsonb("users".*) AS result",
          "values": [],
        },
        "isInFrozen": {
          "text": "DELETE FROM "users" WHERE (("id" IN ($1, $2))) RETURNING to_jsonb("users".*) AS result",
          "values": [
            1,
            2,
          ],
        },
        "isNotInEmpty": {
          "text": "DELETE FROM "users" WHERE ((true)) RETURNING to_jsonb("users".*) AS result",
          "values": [],
        },
        "isNotInReadonly": {
          "text": "DELETE FROM "users" WHERE (("id" NOT IN ($1, $2))) RETURNING to_jsonb("users".*) AS result",
          "values": [
            1,
            2,
          ],
        },
      }
    `);
  });
});

describe('param cast', () => {
  it('the cast type is one quoted identifier: `"` is doubled', () => {
    // as quote_ident: `a"b` gives `"a""b"`; without a `"`, `.` splits (`"a"."b"`); a type already
    // quoted is written as is (prequoted, prequotedEscaped), any other is quoted again, not written raw
    expect(matrix(v => sql`SELECT ${param(1, v)}`)).toMatchInlineSnapshot(`
      {
        "backslash": "SELECT CAST($1 AS "a\\b")",
        "comment": "SELECT CAST($1 AS "a/*b")",
        "dashes": "SELECT CAST($1 AS "a--b")",
        "dollar": "SELECT CAST($1 AS "a$1b")",
        "dot": "SELECT CAST($1 AS "a"."b")",
        "dquote": "SELECT CAST($1 AS "a""b")",
        "escapedCloses": "SELECT CAST($1 AS "a"" OR TRUE OR ""b")",
        "escapedDot": "SELECT CAST($1 AS "a"."b")",
        "escapedNul": "SELECT CAST($1 AS "a""""<NUL>""""b")",
        "escapedOdd": "SELECT CAST($1 AS "a""""""b")",
        "lone": "SELECT CAST($1 AS """")",
        "mixedEscaped": "SELECT CAST($1 AS """s"".a$1.""b"""" OR TRUE OR """"c""")",
        "nul": "SELECT CAST($1 AS "a<NUL>b")",
        "prequoted": "SELECT CAST($1 AS "a")",
        "prequotedCloses": "SELECT CAST($1 AS """a"" OR TRUE OR ""b""")",
        "prequotedEmpty": "SELECT CAST($1 AS """")",
        "prequotedEscaped": "SELECT CAST($1 AS "a"" OR TRUE OR ""b")",
        "qualifiedEscaped": "SELECT CAST($1 AS "s.a"" OR TRUE OR ""b")",
        "semicolon": "SELECT CAST($1 AS "a;b")",
        "squote": "SELECT CAST($1 AS "a'b")",
        "uescape": "SELECT CAST($1 AS """s"".U&""a"" UESCAPE '!' || ""b""")",
        "unicodeCloses": "SELECT CAST($1 AS """s"".U&""a\\"" OR TRUE OR \\""b""")",
        "unicodeEscaped": "SELECT CAST($1 AS """s"".U&""a\\0022"""" OR TRUE OR """"\\0022b""")",
      }
    `);
  });

  it('a cast that closes its quotes compiles to one type name, and its values are untouched', () => {
    const q = sql`SELECT ${param(1, 'int4") || (SELECT secret FROM t) || ("int4')}`.compile();
    expect(q.text).toBe('SELECT CAST($1 AS "int4"") || (SELECT secret FROM t) || (""int4")');
    expect(q.values).toEqual([1]);
  });

  it('a cast is written as is only if it is well-formed once quoted', () => {
    // without a `"`, a cast is split on `.`, each part quoted (leadingDot, newlineInside, the dotted…
    // inputs); with one, `"${cast}"` passes as is only as quoted identifiers without NUL joined by `.`,
    // with whitespace around it but no comment (qualified, threeParts, escaped, newlineOutside,
    // spacesAroundDot, tabsAroundDot, otherSpaces, verticalTab), and so does a cast already quoted that
    // way (prequoted, dottedPrequoted, prequotedDot); any other cast is one identifier, `"` doubled
    expect(matrix(v => sql`SELECT ${param(1, v)}`, hostileCasts)).toMatchInlineSnapshot(`
      {
        "closes": "SELECT CAST($1 AS "int4"") || (SELECT display_name FROM users WHERE id = 1) || (""int4")",
        "comment": "SELECT CAST($1 AS "int4""/*.""*/""int4")",
        "commentBetween": "SELECT CAST($1 AS "pg_catalog""/**/.""int4")",
        "dotted": "SELECT CAST($1 AS "pg_catalog"."int4")",
        "dottedBackslash": "SELECT CAST($1 AS "pg_catalog\\"."int4")",
        "dottedComment": "SELECT CAST($1 AS "pg_catalog/*"."*/int4")",
        "dottedDashes": "SELECT CAST($1 AS "pg_catalog--"."int4")",
        "dottedDollar": "SELECT CAST($1 AS "$1"."int4")",
        "dottedEmpty": "SELECT CAST($1 AS "pg_catalog".""."int4")",
        "dottedNul": "SELECT CAST($1 AS "pg_catalog"."in<NUL>t4")",
        "dottedPrequoted": "SELECT CAST($1 AS "pg_catalog"."int4")",
        "dottedSemicolon": "SELECT CAST($1 AS "int4; (SELECT display_name FROM users WHERE id = 1); --"."int4")",
        "dottedSquote": "SELECT CAST($1 AS "pg_catalog"."int4' || (SELECT display_name FROM users WHERE id = 1) || '")",
        "dquote": "SELECT CAST($1 AS "a""b")",
        "empty": "SELECT CAST($1 AS "")",
        "emptyLast": "SELECT CAST($1 AS "pg_catalog"".""")",
        "emptyPart": "SELECT CAST($1 AS "pg_catalog""..""int4")",
        "escaped": "SELECT CAST($1 AS "int4""")",
        "leadingDot": "SELECT CAST($1 AS ""."int4")",
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
        "prequoted": "SELECT CAST($1 AS "a")",
        "prequotedDot": "SELECT CAST($1 AS "pg_catalog.int4")",
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

  it('array bounds at the end of a cast are written after its type only as `[]` or `[n]`', () => {
    // the type before them follows the rules above; anything else between brackets stays in the type name
    expect(matrix(v => sql`SELECT ${param(1, v)}`, hostileArrayCasts)).toEqual({
      array: 'SELECT CAST($1 AS "int4"[])',
      arrayBounds: 'SELECT CAST($1 AS "int4"[3][])',
      arrayDotted: 'SELECT CAST($1 AS "pg_catalog"."int4"[])',
      arrayQualified: 'SELECT CAST($1 AS "pg_catalog"."int4"[])',
      arrayPrequoted: 'SELECT CAST($1 AS "pg_catalog"."int4"[])',
      arrayOnly: 'SELECT CAST($1 AS ""[])',
      arrayAfterQuote: 'SELECT CAST($1 AS "int4"""[])',
      arrayCloses: 'SELECT CAST($1 AS "int4"") || (SELECT display_name FROM users WHERE id = 1) || (""int4"[])',
      arrayInside: 'SELECT CAST($1 AS "int4[1]) || (SELECT display_name FROM users WHERE id = 1) || CAST(1 AS int4"[])',
      arraySplice: 'SELECT CAST($1 AS "int4[1] || (SELECT display_name FROM users WHERE id = 1) || ARRAY"[1])',
      arraySemicolon: 'SELECT CAST($1 AS "int4; (SELECT display_name FROM users WHERE id = 1); --"[])',
      arraySpace: 'SELECT CAST($1 AS "int4[ ]")',
      arrayNegative: 'SELECT CAST($1 AS "int4[-1]")',
      arrayUnclosed: 'SELECT CAST($1 AS "int4[1")',
      arrayNested: 'SELECT CAST($1 AS "int4[[]]")',
      arrayNul: 'SELECT CAST($1 AS "int4[<NUL>]")',
      arrayBackslash: 'SELECT CAST($1 AS "int4\\"[])',
    });
  });

  it('every cast compiles to quoted identifiers joined by `.`, then array bounds, and nothing else', () => {
    const castType = /^CAST\(\$1 AS "(?:[^"]|"")*"(?:[ \t\n\r\f\v]*\.[ \t\n\r\f\v]*"(?:[^"]|"")*")*(?:\[[0-9]*\])*\)$/;
    for (const cast of [...Object.values(hostile), ...Object.values(hostileCasts), ...Object.values(hostileArrayCasts)])
      expect(sql`${param(1, cast)}`.compile().text).toMatch(castType);
  });

  it('a cast check stays fast on long runs of brackets, digits and dots', () => {
    const
      n = 1_000_000,
      text = (cast: string) => sql`${param(1, cast)}`.compile().text,
      pairs = '[]'.repeat(n),
      digits = `[${'1'.repeat(n)}`;
    // all bounds, after an empty type name (which Postgres refuses)
    expect(text(pairs)).toBe(`CAST($1 AS ""${pairs})`);
    expect(text(`${digits}]`)).toBe(`CAST($1 AS ""${digits}])`);
    // bounds followed by anything else stay in the type name
    expect(text(`${pairs}x`)).toBe(`CAST($1 AS "${pairs}x")`);
    expect(text(`${digits}x]`)).toBe(`CAST($1 AS "${digits}x]")`);
    expect(text('['.repeat(n))).toBe(`CAST($1 AS "${'['.repeat(n)}")`);
    expect(text(']'.repeat(n))).toBe(`CAST($1 AS "${']'.repeat(n)}")`);
    expect(text('[x]'.repeat(n))).toBe(`CAST($1 AS "${'[x]'.repeat(n)}")`);
    // only the last bounds are bounds when a name comes between
    expect(text('a[1]'.repeat(n))).toBe(`CAST($1 AS "${'a[1]'.repeat(n - 1)}a"[1])`);
    expect(text('.'.repeat(n))).toBe(`CAST($1 AS "${'"."'.repeat(n)}")`);
  });
});

describe('param cast under castArrayParamsToJson and castObjectParamsToJson', () => {
  afterEach(resetConfig);
  const allCasts = [...Object.values(hostile), ...Object.values(hostileCasts), ...Object.values(hostileArrayCasts)];

  it('every cast compiles as with the config off, on an array and on a plain object', () => {
    // 6.6.1 dropped the cast for CAST($1 AS "json"); the type is now the one written, with the rules above
    const off = allCasts.map(cast => sql`${param(1, cast)}`.compile().text);
    db.setConfig({ castArrayParamsToJson: true, castObjectParamsToJson: true });
    allCasts.forEach((cast, i) => {
      expect(sql`${param([1, 2], cast)}`.compile().text).toBe(off[i]);
      expect(sql`${param({ a: 1 }, cast)}`.compile()).toEqual({ text: off[i], values: ['{"a":1}'] });
    });
  });

  it('an array goes as an array only when its cast ends with array bounds, otherwise as JSON', () => {
    db.setConfig({ castArrayParamsToJson: true });
    const sent = (inputs: Record<string, string>) => Object.fromEntries(Object.entries(inputs).map(([name, cast]) =>
      [name, sql`${param([1, 2], cast)}`.compile().values[0]]));
    expect(sent(hostileArrayCasts)).toEqual({
      array: [1, 2], arrayBounds: [1, 2], arrayDotted: [1, 2], arrayQualified: [1, 2], arrayPrequoted: [1, 2],
      arrayOnly: [1, 2], arrayAfterQuote: [1, 2], arrayCloses: [1, 2], arrayInside: [1, 2], arraySplice: [1, 2],
      arraySemicolon: [1, 2], arrayBackslash: [1, 2],
      // not bounds, so part of the type name: the config's JSON stays
      arraySpace: '[1,2]', arrayNegative: '[1,2]', arrayUnclosed: '[1,2]', arrayNested: '[1,2]', arrayNul: '[1,2]',
    });
    for (const sentValue of Object.values(sent({ ...hostile, ...hostileCasts }))) expect(sentValue).toBe('[1,2]');
  });

  it('every cast compiles the same in a Whereable, isIn and vals, its value sent as alone', () => {
    db.setConfig({ castArrayParamsToJson: true, castObjectParamsToJson: true });
    for (const cast of allCasts) for (const value of [[1, 2], { a: 1 }]) {
      const { text: alone, values } = sql`${param(value, cast)}`.compile();
      expect(sql`${{ display_name: param(value, cast) }}`.compile()).toEqual({ text: `("display_name" = ${alone})`, values });
      expect(sql`${{ display_name: db.conditions.isIn([param(value, cast)]) }}`.compile())
        .toEqual({ text: `(("display_name" IN (${alone})))`, values });
      expect(sql`${vals([param(value, cast), 2])}`.compile()).toEqual({ text: `${alone}, $2`, values: [...values, 2] });
    }
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
        "escapedCloses": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a"" OR TRUE OR ""b'",
        "escapedDot": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a"."b'",
        "escapedNul": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a""<NUL>""b'",
        "escapedOdd": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a"""b'",
        "lone": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"'",
        "mixedEscaped": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"s".a$1."b"" OR TRUE OR ""c"'",
        "nul": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a<NUL>b'",
        "prequoted": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"a"'",
        "prequotedCloses": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"a" OR TRUE OR "b"'",
        "prequotedEmpty": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '""'",
        "prequotedEscaped": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"a"" OR TRUE OR ""b"'",
        "qualifiedEscaped": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 's.a"" OR TRUE OR ""b'",
        "semicolon": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a;b'",
        "squote": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not 'a'b'",
        "uescape": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"s".U&"a" UESCAPE '!' || "b"'",
        "unicodeCloses": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"s".U&"a\\" OR TRUE OR \\"b"'",
        "unicodeEscaped": "throws: Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '"s".U&"a\\0022"" OR TRUE OR ""\\0022b"'",
      }
    `);
    expect(queryable.connect).not.toHaveBeenCalled();
    expect(queryable.query).not.toHaveBeenCalled();
  });
});

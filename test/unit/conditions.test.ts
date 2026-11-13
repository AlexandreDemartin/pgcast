// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts, compilation only (no database):
// each export compiled as the value of a Whereable key, so that `self` is bound.
// Execution on the fixture: test/integration/conditions.test.ts.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, raw, cols, vals, self, Default, conditions as dc } from '../../src/db';

/** The compiled `{ text, values }` of `{ col: condition }`, nested under a parent table for parent(); values raw. */
const show = (condition: db.SQL) => sql`${{ col: condition }}`.copy({ parentTable: 'p' }).compile();

describe('conditions', () => {
  it('covers every export of db.conditions', () => {
    expect(Object.keys(dc).sort()).toMatchInlineSnapshot(`
      [
        "add",
        "after",
        "and",
        "arrayContainedIn",
        "arrayContains",
        "arrayOverlaps",
        "before",
        "between",
        "betweenSymmetric",
        "eq",
        "fromNow",
        "gt",
        "gte",
        "ilike",
        "isDistinctFrom",
        "isFalse",
        "isIn",
        "isNotDistinctFrom",
        "isNotFalse",
        "isNotIn",
        "isNotNull",
        "isNotTrue",
        "isNotUnknown",
        "isNull",
        "isTrue",
        "isUnknown",
        "like",
        "lt",
        "lte",
        "ne",
        "not",
        "notBetween",
        "notBetweenSymmetric",
        "notIlike",
        "notLike",
        "notReImatch",
        "notReMatch",
        "notSimilarTo",
        "now",
        "or",
        "reImatch",
        "reMatch",
        "similarTo",
        "subtract",
      ]
    `);
  });

  it('IS [NOT] NULL / TRUE / FALSE / UNKNOWN', () => {
    expect({
      isNull: show(dc.isNull), isNotNull: show(dc.isNotNull),
      isTrue: show(dc.isTrue), isNotTrue: show(dc.isNotTrue),
      isFalse: show(dc.isFalse), isNotFalse: show(dc.isNotFalse),
      isUnknown: show(dc.isUnknown), isNotUnknown: show(dc.isNotUnknown),
    }).toMatchInlineSnapshot(`
      {
        "isFalse": {
          "text": "(("col" IS FALSE))",
          "values": [],
        },
        "isNotFalse": {
          "text": "(("col" IS NOT FALSE))",
          "values": [],
        },
        "isNotNull": {
          "text": "(("col" IS NOT NULL))",
          "values": [],
        },
        "isNotTrue": {
          "text": "(("col" IS NOT TRUE))",
          "values": [],
        },
        "isNotUnknown": {
          "text": "(("col" IS NOT UNKNOWN))",
          "values": [],
        },
        "isNull": {
          "text": "(("col" IS NULL))",
          "values": [],
        },
        "isTrue": {
          "text": "(("col" IS TRUE))",
          "values": [],
        },
        "isUnknown": {
          "text": "(("col" IS UNKNOWN))",
          "values": [],
        },
      }
    `);
  });

  it('comparisons: a value, a fragment, a Parameter or parent()', () => {
    expect({
      isDistinctFrom: show(dc.isDistinctFrom('a')), isNotDistinctFrom: show(dc.isNotDistinctFrom(null)),
      eq: show(dc.eq(1)), eqUndefined: show(dc.eq(undefined)), ne: show(dc.ne(sql`lower(${'x'})`)), gt: show(dc.gt(param(1, 'int8'))),
      gte: show(dc.gte(parent('y'))), lt: show(dc.lt(new Date(0))), lte: show(dc.lte(parent())),
      after: show(dc.after(dc.now)), before: show(dc.before(dc.fromNow(-2, 'days'))),
    }).toMatchInlineSnapshot(`
      {
        "after": {
          "text": "(("col" > now()))",
          "values": [],
        },
        "before": {
          "text": "(("col" < now() + $1))",
          "values": [
            "-2 days",
          ],
        },
        "eq": {
          "text": "(("col" = $1))",
          "values": [
            1,
          ],
        },
        "eqUndefined": {
          "text": "(("col" = $1))",
          "values": [
            undefined,
          ],
        },
        "gt": {
          "text": "(("col" > CAST($1 AS "int8")))",
          "values": [
            1,
          ],
        },
        "gte": {
          "text": "(("col" >= "p"."y"))",
          "values": [],
        },
        "isDistinctFrom": {
          "text": "(("col" IS DISTINCT FROM $1))",
          "values": [
            "a",
          ],
        },
        "isNotDistinctFrom": {
          "text": "(("col" IS NOT DISTINCT FROM $1))",
          "values": [
            null,
          ],
        },
        "lt": {
          "text": "(("col" < $1))",
          "values": [
            1970-01-01T00:00:00.000Z,
          ],
        },
        "lte": {
          "text": "(("col" <= "p"."col"))",
          "values": [],
        },
        "ne": {
          "text": "(("col" <> lower("x")))",
          "values": [],
        },
      }
    `);
  });

  it('BETWEEN, [NOT] BETWEEN [SYMMETRIC]', () => {
    expect({
      between: show(dc.between(1, 2)), betweenSymmetric: show(dc.betweenSymmetric(2, 1)),
      notBetween: show(dc.notBetween(1, 2)), notBetweenSymmetric: show(dc.notBetweenSymmetric(2, 1)),
    }).toMatchInlineSnapshot(`
      {
        "between": {
          "text": "(("col" BETWEEN ($1) AND ($2)))",
          "values": [
            1,
            2,
          ],
        },
        "betweenSymmetric": {
          "text": "(("col" BETWEEN SYMMETRIC ($1) AND ($2)))",
          "values": [
            2,
            1,
          ],
        },
        "notBetween": {
          "text": "(("col" NOT BETWEEN ($1) AND ($2)))",
          "values": [
            1,
            2,
          ],
        },
        "notBetweenSymmetric": {
          "text": "(("col" NOT BETWEEN SYMMETRIC ($1) AND ($2)))",
          "values": [
            2,
            1,
          ],
        },
      }
    `);
  });

  it('pattern matching', () => {
    expect({
      like: show(dc.like('A%')), notLike: show(dc.notLike('A%')), ilike: show(dc.ilike('a%')), notIlike: show(dc.notIlike('a%')),
      similarTo: show(dc.similarTo('(A|B)%')), notSimilarTo: show(dc.notSimilarTo('(A|B)%')),
      reMatch: show(dc.reMatch('^A')), reImatch: show(dc.reImatch('^a')),
      notReMatch: show(dc.notReMatch('^A')), notReImatch: show(dc.notReImatch('^a')),
    }).toMatchInlineSnapshot(`
      {
        "ilike": {
          "text": "(("col" ILIKE $1))",
          "values": [
            "a%",
          ],
        },
        "like": {
          "text": "(("col" LIKE $1))",
          "values": [
            "A%",
          ],
        },
        "notIlike": {
          "text": "(("col" NOT ILIKE $1))",
          "values": [
            "a%",
          ],
        },
        "notLike": {
          "text": "(("col" NOT LIKE $1))",
          "values": [
            "A%",
          ],
        },
        "notReImatch": {
          "text": "(("col" !~* $1))",
          "values": [
            "^a",
          ],
        },
        "notReMatch": {
          "text": "(("col" !~ $1))",
          "values": [
            "^A",
          ],
        },
        "notSimilarTo": {
          "text": "(("col" NOT SIMILAR TO $1))",
          "values": [
            "(A|B)%",
          ],
        },
        "reImatch": {
          "text": "(("col" ~* $1))",
          "values": [
            "^a",
          ],
        },
        "reMatch": {
          "text": "(("col" ~ $1))",
          "values": [
            "^A",
          ],
        },
        "similarTo": {
          "text": "(("col" SIMILAR TO $1))",
          "values": [
            "(A|B)%",
          ],
        },
      }
    `);
  });

  it('isIn / isNotIn, empty lists included', () => {
    expect({
      isIn: show(dc.isIn([1, 2, sql`3`])), isInEmpty: show(dc.isIn([])),
      isNotIn: show(dc.isNotIn(['a'])), isNotInEmpty: show(dc.isNotIn([])),
    }).toMatchInlineSnapshot(`
      {
        "isIn": {
          "text": "(("col" IN ($1, $2, 3)))",
          "values": [
            1,
            2,
          ],
        },
        "isInEmpty": {
          "text": "((false))",
          "values": [],
        },
        "isNotIn": {
          "text": "(("col" NOT IN ($1)))",
          "values": [
            "a",
          ],
        },
        "isNotInEmpty": {
          "text": "((true))",
          "values": [],
        },
      }
    `);
  });

  it('or / and / not, of fragments and Whereables', () => {
    expect({
      or: show(dc.or(dc.eq(1), dc.isNull)),
      and: show(dc.and(dc.gt(1), { other: 2 })),
      not: show(dc.not(dc.eq(1))),
      notWhereable: show(dc.not({ other: 2, more: 3 })),
    }).toMatchInlineSnapshot(`
      {
        "and": {
          "text": "(((("col" > $1) AND (("other" = $2)))))",
          "values": [
            1,
            2,
          ],
        },
        "not": {
          "text": "(((NOT ("col" = $1))))",
          "values": [
            1,
          ],
        },
        "notWhereable": {
          "text": "(((NOT (("more" = $1 AND "other" = $2)))))",
          "values": [
            3,
            2,
          ],
        },
        "or": {
          "text": "((("col" = $1 OR "col" IS NULL)))",
          "values": [
            1,
          ],
        },
      }
    `);
  });

  it('not() parenthesises its condition', () => {
    // 6.6.1 wrote `(NOT "col" = 1 OR "col" = 2)`, which reads `(NOT "col" = 1) OR "col" = 2`
    expect({
      notOr: show(dc.not(sql`${db.self} = 1 OR ${db.self} = 2`)),
      notNot: show(dc.not(dc.not(dc.eq(1)))),
    }).toMatchInlineSnapshot(`
      {
        "notNot": {
          "text": "(((NOT ((NOT ("col" = $1))))))",
          "values": [
            1,
          ],
        },
        "notOr": {
          "text": "(((NOT ("col" = 1 OR "col" = 2))))",
          "values": [],
        },
      }
    `);
  });

  // 6.6.1 wrote `(a OR b AND c)`, which reads `a OR (b AND c)`: each case red on its own there
  it.each([
    ['a fragment, then a fragment', () => dc.and(sql`a OR b`, sql`c`).compile(), { text: '((a OR b) AND (c))', values: [] }],
    ['a fragment, then a Whereable', () => dc.and(sql`a OR b`, { id: 1 }).compile(), { text: '((a OR b) AND (("id" = $1)))', values: [1] }],
    ['a Whereable, then a fragment', () => dc.and({ id: 1 }, sql`a OR b`).compile(), { text: '((("id" = $1)) AND (a OR b))', values: [1] }],
    ['one operand', () => dc.and(sql`a OR b`).compile(), { text: '((a OR b))', values: [] }],
    ['conditions, as a Whereable value', () => show(dc.and(dc.gt(1), dc.isNull)), { text: '(((("col" > $1) AND ("col" IS NULL))))', values: [1] }],
    ['nested and(), or() and not()', () => dc.and(dc.or(sql`a`, sql`b`), dc.not(sql`c`), dc.and(sql`d OR e`, sql`f`)).compile(),
      { text: '(((a OR b)) AND ((NOT (c))) AND (((d OR e) AND (f))))', values: [] }],
  ])('and() parenthesises each operand: %s', (_name, compile, expected) => {
    expect(compile()).toEqual(expected);
  });

  it('or() keeps its operands as they are: AND binds tighter than OR', () => {
    expect(dc.or(sql`a AND b`, sql`c OR d`, { id: 1 }).compile()).toEqual({ text: '(a AND b OR c OR d OR ("id" = $1))', values: [1] });
  });

  // their identities; 6.6.1 wrote `()`, which Postgres refuses (42601): each case red on its own there
  it.each([
    ['and()', () => dc.and().compile(), { text: 'TRUE', values: [] }],
    ['or()', () => dc.or().compile(), { text: 'FALSE', values: [] }],
    ['and() as a Whereable value', () => show(dc.and()), { text: '((TRUE))', values: [] }],
    ['or() as a Whereable value', () => show(dc.or()), { text: '((FALSE))', values: [] }],
    ['not(and())', () => dc.not(dc.and()).compile(), { text: '(NOT (TRUE))', values: [] }],
    ['not(or())', () => dc.not(dc.or()).compile(), { text: '(NOT (FALSE))', values: [] }],
    ['and(or())', () => dc.and(dc.or()).compile(), { text: '((FALSE))', values: [] }],
    ['or(and())', () => dc.or(dc.and()).compile(), { text: '(TRUE)', values: [] }],
    ['and(or(), Whereable)', () => dc.and(dc.or(), { id: 1 }).compile(), { text: '((FALSE) AND (("id" = $1)))', values: [1] }],
    ['or(and(), Whereable)', () => dc.or(dc.and(), { id: 1 }).compile(), { text: '(TRUE OR ("id" = $1))', values: [1] }],
  ])('and() / or() without argument: %s', (_name, compile, expected) => {
    expect(compile()).toEqual(expected);
  });

  it('array operators: the array is one parameter', () => {
    expect({
      arrayContains: show(dc.arrayContains([1, 2])), arrayContainedIn: show(dc.arrayContainedIn(['a'])),
      arrayOverlaps: show(dc.arrayOverlaps([])), arrayOverlapsParent: show(dc.arrayOverlaps(parent('tags'))),
    }).toMatchInlineSnapshot(`
      {
        "arrayContainedIn": {
          "text": "(("col" <@ $1))",
          "values": [
            [
              "a",
            ],
          ],
        },
        "arrayContains": {
          "text": "(("col" @> $1))",
          "values": [
            [
              1,
              2,
            ],
          ],
        },
        "arrayOverlaps": {
          "text": "(("col" && $1))",
          "values": [
            [],
          ],
        },
        "arrayOverlapsParent": {
          "text": "(("col" && "p"."tags"))",
          "values": [],
        },
      }
    `);
  });

  it('fromNow, now, add, subtract', () => {
    expect({
      fromNow: dc.fromNow(3).compile(), fromNowUnit: dc.fromNow(-1.5, 'hours').compile(), now: dc.now.compile(),
      add: show(dc.add(5)), subtract: show(dc.subtract(new Date(0))),
    }).toMatchInlineSnapshot(`
      {
        "add": {
          "text": "(("col" + $1))",
          "values": [
            5,
          ],
        },
        "fromNow": {
          "text": "now() + $1",
          "values": [
            "3 millisecond",
          ],
        },
        "fromNowUnit": {
          "text": "now() + $1",
          "values": [
            "-1.5 hours",
          ],
        },
        "now": {
          "text": "now()",
          "values": [],
        },
        "subtract": {
          "text": "(("col" - $1))",
          "values": [
            1970-01-01T00:00:00.000Z,
          ],
        },
      }
    `);
  });

  it('add and subtract a Parameter', () => {
    expect(show(dc.add(param(3, 'int4')))).toEqual({ text: '(("col" + CAST($1 AS "int4")))', values: [3] });
    expect(show(dc.subtract(param(3, 'int4')))).toEqual({ text: '(("col" - CAST($1 AS "int4")))', values: [3] });
    expect(show(dc.add(param(3, 'pg_catalog.int4')))).toEqual({ text: '(("col" + CAST($1 AS "pg_catalog"."int4")))', values: [3] });
    expect(show(dc.add(param(3)))).toEqual({ text: '(("col" + $1))', values: [3] });
  });
});

describe('Default, self, raw, cols and vals as the value of a condition', () => {
  // each condition that takes a value, by arity; the others take none, or take conditions (and, or, not)
  const one: Record<string, (a: any) => db.SQLFragment<any, any>> = {
    isDistinctFrom: dc.isDistinctFrom, isNotDistinctFrom: dc.isNotDistinctFrom,
    eq: dc.eq, ne: dc.ne, gt: dc.gt, gte: dc.gte, lt: dc.lt, lte: dc.lte, after: dc.after, before: dc.before,
    like: dc.like, notLike: dc.notLike, ilike: dc.ilike, notIlike: dc.notIlike, similarTo: dc.similarTo,
    notSimilarTo: dc.notSimilarTo, reMatch: dc.reMatch, reImatch: dc.reImatch, notReMatch: dc.notReMatch,
    notReImatch: dc.notReImatch, arrayContains: dc.arrayContains, arrayContainedIn: dc.arrayContainedIn,
    arrayOverlaps: dc.arrayOverlaps, add: dc.add, subtract: dc.subtract,
  };
  const two: Record<string, (a: any, b: any) => db.SQLFragment<any, any>> = {
    between: dc.between, betweenSymmetric: dc.betweenSymmetric, notBetween: dc.notBetween, notBetweenSymmetric: dc.notBetweenSymmetric,
  };
  const lists: Record<string, (a: any[]) => db.SQLFragment<any, any>> = { isIn: dc.isIn, isNotIn: dc.isNotIn };
  const noValue = ['isNull', 'isNotNull', 'isTrue', 'isNotTrue', 'isFalse', 'isNotFalse', 'isUnknown', 'isNotUnknown',
    'and', 'or', 'not', 'fromNow', 'now'];

  /** What compiling `{ col: condition }` throws, or 'compiled'; building the condition must not throw. */
  const thrown = (condition: db.SQL) => {
    try { show(condition); return 'compiled'; } catch (err) { return (err as Error).message; }
  };
  const messages = (value: unknown) => {
    const conditions = [...Object.values(one).map(f => f(value)), ...Object.values(two).flatMap(f => [f(value, 1), f(1, value)])];
    return new Set(conditions.map(thrown));
  };

  it('covers every condition of db.conditions', () => {
    expect([...Object.keys(one), ...Object.keys(two), ...Object.keys(lists), ...noValue].sort()).toEqual(Object.keys(dc).sort());
  });

  it('a condition given Default or self throws when compiled, not when called', () => {
    // 6.6.1 sent 'Symbol(DEFAULT)' and 'Symbol(self)': no row on a text column, every row with ne(), 22P02 on the others
    expect({ Default: messages(Default), self: messages(self) }).toMatchInlineSnapshot(`
      {
        "Default": Set {
          "\`db.Default\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give \`db.Default\` as the value itself: \`{ n: db.Default }\`.",
        },
        "self": Set {
          "\`db.self\` has no meaning as the value of \`eq()\`, \`add()\` and the other conditions: it is already the column on the left. To compare the column with itself, write a \`sql\` fragment with \`db.self\` on both sides.",
        },
      }
    `);
  });

  it('isIn and isNotIn given Default or self throw when compiled', () => {
    expect(Object.fromEntries(Object.entries(lists).flatMap(([name, f]) =>
      [[`${name}Default`, thrown(f(['Ada', Default]))], [`${name}Self`, thrown(f(['Ada', self]))]]))).toMatchInlineSnapshot(`
      {
        "isInDefault": "\`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.",
        "isInSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
        "isNotInDefault": "\`db.Default\` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. \`DEFAULT\` is for INSERT and UPDATE values.",
        "isNotInSelf": "\`db.self\` has no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: compare with a value, or use it in a \`sql\` fragment value, where it stands for the column.",
      }
    `);
  });

  it('a condition given raw, cols or vals throws when compiled, not when called', () => {
    // 6.6.1 sent them as JSON ('{"value":"\'Ada\'"}'): no row on a text column, every row with ne(), 22P02 on the others
    expect({ raw: messages(raw("'Ada'")), cols: messages(cols('Ada')), vals: messages(vals('Ada')) }).toMatchInlineSnapshot(`
      {
        "cols": Set {
          "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as the value of \`eq()\`, \`add()\` and the other conditions: for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition; for a value, give the value itself, or \`db.param()\`.",
        },
        "raw": Set {
          "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as the value of \`eq()\`, \`add()\` and the other conditions: for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition; for a value, give the value itself, or \`db.param()\`.",
        },
        "vals": Set {
          "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as the value of \`eq()\`, \`add()\` and the other conditions: for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition; for a value, give the value itself, or \`db.param()\`.",
        },
      }
    `);
  });

  it('isIn and isNotIn given raw, cols or vals throw when compiled', () => {
    expect(new Set(Object.values(lists).flatMap(f => [raw("'Ada'"), cols('Ada'), vals('Ada')].map(v => thrown(f(['Ada', v]))))))
      .toMatchInlineSnapshot(`
        Set {
          "\`db.raw()\`, \`db.cols()\` and \`db.vals()\` have no meaning as a value in a Whereable (a filter), nor in \`isIn()\`: to compare with SQL, use a \`sql\` fragment value, where \`db.self\` stands for the column; to compare with a value, give the value itself, or \`db.param()\`.",
        }
      `);
  });

  it('self keeps its meaning in a fragment written by hand', () => {
    expect(show(sql`${self} = ${self}`)).toMatchInlineSnapshot(`
      {
        "text": "(("col" = "col"))",
        "values": [],
      }
    `);
  });
});

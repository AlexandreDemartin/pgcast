// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts, compilation only (no database):
// each export compiled as the value of a Whereable key, so that `self` is bound.
// Execution on the fixture: test/integration/conditions.test.ts.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, conditions as dc } from '../../src/db';

/** `text -- values` of `{ col: condition }`, nested under a parent table for parent(). */
const show = (condition: db.SQL) => {
  const { text, values } = sql`${{ col: condition }}`.copy({ parentTable: 'p' }).compile();
  return values.length ? `${text} -- ${JSON.stringify(values)}` : text;
};

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
        "isFalse": "(("col" IS FALSE))",
        "isNotFalse": "(("col" IS NOT FALSE))",
        "isNotNull": "(("col" IS NOT NULL))",
        "isNotTrue": "(("col" IS NOT TRUE))",
        "isNotUnknown": "(("col" IS NOT UNKNOWN))",
        "isNull": "(("col" IS NULL))",
        "isTrue": "(("col" IS TRUE))",
        "isUnknown": "(("col" IS UNKNOWN))",
      }
    `);
  });

  it('comparisons: a value, a fragment, a Parameter or parent()', () => {
    expect({
      isDistinctFrom: show(dc.isDistinctFrom('a')), isNotDistinctFrom: show(dc.isNotDistinctFrom(null)),
      eq: show(dc.eq(1)), ne: show(dc.ne(sql`lower(${'x'})`)), gt: show(dc.gt(param(1, 'int8'))),
      gte: show(dc.gte(parent('y'))), lt: show(dc.lt(new Date(0))), lte: show(dc.lte(parent())),
      after: show(dc.after(dc.now)), before: show(dc.before(dc.fromNow(-2, 'days'))),
    }).toMatchInlineSnapshot(`
      {
        "after": "(("col" > now()))",
        "before": "(("col" < now() + $1)) -- ["-2 days"]",
        "eq": "(("col" = $1)) -- [1]",
        "gt": "(("col" > CAST($1 AS "int8"))) -- [1]",
        "gte": "(("col" >= "p"."y"))",
        "isDistinctFrom": "(("col" IS DISTINCT FROM $1)) -- ["a"]",
        "isNotDistinctFrom": "(("col" IS NOT DISTINCT FROM $1)) -- [null]",
        "lt": "(("col" < $1)) -- ["1970-01-01T00:00:00.000Z"]",
        "lte": "(("col" <= "p"."col"))",
        "ne": "(("col" <> lower("x")))",
      }
    `);
  });

  it('BETWEEN, [NOT] BETWEEN [SYMMETRIC]', () => {
    expect({
      between: show(dc.between(1, 2)), betweenSymmetric: show(dc.betweenSymmetric(2, 1)),
      notBetween: show(dc.notBetween(1, 2)), notBetweenSymmetric: show(dc.notBetweenSymmetric(2, 1)),
    }).toMatchInlineSnapshot(`
      {
        "between": "(("col" BETWEEN ($1) AND ($2))) -- [1,2]",
        "betweenSymmetric": "(("col" BETWEEN SYMMETRIC ($1) AND ($2))) -- [2,1]",
        "notBetween": "(("col" NOT BETWEEN ($1) AND ($2))) -- [1,2]",
        "notBetweenSymmetric": "(("col" NOT BETWEEN SYMMETRIC ($1) AND ($2))) -- [2,1]",
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
        "ilike": "(("col" ILIKE $1)) -- ["a%"]",
        "like": "(("col" LIKE $1)) -- ["A%"]",
        "notIlike": "(("col" NOT ILIKE $1)) -- ["a%"]",
        "notLike": "(("col" NOT LIKE $1)) -- ["A%"]",
        "notReImatch": "(("col" !~* $1)) -- ["^a"]",
        "notReMatch": "(("col" !~ $1)) -- ["^A"]",
        "notSimilarTo": "(("col" NOT SIMILAR TO $1)) -- ["(A|B)%"]",
        "reImatch": "(("col" ~* $1)) -- ["^a"]",
        "reMatch": "(("col" ~ $1)) -- ["^A"]",
        "similarTo": "(("col" SIMILAR TO $1)) -- ["(A|B)%"]",
      }
    `);
  });

  it('isIn / isNotIn, empty lists included', () => {
    expect({
      isIn: show(dc.isIn([1, 2, sql`3`])), isInEmpty: show(dc.isIn([])),
      isNotIn: show(dc.isNotIn(['a'])), isNotInEmpty: show(dc.isNotIn([])),
    }).toMatchInlineSnapshot(`
      {
        "isIn": "(("col" IN ($1, $2, 3))) -- [1,2]",
        "isInEmpty": "((false))",
        "isNotIn": "(("col" NOT IN ($1))) -- ["a"]",
        "isNotInEmpty": "((true))",
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
        "and": "((("col" > $1 AND ("other" = $2)))) -- [1,2]",
        "not": "(((NOT "col" = $1))) -- [1]",
        "notWhereable": "(((NOT ("more" = $1 AND "other" = $2)))) -- [3,2]",
        "or": "((("col" = $1 OR "col" IS NULL))) -- [1]",
      }
    `);
  });

  it('characterization: and() / or() without argument compile to ()', () => {
    // characterization: `()` is invalid SQL (see the integration test); `TRUE` / `FALSE` would be valid
    expect({ and: show(dc.and()), or: show(dc.or()), topLevelAnd: dc.and().compile().text }).toMatchInlineSnapshot(`
      {
        "and": "((()))",
        "or": "((()))",
        "topLevelAnd": "()",
      }
    `);
  });

  it('array operators: the array is one parameter', () => {
    expect({
      arrayContains: show(dc.arrayContains([1, 2])), arrayContainedIn: show(dc.arrayContainedIn(['a'])),
      arrayOverlaps: show(dc.arrayOverlaps([])), arrayOverlapsParent: show(dc.arrayOverlaps(parent('tags'))),
    }).toMatchInlineSnapshot(`
      {
        "arrayContainedIn": "(("col" <@ $1)) -- [["a"]]",
        "arrayContains": "(("col" @> $1)) -- [[1,2]]",
        "arrayOverlaps": "(("col" && $1)) -- [[]]",
        "arrayOverlapsParent": "(("col" && "p"."tags"))",
      }
    `);
  });

  it('fromNow, now, add, subtract', () => {
    expect({
      fromNow: dc.fromNow(3).compile(), fromNowUnit: dc.fromNow(-1.5, 'hours').compile(), now: dc.now.compile(),
      add: show(dc.add(5)), subtract: show(dc.subtract(new Date(0))),
    }).toMatchInlineSnapshot(`
      {
        "add": "(("col" + $1)) -- [5]",
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
        "subtract": "(("col" - $1)) -- ["1970-01-01T00:00:00.000Z"]",
      }
    `);
  });
});

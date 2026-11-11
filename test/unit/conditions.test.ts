// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts, compilation only (no database):
// each export compiled as the value of a Whereable key, so that `self` is bound.
// Execution on the fixture: test/integration/conditions.test.ts.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, conditions as dc } from '../../src/db';

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
          "text": "((("col" > $1 AND ("other" = $2))))",
          "values": [
            1,
            2,
          ],
        },
        "not": {
          "text": "(((NOT "col" = $1)))",
          "values": [
            1,
          ],
        },
        "notWhereable": {
          "text": "(((NOT ("more" = $1 AND "other" = $2))))",
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

  it('characterization: and() / or() without argument compile to ()', () => {
    // characterization: `()` is invalid SQL (see the integration test); `TRUE` / `FALSE` would be valid
    expect({ and: show(dc.and()), or: show(dc.or()), topLevelAnd: dc.and().compile() }).toMatchInlineSnapshot(`
      {
        "and": {
          "text": "((()))",
          "values": [],
        },
        "or": {
          "text": "((()))",
          "values": [],
        },
        "topLevelAnd": {
          "text": "()",
          "values": [],
        },
      }
    `);
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
});

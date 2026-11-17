// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts, compilation only (no database):
// each export compiled as the value of a Whereable key, so that `self` is bound.
// Execution on the fixture: test/integration/conditions.test.ts.

import { describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, raw, cols, vals, self, Default, conditions as dc } from '../../src/db';
import { resetConfig } from '../helpers/config';

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
        "eqAny",
        "exists",
        "fromNow",
        "gt",
        "gte",
        "ilike",
        "isDistinctFrom",
        "isFalse",
        "isIn",
        "isInSelect",
        "isNotDistinctFrom",
        "isNotFalse",
        "isNotIn",
        "isNotNull",
        "isNotTrue",
        "isNotUnknown",
        "isNull",
        "isTrue",
        "isUnknown",
        "jsonbContains",
        "jsonbPathExists",
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
        "websearchToTsquery",
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

  it('isDistinctFrom() and isNotDistinctFrom() of a nullable value: one parameter, whatever it holds (#181)', () => {
    const none = null as number | null, one = 1 as number | null;
    expect({
      isDistinctFromNone: show(dc.isDistinctFrom(none)), isNotDistinctFromNone: show(dc.isNotDistinctFrom(none)),
      isNotDistinctFromOne: show(dc.isNotDistinctFrom(one)),
    }).toEqual({
      isDistinctFromNone: { text: '(("col" IS DISTINCT FROM $1))', values: [null] },
      isNotDistinctFromNone: { text: '(("col" IS NOT DISTINCT FROM $1))', values: [null] },
      isNotDistinctFromOne: { text: '(("col" IS NOT DISTINCT FROM $1))', values: [1] },
    });
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

  it('eqAny: the array is one parameter, the same text for any length, the empty array included', () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => i);
    expect({
      eqAny: show(dc.eqAny([1, 2, 3])), eqAnyEmpty: show(dc.eqAny([])), eqAnyParent: show(dc.eqAny(parent('scores'))),
      eqAnyParentSelf: show(dc.eqAny(parent())), eqAnyItems: show(dc.eqAny(['a', null, new Date(0), { a: 1 }, BigInt(2)])),
    }).toMatchInlineSnapshot(`
      {
        "eqAny": {
          "text": "(("col" = ANY($1)))",
          "values": [
            [
              1,
              2,
              3,
            ],
          ],
        },
        "eqAnyEmpty": {
          "text": "(("col" = ANY($1)))",
          "values": [
            [],
          ],
        },
        "eqAnyItems": {
          "text": "(("col" = ANY($1)))",
          "values": [
            [
              "a",
              null,
              1970-01-01T00:00:00.000Z,
              {
                "a": 1,
              },
              2n,
            ],
          ],
        },
        "eqAnyParent": {
          "text": "(("col" = ANY("p"."scores")))",
          "values": [],
        },
        "eqAnyParentSelf": {
          "text": "(("col" = ANY("p"."col")))",
          "values": [],
        },
      }
    `);
    const many = show(dc.eqAny(thousand));
    expect(many.text).toBe(show(dc.eqAny([1])).text);
    expect(many.values).toEqual([thousand]);
  });

  it('eqAny sends its array as an array under castArrayParamsToJson, where a fragment with param() sends JSON', () => {
    db.setConfig({ castArrayParamsToJson: true });
    try {
      expect({
        eqAny: show(dc.eqAny([1, 2])), fragment: show(sql`${self} = ANY(${param([1, 2])})`),
      }).toMatchInlineSnapshot(`
        {
          "eqAny": {
            "text": "(("col" = ANY($1)))",
            "values": [
              [
                1,
                2,
              ],
            ],
          },
          "fragment": {
            "text": "(("col" = ANY(CAST($1 AS "json"))))",
            "values": [
              "[1,2]",
            ],
          },
        }
      `);
    } finally { resetConfig(); }
  });

  it('a copy of eqAny compiles the same, and still refuses what eqAny refuses', () => {
    const condition = dc.eqAny([1, 2]);
    expect(sql`${{ col: condition.copy() }}`.compile()).toEqual(sql`${{ col: condition }}`.compile());
    expect(() => show(dc.eqAny(['Bob', param('Ada')]).copy())).toThrow('so each item is a plain value, not `db.param()`');
    expect(() => show(dc.eqAny(new Set([1]) as any).copy())).toThrow('takes an array, not `Set`');
  });

  it('websearchToTsquery: the configuration and the query are two parameters, the configuration cast to regconfig', () => {
    expect({
      words: show(dc.websearchToTsquery('english', 'salt orchard')),
      operators: show(dc.websearchToTsquery('simple', `"salt orchard" or -lantern & edi:* 'x'`)),
      empty: show(dc.websearchToTsquery('', '')),
    }).toMatchInlineSnapshot(`
      {
        "empty": {
          "text": "(("col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
          "values": [
            "",
            "",
          ],
        },
        "operators": {
          "text": "(("col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
          "values": [
            "simple",
            ""salt orchard" or -lantern & edi:* 'x'",
          ],
        },
        "words": {
          "text": "(("col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
          "values": [
            "english",
            "salt orchard",
          ],
        },
      }
    `);
  });

  it('jsonbContains: the value is one jsonb parameter, as JSON text, whatever its kind', () => {
    // pg alone would send a string as text and an array as '{1,2}', which the cast to jsonb refuses (22P02)
    expect({
      object: show(dc.jsonbContains({ theme: 'dark', tags: ['a'] })), string: show(dc.jsonbContains('dark')),
      number: show(dc.jsonbContains(1.5)), array: show(dc.jsonbContains([1, 'a', null])), null: show(dc.jsonbContains(null)),
      boolean: show(dc.jsonbContains(false)), empty: show(dc.jsonbContains({})),
    }).toMatchInlineSnapshot(`
      {
        "array": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "[1,"a",null]",
          ],
        },
        "boolean": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "false",
          ],
        },
        "empty": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "{}",
          ],
        },
        "null": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "null",
          ],
        },
        "number": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "1.5",
          ],
        },
        "object": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            "{"theme":"dark","tags":["a"]}",
          ],
        },
        "string": {
          "text": "(("col" @> CAST($1 AS "jsonb")))",
          "values": [
            ""dark"",
          ],
        },
      }
    `);
  });

  it('websearchToTsquery: one SQL wherever it sits, in a select(), count(), deletes(), and(), not() and a sql template', () => {
    const search = dc.websearchToTsquery('simple', 'shirt');
    expect({
      select: db.select('products', { search }, { columns: ['id'] }).compile(),
      count: db.count('products', { search }).compile(),
      deletes: db.deletes('products', { search }).compile(),
      and: sql`${{ search: dc.and(search, dc.isNotNull) }}`.compile(),
      not: sql`${{ search: dc.not(search) }}`.compile(),
      template: sql<db.SQL>`SELECT 1 WHERE ${{ search }}`.compile(),
    }).toMatchInlineSnapshot(`
      {
        "and": {
          "text": "(((("search" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)) AND ("search" IS NOT NULL))))",
          "values": [
            "simple",
            "shirt",
          ],
        },
        "count": {
          "text": "SELECT count(*) AS result FROM "products" WHERE (("search" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
          "values": [
            "simple",
            "shirt",
          ],
        },
        "deletes": {
          "text": "DELETE FROM "products" WHERE (("search" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2))) RETURNING to_jsonb("products".*) AS result",
          "values": [
            "simple",
            "shirt",
          ],
        },
        "not": {
          "text": "(((NOT ("search" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))))",
          "values": [
            "simple",
            "shirt",
          ],
        },
        "select": {
          "text": "SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "id") AS result FROM "products" WHERE (("search" @@ websearch_to_tsquery(CAST($2 AS "regconfig"), $3)))) AS "sq_products"",
          "values": [
            "id",
            "simple",
            "shirt",
          ],
        },
        "template": {
          "text": "SELECT 1 WHERE (("search" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
          "values": [
            "simple",
            "shirt",
          ],
        },
      }
    `);
  });

  it('jsonbContains writes the same under castObjectParamsToJson and castArrayParamsToJson, where a bare param() changes', () => {
    const value = { theme: 'dark' }, list = ['dark'];
    const bare = () => ({ object: show(sql`${self} @> ${param(value, 'jsonb')}`), array: show(sql`${self} @> ${param(list, 'jsonb')}`) });
    const before = { object: show(dc.jsonbContains(value)), array: show(dc.jsonbContains(list)) }, bareBefore = bare();
    for (const config of [{ castObjectParamsToJson: true }, { castArrayParamsToJson: true }]) {
      db.setConfig(config);
      try {
        expect({ object: show(dc.jsonbContains(value)), array: show(dc.jsonbContains(list)) }).toEqual(before);
      } finally { resetConfig(); }
    }
    db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true });
    try {
      expect({ before: bareBefore, after: bare() }).toMatchInlineSnapshot(`
        {
          "after": {
            "array": {
              "text": "(("col" @> CAST($1 AS "jsonb")))",
              "values": [
                "["dark"]",
              ],
            },
            "object": {
              "text": "(("col" @> CAST($1 AS "jsonb")))",
              "values": [
                "{"theme":"dark"}",
              ],
            },
          },
          "before": {
            "array": {
              "text": "(("col" @> CAST($1 AS "jsonb")))",
              "values": [
                [
                  "dark",
                ],
              ],
            },
            "object": {
              "text": "(("col" @> CAST($1 AS "jsonb")))",
              "values": [
                {
                  "theme": "dark",
                },
              ],
            },
          },
        }
      `);
    } finally { resetConfig(); }
  });

  it('jsonbContains reads its value once, at the call', () => {
    const value: { theme: string; size?: number } = { theme: 'dark' }, condition = dc.jsonbContains(value);
    value.size = 2;
    expect(show(condition).values).toEqual(['{"theme":"dark"}']);
  });

  it('a copy of jsonbContains compiles the same, and still refuses what jsonbContains refuses', () => {
    const condition = dc.jsonbContains({ theme: 'dark' });
    expect(sql`${{ col: condition.copy() }}`.compile()).toEqual(sql`${{ col: condition }}`.compile());
    expect(() => show(dc.jsonbContains(param({ theme: 'dark' }) as any).copy())).toThrow('so it takes a JSON value, not `db.param()`');
  });

  it('jsonbPathExists: the path is one jsonpath parameter, the variables one jsonb parameter, as JSON text', () => {
    expect({
      vars: show(dc.jsonbPathExists('$.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' })),
      none: show(dc.jsonbPathExists('$.format')),
      undefined: show(dc.jsonbPathExists('$.format', undefined)),
      nested: show(dc.jsonbPathExists('$ ? (@.year < $range.to && @.tags == $tags)', { range: { to: 2000 }, tags: ['a', null], n: 1.5, b: false, z: null })),
    }).toMatchInlineSnapshot(`
      {
        "nested": {
          "text": "((jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))))",
          "values": [
            "$ ? (@.year < $range.to && @.tags == $tags)",
            "{"range":{"to":2000},"tags":["a",null],"n":1.5,"b":false,"z":null}",
          ],
        },
        "none": {
          "text": "((jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))))",
          "values": [
            "$.format",
            "{}",
          ],
        },
        "undefined": {
          "text": "((jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))))",
          "values": [
            "$.format",
            "{}",
          ],
        },
        "vars": {
          "text": "((jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))))",
          "values": [
            "$.prizes[*] ? (@ == $prize)",
            "{"prize":"Golden Gull"}",
          ],
        },
      }
    `);
  });

  it('jsonbPathExists writes the same under castObjectParamsToJson and castArrayParamsToJson', () => {
    const condition = () => show(dc.jsonbPathExists('$.tags ? (@ == $tags)', { tags: ['a'] }));
    const before = condition();
    for (const config of [{ castObjectParamsToJson: true }, { castArrayParamsToJson: true }]) {
      db.setConfig(config);
      try { expect(condition()).toEqual(before); } finally { resetConfig(); }
    }
  });

  it('jsonbPathExists reads its variables once, at the call, and a copy compiles the same', () => {
    const vars: Record<string, string> = { format: '35mm' }, condition = dc.jsonbPathExists('$.format ? (@ == $format)', vars);
    vars.format = 'VHS';
    expect(show(condition).values).toEqual(['$.format ? (@ == $format)', '{"format":"35mm"}']);
    expect(sql`${{ col: condition.copy() }}`.compile()).toEqual(sql`${{ col: condition }}`.compile());
    expect(() => show(dc.jsonbPathExists(param('$') as any).copy())).toThrow('takes its path as a string, not `db.param()`');
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
  // these take a table and a Whereable, not a value: below, exists() and isInSelect()
  const subqueries = ['exists', 'isInSelect'];

  /** What compiling `{ col: condition }` throws, or 'compiled'; building the condition must not throw. */
  const thrown = (condition: db.SQL) => {
    try { show(condition); return 'compiled'; } catch (err) { return (err as Error).message; }
  };
  const messages = (value: unknown) => {
    const conditions = [...Object.values(one).map(f => f(value)), ...Object.values(two).flatMap(f => [f(value, 1), f(1, value)])];
    return new Set(conditions.map(thrown));
  };

  it('covers every condition of db.conditions', () => {
    expect([...Object.keys(one), ...Object.keys(two), ...Object.keys(lists), 'eqAny', 'jsonbContains', 'jsonbPathExists', 'websearchToTsquery', ...noValue, ...subqueries].sort())
      .toEqual(Object.keys(dc).sort());
  });

  it('eqAny given an item one array parameter cannot hold throws when compiled, not when called, saying what to do', () => {
    // pg sends a Parameter or a fragment as JSON, and reads an array item as more items: no row, with no error
    const items = { Default, self, raw: raw("'Ada'"), cols: cols('Ada'), vals: vals('Ada'), param: param('Ada'),
      fragment: sql`'Ada'`, parent: parent('id'), array: ['Ada'], nested: [[1, 2]] };
    expect(Object.fromEntries(Object.entries(items).map(([name, item]) => [name, thrown(dc.eqAny(['Bob', item]))])))
      .toMatchInlineSnapshot(`
        {
          "Default": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.Default\`: give a value.",
          "array": "\`eqAny()\` sends its array as one parameter, which reads an array item as more items: on an array column, use \`isIn()\`; on a \`jsonb\` column, give the item as JSON text, \`JSON.stringify(item)\`.",
          "cols": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.cols()\`: give a value.",
          "fragment": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not a \`sql\` fragment: give the value itself, or use \`isIn()\`, which takes it.",
          "nested": "\`eqAny()\` sends its array as one parameter, which reads an array item as more items: on an array column, use \`isIn()\`; on a \`jsonb\` column, give the item as JSON text, \`JSON.stringify(item)\`.",
          "param": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.param()\`: give the value itself, or use \`isIn()\`, which takes it.",
          "parent": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.parent()\`: give the value itself, or use \`isIn()\`, which takes it.",
          "raw": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.raw()\`: give a value.",
          "self": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.self\`: give a value.",
          "vals": "\`eqAny()\` sends its array as one parameter, so each item is a plain value, not \`db.vals()\`: give a value.",
        }
      `);
  });

  it('websearchToTsquery given anything but a value as the configuration or the query throws when compiled, not when called', () => {
    // a plain value goes as a parameter; pg would send a Parameter or a fragment as JSON, and Default or self as their names
    const values = { Default, self, raw: raw("'english'"), cols: cols('english'), vals: vals('english'), param: param('english'),
      fragment: sql`'english'`, parent: parent('title') };
    expect(Object.fromEntries(Object.entries(values).flatMap(([name, x]) => [
      [`${name} config`, thrown(dc.websearchToTsquery(x as any, 'salt'))], [`${name} query`, thrown(dc.websearchToTsquery('english', x as any))],
    ]))).toMatchInlineSnapshot(`
      {
        "Default config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.Default\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "Default query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.Default\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "cols config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.cols()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "cols query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.cols()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "fragment config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not a \`sql\` fragment; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "fragment query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not a \`sql\` fragment; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "param config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.param()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "param query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.param()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "parent config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.parent()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "parent query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.parent()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "raw config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.raw()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "raw query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.raw()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "self config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.self\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "self query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.self\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "vals config": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the configuration as a string, not \`db.vals()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "vals query": "\`websearchToTsquery()\` sends its configuration and its query as parameters: give the query as a string, not \`db.vals()\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
      }
    `);
    expect({ number: show(dc.websearchToTsquery('english', 42 as any)), null: show(dc.websearchToTsquery('english', null as any)) })
      .toMatchInlineSnapshot(`
        {
          "null": {
            "text": "(("col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
            "values": [
              "english",
              null,
            ],
          },
          "number": {
            "text": "(("col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)))",
            "values": [
              "english",
              42,
            ],
          },
        }
      `);
  });

  it('eqAny given a list that is not an array throws when compiled, saying what to do', () => {
    const lists = { Set: new Set([1]), string: '5', number: 5, null: null, undefined, Default, self,
      param: param([1]), fragment: sql`ARRAY[1]`, raw: raw("'{1}'"), cols: cols(['id']), vals: vals([1]) };
    expect(Object.fromEntries(Object.entries(lists).map(([name, x]) => [name, thrown(dc.eqAny(x as any))]))).toMatchInlineSnapshot(`
      {
        "Default": "\`eqAny()\` takes an array of values, not \`db.Default\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "Set": "\`eqAny()\` takes an array, not \`Set\`: make one with \`eqAny([...values])\`, or \`Array.from(values)\` for an array-like object.",
        "cols": "\`eqAny()\` takes an array of values, not \`db.cols()\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "fragment": "\`eqAny()\` takes an array of values, not a \`sql\` fragment: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "null": "\`eqAny()\` takes an array, not \`null\`: for one value, write \`eqAny([value])\`.",
        "number": "\`eqAny()\` takes an array, not \`number\`: for one value, write \`eqAny([value])\`.",
        "param": "\`eqAny()\` takes an array of values, not \`db.param()\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "raw": "\`eqAny()\` takes an array of values, not \`db.raw()\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "self": "\`eqAny()\` takes an array of values, not \`db.self\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        "string": "\`eqAny()\` takes an array, not \`string\`: for one value, write \`eqAny([value])\`.",
        "undefined": "\`eqAny()\` takes an array, not \`undefined\`: for one value, write \`eqAny([value])\`.",
        "vals": "\`eqAny()\` takes an array of values, not \`db.vals()\`: write \`eqAny(values)\`; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
      }
    `);
  });

  it('jsonbContains given a wrapper throws when compiled, not when called, saying what to do', () => {
    // JSON.stringify would send their fields, '{"value":…}', and match no row, with no error
    const values = { Default, self, raw: raw("'{}'"), cols: cols(['a']), vals: vals(['a']), param: param({ a: 1 }),
      fragment: sql`'{}'::jsonb`, parent: parent('settings') };
    expect(Object.fromEntries(Object.entries(values).map(([name, x]) => [name, thrown(dc.jsonbContains(x as any))])))
      .toMatchInlineSnapshot(`
        {
          "Default": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.Default\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "cols": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.cols()\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "fragment": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not a \`sql\` fragment: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "param": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.param()\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "parent": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.parent()\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "raw": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.raw()\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "self": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.self\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
          "vals": "\`jsonbContains()\` sends its value as JSON text, so it takes a JSON value, not \`db.vals()\`: give a value; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.",
        }
      `);
  });

  it('jsonbContains given what JSON lacks, at any depth, throws when compiled, not when called, naming its key', () => {
    // JSON.stringify leaves out a key holding undefined, a function or a symbol, so that { format: undefined } was {},
    // every row; it writes them as null in an array, and a wrapper as its fields
    const head = '`jsonbContains()` sends its value as JSON text, so it takes a JSON value, not',
      dropped = '`JSON.stringify` would leave the key out, and the value match more rows. Give a JSON value, or leave the key out.',
      nulled = '`JSON.stringify` would write `null` in its place. Give a JSON value.';
    const values = {
      key: { format: undefined }, nested: { a: [{ b: undefined }] }, item: [1, undefined], top: undefined,
      fn: { f: () => 1 }, symbol: [Symbol('x')], Default: { d: Default }, self: [self],
      param: { p: param(1) }, fragment: [sql`1`], parent: { p: parent('settings') },
    };
    expect(Object.fromEntries(Object.entries(values).map(([name, x]) => [name, thrown(dc.jsonbContains(x as any))]))).toEqual({
      key: `${head} \`undefined\` at key \`format\`: ${dropped}`,
      nested: `${head} \`undefined\` at key \`b\`: ${dropped}`,
      item: `${head} \`undefined\` at item 1: ${nulled}`,
      top: `${head} \`undefined\`: \`JSON.stringify\` would write nothing. Give a JSON value.`,
      fn: `${head} a function at key \`f\`: ${dropped}`,
      symbol: `${head} a symbol at item 0: ${nulled}`,
      Default: `${head} \`db.Default\` at key \`d\`: ${dropped}`,
      self: `${head} \`db.self\` at item 0: ${nulled}`,
      param: `${head} \`db.param()\` at key \`p\`: \`JSON.stringify\` would write its fields. Give a JSON value, or leave the key out.`,
      fragment: `${head} a \`sql\` fragment at item 0: \`JSON.stringify\` would write its fields. Give a JSON value.`,
      parent: `${head} \`db.parent()\` at key \`p\`: \`JSON.stringify\` would write its fields. Give a JSON value, or leave the key out.`,
    });
  });

  it('jsonbContains given what JSON.stringify throws on throws when compiled, not when called', () => {
    // as the other refusals, so that run() rejects before any query, rather than select() throwing as it builds the query
    const circular: Record<string, unknown> = {};
    circular.me = circular;
    const head = '`jsonbContains()` sends its value as JSON text, so it takes a JSON value';
    const built = {
      bigint: () => dc.jsonbContains(BigInt(1) as any), nested: () => dc.jsonbContains({ n: [BigInt(1)] } as any),
      circular: () => dc.jsonbContains(circular as any), toJSON: () => dc.jsonbContains({ toJSON() { throw new Error('no film'); } } as any),
    };
    const conditions = Object.fromEntries(Object.entries(built).map(([name, build]) => [name, build()]));
    expect(Object.fromEntries(Object.entries(conditions).map(([name, condition]) => [name, thrown(condition).split('\n')[0]]))).toEqual({
      bigint: `${head}, not a \`bigint\`: \`JSON.stringify\` would throw. Give it as a number or a string.`,
      nested: `${head}, not a \`bigint\` at item 0: \`JSON.stringify\` would throw. Give it as a number or a string.`,
      circular: `${head}: \`JSON.stringify\` threw "Converting circular structure to JSON`,
      toJSON: `${head}: \`JSON.stringify\` threw "no film". Give a JSON value.`,
    });
  });

  it('jsonbContains reads its value once, as it is called', () => {
    let reads = 0;
    const condition = dc.jsonbContains({ get format() { reads++; return '35mm'; } });
    show(condition); show(condition.copy());
    expect({ reads, values: show(condition).values }).toEqual({ reads: 1, values: ['{"format":"35mm"}'] });
  });

  it('jsonbContains given null, a key holding null and an empty key still sends them', () => {
    expect([null, { format: null }, { '': 1 }, [null]].map(x => show(dc.jsonbContains(x)).values))
      .toEqual([['null'], ['{"format":null}'], ['{"":1}'], ['[null]']]);
  });

  it('jsonbPathExists given a path that is no string throws when compiled, not when called, saying what to do', () => {
    // pg would send a wrapper as JSON, a number as its text, which Postgres reads as a path, and Default as 'Symbol(DEFAULT)'
    const paths = {
      number: 1, null: null, object: { a: 1 }, array: ['$'], undefined, function: () => '$', symbol: Symbol('$'),
      Default, self, raw: raw("'$'"), param: param('$'), fragment: sql`'$'`, parent: parent('path'),
    };
    expect(Object.fromEntries(Object.entries(paths).map(([name, x]) => [name, thrown(dc.jsonbPathExists(x as any))]))).toMatchInlineSnapshot(`
      {
        "Default": "\`jsonbPathExists()\` takes its path as a string, not \`db.Default\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "array": "\`jsonbPathExists()\` takes its path as a string, not an array: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "fragment": "\`jsonbPathExists()\` takes its path as a string, not a \`sql\` fragment: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "function": "\`jsonbPathExists()\` takes its path as a string, not a function: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "null": "\`jsonbPathExists()\` takes its path as a string, not \`null\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "number": "\`jsonbPathExists()\` takes its path as a string, not a \`number\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "object": "\`jsonbPathExists()\` takes its path as a string, not an object: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "param": "\`jsonbPathExists()\` takes its path as a string, not \`db.param()\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "parent": "\`jsonbPathExists()\` takes its path as a string, not \`db.parent()\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "raw": "\`jsonbPathExists()\` takes its path as a string, not \`db.raw()\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "self": "\`jsonbPathExists()\` takes its path as a string, not \`db.self\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "symbol": "\`jsonbPathExists()\` takes its path as a string, not a symbol: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
        "undefined": "\`jsonbPathExists()\` takes its path as a string, not \`undefined\`: write the path as a string, and each value it compares with as a variable, \`jsonbPathExists(path, { name: value })\`.",
      }
    `);
  });

  it('jsonbPathExists given variables JSON lacks, at any depth, or a wrapper, throws when compiled, not when called, naming its key', () => {
    // JSON.stringify would leave out { prize: undefined }, and Postgres raise 42704, could not find jsonpath variable;
    // vars as a whole is an object, so the advice for it never names a JSON value, which Postgres refuses (22023)
    const head = '`jsonbPathExists()` sends its variables as JSON text, so it takes an object of JSON values, not',
      dropped = '`JSON.stringify` would leave the key out. Give a JSON value.',
      whole = 'Give an object of JSON values.';
    const circular: Record<string, unknown> = {};
    circular.me = circular;
    const vars = {
      key: { prize: undefined }, nested: { a: [{ b: () => 1 }] }, bigint: { n: BigInt(1) }, param: param({ a: 1 }),
      inner: { p: param(1) }, Default: { d: Default }, circular, function: () => 1, symbol: Symbol('vars'), bigintWhole: BigInt(1),
    };
    expect(Object.fromEntries(Object.entries(vars).map(([name, x]) => [name, thrown(dc.jsonbPathExists('$', x as any)).split('\n')[0]]))).toEqual({
      key: `${head} \`undefined\` at key \`prize\`: ${dropped}`,
      nested: `${head} a function at key \`b\`: ${dropped}`,
      bigint: `${head} a \`bigint\` at key \`n\`: \`JSON.stringify\` would throw. Give it as a number or a string.`,
      param: `${head} \`db.param()\`: give an object; for SQL, write a \`sql\` fragment with \`db.self\` in place of the condition.`,
      inner: `${head} \`db.param()\` at key \`p\`: \`JSON.stringify\` would write its fields. Give a JSON value.`,
      Default: `${head} \`db.Default\` at key \`d\`: ${dropped}`,
      circular: '`jsonbPathExists()` sends its variables as JSON text, so it takes an object of JSON values: `JSON.stringify` threw "Converting circular structure to JSON',
      function: `${head} a function: \`JSON.stringify\` would write nothing. ${whole}`,
      symbol: `${head} a symbol: \`JSON.stringify\` would write nothing. ${whole}`,
      bigintWhole: `${head} a \`bigint\`: \`JSON.stringify\` would throw. ${whole}`,
    });
    expect(thrown(dc.jsonbPathExists('$', circular as any))).toMatch(/\. Give an object of JSON values\.$/);
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

  it('isIn and isNotIn given a list that is not an array throw when compiled, not when called, saying what to do', () => {
    // 6.6.1 compiled a Set to `false` and `true`, every row for isNotIn (#235); each kind: test/unit/injection.test.ts
    expect(Object.fromEntries(Object.entries(lists).map(([name, f]) => [name, thrown(f(new Set([1, 2]) as any))])))
      .toMatchInlineSnapshot(`
        {
          "isIn": "\`isIn()\` takes an array, not \`Set\`: make one with \`isIn([...values])\`, or \`Array.from(values)\` for an array-like object.",
          "isNotIn": "\`isNotIn()\` takes an array, not \`Set\`: make one with \`isNotIn([...values])\`, or \`Array.from(values)\` for an array-like object.",
        }
      `);
  });

  it('isIn and isNotIn given one value in place of the list say to wrap it, not to spread it', () => {
    // spread, a string gives its characters (`[...'Ada']`, the defect of #235) and null throws
    expect(Object.fromEntries(Object.entries(lists).flatMap(([name, f]) =>
      (['5', 5, null, undefined] as unknown[]).map(x => [`${name}(${typeof x === 'string' ? `'${x}'` : x})`, thrown(f(x as any))]))))
      .toMatchInlineSnapshot(`
        {
          "isIn('5')": "\`isIn()\` takes an array, not \`string\`: for one value, write \`isIn([value])\`.",
          "isIn(5)": "\`isIn()\` takes an array, not \`number\`: for one value, write \`isIn([value])\`.",
          "isIn(null)": "\`isIn()\` takes an array, not \`null\`: for one value, write \`isIn([value])\`.",
          "isIn(undefined)": "\`isIn()\` takes an array, not \`undefined\`: for one value, write \`isIn([value])\`.",
          "isNotIn('5')": "\`isNotIn()\` takes an array, not \`string\`: for one value, write \`isNotIn([value])\`.",
          "isNotIn(5)": "\`isNotIn()\` takes an array, not \`number\`: for one value, write \`isNotIn([value])\`.",
          "isNotIn(null)": "\`isNotIn()\` takes an array, not \`null\`: for one value, write \`isNotIn([value])\`.",
          "isNotIn(undefined)": "\`isNotIn()\` takes an array, not \`undefined\`: for one value, write \`isNotIn([value])\`.",
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

describe('exists() and isInSelect()', () => {
  // the expected SQL is note 006 § Replays (docs/decisions/006-subquery-conditions.md): the `WHERE` of a
  // select() of users, columns ['display_name'], so that the condition's values start at $2
  const { exists, isInSelect } = dc;
  const where = (condition: db.SQL) => {
    const { text, values } = db.select('users', condition as any, { columns: ['display_name'] }).compile();
    return { where: /^SELECT coalesce\(jsonb_agg\(result\), '\[\]'\) AS result FROM \(SELECT jsonb_build_object\(\$1::text, "display_name"\) AS result FROM "users" WHERE (.*)\) AS "sq_users"$/.exec(text)?.[1] ?? text, values };
  };
  const thrown = (build: () => db.SQL) => {
    try { where(build()); return 'compiled'; } catch (err) { return (err as Error).message; }
  };
  const ownName = (fn: string, parent: string, name: string) =>
    `\`${fn}()\` was given \`parent: '${parent}'\`, which names "${name}", the subquery's own name, so Postgres would read \`parent()\` as a column of the subquery's row: give the subquery another name with the \`alias\` option.`;

  it('exists() with parent: the outer row\'s column, qualified by parent', () => {
    expect(where(exists('extra.articles', { author_id: parent('id'), body: dc.like('Notes%') }, { parent: 'users' }))).toEqual({
      where: 'EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id" AND ("body" LIKE $2)))',
      values: ['display_name', 'Notes%'],
    });
    expect(where(exists('extra.articles', { author_id: parent('id') }, { parent: 'users' }))).toEqual({
      where: 'EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))',
      values: ['display_name'],
    });
  });

  it('isInSelect(): the key\'s column IN the subquery\'s column', () => {
    expect(where({ id: isInSelect('extra.articles', { body: dc.like('Notes%') }, 'author_id') })).toEqual({
      where: '(("id" IN (SELECT "author_id" FROM "extra"."articles" WHERE (("body" LIKE $2)))))',
      values: ['display_name', 'Notes%'],
    });
  });

  it('all gives no WHERE, {} gives WHERE TRUE, as in select()', () => {
    expect(where({ id: isInSelect('extra.articles', db.all, 'author_id') }).where).toBe('(("id" IN (SELECT "author_id" FROM "extra"."articles")))');
    expect(where({ id: isInSelect('extra.articles', {}, 'author_id') }).where).toBe('(("id" IN (SELECT "author_id" FROM "extra"."articles" WHERE TRUE)))');
    expect(exists('users', db.all).compile()).toEqual({ text: 'EXISTS (SELECT 1 FROM "users")', values: [] });
    expect(exists('users', {}).compile().text).toBe('EXISTS (SELECT 1 FROM "users" WHERE TRUE)');
  });

  it('a sql fragment as the where, written as given', () => {
    expect(exists('extra.articles', sql`${'author_id'} = ${parent('id')} AND ${'reviewer_id'} IS NULL`, { parent: 'users' }).compile().text)
      .toBe('EXISTS (SELECT 1 FROM "extra"."articles" WHERE "author_id" = "users"."id" AND "reviewer_id" IS NULL)');
  });

  it('alias: AS <alias> after the table, and parent may then name the same table', () => {
    expect(where(exists('users', { manager_id: parent('id') }, { parent: 'users', alias: 'reports' })).where)
      .toBe('EXISTS (SELECT 1 FROM "users" AS "reports" WHERE ("manager_id" = "users"."id"))');
    expect(where({ id: isInSelect('users', { mood: 'sad' }, 'manager_id', { alias: 'reports' }) }).where)
      .toBe('(("id" IN (SELECT "manager_id" FROM "users" AS "reports" WHERE ("mood" = $2))))');
  });

  it('the anti-join: not(exists(…)), and not() of isInSelect() under a key', () => {
    expect(where(dc.not(exists('extra.articles', { reviewer_id: parent('id') }, { parent: 'users' }))).where)
      .toBe('(NOT (EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("reviewer_id" = "users"."id"))))');
    expect(where({ id: dc.not(isInSelect('extra.articles', db.all, 'reviewer_id')) }).where)
      .toBe('(((NOT ("id" IN (SELECT "reviewer_id" FROM "extra"."articles")))))');
  });

  it('exists() fits under any key, in and() and or(), and in a sql template, where its SQL is the same', () => {
    const e = exists('extra.articles', { author_id: parent('id') }, { parent: 'users' });
    const subquery = 'EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))';
    expect(where({ display_name: e }).where).toBe(`((${subquery}))`);
    expect(where(dc.and({ mood: 'happy' }, e))).toEqual({ where: `((("mood" = $2)) AND (${subquery}))`, values: ['display_name', 'happy'] });
    expect(where(dc.or({ id: isInSelect('extra.articles', db.all, 'author_id') }, e)).where)
      .toBe(`((("id" IN (SELECT "author_id" FROM "extra"."articles"))) OR ${subquery})`);
    expect(sql`SELECT 1 FROM ${'users'} WHERE ${e}`.compile().text).toBe(`SELECT 1 FROM "users" WHERE ${subquery}`);
  });

  it('a name that parent shares with the subquery\'s own is refused as the query compiles, not at the call', () => {
    // Postgres would read `"users"."id"` as the inner row's: no row, no error (note 006 § Replays)
    const refusals = {
      'users over users': () => exists('users', { manager_id: parent('id') }, { parent: 'users' }),
      'users over public.users': () => exists('public.users', { manager_id: parent('id') }, { parent: 'users' }),
      '"users" over users': () => exists('users', { manager_id: parent('id') }, { parent: '"users"' }),
      'public.users over extra.users': () => exists('extra.users' as any, { manager_id: parent('id') }, { parent: 'public.users' }),
      'users over extra.articles AS users': () => exists('extra.articles', { author_id: parent('id') }, { parent: 'users', alias: 'users' }),
      'isInSelect, users over users': () => isInSelect('users', { manager_id: parent('id') }, 'id', { parent: 'users' }),
    };
    for (const build of Object.values(refusals)) expect(build).not.toThrow();
    expect(Object.fromEntries(Object.entries(refusals).map(([name, build]) => [name, thrown(() => ({ id: build() }))]))).toEqual({
      'users over users': ownName('exists', 'users', 'users'),
      'users over public.users': ownName('exists', 'users', 'users'),
      '"users" over users': ownName('exists', '"users"', 'users'),
      'public.users over extra.users': ownName('exists', 'public.users', 'users'),
      'users over extra.articles AS users': ownName('exists', 'users', 'users'),
      'isInSelect, users over users': ownName('isInSelect', 'users', 'users'),
    });
  });

  it('names compare as Postgres reads them: a U& part decoded, case kept in quotes', () => {
    const refusal = (p: string, table = 'users', alias?: string) =>
      thrown(() => exists(table as any, { manager_id: parent('id') }, alias === undefined ? { parent: p } : { parent: p, alias }));
    expect({
      unicode: refusal('"public".U&"\\0075sers"'),
      unicodeLower: refusal('"public".u&"user\\+000073"'),
      unicodeBackslash: refusal('"s".U&"a\\\\b"', 'a\\b'),
      quotedCase: refusal('Users'),
      aliasQuotedCase: refusal('users', 'users', 'Users'),
      escapedQuote: refusal('a"b', 'a"b'),
      unicodePastMax: refusal('"s".U&"\\+110000"'),
    }).toEqual({
      unicode: ownName('exists', '"public".U&"\\0075sers"', 'users'),
      unicodeLower: ownName('exists', '"public".u&"user\\+000073"', 'users'),
      unicodeBackslash: ownName('exists', '"s".U&"a\\\\b"', 'a\\b'),
      // `"Users"` is another name than `"users"`: Postgres reads it as such
      quotedCase: 'compiled',
      aliasQuotedCase: 'compiled',
      escapedQuote: ownName('exists', 'a"b', 'a"b'),
      // past U+10FFFF, no character: the escape is kept as it is, and Postgres refuses the name, not the call
      unicodePastMax: 'compiled',
    });
  });

  it('names compare as Postgres truncates them: the first 63 bytes, cut at a character\'s end', () => {
    const r = (n: number) => 'r'.repeat(n);
    const refusal = (p: string, alias: string) => thrown(() => exists('users', { manager_id: parent('id') }, { parent: p, alias }));
    expect({
      past63: refusal(`${r(63)}a`, `${r(63)}b`),
      // é and è are 2 bytes each: 62 + 2 is past 63, so Postgres keeps the 62 r's of each, though each is 63 characters
      past63Bytes: refusal(`${r(62)}é`, `${r(62)}è`),
      unicodePast63: refusal(`"public".U&"${r(63)}\\0061"`, `${r(63)}b`),
      within63: refusal(`${r(62)}a`, `${r(62)}b`),
    }).toEqual({
      past63: ownName('exists', `${r(63)}a`, r(63)),
      past63Bytes: ownName('exists', `${r(62)}é`, r(62)),
      unicodePast63: ownName('exists', `"public".U&"${r(63)}\\0061"`, r(63)),
      within63: 'compiled',
    });
  });

  it('the name check stays fast on a long run of doubled quotes', () => {
    const name = `${'a""'.repeat(100_000)}"`;
    expect(exists('users', db.all, { parent: name }).compile().text).toBe('EXISTS (SELECT 1 FROM "users")');
  });

  it('without parent, parent() throws, at the top level and in a lateral, which hands no mark down', () => {
    const noMark = "The 'parent' table alias has no meaning here";
    expect(thrown(() => exists('extra.articles', { author_id: parent('id') }))).toBe(noMark);
    expect(thrown(() => db.select('users', db.all, {
      lateral: { a: db.select('extra.articles', exists('users', { id: parent('author_id') }), { columns: ['id'] }) },
    }))).toBe(noMark);
    // uncorrelated, it compiles anywhere
    expect(db.select('users', db.all, { lateral: { a: db.select('extra.articles', exists('users', db.all)) } }).compile().text)
      .toContain('FROM "extra"."articles" WHERE EXISTS (SELECT 1 FROM "users")) AS "sq_extra.articles"');
  });

  it('with parent, in a lateral, the subquery\'s own mark wins over the lateral\'s', () => {
    const q = db.select('users', db.all, {
      lateral: { a: db.select('extra.articles', exists('users', { id: parent('reviewer_id') }, { parent: 'extra.articles' }), { columns: ['id'] }) },
    });
    expect(q.compile().text).toContain('FROM "extra"."articles" WHERE EXISTS (SELECT 1 FROM "users" WHERE ("id" = "extra"."articles"."reviewer_id"))) AS "sq_extra.articles"');
  });

  it('self has no meaning in the subquery\'s where, nor isInSelect() as the whole where', () => {
    const noColumn = "The 'self' column alias has no meaning here";
    expect(thrown(() => ({ id: exists('extra.articles', sql`${'author_id'} = ${self}`, { parent: 'users' }) }))).toBe(noColumn);
    expect(thrown(() => ({ id: isInSelect('extra.articles', { author_id: dc.eq(1) }, 'author_id') }))).toBe('compiled');
    expect(thrown(() => dc.not(isInSelect('extra.articles', db.all, 'reviewer_id')))).toBe(noColumn);
  });

  it('copy() of the condition keeps parent, and drops the inherited mark', () => {
    const e = exists('extra.articles', { author_id: parent('id') }, { parent: 'users' });
    expect(e.copy().compile().text).toBe('EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))');
    expect(e.copy({ parentTable: 'films' }).compile().text).toBe('EXISTS (SELECT 1 FROM "extra"."articles" WHERE ("author_id" = "users"."id"))');
    expect(() => exists('extra.articles', { author_id: parent('id') }).copy({ parentTable: 'users' }).compile())
      .toThrow("The 'parent' table alias has no meaning here");
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts against the fixture: each export
// run on a column of the matching type. Seeded rows:
//   users: 1 Ada (happy, no manager), 2 Bob (ok, manager 1), 3 Cyd (sad, manager 1)
//   accounts.scores: 1 {1,2,3}, 2 {}, 3 {7}; accounts.flags: 1 {t,f}, 2 NULL, 3 {}
//   extra.type_zoo (inserted below): T true, F false, N null

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, conditions as dc } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

afterEach(resetConfig);

/** Ids of the rows of `table` matched by `where`, in id order. */
const ids = async (table: string, where: db.SQL) =>
  (await sql`SELECT ${'id'} FROM ${table} WHERE ${where} ORDER BY ${'id'}`.run(t.client)).map(r => Number(r.id));

describe('on users', () => {
  // [condition, Whereable, expected user ids]
  const cases: [string, db.SQL, number[]][] = [
    ['isNull', { manager_id: dc.isNull }, [1]],
    ['isNotNull', { manager_id: dc.isNotNull }, [2, 3]],
    ['isDistinctFrom', { mood: dc.isDistinctFrom('sad') }, [1, 2]],
    ['isDistinctFrom null', { manager_id: dc.isDistinctFrom(null) }, [2, 3]],
    ['isNotDistinctFrom null', { manager_id: dc.isNotDistinctFrom(null) }, [1]],
    ['eq', { display_name: dc.eq('Bob') }, [2]],
    ['eq a fragment', { display_name: dc.eq(sql`initcap(${param('cyd')})`) }, [3]],
    ['ne', { display_name: dc.ne('Bob') }, [1, 3]],
    ['gt', { id: dc.gt(2) }, [3]],
    ['gte', { id: dc.gte(2) }, [2, 3]],
    ['lt', { id: dc.lt(2) }, [1]],
    ['lte', { id: dc.lte(2) }, [1, 2]],
    ['between', { id: dc.between(1, 2) }, [1, 2]],
    ['between, bounds reversed', { id: dc.between(2, 1) }, []],
    ['betweenSymmetric', { id: dc.betweenSymmetric(2, 1) }, [1, 2]],
    ['notBetween', { id: dc.notBetween(1, 2) }, [3]],
    ['notBetweenSymmetric', { id: dc.notBetweenSymmetric(2, 1) }, [3]],
    ['like', { display_name: dc.like('A%') }, [1]],
    ['notLike', { display_name: dc.notLike('A%') }, [2, 3]],
    ['ilike', { display_name: dc.ilike('b%') }, [2]],
    ['notIlike', { display_name: dc.notIlike('b%') }, [1, 3]],
    ['similarTo', { display_name: dc.similarTo('(A|B)%') }, [1, 2]],
    ['notSimilarTo', { display_name: dc.notSimilarTo('(A|B)%') }, [3]],
    ['reMatch', { display_name: dc.reMatch('^C') }, [3]],
    ['reImatch', { display_name: dc.reImatch('^c') }, [3]],
    ['notReMatch', { display_name: dc.notReMatch('^C') }, [1, 2]],
    ['notReImatch', { display_name: dc.notReImatch('^c') }, [1, 2]],
    ['isIn', { id: dc.isIn([1, 3]) }, [1, 3]],
    ['isIn text', { mood: dc.isIn(['ok', 'sad']) }, [2, 3]],
    ['isIn []', { id: dc.isIn([]) }, []],
    ['isNotIn', { id: dc.isNotIn([1]) }, [2, 3]],
    ['isNotIn []', { id: dc.isNotIn([]) }, [1, 2, 3]],
    ['or of fragments', { id: dc.or(dc.eq(1), dc.eq(3)) }, [1, 3]],
    ['or of Whereables', dc.or({ id: 1 }, { display_name: 'Bob' }), [1, 2]],
    ['and', dc.and({ manager_id: 1 }, { mood: dc.ne('sad') }), [2]],
    ['not', dc.not({ id: 1 }), [2, 3]],
    ['not of a fragment', { manager_id: dc.not(dc.isNull) }, [2, 3]],
    ['before now', { created_at: dc.before(dc.now) }, [1, 2, 3]],
    ['after now', { created_at: dc.after(dc.now) }, []],
    ['after fromNow(-1, day)', { created_at: dc.after(dc.fromNow(-1, 'day')) }, [1, 2, 3]],
    ['after fromNow(1, day)', { created_at: dc.after(dc.fromNow(1, 'day')) }, []],
    ['arrayContains on a domain over text[]', { tags: dc.arrayContains(['new']) }, [3]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('characterization: eq(null) matches no row', async () => {
    // characterization: `"manager_id" = NULL`; isNull or isNotDistinctFrom(null) are needed
    expect(await ids('users', { manager_id: dc.eq(null) })).toEqual([]);
  });

  it('characterization: isNotIn with a null in the list matches no row', async () => {
    // characterization: SQL `NOT IN (2, NULL)` is never true
    expect(await ids('users', { id: dc.isNotIn([2, null]) })).toEqual([]);
  });

  it('characterization: not() does not parenthesise a fragment', async () => {
    // characterization: `(NOT "id" = 1 OR "id" = 2)` reads `(NOT "id" = 1) OR "id" = 2`: [2, 3], not [3]
    expect(await ids('users', { id: dc.not(sql`${db.self} = 1 OR ${db.self} = 2`) })).toEqual([2, 3]);
    expect(await ids('users', { id: dc.not(dc.or(dc.eq(1), dc.eq(2))) })).toEqual([3]);
  });

  it('characterization: and() / or() without argument are a syntax error', async () => {
    // characterization: `WHERE ()` and `WHERE ((()))`; a Whereable `{}` gives TRUE instead
    expect(await pgError(t.client, () => ids('users', dc.and()))).toMatchInlineSnapshot(`
      {
        "code": "42601",
        "message": "syntax error at or near ")"",
      }
    `);
    expect(await pgError(t.client, () => ids('users', { id: dc.or() }))).toMatchInlineSnapshot(`
      {
        "code": "42601",
        "message": "syntax error at or near ")"",
      }
    `);
    expect(await ids('users', {})).toEqual([1, 2, 3]);
  });
});

describe('on booleans (extra.type_zoo)', () => {
  let label: Record<number, string>;

  beforeEach(async () => {
    const rows = await db.insert('extra.type_zoo', [
      { c_varchar: 'T', c_bool: true }, { c_varchar: 'F', c_bool: false }, { c_varchar: 'N', c_bool: null },
    ], { returning: ['id', 'c_varchar'] }).run(t.client);
    label = Object.fromEntries(rows.map((r: { id: number; c_varchar: string }) => [r.id, r.c_varchar]));
  });

  const cases: [string, db.SQLFragment<any>, string[]][] = [
    ['isTrue', dc.isTrue, ['T']],
    ['isNotTrue', dc.isNotTrue, ['F', 'N']],
    ['isFalse', dc.isFalse, ['F']],
    ['isNotFalse', dc.isNotFalse, ['T', 'N']],
    ['isUnknown', dc.isUnknown, ['N']],
    ['isNotUnknown', dc.isNotUnknown, ['T', 'F']],
  ];

  it.each(cases)('%s', async (_name, condition, expected) => {
    expect((await ids('extra.type_zoo', { c_bool: condition })).map(id => label[id])).toEqual(expected);
  });
});

describe('on arrays (accounts)', () => {
  const cases: [string, db.SQL, number[]][] = [
    ['arrayContains', { scores: dc.arrayContains([1, 2]) }, [1]],
    ['arrayContains []', { scores: dc.arrayContains([]) }, [1, 2, 3]],
    ['arrayContainedIn', { scores: dc.arrayContainedIn([1, 2, 3, 7]) }, [1, 2, 3]],
    ['arrayContainedIn, partial', { scores: dc.arrayContainedIn([7]) }, [2, 3]],
    ['arrayOverlaps', { scores: dc.arrayOverlaps([7, 1]) }, [1, 3]],
    ['arrayOverlaps []', { scores: dc.arrayOverlaps([]) }, []],
    ['arrayContains on bool[], NULL array skipped', { flags: dc.arrayContains([true]) }, [1]],
    ['eq on a whole array', { scores: dc.eq([1, 2, 3]) }, [1]],
    ['Whereable value on a whole array', { scores: [7] }, [3]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('accounts', where)).toEqual(expected);
  });

  it('characterization: castArrayParamsToJson breaks the array operators', async () => {
    // characterization: the array parameter becomes CAST($1 AS "json"); `int4[] @> json` has no operator
    db.setConfig({ castArrayParamsToJson: true });
    expect(await pgError(t.client, () => ids('accounts', { scores: dc.arrayContains([1]) }))).toMatchInlineSnapshot(`
      {
        "code": "42883",
        "message": "operator does not exist: integer[] @> json",
      }
    `);
  });
});

describe('add, subtract (in an update)', () => {
  it('add and subtract a number', async () => {
    expect(await db.update('accounts', { balance: dc.add(10), lifetime_ops: dc.subtract(1) }, { id: 3 },
      { returning: ['balance', 'lifetime_ops'] }).run(t.client)).toEqual([{ balance: 10, lifetime_ops: 0 }]);
  });

  it('characterization: add a number of days to a date needs a cast', async () => {
    // characterization: `"occurred_on" + $1` leaves $1 untyped, and `date + unknown` is ambiguous
    expect(await pgError(t.client, () => db.update('events', { occurred_on: dc.add(1) }, { kind: 'signup' }).run(t.client)))
      .toMatchInlineSnapshot(`
        {
          "code": "42725",
          "message": "operator is not unique: date + unknown",
        }
      `);
    // the type of add() refuses a Parameter, its runtime accepts one
    expect(await db.update('events', { occurred_on: dc.add(param(1, 'int4') as unknown as number) }, { kind: 'signup' }, { returning: ['occurred_on'] })
      .run(t.client)).toEqual([{ occurred_on: '2025-06-02' }]);
  });
});

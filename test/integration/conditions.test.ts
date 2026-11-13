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

  it('not() parenthesises a fragment', async () => {
    // `(NOT ("id" = 1 OR "id" = 2))`; 6.6.1 wrote `(NOT "id" = 1 OR "id" = 2)`, read `(NOT "id" = 1) OR "id" = 2`
    expect(await ids('users', { id: dc.not(sql`${db.self} = 1 OR ${db.self} = 2`) })).toEqual([3]);
    expect(await ids('users', { id: dc.not(sql`${db.self} >= 1 AND ${db.self} <= 2`) })).toEqual([3]);
    expect(await ids('users', { id: dc.not(dc.not(sql`${db.self} = 1 OR ${db.self} = 2`)) })).toEqual([1, 2]);
    expect(await ids('users', { id: dc.not(dc.or(dc.eq(1), dc.eq(2))) })).toEqual([3]);
  });

  // `and()` puts each operand in parentheses; 6.6.1 wrote `("id" = 1 OR "id" = 2 AND …)`, read `"id" = 1 OR ("id" = 2 AND …)`
  it.each([
    ['a fragment, then a Whereable', dc.and(sql`${'id'} = 1 OR ${'id'} = 2`, { manager_id: 1 }), [2]],
    ['a Whereable, then a fragment', dc.and({ manager_id: 1 }, sql`${'id'} = 2 OR ${'id'} = 1`), [2]],
    ['two fragments', dc.and(sql`${'id'} = 1 OR ${'id'} = 2`, sql`${'id'} = 2 OR ${'id'} = 3`), [2]],
    ['as a Whereable value, with self', { id: dc.and(sql`${db.self} = 1 OR ${db.self} = 2`, dc.gt(1)) }, [2]],
    ['under or()', dc.or(dc.and(sql`${'id'} = 1 OR ${'id'} = 2`, { manager_id: 1 }), { id: 3 }), [2, 3]],
    // on display_name, NOT NULL: user 1's manager_id would make it NOT (NULL), no row either way
    ['under not()', dc.not(dc.and(sql`${'id'} = 1 OR ${'id'} = 2`, { display_name: 'Bob' })), [1, 3]],
  ] as [string, db.SQL, number[]][])('and() parenthesises a fragment with a bare OR: %s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('and() parenthesises a fragment with a bare OR: the rows update() writes', async () => {
    // 6.6.1 updated user 1 too, who has no manager
    expect(await db.update('users', { display_name: 'Bea' }, dc.and(sql`${'id'} = 1 OR ${'id'} = 2`, { manager_id: 1 }), { returning: ['id'] })
      .run(t.client)).toEqual([{ id: 2 }]);
  });

  it('and() parenthesises a fragment with a bare OR: in a lateral, beside parent()', async () => {
    // 6.6.1 gave account 3 to every user
    expect(await db.select('users', db.all, {
      columns: ['id'], order: { by: 'id', direction: 'ASC' },
      lateral: {
        accounts: db.select('accounts', dc.and({ owner_id: db.parent('id') }, sql`${'id'} = 1 OR ${'id'} = 3`),
          { columns: ['id'], order: { by: 'id', direction: 'ASC' } }),
      },
    }).run(t.client)).toEqual([{ id: 1, accounts: [{ id: 1 }] }, { id: 2, accounts: [{ id: 3 }] }, { id: 3, accounts: [] }]);
  });

  it('and() parenthesises a fragment with a bare OR: in a having', async () => {
    // owner 1 has two accounts, the larger 1500.50; owner 2 one, at 0; 6.6.1 kept owner 1 too
    expect(await db.select('accounts', db.all, {
      columns: ['owner_id'], groupBy: 'owner_id', order: { by: 'owner_id', direction: 'ASC' },
      having: dc.and(sql`count(*) > 1 OR min(${'balance'}) = 0`, sql`max(${'balance'}) < 100`),
    }).run(t.client)).toEqual([{ owner_id: 2 }]);
  });

  it('and() parenthesises each operand: a quoted literal split across two', async () => {
    // 6.6.1 wrote `("display_name" = 'x AND y')` and found user 1; now `(("display_name" = 'x) AND (y'))`
    await sql`UPDATE ${'users'} SET ${'display_name'} = CASE ${'id'} WHEN 1 THEN 'x AND y' WHEN 2 THEN 'x) AND (y' END
      WHERE ${'id'} IN (1, 2)`.run(t.client);
    expect(await ids('users', dc.and(sql`${'display_name'} = 'x`, sql`y'`))).toEqual([2]);
  });

  it('or() matches the same rows whatever its operands: AND binds tighter than OR', async () => {
    expect(await ids('users', dc.or(sql`${'id'} = 1 AND ${'manager_id'} = 1`, sql`${'id'} = 2 OR ${'id'} = 3`))).toEqual([2, 3]);
  });

  // `and()` is TRUE and `or()` FALSE, as a Whereable `{}` is TRUE; 6.6.1 wrote `()`: each case was 42601 there
  it.each([
    ['and()', dc.and(), [1, 2, 3]],
    ['or()', dc.or(), []],
    ['and() as a Whereable value', { id: dc.and() }, [1, 2, 3]],
    ['or() as a Whereable value', { id: dc.or() }, []],
    ['not(and())', dc.not(dc.and()), []],
    ['not(or())', dc.not(dc.or()), [1, 2, 3]],
    ['and(or(), Whereable)', dc.and(dc.or(), { id: 1 }), []],
    ['or(and(), Whereable)', dc.or(dc.and(), { id: 1 }), [1, 2, 3]],
    ['or(or(), Whereable)', dc.or(dc.or(), { id: 1 }), [1]],
    ['and(and(), Whereable)', dc.and(dc.and(), { id: 1 }), [1]],
    ['or(Whereable) of an and()', dc.or({ id: dc.and() }, { id: 1 }), [1, 2, 3]],
  ] as [string, db.SQL, number[]][])('and() / or() without argument: %s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('a Whereable {} matches every row, as and() does', async () => {
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

describe('on Date values (extra.type_zoo)', () => {
  // pg sends a Date as local time with its offset (2025-06-01T00:30:00.000+02:00): a timestamptz keeps the
  // instant, a date keeps the local calendar day. Local constructors keep the tests independent of TZ.
  let id: number;

  beforeEach(async () => {
    ({ id } = await db.insert('extra.type_zoo', { c_timestamptz: '2025-06-01T12:00:00Z', c_date: '2025-06-01' },
      { returning: ['id'] }).run(t.client));
  });

  const matches = async (where: db.SQL) => (await ids('extra.type_zoo', where)).includes(id);
  const diff = async (where: db.SQL) =>
    (await sql`SELECT (${where})::text AS v FROM ${'extra.type_zoo'} WHERE ${{ id }}`.run(t.client))[0].v;

  it('timestamptz: the instant, to the millisecond', async () => {
    expect(await matches({ c_timestamptz: dc.lt(new Date('2025-06-01T12:00:00.001Z')) })).toBe(true);
    expect(await matches({ c_timestamptz: dc.lt(new Date('2025-06-01T12:00:00.000Z')) })).toBe(false);
    expect(await matches({ c_timestamptz: dc.eq(new Date('2025-06-01T12:00:00Z')) })).toBe(true);
    expect(await diff({ c_timestamptz: dc.subtract(new Date('2025-06-01T10:30:00Z')) })).toBe('01:30:00');
  });

  it('characterization: date: the local day of the Date, its time dropped', async () => {
    // characterization: `"c_date" < $1` types $1 as date, so 23:30 on June 1 is not after June 1
    expect(await matches({ c_date: dc.eq(new Date(2025, 5, 1, 0, 30)) })).toBe(true);
    expect(await matches({ c_date: dc.eq(new Date(2025, 5, 1, 23, 30)) })).toBe(true);
    expect(await matches({ c_date: dc.lt(new Date(2025, 5, 1, 23, 30)) })).toBe(false);
    expect(await matches({ c_date: dc.lt(new Date(2025, 5, 2, 0, 30)) })).toBe(true);
    // `date - date` is a number of days
    expect(await diff({ c_date: dc.subtract(new Date(2025, 4, 30, 23, 30)) })).toBe('2');
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

// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/conditions.ts against the fixture: each export
// run on a column of the matching type. Seeded rows:
//   users: 1 Ada (happy, no manager), 2 Bob (ok, manager 1), 3 Cyd (sad, manager 1)
//   accounts.scores: 1 {1,2,3}, 2 {}, 3 {7}; accounts.flags: 1 {t,f}, 2 NULL, 3 {}
//   extra.type_zoo (inserted below): T true, F false, N null

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, param, all, parent, conditions as dc } from '../../src/db';
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

  it('isDistinctFrom() and isNotDistinctFrom() of a nullable value, holding null or not (#181)', async () => {
    const none = null as number | null, one = 1 as number | null;
    expect({
      notDistinctFromNone: await ids('users', { manager_id: dc.isNotDistinctFrom(none) }),
      distinctFromNone: await ids('users', { manager_id: dc.isDistinctFrom(none) }),
      notDistinctFromOne: await ids('users', { manager_id: dc.isNotDistinctFrom(one) }),
      distinctFromOne: await ids('users', { manager_id: dc.isDistinctFrom(one) }),
    }).toEqual({ notDistinctFromNone: [1], distinctFromNone: [2, 3], notDistinctFromOne: [2, 3], distinctFromOne: [1] });
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

  it('and() parenthesises each operand: a BETWEEN split across two', async () => {
    // 6.6.1 wrote `("id" BETWEEN 1 AND 2)` and found users 1 and 2; now `(("id" BETWEEN 1) AND (2))`, which Postgres refuses
    expect(await pgError(t.client, () => ids('users', dc.and(sql`${'id'} BETWEEN 1`, sql`2`))))
      .toEqual({ code: '42601', message: 'syntax error at or near ")"' });
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

  it('castArrayParamsToJson: an array operator takes an array type cast', async () => {
    // 6.6.1 dropped the cast: `int4[] @> json` (42883). The type of the array conditions refuses a Parameter (#40)
    db.setConfig({ castArrayParamsToJson: true });
    expect(await ids('accounts', { scores: dc.arrayContains(param([1], 'int4[]') as unknown as number[]) })).toEqual([1]);
    expect(await ids('accounts', { scores: dc.arrayOverlaps(param([7, 1], 'int4[]') as unknown as number[]) })).toEqual([1, 3]);
  });

  it('castArrayParamsToJson: an array operator given a plain array sends JSON, as before', async () => {
    db.setConfig({ castArrayParamsToJson: true });
    expect(await pgError(t.client, () => ids('accounts', { scores: dc.arrayContains([1]) })))
      .toEqual({ code: '42883', message: 'operator does not exist: integer[] @> json' });
  });
});

describe('eqAny: one array parameter', () => {
  // users: 1 Ada (happy, settings {"theme":"dark"}), 2 Bob (ok, manager 1), 3 Cyd (sad, manager 1)
  const cases: [string, db.SQL, number[]][] = [
    ['ids', { id: dc.eqAny([1, 3]) }, [1, 3]],
    ['the empty array matches no row', { id: dc.eqAny([]) }, []],
    ['an enum', { mood: dc.eqAny(['ok', 'sad']) }, [2, 3]],
    ['a domain', { email: dc.eqAny(['Ada@Example.com', 'cyd@example.com']) }, [1, 3]],
    ['a null item matches no row', { manager_id: dc.eqAny([null as unknown as number]) }, []],
    ['a null item beside a value', { manager_id: dc.eqAny([1, null as unknown as number]) }, [2, 3]],
    // as NOT IN: `NOT (NULL = ANY(…))` and `NOT (2 = ANY('{1,NULL}'))` are NULL, never true
    ['under not(), a null item matches no row', { manager_id: dc.not(dc.eqAny([2, null as unknown as number])) }, []],
    ['under not(), the empty array matches every row', { id: dc.not(dc.eqAny([])) }, [1, 2, 3]],
    ['jsonb: an object item', { settings: dc.eqAny([{ theme: 'dark' }]) }, [1]],
    ['jsonb: a string item is JSON text', { settings: dc.eqAny(['{}']) }, [2, 3]],
    ['70,000 items, past the 65,535 parameters of IN', { id: dc.eqAny(Array.from({ length: 70000 }, (_, i) => i + 1)) }, [1, 2, 3]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('an enum label that is not one: 22P02', async () => {
    expect(await pgError(t.client, () => ids('users', { mood: dc.eqAny(['nope' as 'ok']) })))
      .toEqual({ code: '22P02', message: 'invalid input value for enum mood: "nope"' });
  });

  it('jsonb: an array or a string value goes as JSON text, as the refusal of an array item says', async () => {
    await sql`UPDATE ${'users'} SET ${'settings'} = CASE ${'id'} WHEN 2 THEN '[1, 2]'::jsonb ELSE '"x"' END
      WHERE ${'id'} IN (2, 3)`.run(t.client);
    expect(await ids('users', { settings: dc.eqAny([JSON.stringify([1, 2]), JSON.stringify('x')]) })).toEqual([2, 3]);
    await expect(ids('users', { settings: dc.eqAny([[1, 2]]) })).rejects.toThrow('`eqAny()` sends its array as one parameter, which reads an array item as more items');
  });

  it('an array column: isIn(), as the refusal of an array item says', async () => {
    // `"scores" = ANY($1)` would be 42704, could not find array type for data type integer[]
    expect(await ids('accounts', { scores: dc.isIn([[1, 2, 3], [7]]) })).toEqual([1, 3]);
  });

  it('a Date: the instant on a timestamptz, the local day on a date, as eq()', async () => {
    const { id } = await db.insert('extra.type_zoo', { c_timestamptz: '2025-06-01T12:00:00Z', c_date: '2025-06-01' },
      { returning: ['id'] }).run(t.client);
    expect({
      timestamptz: await ids('extra.type_zoo', { id, c_timestamptz: dc.eqAny([new Date('2025-06-01T12:00:00Z')]) }),
      timestamptzMissed: await ids('extra.type_zoo', { id, c_timestamptz: dc.eqAny([new Date('2025-06-01T12:00:00.001Z')]) }),
      date: await ids('extra.type_zoo', { id, c_date: dc.eqAny([new Date(2025, 5, 1, 23, 30)]) }),
    }).toEqual({ timestamptz: [id], timestamptzMissed: [], date: [id] });
  });

  it('int8 as a string or a bigint, and a domain over int4', async () => {
    expect(await ids('accounts', { lifetime_ops: dc.eqAny(['9007199254740993', BigInt(1)]) })).toEqual([1, 3]);
    expect(await ids('accounts', { overdraft_limit: dc.eqAny([100, 5]) })).toEqual([1]);
  });

  it('one prepared statement for any length, where isIn() writes one text per length', async () => {
    const byId = (where: db.SQL, name: string) => sql`SELECT ${'id'} FROM ${'users'} WHERE ${where} ORDER BY ${'id'}`.prepared(name);
    expect((await byId({ id: dc.eqAny([1]) }, 'pgcast_test_eq_any').run(t.client)).map(r => r.id)).toEqual([1]);
    expect((await byId({ id: dc.eqAny([2, 3]) }, 'pgcast_test_eq_any').run(t.client)).map(r => r.id)).toEqual([2, 3]);
    await byId({ id: dc.isIn([1]) }, 'pgcast_test_is_in').run(t.client);
    await expect(byId({ id: dc.isIn([2, 3]) }, 'pgcast_test_is_in').run(t.client)).rejects.toThrow(`Prepared statements must be unique - 'pgcast_test_is_in'`);
  });

  it('the same under castArrayParamsToJson', async () => {
    db.setConfig({ castArrayParamsToJson: true });
    expect(await ids('users', { id: dc.eqAny([1, 3]) })).toEqual([1, 3]);
  });

  it('parent(): an array column of the parent row, in a lateral', async () => {
    // accounts.scores: 1 {1,2,3}, 2 {}, 3 {7}
    expect(await db.select('accounts', db.all, {
      columns: ['id'], order: { by: 'id', direction: 'ASC' },
      lateral: { users: db.select('users', { id: dc.eqAny(db.parent('scores')) }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } }) },
    }).run(t.client)).toEqual([
      { id: 1, users: [{ id: 1 }, { id: 2 }, { id: 3 }] }, { id: 2, users: [] }, { id: 3, users: [] },
    ]);
  });

  it('a list that is not an array rejects before any query', async () => {
    await expect(ids('users', { id: dc.eqAny(new Set([1]) as unknown as number[]) })).rejects.toThrow('`eqAny()` takes an array, not `Set`');
  });

  it('db.all as an item rejects before any query, so an update() changes no row', async () => {
    // pg would send it as 'Symbol(all)', which no name equals: under not(), every user
    await expect(db.update('users', { display_name: 'Gone' }, { display_name: dc.not(dc.eqAny([db.all as any])) }).run(t.client))
      .rejects.toThrow('not `db.all`: give a value.');
    expect(await db.count('users', { display_name: 'Gone' }).run(t.client)).toBe(0);
  });
});

describe('websearchToTsquery on a tsvector column', () => {
  // products.search is to_tsvector('simple', coalesce(title, '')): 1 'T-shirt small', 2 'T-shirt medium', 3 no title, ''
  const { websearchToTsquery: search, not } = dc;
  const cases: [string, db.SQL, number[]][] = [
    ['a word', { search: search('simple', 'shirt') }, [1, 2]],
    ['two words, both', { search: search('simple', 'shirt small') }, [1]],
    ['or', { search: search('simple', 'small or medium') }, [1, 2]],
    ['-word, without it', { search: search('simple', 'shirt -small') }, [2]],
    ['a quoted phrase, in order', { search: search('simple', '"shirt medium"') }, [2]],
    ['a quoted phrase, out of order', { search: search('simple', '"medium shirt"') }, []],
    ['a hyphenated word, as the vector splits it', { search: search('simple', 't-shirt') }, [1, 2]],
    ['the configuration\'s stems: simple keeps shirts', { search: search('simple', 'shirts') }, []],
    ['the configuration\'s stems: english reads shirts as shirt', { search: search('english', 'shirts') }, [1, 2]],
    ['under not(), the rows without it, the empty vector included', { search: not(search('simple', 'small')) }, [2, 3]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('products', where)).toEqual(expected);
  });

  it('runs in select(), with the same SQL', async () => {
    const q = db.select('products' as any, { search: search('english', 'medium') }, { columns: ['id'] });
    expect(q.compile().text).toContain('WHERE (("search" @@ websearch_to_tsquery(CAST($2 AS "regconfig"), $3)))');
    expect(await q.run(t.client)).toEqual([{ id: 2 }]);
  });

  it('tsquery operators and quotes are no syntax error: Postgres reads them as a search box would', async () => {
    // & and | are not operators here, so | is no OR; :* is no prefix; a lone quote or punctuation leaves no word
    const rows = async (query: string) => {
      const [{ q }] = (await t.client.query<{ q: string }>(`SELECT websearch_to_tsquery('simple', $1)::text AS q`, [query])).rows;
      return { tsquery: q, ids: await ids('products', { search: search('simple', query) }) };
    };
    expect({
      and: await rows('small & medium'), pipe: await rows('small | medium'), prefix: await rows('smal:*'),
      squotes: await rows(`'small'`), dquote: await rows('"'), punctuation: await rows('!('),
    }).toEqual({
      and: { tsquery: `'small' & 'medium'`, ids: [] },
      pipe: { tsquery: `'small' & 'medium'`, ids: [] },
      prefix: { tsquery: `'smal'`, ids: [] },
      squotes: { tsquery: `'small'`, ids: [1] },
      dquote: { tsquery: '', ids: [] },
      punctuation: { tsquery: '', ids: [] },
    });
  });

  it('a query of stop words alone matches no row, and Postgres sends a NOTICE', async () => {
    const notices: string[] = [];
    const listener = (n: { message?: string | undefined }) => notices.push(n.message ?? '');
    t.client.on('notice', listener);
    try {
      expect(await ids('products', { search: search('english', 'the') })).toEqual([]);
    } finally {
      t.client.off('notice', listener);
    }
    expect(new Set(notices)).toEqual(new Set(['text-search query contains only stop words or doesn\'t contain lexemes, ignored']));
  });

  it('an unknown configuration: 42704', async () => {
    expect(await pgError(t.client, () => ids('products', { search: search('klingon', 'shirt') })))
      .toEqual({ code: '42704', message: 'text search configuration "klingon" does not exist' });
  });

  it('an unknown schema in a dotted configuration: 3F000 before Postgres 16, 42704 from 16', async () => {
    // from 16, regconfig's input reports its errors softly, and the schema it lacks as the configuration it lacks
    const { rows: [{ version }] } = await t.client.query("SELECT current_setting('server_version_num')::int AS version");
    expect(await pgError(t.client, () => ids('products', { search: search('nosuch.english', 'shirt') }))).toEqual(version >= 160000 ?
      { code: '42704', message: 'text search configuration "nosuch.english" does not exist' } :
      { code: '3F000', message: 'schema "nosuch" does not exist' });
  });

  it('a query that is no string rejects before any query, so an update() changes no row', async () => {
    // pg would send ['shirt'] as '{"shirt"}', which Postgres reads as the word shirt: both shirts
    await expect(db.update('products', { price_cents: 0 }, { search: search('simple', ['shirt'] as any) }).run(t.client))
      .rejects.toThrow('`websearchToTsquery()` takes its query as a string, not an array');
    expect(await db.count('products', { price_cents: 0 }).run(t.client)).toBe(0);
  });

  it('a NULL vector gives NULL: not() leaves the row out too', async () => {
    const { id } = await db.insert('extra.type_zoo' as any, { c_text: 'no vector' }, { returning: ['id'] }).run(t.client) as { id: number };
    expect({
      search: await ids('extra.type_zoo', { id, c_tsvector: search('simple', 'vector') }),
      not: await ids('extra.type_zoo', { id, c_tsvector: not(search('simple', 'vector')) }),
    }).toEqual({ search: [], not: [] });
  });

  it('characterization: a text-like column, untyped, is no error: Postgres builds its vector with default_text_search_config', async () => {
    // users.email, a domain over citext: the type refuses it, being string; a column typed any would pass
    const config = (await t.client.query<{ c: string }>(`SELECT current_setting('default_text_search_config') AS c`)).rows[0]!.c;
    expect({ config, ids: await ids('users', { email: search('simple', 'bob@example.com') }) })
      .toEqual({ config: 'pg_catalog.english', ids: [2] });
  });

  it('characterization: an xml column, typed any, passes the type, and Postgres refuses it, 42883', async () => {
    expect(await pgError(t.client, () => ids('extra.type_zoo', { c_xml: search('simple', 'vector') })))
      .toEqual({ code: '42883', message: 'operator does not exist: xml @@ tsquery' });
  });
});

describe('jsonbContains: the value sent as jsonb', () => {
  // users.settings: 1 {"theme":"dark"}, 2 {}, 3 {}; events.payload: {"user": 1}, {"user": 2}, NULL
  const cases: [string, db.SQL, number[]][] = [
    ['an object', { settings: dc.jsonbContains({ theme: 'dark' }) }, [1]],
    ['another value of the key', { settings: dc.jsonbContains({ theme: 'light' }) }, []],
    ['{} is contained in every object', { settings: dc.jsonbContains({}) }, [1, 2, 3]],
    ['under not()', { settings: dc.not(dc.jsonbContains({ theme: 'dark' })) }, [2, 3]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('a nullable column: its NULL rows never match', async () => {
    expect(await sql`SELECT ${'kind'} FROM ${'events'} WHERE ${{ payload: dc.jsonbContains({ user: 2 }) }}`.run(t.client)).toEqual([{ kind: 'login' }]);
    expect(await sql`SELECT ${'kind'} FROM ${'events'} WHERE ${{ payload: dc.not(dc.jsonbContains({ user: 2 })) }}`.run(t.client)).toEqual([{ kind: 'signup' }]);
  });

  describe('a string, a number, an array and null', () => {
    const
      stored = { object: { edition: 'first', tags: ['x', 'y'], n: 1 }, array: ['x', 1, null], string: 'x', number: 1, null: null },
      // each value, what it matches among the rows above (an array contains a scalar it holds, as Postgres reads @>)
      values: [string, db.JSONValue, string[]][] = [
        ['a string', 'x', ['array', 'string']],
        ['a number', 1, ['array', 'number']],
        ['an array', ['x'], ['array']],
        ['null, the JSON null', null, ['array', 'null']],
        ['an object, nested', { tags: ['y'] }, ['object']],
      ];
    const rows = async () => {
      // each stored as its JSON text, as an insert() of a string or an array would hit the 22P02 below
      const inserted = await db.insert('extra.type_zoo', [...Object.values(stored).map(v => JSON.stringify(v)), db.sql`NULL`]
        .map(c_jsonb => ({ c_jsonb })), { returning: ['id'] }).run(t.client);
      return Object.fromEntries([...Object.keys(stored), 'sqlNull'].map((k, i) => [inserted[i]!.id, k]));
    };

    it.each(values)('%s: the rows whose JSON contains it, SQL NULL never', async (_name, value, expected) => {
      const byId = await rows();
      expect((await ids('extra.type_zoo', { c_jsonb: dc.jsonbContains(value) })).map(id => byId[id])).toEqual(expected);
    });

    it.each(values)('%s: Postgres receives JSON text of that type, whatever the configuration', async (_name, value) => {
      const received = [];
      for (const config of [{}, { castObjectParamsToJson: true }, { castArrayParamsToJson: true }]) {
        db.setConfig(config);
        const { values: sent } = sql`${{ c_jsonb: dc.jsonbContains(value) }}`.compile();
        received.push((await t.client.query('SELECT jsonb_typeof(CAST($1 AS "jsonb")) AS type, CAST($1 AS "jsonb") AS json', sent)).rows[0]);
        resetConfig();
      }
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      expect(received).toEqual(Array(3).fill({ type, json: value }));
    });

    it('where a bare param() cast to jsonb sends a string as text and an array as a Postgres array: 22P02', async () => {
      for (const value of ['x', ['x']])
        expect(await pgError(t.client, () => ids('extra.type_zoo', { c_jsonb: sql`${db.self} @> ${param(value, 'jsonb')}` })))
          .toEqual({ code: '22P02', message: 'invalid input syntax for type json' });
    });
  });

  it('the same rows under castObjectParamsToJson and castArrayParamsToJson', async () => {
    db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true });
    expect(await ids('users', { settings: dc.jsonbContains({ theme: 'dark' }) })).toEqual([1]);
  });

  it('characterization: a json column passes the type, and Postgres refuses it, 42883', async () => {
    expect(await pgError(t.client, () => ids('extra.type_zoo', { c_json: dc.jsonbContains({}) })))
      .toEqual({ code: '42883', message: 'operator does not exist: json @> jsonb' });
  });

  it('a wrapper rejects before any query', async () => {
    await expect(ids('users', { settings: dc.jsonbContains(param({ theme: 'dark' }) as any) })).rejects.toThrow('so it takes a JSON value, not `db.param()`');
  });

  it('a bigint rejects before any query, as an int8 parsed as a BigInt, typed any, would', async () => {
    const parsed: any = { owner: BigInt(1) };
    await expect(ids('users', { settings: dc.jsonbContains(parsed) })).rejects.toThrow('not a `bigint` at key `owner`');
  });

  it('a key holding undefined rejects before any query, so an update() changes no row', async () => {
    // JSON.stringify would leave the key out: {} is contained in every object, and every user was renamed
    // as `{ theme?: string }` holds it without exactOptionalPropertyTypes, on here
    const filter: { theme?: string | undefined } = { theme: undefined };
    await expect(db.update('users', { display_name: 'Gone' }, { settings: dc.jsonbContains(filter as db.JSONValue) }).run(t.client))
      .rejects.toThrow('not `undefined` at key `theme`');
    expect(await db.count('users', { display_name: 'Gone' }).run(t.client)).toBe(0);
  });
});

describe('jsonbPathExists: the path and its variables bound', () => {
  // users.settings: 1 {"theme":"dark"}, 2 {}, 3 {}; events.payload: {"user": 1}, {"user": 2}, NULL
  const cases: [string, db.SQL, number[]][] = [
    ['a variable', { settings: dc.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' }) }, [1]],
    ['another value of the variable', { settings: dc.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'light' }) }, []],
    ['no variables: a key that exists', { settings: dc.jsonbPathExists('$.theme') }, [1]],
    ['the root, in every row', { settings: dc.jsonbPathExists('$') }, [1, 2, 3]],
    ['under not()', { settings: dc.not(dc.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' })) }, [2, 3]],
    ['lax, the default mode: a row lacking the key finds no item', { settings: dc.jsonbPathExists('lax $.theme') }, [1]],
    ['strict, in a filter: a row lacking the key finds no item', { settings: dc.jsonbPathExists('strict $ ? (@.theme == $theme)', { theme: 'dark' }) }, [1]],
  ];

  it.each(cases)('%s', async (_name, where, expected) => {
    expect(await ids('users', where)).toEqual(expected);
  });

  it('a nullable column: its NULL rows never match', async () => {
    const kinds = (where: db.SQL) => sql`SELECT ${'kind'} FROM ${'events'} WHERE ${where}`.run(t.client).then(rs => rs.map(r => r.kind));
    expect(await kinds({ payload: dc.jsonbPathExists('$.user ? (@ == $user)', { user: 2 }) })).toEqual(['login']);
    expect(await kinds({ payload: dc.not(dc.jsonbPathExists('$.user ? (@ == $user)', { user: 2 }) ) })).toEqual(['signup']);
  });

  describe('variables of each JSON type, on extra.type_zoo', () => {
    const rows = async () => {
      const stored = [
        { title: 'The Salt Orchard', year: 1974, prizes: ['Golden Gull'], cut: { format: '35mm' } },
        { title: 'Small Hours', year: 2019, prizes: [] },
        { title: 'It\'s "quoted" (and $1 @ \\)', year: 2008, prizes: 'Golden Gull' },
      ];
      // each stored as its JSON text, as in jsonbContains's tests above
      const inserted = await db.insert('extra.type_zoo', stored.map(v => ({ c_jsonb: JSON.stringify(v) })), { returning: ['id'] }).run(t.client);
      const order: number[] = inserted.map((r: { id: unknown }) => Number(r.id));
      return (where: db.SQL) => ids('extra.type_zoo', where).then(found => found.map(id => order.indexOf(id)));
    };

    it('a string, a number, an object, an array item, and a name that needs quoting', async () => {
      const found = await rows();
      expect({
        string: await found({ c_jsonb: dc.jsonbPathExists('$.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' }) }),
        number: await found({ c_jsonb: dc.jsonbPathExists('$ ? (@.year < $before)', { before: 2000 }) }),
        numberAsString: await found({ c_jsonb: dc.jsonbPathExists('$ ? (@.year < $before)', { before: '2000' }) }),
        nested: await found({ c_jsonb: dc.jsonbPathExists('$.cut ? (@.format == $cut.format)', { cut: { format: '35mm' } }) }),
        quoted: await found({ c_jsonb: dc.jsonbPathExists('$.title ? (@ == $"a title")', { 'a title': 'It\'s "quoted" (and $1 @ \\)' }) }),
      }).toEqual({ string: [0, 2], number: [0], numberAsString: [], nested: [0], quoted: [2] });
    });

    it('lax unwraps a value where an array is expected; strict raises on it, 22039', async () => {
      const found = await rows();
      expect(await found({ c_jsonb: dc.jsonbPathExists('lax $.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' }) })).toEqual([0, 2]);
      expect(await pgError(t.client, () => found({ c_jsonb: dc.jsonbPathExists('strict $.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' }) })))
        .toEqual({ code: '22039', message: 'jsonpath wildcard array accessor can only be applied to an array' });
    });
  });

  it('strict, outside a filter: Postgres raises on a row lacking the key, 2203A', async () => {
    expect(await pgError(t.client, () => ids('users', { settings: dc.jsonbPathExists('strict $.theme') })))
      .toEqual({ code: '2203A', message: 'JSON object does not contain key "theme"' });
  });

  it('an invalid path fails in Postgres, with its own error, 42601', async () => {
    expect(await pgError(t.client, () => ids('users', { settings: dc.jsonbPathExists('$.prizes[*') })))
      .toEqual({ code: '42601', message: 'syntax error at end of jsonpath input' });
  });

  it('a variable the path names and vars lacks fails in Postgres, 42704', async () => {
    expect(await pgError(t.client, () => ids('users', { settings: dc.jsonbPathExists('$.theme ? (@ == $theme)') })))
      .toEqual({ code: '42704', message: 'could not find jsonpath variable "theme"' });
  });

  it.each([
    ['null', null],
    ['an array', ['dark']],
  ])('vars that is %s, no object, fails in Postgres, 22023, even when the path names no variable', async (_, vars) => {
    expect(await pgError(t.client, () => ids('users', { settings: dc.jsonbPathExists('$.theme', vars as any) })))
      .toEqual({ code: '22023', message: '"vars" argument is not an object' });
  });

  it('characterization: a predicate path always gives an item, its boolean, so every row matches', async () => {
    // Postgres's docs: jsonb_path_exists is "useful only with SQL-standard JSON path expressions"
    expect(await ids('users', { settings: dc.jsonbPathExists('$.theme == $theme', { theme: 'light' }) })).toEqual([1, 2, 3]);
  });

  it('a jsonb domain, its placeholder narrowed in the type tests', async () => {
    const row = await db.insert('extra.type_zoo', { c_jsonb_domain: JSON.stringify({ theme: 'dark' }) as any }, { returning: ['id'] }).run(t.client);
    expect(await ids('extra.type_zoo', { c_jsonb_domain: dc.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' }) })).toEqual([row.id]);
  });

  it('the same rows under castObjectParamsToJson and castArrayParamsToJson', async () => {
    db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true });
    expect(await ids('users', { settings: dc.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' }) })).toEqual([1]);
  });

  it('characterization: a json column passes the type, and Postgres refuses it, 42883', async () => {
    expect(await pgError(t.client, () => ids('extra.type_zoo', { c_json: dc.jsonbPathExists('$') })))
      .toEqual({ code: '42883', message: 'function jsonb_path_exists(json, jsonpath, jsonb) does not exist' });
  });

  it('a path that is no string, or a key holding undefined, rejects before any query, so an update() changes no row', async () => {
    await expect(ids('users', { settings: dc.jsonbPathExists(param('$.theme') as any) })).rejects.toThrow('takes its path as a string, not `db.param()`');
    // JSON.stringify would leave the key out, and Postgres raise 42704
    const vars: { theme?: string | undefined } = { theme: undefined };
    await expect(db.update('users', { display_name: 'Gone' }, { settings: dc.jsonbPathExists('$.theme ? (@ == $theme)', vars as db.JSONObject) }).run(t.client))
      .rejects.toThrow('not `undefined` at key `theme`');
    expect(await db.count('users', { display_name: 'Gone' }).run(t.client)).toBe(0);
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

describe('characterization: conditions the type accepts and Postgres refuses, as in 6.6.1 (#180)', () => {
  // documented, not refused by the type: each narrower type tried refused code that runs (#180)
  const conds: [string, db.SQLFragment<any>, string][] = [
    ['isTrue', dc.isTrue, 'IS TRUE'], ['isNotTrue', dc.isNotTrue, 'IS NOT TRUE'],
    ['isFalse', dc.isFalse, 'IS FALSE'], ['isNotFalse', dc.isNotFalse, 'IS NOT FALSE'],
    ['isUnknown', dc.isUnknown, 'IS UNKNOWN'], ['isNotUnknown', dc.isNotUnknown, 'IS NOT UNKNOWN'],
  ];

  it.each(conds)('%s on an int column', async (_name, cond, keyword) => {
    expect(await pgError(t.client, () => ids('users', { id: cond })))
      .toEqual({ code: '42804', message: `argument of ${keyword} must be type boolean, not type integer` });
  });

  it('add() and now alone as a where value, which run in a SELECT list', async () => {
    expect(await pgError(t.client, () => ids('users', { id: dc.add(1) })))
      .toEqual({ code: '42804', message: 'argument of WHERE must be type boolean, not type integer' });
    expect(await pgError(t.client, () => ids('users', { created_at: dc.now })))
      .toEqual({ code: '42804', message: 'argument of WHERE must be type boolean, not type timestamp with time zone' });
    expect(await sql`SELECT ${{ id: dc.add(1) }} AS v FROM ${'users'} WHERE ${{ id: 1 }}`.run(t.client)).toEqual([{ v: 2 }]);
  });

  it('a Date in add() or subtract() as an update() value, and in add() as a where value', async () => {
    const d = new Date(2025, 5, 1, 12);
    expect(await pgError(t.client, () => db.update('accounts', { opened_on: dc.add(d) }, { id: 1 }).run(t.client)))
      .toEqual({ code: '42725', message: 'operator is not unique: date + unknown' });
    expect(await pgError(t.client, () => db.update('accounts', { opened_on: dc.subtract(d) }, { id: 1 }).run(t.client)))
      .toEqual({ code: '42804', message: 'column "opened_on" is of type date but expression is of type integer' });
    const added = await pgError(t.client, () => db.update('users', { created_at: dc.add(d) }, { id: 1 }).run(t.client));
    expect(added.code).toBe('22007');
    expect(added.message).toMatch(/^invalid input syntax for type interval: "2025-06-01T12:00:00\.000[+-]\d\d:\d\d"$/);
    // a where refuses it before reading the Date
    expect(await pgError(t.client, () => ids('users', { created_at: dc.add(d) })))
      .toEqual({ code: '42804', message: 'argument of WHERE must be type boolean, not type timestamp with time zone' });
    expect(await pgError(t.client, () => db.update('users', { created_at: dc.subtract(d) }, { id: 1 }).run(t.client)))
      .toEqual({ code: '42804', message: 'column "created_at" is of type timestamp with time zone but expression is of type interval' });
  });

  it('add() as an insert() value', async () => {
    // the type refuses it too (TS2769, test/types/core.test-d.ts); here src/db is typed by the stub schema
    const q = db.insert('accounts', { owner_id: 1, balance: dc.add(1) });
    expect(q.compile().text).toMatch(/^INSERT INTO "accounts" \("balance", "owner_id"\) VALUES \("balance" \+ \$1, \$2\)/);
    expect(await pgError(t.client, () => q.run(t.client))).toEqual({ code: '42703', message: 'column "balance" does not exist' });
  });
});

describe('exists() and isInSelect() (note 006 § Replays)', () => {
  // extra.articles: (author 1, reviewer 2, 'Notes on the engine'), (author 2, no reviewer, 'Draft')
  const { exists, isInSelect, like, not, and } = dc;
  const names = async (where: db.SQL) =>
    (await db.select('users', where as any, { columns: ['display_name'], order: { by: 'id', direction: 'ASC' } }).run(t.client))
      .map(u => u.display_name);
  /** What `run()` rejects with, after checking that no query reached the client. */
  const rejectsBeforeAnyQuery = async (q: db.SQLFragment<any>) => {
    const query = vi.spyOn(t.client, 'query');
    try {
      const err = await q.run(t.client).then(() => undefined, (e: Error) => e.message);
      expect(query).not.toHaveBeenCalled();
      return err;
    } finally {
      query.mockRestore();
    }
  };

  it('users with an article whose body starts with Notes, and users with at least one article', async () => {
    expect({
      exists: await names(exists('extra.articles', { author_id: parent('id'), body: like('Notes%') }, { parent: 'users' })),
      isInSelect: await names({ id: isInSelect('extra.articles', { body: like('Notes%') }, 'author_id') }),
      existsAny: await names(exists('extra.articles', { author_id: parent('id') }, { parent: 'users' })),
      isInSelectAll: await names({ id: isInSelect('extra.articles', all, 'author_id') }),
      isInSelectEmpty: await names({ id: isInSelect('extra.articles', {}, 'author_id') }),
    }).toEqual({
      exists: ['Ada'], isInSelect: ['Ada'],
      existsAny: ['Ada', 'Bob'], isInSelectAll: ['Ada', 'Bob'], isInSelectEmpty: ['Ada', 'Bob'],
    });
  });

  it('users who manage someone: by hand, the bare name is the inner table; exists() refuses it, and an alias settles it', async () => {
    const byHand = async (text: string) => (await t.client.query(text)).rows.map(r => r.display_name);
    expect(await byHand('SELECT display_name FROM "users" WHERE EXISTS (SELECT 1 FROM "users" WHERE "manager_id" = "users"."id") ORDER BY id')).toEqual([]);
    expect(await byHand('SELECT display_name FROM "users" WHERE EXISTS (SELECT 1 FROM "public"."users" WHERE "manager_id" = "users"."id") ORDER BY id')).toEqual([]);
    const select = (where: db.SQL) => db.select('users', where as any, { columns: ['display_name'] });
    expect(new Set([
      await rejectsBeforeAnyQuery(select(exists('users', { manager_id: parent('id') }, { parent: 'users' }))),
      await rejectsBeforeAnyQuery(select(exists('public.users', { manager_id: parent('id') }, { parent: 'users' }))),
      await rejectsBeforeAnyQuery(select(exists('users', { manager_id: parent('id') }, { parent: '"users"' }))),
      await rejectsBeforeAnyQuery(select(exists('extra.articles', { author_id: parent('id') }, { parent: 'users', alias: 'users' }))),
    ])).toEqual(new Set([
      "`exists()` was given `parent: 'users'`, which names \"users\", the subquery's own name, so Postgres would read `parent()` as a column of the subquery's row: give the subquery another name with the `alias` option.",
      "`exists()` was given `parent: '\"users\"'`, which names \"users\", the subquery's own name, so Postgres would read `parent()` as a column of the subquery's row: give the subquery another name with the `alias` option.",
    ]));
    expect(await names(exists('users', { manager_id: parent('id') }, { parent: 'users', alias: 'reports' }))).toEqual(['Ada']);
    expect(await names(exists('extra.articles', { author_id: parent('id') }, { parent: 'users', alias: 'a' }))).toEqual(['Ada', 'Bob']);
  });

  it('a null alias or parent runs as without the key, as select() reads its alias (#618)', async () => {
    const
      outcome = (where: db.SQL) => names(where).catch((err: Error) => err.message),
      answering = new Proxy({}, { get: (target, k) => k === 'parent' ? 'users' : k === 'alias' ? null : Reflect.get(target, k) });
    expect({
      alias: await outcome(exists('extra.articles', { author_id: parent('id') }, { parent: 'users', alias: null } as any)),
      both: await outcome(exists('users', all, { parent: null, alias: null } as any)),
      isInSelect: await outcome({ id: isInSelect('extra.articles', all, 'author_id', { parent: null, alias: null } as any) }),
      getter: await outcome({ id: isInSelect('extra.articles', all, 'author_id', { get parent() { return null; }, get alias() { return null; } } as any) }),
      proxy: await outcome(exists('extra.articles', { author_id: parent('id') }, answering)),
      noMark: await rejectsBeforeAnyQuery(db.select('users', exists('extra.articles', { author_id: parent('id') }, { parent: null } as any))),
    }).toEqual({
      alias: ['Ada', 'Bob'], both: ['Ada', 'Bob', 'Cyd'], isInSelect: ['Ada', 'Bob'], getter: ['Ada', 'Bob'], proxy: ['Ada', 'Bob'],
      noMark: "The 'parent' table alias has no meaning here",
    });
  });

  it('an alias that is the table\'s name still writes its AS, so the where binds as the caller wrote it (#618)', async () => {
    // unaliased, the subquery's "users" would answer to "public"."users" too, and hide the outer row
    const managers = exists('users', sql`"manager_id" = "public"."users"."id"`, { alias: 'users' });
    expect({
      text: managers.compile().text,
      managers: await names(managers),
      aliasArray: await rejectsBeforeAnyQuery(db.select('users', exists('extra.articles', { author_id: parent('id') }, { parent: 'users', alias: ['users'] } as any))),
      parentArray: await rejectsBeforeAnyQuery(db.select('users', exists('extra.articles', { author_id: parent('id') }, { parent: ['users'] } as any))),
    }).toEqual({
      text: 'EXISTS (SELECT 1 FROM "users" AS "users" WHERE "manager_id" = "public"."users"."id")',
      managers: ['Ada'],
      aliasArray: "`exists()` takes its `alias` option as a string, not an array: give the subquery's name, or leave the option out.",
      parentArray: "`exists()` takes its `parent` option as a string, not an array: give the outer table's name as the outer query names it, or leave the option out.",
    });
  });

  it('names past 63 bytes: Postgres reads each as its first 63, cut at a character\'s end, so exists() refuses two that meet there', async () => {
    const r = (n: number) => 'r'.repeat(n);
    const byHand = async (outer: string, inner: string) => (await t.client.query(
      `SELECT display_name FROM "users" AS ${outer} WHERE EXISTS (SELECT 1 FROM "users" AS ${inner} WHERE "manager_id" = ${outer}."id") ORDER BY id`,
    )).rows.map(row => row.display_name);
    expect({
      within63: await byHand(`"${r(62)}a"`, `"${r(62)}b"`),
      past63: await byHand(`"${r(63)}a"`, `"${r(63)}b"`),
      past63Bytes: await byHand(`"${r(62)}é"`, `"${r(62)}è"`),
      unicodePast63: await byHand(`U&"${r(63)}\\0061"`, `"${r(63)}b"`),
    }).toEqual({ within63: ['Ada'], past63: [], past63Bytes: [], unicodePast63: [] });
    const refused = (p: string, name: string) =>
      `\`exists()\` was given \`parent: '${p}'\`, which names "${name}", the subquery's own name, so Postgres would read \`parent()\` as a column of the subquery's row: give the subquery another name with the \`alias\` option.`;
    const select = (outer: string, inner: string) => db.select('users', exists('users', { manager_id: parent('id') }, { parent: outer, alias: inner }) as any,
      { columns: ['display_name'], alias: outer, order: { by: 'id', direction: 'ASC' } });
    expect({
      within63: (await select(`${r(62)}a`, `${r(62)}b`).run(t.client)).map(u => u.display_name),
      past63: await rejectsBeforeAnyQuery(select(`${r(63)}a`, `${r(63)}b`)),
      past63Bytes: await rejectsBeforeAnyQuery(select(`${r(62)}é`, `${r(62)}è`)),
    }).toEqual({ within63: ['Ada'], past63: refused(`${r(63)}a`, r(63)), past63Bytes: refused(`${r(62)}é`, r(62)) });
  });

  it('users who review no article: not(exists()) finds them, not(isInSelect()) finds none, as a NULL reviewer_id makes NOT IN match nothing', async () => {
    expect(await names(not(exists('extra.articles', { reviewer_id: parent('id') }, { parent: 'users' })))).toEqual(['Ada', 'Cyd']);
    expect(await names({ id: not(isInSelect('extra.articles', all, 'reviewer_id')) })).toEqual([]);
  });

  it('runs the same in a sql query, deletes(), and(), extras and under any key', async () => {
    const e = () => exists('extra.articles', { author_id: parent('id') }, { parent: 'users' });
    const inSql = await sql`SELECT ${'display_name'} FROM ${'users'} WHERE ${e()} ORDER BY ${'id'}`.run(t.client);
    expect(inSql.map(u => u.display_name)).toEqual(['Ada', 'Bob']);
    expect(await names(and({ mood: 'happy' }, e()))).toEqual(['Ada']);
    expect(await names({ display_name: e() })).toEqual(['Ada', 'Bob']);
    expect(await names(e().copy())).toEqual(['Ada', 'Bob']);
    const extras = await db.select('users', all, { columns: ['display_name'], extras: { has_article: e() }, order: { by: 'id', direction: 'ASC' } }).run(t.client);
    expect(extras.map(u => [u.display_name, u.has_article])).toEqual([['Ada', true], ['Bob', true], ['Cyd', false]]);
    const deleted = await db.deletes('extra.articles', exists('users', { id: parent('reviewer_id') }, { parent: 'extra.articles' }), { returning: ['body'] }).run(t.client);
    expect(deleted.map(a => a.body)).toEqual(['Notes on the engine']);
  });

  it('in a lateral: parent() without parent rejects before any query; with parent, or uncorrelated, it runs', async () => {
    // each user's articles, with the lateral's parent() (users) and the subquery's (extra.articles) in one where
    const lateral = (sub: db.SQLFragment<any>) => db.select('users', all, {
      columns: ['display_name'], order: { by: 'id', direction: 'ASC' },
      lateral: { a: db.select('extra.articles', and({ author_id: parent('id') }, sub), { columns: ['id'] }) },
    });
    expect(await rejectsBeforeAnyQuery(lateral(exists('users', { id: parent('author_id'), manager_id: dc.isNotNull }))))
      .toBe("The 'parent' table alias has no meaning here");
    expect(await rejectsBeforeAnyQuery(db.select('users', exists('extra.articles', { author_id: parent('id') }), { columns: ['display_name'] })))
      .toBe("The 'parent' table alias has no meaning here");
    // Bob, who has a manager, wrote 'Draft'; Ada wrote the other
    const correlated = await lateral(exists('users', { id: parent('author_id'), manager_id: dc.isNotNull }, { parent: 'extra.articles' })).run(t.client);
    expect(correlated.map(u => u.a.length)).toEqual([0, 1, 0]);
    const uncorrelated = await lateral(exists('users', all)).run(t.client);
    expect(uncorrelated.map(u => u.a.length)).toEqual([1, 1, 0]);
  });

  it('a parent() column or table that does not exist is Postgres\'s error, before any row', async () => {
    expect(await pgError(t.client, () => names(exists('extra.articles', { author_id: parent('nope') }, { parent: 'users' }))))
      .toEqual({ code: '42703', message: 'column users.nope does not exist' });
    expect(await pgError(t.client, () => names(exists('extra.articles', { author_id: parent('id') }, { parent: 'nope' }))))
      .toEqual({ code: '42P01', message: 'missing FROM-clause entry for table "nope"' });
  });

  it('the name check compares names, not relations: public.users over extra.users is refused, an alias settles it', async () => {
    // note 006 § Risks: Postgres resolves "public"."users"."id" to the outer table, the bare "users"."id" to the inner one
    await t.client.query('CREATE TABLE extra.users (id int PRIMARY KEY, manager_id int); INSERT INTO extra.users VALUES (1, NULL), (2, 1)');
    expect(await rejectsBeforeAnyQuery(db.select('users', exists('extra.users' as any, { manager_id: parent('id') }, { parent: 'public.users' }))))
      .toMatch(/^`exists\(\)` was given `parent: 'public\.users'`, which names "users"/);
    expect(await names(exists('extra.users' as any, { manager_id: parent('id') }, { parent: 'public.users', alias: 'e' }))).toEqual(['Ada']);
    const byHand = async (column: string) => (await t.client.query(
      `SELECT display_name FROM public.users WHERE EXISTS (SELECT 1 FROM extra.users WHERE manager_id = ${column}) ORDER BY id`)).rows.map(r => r.display_name);
    expect({ qualified: await byHand('"public"."users"."id"'), bare: await byHand('"users"."id"') }).toEqual({ qualified: ['Ada'], bare: [] });
  });

  it('characterization: past the type, a name the inner table lacks resolves to the outer row, with no error', async () => {
    // note 006 § Risks: typed calls refuse both; extra.articles has no manager_id and no display_name
    expect(await names({ manager_id: isInSelect('extra.articles', all, 'manager_id' as any) })).toEqual(['Bob', 'Cyd']);
    expect(await names(exists('extra.articles', { author_id: parent('id'), display_name: 'Bob' } as any, { parent: 'users' }))).toEqual(['Bob']);
  });
});

describe('db.all as the value of a condition', () => {
  // 6.6.1 sent it as 'Symbol(all)', which no kind nor name equals: ne() deleted every event, not(eq()) renamed every
  // user, and a number got 22P02 (#619)
  const message = '`db.all` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`.';
  const rejectsBeforeAnyQuery = async (q: db.SQLFragment<any>) => {
    const query = vi.spyOn(t.client, 'query');
    try {
      const err = await q.run(t.client).then(() => undefined, (e: Error) => e.message);
      expect(query).not.toHaveBeenCalled();
      return err;
    } finally {
      query.mockRestore();
    }
  };

  it('rejects before any query, so deletes() and update() change no row', async () => {
    const events = await db.count('events', all).run(t.client);
    expect(events).toBeGreaterThan(0);
    expect({
      deletesNe: await rejectsBeforeAnyQuery(db.deletes('events', { kind: dc.ne(all as any) })),
      updateNotEq: await rejectsBeforeAnyQuery(db.update('users', { display_name: 'Gone' }, { display_name: dc.not(dc.eq(all as any)) })),
      updateAdd: await rejectsBeforeAnyQuery(db.update('accounts', { lifetime_ops: dc.add(all as any) }, { id: 1 })),
      selectBetween: await rejectsBeforeAnyQuery(db.select('users', { id: dc.between(1, all as any) })),
    }).toEqual({ deletesNe: message, updateNotEq: message, updateAdd: message, selectBetween: message });
    expect(await db.count('events', all).run(t.client)).toBe(events);
    expect(await db.count('users', { display_name: 'Gone' }).run(t.client)).toBe(0);
  });
});

describe('an item one array parameter cannot hold, in an array condition', () => {
  // 6.6.1 sent Default and self as '{"Symbol(DEFAULT)"}', and a wrapper, a Parameter, parent() or a fragment as its
  // JSON: under not(), update() renamed every user with tags, and an int4[] got 22P02 (#636)
  const
    sqlAdvice = 'give the value itself; for SQL, write a `sql` fragment with `db.self` in place of the condition.',
    says = (fn: string, name: string, advice = 'give a value.') =>
      [Error, undefined, `\`${fn}()\` sends its array as one parameter, so each item is a plain value, not ${name}: ${advice}`],
    rejectsBeforeAnyQuery = async (q: db.SQLFragment<any>) => {
      const query = vi.spyOn(t.client, 'query');
      try {
        const err = await q.run(t.client).then(() => undefined, (e: Error) => [e.constructor, (e as { code?: string }).code, e.message]);
        expect(query).not.toHaveBeenCalled();
        return err;
      } finally {
        query.mockRestore();
      }
    },
    any = (x: unknown) => x as any;

  it('rejects run() with a plain Error before any query, so update() and deletes() change no row', async () => {
    expect({
      updateNotDefault: await rejectsBeforeAnyQuery(db.update('users', { display_name: 'Gone' }, { tags: dc.not(dc.arrayContains([any(db.Default)])) })),
      updateNotSelf: await rejectsBeforeAnyQuery(db.update('users', { display_name: 'Gone' }, { tags: dc.not(dc.arrayOverlaps(['new', any(db.self)])) })),
      deletesRaw: await rejectsBeforeAnyQuery(db.deletes('users', { tags: dc.not(dc.arrayContainedIn([any(db.raw("'admin'"))])) })),
      selectCols: await rejectsBeforeAnyQuery(db.select('accounts', { scores: dc.arrayContains([any(db.cols(['id']))]) })),
      selectVals: await rejectsBeforeAnyQuery(db.select('accounts', { scores: dc.arrayContains([any(db.vals([1]))]) })),
      selectParamNested: await rejectsBeforeAnyQuery(db.select('accounts', { scores: dc.arrayContains<number[]>([[any(param(1))]]) })),
      selectFragment: await rejectsBeforeAnyQuery(db.select('accounts', { scores: dc.arrayContains([sql`1`]) })),
      lateralParent: await rejectsBeforeAnyQuery(db.select('users', db.all, {
        lateral: { n: db.count('accounts', { scores: dc.arrayOverlaps([parent('id')]) }) },
      })),
    }).toEqual({
      updateNotDefault: says('arrayContains', '`db.Default`'),
      updateNotSelf: says('arrayOverlaps', '`db.self`'),
      deletesRaw: says('arrayContainedIn', '`db.raw()`'),
      selectCols: says('arrayContains', '`db.cols()`'),
      selectVals: says('arrayContains', '`db.vals()`'),
      selectParamNested: says('arrayContains', '`db.param()`', sqlAdvice),
      selectFragment: says('arrayContains', 'a `sql` fragment', sqlAdvice),
      lateralParent: says('arrayOverlaps', '`db.parent()`', sqlAdvice),
    });
    expect(await db.count('users', { display_name: 'Gone' }).run(t.client)).toBe(0);
    expect(await db.count('users', all).run(t.client)).toBe(3);
  });

  it('a plain array still runs, nested in the typed form on an int4[] too', async () => {
    expect({
      tags: await ids('users', { tags: dc.arrayOverlaps(['new', 'admin']) }),
      scores: await ids('accounts', { scores: dc.arrayContains<number[]>([[1]]) }),
    }).toEqual({ tags: [1, 3], scores: [1] });
  });
});

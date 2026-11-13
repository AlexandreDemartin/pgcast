// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the types of src/db/core.ts and src/db/conditions.ts on the
// fixture schema: sql<> generics, param / parent / self, the column constraint of a
// condition. Surprises (a type that accepts what the runtime refuses, or refuses
// what it accepts) are frozen with a `characterization:` comment.

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

const c = db.conditions;
declare const pool: db.Queryable;
type Run<Q> = Q extends db.SQLFragment<infer R, any> ? R : never;

describe('sql<Interpolations, RunResult, Constraint>', () => {
  test('RunResult is what run() resolves to; rows of any by default', () => {
    const q = db.sql<db.SQL, { one: number }[]>`SELECT 1 AS one`;
    expectTypeOf(q.run).returns.resolves.toEqualTypeOf<{ one: number }[]>();
    expectTypeOf(db.sql`SELECT 1`.run(pool)).resolves.toEqualTypeOf<any[]>();
  });

  test('Interpolations limits what may be interpolated', () => {
    const q = db.sql<s.users.SQL>`SELECT ${'display_name'} FROM ${'users'} WHERE ${{ id: 1 }}`;
    expectTypeOf(q).toEqualTypeOf<db.SQLFragment<any[], never>>();
    // @ts-expect-error 'nope' is not a column of users
    db.sql<s.users.SQL>`SELECT ${'nope'} FROM ${'users'}`;
    // @ts-expect-error 'accounts' is not the users table
    db.sql<s.users.SQL>`SELECT * FROM ${'accounts'}`;
  });
});

describe('param, parent, self', () => {
  test('param carries its value type', () => {
    expectTypeOf(db.param(1)).toEqualTypeOf<db.Parameter<number>>();
    expectTypeOf(db.param('x', 'text')).toEqualTypeOf<db.Parameter<string>>();
  });

  test('parent carries its column; refuses a name that is no column at all', () => {
    expectTypeOf(db.parent('id')).toEqualTypeOf<db.ParentColumn<'id'>>();
    // @ts-expect-error 'nope' is no column of any table
    db.parent('nope');
  });

  test('characterization: parent() is not checked against the parent table', () => {
    // characterization: Column is every table's column; owner_id is not a users column,
    // sku (products) is a column of neither users nor accounts
    db.select('users', db.all, { lateral: { u: db.selectOne('accounts', { owner_id: db.parent('owner_id') }) } });
    db.select('users', db.all, { lateral: { u: db.selectOne('accounts', { owner_id: db.parent('sku') }) } });
  });

  test('self is a unique symbol', () => {
    expectTypeOf(db.self).toEqualTypeOf<db.SelfType>();
  });
});

describe('conditions: the constraint on the column', () => {
  test('a value of the column type is accepted', () => {
    db.select('users', { id: c.eq(1), display_name: c.like('A%'), mood: c.isIn(['ok', 'happy']) });
    db.select('users', { manager_id: c.isNull, id: c.or(c.eq(1), c.eq(2)) });
    db.select('accounts', { opened_on: c.gt(new Date()), lifetime_ops: c.gte(BigInt(1)) });
    db.update('accounts', { balance: c.add(1) }, { id: 1 });
  });

  test('a value of another type is refused', () => {
    // @ts-expect-error '1' is not a number (users.id)
    db.select('users', { id: c.eq('1') });
    // @ts-expect-error like() on an int column
    db.select('users', { id: c.like('A%') });
    // @ts-expect-error isIn of strings on an int column
    db.select('users', { id: c.isIn(['1']) });
    // @ts-expect-error 'angry' is not a mood
    db.select('users', { mood: c.eq('angry') });
    // @ts-expect-error eq(null) would compile to `= NULL`: isNull is needed
    db.select('users', { manager_id: c.eq(null) });
  });
});

describe('type surprises', () => {
  test('a Parameter in a Whereable is accepted, of the column type', () => {
    // compiled as it is (test/integration/core.test.ts, "a Parameter value is a parameter, with its cast")
    db.select('users', { id: db.param(1) });
    db.select('users', { display_name: db.param('Ada', 'text') });
    db.select('users', { id: c.isIn([db.param(1), 2]) });
    // @ts-expect-error Parameter<string> on an int column
    db.select('users', { id: db.param('1') });
    // @ts-expect-error Parameter<string> in isIn on an int column
    db.select('users', { id: c.isIn([db.param('1')]) });
    // @ts-expect-error Default has no meaning in a filter (it throws at run time)
    db.select('users', { id: db.Default });
    // @ts-expect-error Default in isIn
    db.select('users', { id: c.isIn([db.Default]) });
  });

  test('raw(), cols(x) and vals(x) are refused as a value where a Parameter<T> stands, filters and writes', () => {
    // each throws in a filter (test/integration/core.test.ts, "raw(), cols(x) and vals(x) as a filter value reject
    // run()"); as insert() and update() values too, where 6.6.1 sent them as JSON (#259)
    // @ts-expect-error raw() is no Parameter<string>: in a Whereable
    db.select('users', { display_name: db.raw("'Ada'") });
    // @ts-expect-error nor Parameter<JSONValue>, on jsonb
    db.select('users', { settings: db.raw(`'{"theme": "dark"}'`) });
    // @ts-expect-error in isIn
    db.select('users', { display_name: c.isIn([db.raw("'Ada'")]) });
    // @ts-expect-error in isNotIn
    db.select('users', { display_name: c.isNotIn([db.raw("'Ada'")]) });
    // @ts-expect-error in eq
    db.select('users', { display_name: c.eq(db.raw("'Ada'")) });
    // @ts-expect-error in the where of update
    db.update('users', { mood: 'ok' }, { display_name: db.raw("'Ada'") });
    // @ts-expect-error in a Whereable written apart
    const where: s.users.Whereable = { display_name: db.raw("'Ada'") };
    // @ts-expect-error cols(x) is no Parameter<T>: on text
    db.select('users', { display_name: db.cols('Ada') });
    // @ts-expect-error vals(x) neither
    db.select('users', { display_name: db.vals('Ada') });
    // @ts-expect-error in isIn
    db.select('users', { display_name: c.isIn([db.cols('Ada'), db.vals('Ada')]) });
    // @ts-expect-error in eq
    db.select('users', { display_name: c.eq(db.cols('Ada')) });
    // @ts-expect-error cols(x) on an array column
    db.select('users', { tags: db.cols(['admin']) });
    // @ts-expect-error vals(x) on an array column
    db.select('users', { tags: db.vals(['admin']) });
    // @ts-expect-error vals(x) on an int column
    db.select('users', { id: db.vals(1) });
    // @ts-expect-error cols(x) on an int column
    db.select('users', { id: db.cols(1) });
    // @ts-expect-error in isIn, on an int column
    db.select('users', { id: c.isIn([db.vals(1)]) });
    // @ts-expect-error in eq, on an int column
    db.select('users', { id: c.eq(db.vals(1)) });
    // @ts-expect-error cols(x) on an enum column
    db.select('users', { mood: db.cols('ok') });
    // @ts-expect-error in isIn, on an enum column
    db.select('users', { mood: c.isIn([db.cols('ok')]) });
    // @ts-expect-error vals(x) in eq, on an enum column
    db.select('users', { mood: c.eq(db.vals('ok')) });
    // @ts-expect-error raw() on an int column
    db.select('users', { id: db.raw('1') });
    // @ts-expect-error raw() on an enum column
    db.select('users', { mood: db.raw("'ok'") });
    // @ts-expect-error raw() in isIn, on an int column
    db.select('users', { id: c.isIn([db.raw('1')]) });
    // @ts-expect-error as an insert() value
    db.insert('users', { email: 'a@b', display_name: db.raw("'A'") });
    // @ts-expect-error as an update() value
    db.update('users', { display_name: db.raw('upper(display_name)') }, { id: 1 });
    // @ts-expect-error as an upsert() value
    db.upsert('users', { email: 'a@b', display_name: db.cols('A') }, 'email');
    expectTypeOf(where).not.toBeAny();
  });

  test('a Parameter, a plain { value } and a sql fragment with raw() are still accepted as values', () => {
    // a plain { value } object is a value, sent as JSON (test/unit/core.test.ts)
    expectTypeOf(db.select('users', { display_name: db.param('Ada') }).run(pool)).not.toBeAny();
    db.select('users', { display_name: db.param('Ada', 'text') });
    db.select('users', { display_name: c.eq(db.param('Ada')) });
    db.select('users', { display_name: c.isIn([db.param('Ada'), 'Bob']) });
    db.select('users', { display_name: { value: 'Ada' } });
    db.select('users', { settings: { value: 'Ada' } });
    db.select('users', { display_name: db.sql`${db.self} = ${db.raw("'Ada'")}` });
    db.insert('users', { email: 'a@b', display_name: db.param('A') });
    db.insert('users', { email: 'a@b', display_name: db.sql`${db.raw("'A'")}` });
    expectTypeOf(db.param('Ada')).toEqualTypeOf<db.Parameter<string>>();
  });

  test('DangerousRawString, ColumnNames and ColumnValues match neither a plain { value } nor each other', () => {
    // Parameter still matches a plain { value } (above)
    // @ts-expect-error a plain { value } is no DangerousRawString
    const r: db.DangerousRawString = { value: 'x' };
    // @ts-expect-error a ColumnValues is no ColumnNames
    const n: db.ColumnNames<string[]> = db.vals(['a']);
    // @ts-expect-error a ColumnNames is no ColumnValues
    const v: db.ColumnValues<string[]> = db.cols(['a']);
    // @ts-expect-error a ColumnNames is no DangerousRawString
    const x: db.DangerousRawString = db.cols('x');
    const p: db.Parameter<string> = { value: 'x' };
    expectTypeOf([r, n, v, x, p]).not.toBeAny();
  });

  test('cols(x) and vals(x) are refused where a ParentColumn stands, parent() and param(x) still accepted', () => {
    // ParentColumn is all-optional ({ value?: Column }): cols(x) and vals(x) of a column name, or of undefined, fit it
    // without its tag; each throws at run time (test/integration/core.test.ts, "raw(), cols(x) and vals(x) as a filter
    // value reject run()")
    // @ts-expect-error cols(x) is no ParentColumn: in eq()
    db.select('users', { id: c.eq(db.cols('id')) });
    // @ts-expect-error vals(x) is no ParentColumn: in isIn()
    db.select('users', { id: c.isIn([db.vals('email')]) });
    // @ts-expect-error vals(undefined) is no ParentColumn: in a Whereable
    db.select('users', { display_name: db.vals(undefined) });
    // @ts-expect-error cols(undefined) neither
    db.select('users', { display_name: db.cols(undefined) });
    // @ts-expect-error cols(x) in isNotIn()
    db.select('users', { id: c.isNotIn([db.cols('id')]) });
    // @ts-expect-error vals(undefined) in ne()
    db.select('users', { id: c.ne(db.vals(undefined)) });
    // @ts-expect-error vals(undefined) in a lateral subquery
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: db.vals(undefined) }) } });
    // @ts-expect-error vals(undefined) as the ParentColumn of arrayContains()
    db.select('accounts', { scores: c.arrayContains(db.vals(undefined)) });
    // @ts-expect-error cols(undefined) as the ParentColumn of arrayOverlaps()
    db.select('accounts', { scores: c.arrayOverlaps(db.cols(undefined)) });
    // @ts-expect-error a ColumnNames is no ParentColumn
    const n: db.ParentColumn = db.cols('id' as const);
    db.select('users', { id: db.parent('id'), display_name: db.parent() });
    db.select('users', { id: c.eq(db.parent('id')), email: c.isIn([db.parent('email'), 'a@b']) });
    db.select('users', { id: c.isNotIn([db.parent('id'), db.param(2)]) });
    db.select('users', { id: db.param(1), email: c.eq(db.param('a@b')), mood: c.isIn([db.param('ok' as const)]) });
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: db.parent('id') }) } });
    db.select('accounts', { scores: c.arrayContains(db.parent('scores')) });
    const p: db.ParentColumn = db.parent('id');
    const q: db.ParentColumn = db.param('id' as const);
    expectTypeOf([n, p, q]).not.toBeAny();
  });

  test('cols(x) and vals(x) of any value are still accepted in a sql template', () => {
    // a Parameter<any> accepted them before the tag that refuses them as values
    const ids: readonly number[] = [1, 2];
    db.sql<s.users.SQL>`SELECT ${db.cols(['id', 'email'])} FROM ${'users'} WHERE ${'id'} IN (${db.vals([1, 2])})`;
    db.sql`SELECT * FROM ${'users'} WHERE ${'id'} IN (${db.vals(ids)})`;
    db.sql`INSERT INTO ${'users'} (${db.cols({ email: 'a@b' })}) VALUES (${db.vals({ email: 'a@b' })})`;
  });

  test('characterization: vals({…}) of a sql template takes raw(), cols(x), vals(x) and parent() as values', () => {
    // a ColumnValues of any value is a GenericSQLExpression; compiling throws on each, but parent() in a nested
    // query (test/integration/core.test.ts, "in vals({…}) of a sql template of its own reject run()")
    const row = { email: 'a@b', display_name: db.raw("upper('a')"), tags: db.cols(['t']), settings: db.vals({}), mood: db.parent('mood') };
    db.sql<s.users.SQL>`INSERT INTO ${'users'} (${db.cols(row)}) VALUES (${db.vals(row)})`;
  });

  test('updateValues takes raw(), cols(x) and vals(x) where 6.6.1 took them, and keeps the type of param(x)', () => {
    // compiled as in a sql template (test/integration/core.test.ts, "raw() in a fragment value, or in the updateValues
    // of upsert, is SQL"); each where 6.6.1 took it as the column's Parameter<V>: raw() if V takes a string, cols(x)
    // and vals(x) of V
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { display_name: db.raw(`"users"."display_name" || '!'`), settings: db.raw(`'{}'`), tags: db.cols(['users.tags']) } });
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.vals(1), mood: db.vals('ok'), created_at: db.vals('2020-01-01T12:00:00Z') } });
    // param(x) keeps its literal type, as in 6.6.1: a wider member would widen it to string
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { mood: db.param('ok'), created_at: db.param('2020-01-01T12:00:00Z') } });
    db.upsert('accounts', {} as s.accounts.Insertable, 'id', { updateValues: { opened_on: db.param('2020-01-01'), lifetime_ops: db.param('1') } });
    // kept for compatibility: 6.6.1 accepted vals(x) of V, though it compiles to the values of x
    // (here `1`), not to x
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { settings: db.vals({ a: 1 }) } });
    // @ts-expect-error vals(x) of another type, refused by 6.6.1 too
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.vals('nonsense') } });
    // @ts-expect-error vals(null), refused by 6.6.1 too: it throws while compiling
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.vals(null) } });
    // @ts-expect-error vals() of a fragment, refused by 6.6.1 too: the fragment's fields become parameters
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { created_at: db.vals(db.sql`now()`) } });
    // @ts-expect-error vals() of a Parameter, refused by 6.6.1 too: its fields become parameters
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.vals(db.param(1)) } });
    // @ts-expect-error vals(Default), refused by 6.6.1 too: it compiles to `ROW(…, )`
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { created_at: db.vals(db.Default) } });
    // @ts-expect-error raw() on an int column, refused by 6.6.1 too
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.raw('"users"."manager_id"') } });
    // @ts-expect-error cols(x) of another type
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.cols(['users.manager_id']) } });
    // @ts-expect-error still the columns of the table
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { nope: db.raw('1') } });
  });

  test('parent() is accepted in isIn and isNotIn', () => {
    // isIn<T> takes T = ParentColumn<'id'>, which a Whereable value accepts; the runtime compiles it to the
    // parent column (test/integration/core.test.ts, "parent() in isIn and isNotIn is the parent column in a lateral")
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: c.isIn([db.parent('id')]) }) } });
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: c.isNotIn([db.parent('id'), 2]) }) } });
  });

  test('characterization: parent() as a value, in eq() or in isIn, is accepted outside a lateral', () => {
    // characterization: the type does not know whether there is a parent query; outside one, the runtime throws
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: db.parent('id') }) } });
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: c.eq(db.parent('id')) }) } });
    db.select('users', { id: db.parent('id') });
    db.select('users', { id: c.eq(db.parent('id')) });
    db.select('users', { id: c.isIn([db.parent('id')]) });
  });

  test('self as a value, and Default in a condition, are refused', () => {
    // the runtime throws on each while compiling (#106); 6.6.1 sent them as strings, 'Symbol(self)' and 'Symbol(DEFAULT)'
    // @ts-expect-error self is no value of the column
    db.select('users', { display_name: db.self });
    // @ts-expect-error nor in isIn
    db.select('users', { display_name: c.isIn([db.self]) });
    // @ts-expect-error nor in eq
    db.select('users', { display_name: c.eq(db.self) });
    // @ts-expect-error Default has no meaning in a filter, in eq() too
    db.select('users', { display_name: c.eq(db.Default) });
    // @ts-expect-error nor in ne(), on an int column
    db.select('users', { id: c.ne(db.Default) });
  });

  test('updateValues takes a plain value of the column, sent as a parameter', () => {
    // (test/integration/shortcuts.test.ts, "updateValues: a plain value is stored as it is")
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { display_name: 'x', mood: 'happy', manager_id: null } });
    // @ts-expect-error a number is not text (display_name)
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { display_name: 1 } });
    // @ts-expect-error 'glad' is not a mood
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { mood: 'glad' } });
  });

  test('add() and subtract() take a Parameter of a number or a Date, its type as the constraint', () => {
    // compiled as it is, `"col" + CAST($1 AS "int4")` (test/unit/conditions.test.ts, "add and subtract a Parameter")
    expectTypeOf(c.add(db.param(3))).toEqualTypeOf<db.SQLFragment<number, number>>();
    expectTypeOf(c.subtract(db.param(3, 'int4'))).toEqualTypeOf<db.SQLFragment<number, number>>();
    expectTypeOf(c.subtract(db.param(new Date()))).toEqualTypeOf<db.SQLFragment<number, Date>>();
    expectTypeOf(c.add(db.param(3))).not.toBeAny();
    expectTypeOf([db.param(1)].map(c.add)).toEqualTypeOf<db.SQLFragment<number, number>[]>();
    db.update('accounts', { balance: c.add(db.param(10, 'numeric')), lifetime_ops: c.subtract(db.param(1)) }, { id: 1 });
    db.update('accounts', { opened_on: c.subtract(db.param(new Date())) }, { id: 1 });
    // @ts-expect-error Parameter<string> is not a number nor a Date
    c.add(db.param('3'));
    // @ts-expect-error Parameter<string | number> neither
    c.subtract(db.param(3 as number | string));
    // @ts-expect-error a number on a text column
    db.update('users', { display_name: c.add(db.param(1, 'int4')) }, { id: 1 });
    // @ts-expect-error a number on an enum column
    db.update('users', { mood: c.add(db.param(1)) }, { id: 1 });
    // @ts-expect-error a number on a date column, as add(3): the constraint is the Parameter's type
    db.update('events', { occurred_on: c.add(db.param(3, 'int4')) }, { kind: 'signup' });
  });

  test('add() and subtract() infer as in 6.6.1 for a value that is not a Parameter', () => {
    const inc = <N extends number>(n: N) => c.add(n);
    const n: number = 5;
    expectTypeOf(c.add(1)).toEqualTypeOf<db.SQLFragment<number, 1>>();
    expectTypeOf(c.add(n)).toEqualTypeOf<db.SQLFragment<number, number>>();
    expectTypeOf(c.subtract(new Date() as number | Date)).toEqualTypeOf<db.SQLFragment<number, number | Date>>();
    expectTypeOf(inc(3)).toEqualTypeOf<db.SQLFragment<number, 3>>();
    expectTypeOf([1, 2].map(c.add)).toEqualTypeOf<db.SQLFragment<number, number>[]>();
    expectTypeOf(c.add<1 | 2>(1)).toEqualTypeOf<db.SQLFragment<number, 1 | 2>>();
    // @ts-expect-error a number on a date column (42725 in Postgres: date + unknown)
    db.update('events', { occurred_on: c.add(3) }, { kind: 'signup' });
    // @ts-expect-error a string is not a number nor a Date
    c.add('1');
  });

  test('a sql fragment adds a cast Parameter to a date column', () => {
    // run in test/integration/conditions.test.ts, "add a number of days to a date with a cast Parameter"
    db.update('events', { occurred_on: db.sql`${db.self} + ${db.param(3, 'int4')}` }, { kind: 'signup' });
  });

  test('characterization: array conditions are typed on the element, not on the column', () => {
    // characterization: arrayContains<T>(a: T[] | ParentColumn) gives Constraint T = number; scores wants number[]
    // @ts-expect-error valid at run time ("scores" @> '{1}'), refused by the type
    db.select('accounts', { scores: c.arrayContains([1]) });
    // @ts-expect-error same for arrayContainedIn
    db.select('accounts', { scores: c.arrayContainedIn([1]) });
    // @ts-expect-error same for arrayOverlaps
    db.select('accounts', { scores: c.arrayOverlaps([1]) });
    // the workaround types the argument as an array of arrays
    db.select('accounts', { scores: c.arrayContains<number[]>([[1]]) });
  });

  test('characterization: an inline sql`${self} …` in a Whereable is refused', () => {
    // characterization: inferred from the context before T is fixed, Constraint takes the
    // union of every table's `id` type; a fragment declared first, or sql<db.SQL>, passes
    // @ts-expect-error valid at run time
    db.select('users', { id: db.sql`${db.self} = 1` });
    const frag = db.sql`${db.self} = 1`;
    db.select('users', { id: frag });
    db.select('users', { id: db.sql<db.SQL>`${db.self} = 1` });
  });

  test('characterization: columns as a readonly tuple gives never[]', () => {
    // characterization: ReturningTypeForTable tests `C extends ColumnForTable<T>[]`, which a readonly array is not
    const q = db.select('accounts', db.all, { columns: ['id'] as const });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<never[]>();
  });

  test('characterization: a passthru lateral is refused after columns or extras', () => {
    // characterization: LateralOption limits lateral to an object once columns or extras is set
    // @ts-expect-error at run time, columns is dropped
    db.select('accounts', db.all, { columns: ['id'], lateral: db.count('users', db.all) });
    // @ts-expect-error at run time, extras is dropped
    db.select('accounts', db.all, { extras: { b: 'balance' }, lateral: db.count('users', db.all) });
  });

  test('characterization: an untyped sql`` lateral is `any`', () => {
    // characterization: without RunResult, the lateral key is `any` and no error is reported
    const q = db.select('users', db.all, { lateral: { x: db.sql`SELECT 1 AS result` } });
    expectTypeOf<Run<typeof q>[number]['x']>().toBeAny();
  });
});

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
    // run()"); as insert() and update() values 6.6.1 sent them as JSON too (#132)
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
    // @ts-expect-error on an array column
    db.select('users', { tags: db.vals(['admin']) });
    // @ts-expect-error on an int column
    db.select('users', { id: db.vals(1) });
    // @ts-expect-error in isIn, on an int column
    db.select('users', { id: c.isIn([db.vals(1)]) });
    // @ts-expect-error in eq, on an int column
    db.select('users', { id: c.eq(db.vals(1)) });
    // @ts-expect-error in isIn, on an enum column
    db.select('users', { mood: c.isIn([db.cols('ok')]) });
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

  test('cols(x) and vals(x) of any value are still accepted in a sql template', () => {
    // a Parameter<any> accepted them before the tag that refuses them as values
    const ids: readonly number[] = [1, 2];
    db.sql<s.users.SQL>`SELECT ${db.cols(['id', 'email'])} FROM ${'users'} WHERE ${'id'} IN (${db.vals([1, 2])})`;
    db.sql`SELECT * FROM ${'users'} WHERE ${'id'} IN (${db.vals(ids)})`;
    db.sql`INSERT INTO ${'users'} (${db.cols({ email: 'a@b' })}) VALUES (${db.vals({ email: 'a@b' })})`;
  });

  test('updateValues takes raw(), cols(x) and vals(x) on any column, compiled as SQL', () => {
    // as in 6.6.1, which took raw() only on a text or jsonb column (test/integration/core.test.ts, "raw() in a
    // fragment value, or in the updateValues of upsert, is SQL")
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { display_name: db.raw(`"users"."display_name" || '!'`) } });
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.raw('"users"."manager_id"'), tags: db.cols(['users.tags']) } });
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { settings: db.vals({ a: 1 }) } });
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

  test('characterization: add() and subtract() refuse a Parameter, which the runtime accepts', () => {
    // characterization: add<T extends number | Date>; conditionalParam() passes a Parameter through
    // @ts-expect-error Parameter<number> is not number | Date (add)
    c.add(db.param(1));
    // @ts-expect-error Parameter<number> is not number | Date (subtract)
    c.subtract(db.param(1));
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

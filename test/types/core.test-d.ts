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

  test('cols and vals keep the type of 6.6.1: a generic helper compiles; a string type-checks, and throws at run time', () => {
    // narrowing to `T extends object` would refuse the helper and `unknown`, which run when given an object (#244)
    const insertRow = <T>(row: T) => db.sql`INSERT INTO ${'users'} (${db.cols(row)}) VALUES (${db.vals(row)})`;
    expectTypeOf(insertRow({ display_name: 'Ada' })).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.cols({ id: 1 } as unknown)).toEqualTypeOf<db.ColumnNames<unknown>>();
    expectTypeOf(db.cols('id')).toEqualTypeOf<db.ColumnNames<string>>();
    expectTypeOf(db.vals('id')).toEqualTypeOf<db.ColumnValues<string>>();
    expectTypeOf(db.vals('id')).not.toBeAny();
  });
});

describe('conditions: the constraint on the column', () => {
  test('a value of the column type is accepted', () => {
    db.select('users', { id: c.eq(1), display_name: c.like('A%'), mood: c.isIn(['ok', 'happy']) });
    db.select('users', { manager_id: c.isNull, id: c.or(c.eq(1), c.eq(2)) });
    db.select('accounts', { opened_on: c.gt(new Date()), lifetime_ops: c.gte(BigInt(1)) });
    db.update('accounts', { balance: c.add(1) }, { id: 1 });
    const ids: readonly number[] = [1, 2];
    db.deletes('users', { id: c.isNotIn(ids) });
  });

  test('a value of another type is refused', () => {
    // @ts-expect-error '1' is not a number (users.id)
    db.select('users', { id: c.eq('1') });
    // @ts-expect-error like() on an int column
    db.select('users', { id: c.like('A%') });
    // @ts-expect-error isIn of strings on an int column
    db.select('users', { id: c.isIn(['1']) });
    // @ts-expect-error a Set is no array (it throws at run time, #235)
    db.select('users', { id: c.isIn(new Set([1])) });
    // @ts-expect-error nor is a typed array
    db.deletes('users', { id: c.isNotIn(new Uint8Array([1])) });
    // @ts-expect-error nor an iterator
    db.deletes('users', { id: c.isNotIn(new Map([[1, 'a']]).keys()) });
    // @ts-expect-error nor an array-like object
    db.deletes('users', { id: c.isNotIn({ length: 1, 0: 1 }) });
    // @ts-expect-error nor a string
    db.select('users', { display_name: c.isIn('Ada') });
    // @ts-expect-error 'angry' is not a mood
    db.select('users', { mood: c.eq('angry') });
    // @ts-expect-error eq(null) would compile to `= NULL`: isNull is needed
    db.select('users', { manager_id: c.eq(null) });
  });

  test('isDistinctFrom() and isNotDistinctFrom() take a nullable value (#181)', () => {
    const nullableNum = 1 as number | null, nullableMood = 'ok' as s.mood | null, mood = 'ok' as s.mood;
    db.select('users', { manager_id: c.isNotDistinctFrom(nullableNum), mood: c.isDistinctFrom(nullableMood) });
    db.select('users', { id: c.isDistinctFrom(nullableNum), display_name: c.isNotDistinctFrom(null) });
    db.sql<s.users.SQL>`SELECT * FROM ${'users'} WHERE ${{ manager_id: c.isNotDistinctFrom(nullableNum) }}`;
    // `null` leaves the constraint, nothing else: a value without `null` keeps the type Zapatos 6.6.1 inferred
    expectTypeOf(c.isNotDistinctFrom(nullableNum)).toEqualTypeOf<db.SQLFragment<boolean, number>>();
    expectTypeOf(c.isDistinctFrom(null)).toEqualTypeOf<db.SQLFragment<boolean, never>>();
    expectTypeOf(c.isDistinctFrom(mood)).toEqualTypeOf<db.SQLFragment<boolean, s.mood>>();
    expectTypeOf(c.isNotDistinctFrom(1)).toEqualTypeOf<db.SQLFragment<boolean, number>>();
    expectTypeOf(c.isDistinctFrom('a')).toEqualTypeOf<db.SQLFragment<boolean, string>>();
  });

  test('isDistinctFrom() and isNotDistinctFrom() still refuse undefined and a value of another type', () => {
    const nullableNum = 1 as number | null, maybeNum = 1 as number | undefined, nullableStr = 'a' as string | null;
    const nullableBadMood = 'angry' as 'angry' | null;
    // @ts-expect-error undefined is not a SQL value
    db.select('users', { manager_id: c.isNotDistinctFrom(undefined) });
    // @ts-expect-error nor is a value that may be undefined
    db.select('users', { manager_id: c.isDistinctFrom(maybeNum) });
    // @ts-expect-error a nullable string on an int column (users.id)
    db.select('users', { id: c.isNotDistinctFrom(nullableStr) });
    // @ts-expect-error 'angry' is not a mood, nullable or not
    db.select('users', { mood: c.isDistinctFrom(nullableBadMood) });
    // @ts-expect-error eq() of a nullable value would compile to `= NULL` when it holds null
    db.select('users', { manager_id: c.eq(nullableNum) });
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

  test('characterization: a Parameter is checked by its shape, so an object with a value key passes as one (#274)', () => {
    // characterization: as in 6.6.1, sent as one parameter, as JSON ([{"value":3}], test/unit/shortcuts.test.ts),
    // which a numeric column refuses (22P02); a value object with toPostgres() is sent through it, which works
    class UserId { constructor(public value: number) { } toPostgres() { return String(this.value); } }
    class Stamp<T> extends db.Parameter<T> { }
    const typed: db.Parameter<number> = db.param(3);
    const plain: db.Parameter<number> = { value: 3 };
    db.update('accounts', { balance: db.param(3) }, { id: 1 });
    db.update('accounts', { balance: new db.Parameter(3) }, { id: 1 });
    db.update('accounts', { balance: typed }, { id: 1 });
    db.update('accounts', { balance: new Stamp(3) }, { id: 1 });
    db.update('accounts', { balance: { value: 3 } }, { id: 1 });
    db.update('accounts', { balance: plain }, { id: 1 });
    db.insert('users', { email: 'a@b', display_name: { value: 'Ada' } });
    db.select('users', { manager_id: new UserId(1) });
    db.update('users', { manager_id: new UserId(1) }, { id: 1 });
    // a ParentColumn is checked by its shape too ({ value?: Column }): a column name passes on an int column
    db.select('users', { manager_id: { value: 'email' } });
    // @ts-expect-error the value is still checked: a string that names no column, on an int column
    db.select('users', { manager_id: { value: 'x' } });
    // @ts-expect-error nor a Parameter<number> on a text column
    db.update('users', { display_name: { value: 3 } }, { id: 1 });
    expectTypeOf(db.update('accounts', { balance: { value: 3 } }, { id: 1 }).run(pool)).not.toBeAny();
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

  test('characterization: a template typed by table checks neither the names of cols() nor the keys of vals(), as in 6.6.1; a typed value does (#216)', () => {
    // characterization: Postgres refuses these (42703); each check tried in the template refused code that compiles
    // under 6.6.1: the right cols(['email', 'display_name']), inferred as string[], and generic forwarders; or, with
    // cols<const T>, what cols() and vals() return (`let c = cols(['a']); c = cols(['b'])`, `.value.push()`)
    db.sql<s.users.SQL>`SELECT ${db.cols(['email', 'emial'])} FROM ${'users'}`;
    db.sql<s.users.SQL>`INSERT INTO ${'users'} (${db.cols({ emial: 'a' })}) VALUES (${db.vals({ emial: 'a' })})`;
    const forward = <T>(row: T) => db.sql<s.users.SQL>`INSERT INTO ${'users'} (${db.cols(row)}) VALUES (${db.vals(row)})`;
    expectTypeOf(forward({ emial: 'a' })).toEqualTypeOf<db.SQLFragment<any[], never>>();
    // @ts-expect-error a name interpolated on its own is checked
    db.sql<s.users.SQL>`SELECT ${'emial'} FROM ${'users'}`;
    // @ts-expect-error so is a Whereable written in place
    db.sql<s.users.SQL>`SELECT * FROM ${'users'} WHERE ${{ emial: 'a' }}`;
    // @ts-expect-error a type argument checks the names of cols()
    db.cols<s.users.Column[]>(['email', 'emial']);
    // @ts-expect-error so does satisfies
    db.cols(['email', 'emial'] satisfies s.users.Column[]);
    // @ts-expect-error and the keys of vals()
    db.vals<s.users.Updatable>({ email: 'a', emial: 'a' });
    // @ts-expect-error Updatable leaves out the GENERATED ALWAYS id
    db.vals<s.users.Updatable>({ id: 1 });
    // characterization: in an object held in a variable, the type argument lets an extra key through, since
    // TypeScript refuses one only in an object written in place
    const loose = { email: 'a', emial: 'a' };
    db.vals<s.users.Updatable>(loose);
    const wrongOnly = { emial: 'a' };
    // @ts-expect-error but a held object with no key of the table, or a wrong value type, is still refused
    db.vals<s.users.Updatable>(wrongOnly);
    const wrongType = { manager_id: 'a' };
    // @ts-expect-error manager_id is a number
    db.vals<s.users.Updatable>(wrongType);
    // the right names pass each typed form
    db.sql<s.users.SQL>`SELECT ${db.cols<s.users.Column[]>(['id', 'email'])} FROM ${'users'}`;
    db.cols(['id', 'email'] satisfies s.users.Column[]);
    db.vals<s.users.Updatable>({ email: 'a' });
    db.vals({ email: 'a', display_name: 'A' } satisfies s.users.Updatable);
    // an array held in a variable is a string[], refused by Column[]: type the variable, readonly …[] for a readonly one
    const names = ['id', 'email'];
    // @ts-expect-error names is a string[]
    db.cols<s.users.Column[]>(names);
    const typedNames: s.users.Column[] = ['id', 'email'];
    db.cols<s.users.Column[]>(typedNames);
    const readonlyNames: readonly s.users.Column[] = ['id', 'email'];
    // @ts-expect-error a readonly array is no Column[]
    db.cols<s.users.Column[]>(readonlyNames);
    db.cols<readonly s.users.Column[]>(readonlyNames);
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
    // and vals(x) of V, but for a primitive x (#503)
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { display_name: db.raw(`"users"."display_name" || '!'`), settings: db.raw(`'{}'`), tags: db.cols(['users.tags']) } });
    // vals() of a primitive always threw while compiling since #244, so the type refuses it (#503): here a number,
    // an enum label and a timestamp string, which 6.6.1 took
    // @ts-expect-error vals() of a number
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { manager_id: db.vals(1) } });
    // @ts-expect-error vals() of an enum label
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { mood: db.vals('ok') } });
    // @ts-expect-error vals() of a timestamp string
    db.upsert('users', { email: 'a@b', display_name: 'A' }, 'email', { updateValues: { created_at: db.vals('2020-01-01T12:00:00Z') } });
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

  test('characterization: add() and subtract() refuse a Parameter, which the runtime accepts', () => {
    // characterization: add<T extends number | Date>; conditionalParam() passes a Parameter through
    // @ts-expect-error Parameter<number> is not number | Date (add)
    c.add(db.param(1));
    // @ts-expect-error Parameter<number> is not number | Date (subtract)
    c.subtract(db.param(1));
  });

  test('characterization: conditions that type-check where Postgres refuses them, as in 6.6.1 (#180)', () => {
    // documented, not refused: each narrower type tried refused code that runs (#180)
    // the six boolean tests have no constraint: on an int column, 42804
    expectTypeOf(db.select('users', { id: c.isTrue })).not.toBeAny();
    expectTypeOf(db.select('users', { id: c.isNotTrue })).not.toBeAny();
    expectTypeOf(db.select('users', { id: c.isFalse })).not.toBeAny();
    expectTypeOf(db.select('users', { id: c.isNotFalse })).not.toBeAny();
    expectTypeOf(db.select('users', { id: c.isUnknown })).not.toBeAny();
    expectTypeOf(db.select('users', { id: c.isNotUnknown })).not.toBeAny();
    expectTypeOf(c.isTrue).toEqualTypeOf<db.SQLFragment<boolean, never>>();
    // a SQLFragment<any> holding one, on a boolean column, runs: a constraint of boolean would refuse it
    const cond: db.SQLFragment<any> = c.isTrue;
    expectTypeOf(db.select('extra.type_zoo', { c_bool: cond })).not.toBeAny();
    // add() and now alone as a where value: 42804 in a WHERE, but the same Whereable runs in a SELECT list
    expectTypeOf(db.select('users', { id: c.add(1) })).not.toBeAny();
    expectTypeOf(db.select('users', { created_at: c.now })).not.toBeAny();
    db.sql<s.users.SQL>`SELECT ${{ id: c.add(1) }} FROM ${'users'}`;
    expectTypeOf(c.now).toEqualTypeOf<db.SQLFragment<any[], never>>();
    // a Date in add() or subtract() as an update() value: 42725 or 22007, and 42804
    expectTypeOf(db.update('accounts', { opened_on: c.add(new Date()) }, { id: 1 })).not.toBeAny();
    expectTypeOf(db.update('accounts', { opened_on: c.subtract(new Date()) }, { id: 1 })).not.toBeAny();
    expectTypeOf(db.update('users', { created_at: c.add(new Date()) }, { id: 1 })).not.toBeAny();
    expectTypeOf(db.update('users', { created_at: c.subtract(new Date()) }, { id: 1 })).not.toBeAny();
    expectTypeOf(c.add(new Date())).toEqualTypeOf<db.SQLFragment<number, Date>>();
    expectTypeOf(c.subtract(new Date())).toEqualTypeOf<db.SQLFragment<number, Date>>();
  });

  test('add() and the boolean tests are refused as insert() values, which Postgres refuses too (42703); now is accepted', () => {
    // Insertable takes a SQLFragment with no constraint and rows as its RunResult: add() has a constraint and a
    // non-rows RunResult; a boolean test has a non-rows RunResult
    // @ts-expect-error add() as an insert() value ("balance" + $1 in VALUES)
    db.insert('accounts', { owner_id: 1, balance: c.add(1) });
    // @ts-expect-error isTrue as an insert() value
    db.insert('extra.type_zoo', { c_bool: c.isTrue });
    expectTypeOf(db.insert('users', { email: 'a@b', display_name: 'A', created_at: c.now })).not.toBeAny();
  });

  test('array conditions are typed on the element, not on the column', () => {
    // documented (R34, #40): arrayContains<T>(a: T[] | ParentColumn) gives Constraint T = number; scores wants number[].
    // Every type tried on the column broke code that compiles under 6.6.1 (a mock written to its signature, `.map()`)
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

  test('columns as a readonly tuple types the result as a mutable array does', () => {
    const q = db.select('accounts', db.all, { columns: ['id'] as const });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<Pick<s.accounts.JSONSelectable, 'id'>[]>();
    expectTypeOf<Run<typeof q>>().items.not.toBeNever();
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

declare const row: s.transfers.Selectable;
declare const jrow: s.transfers.JSONSelectable;
type Old = `${'[' | '('}${number | ''},${number | ''}${']' | ')'}`; // Zapatos 6.6.1's NumberRangeString
type Finite = Exclude<db.NumberRangeString, 'empty' | `${string}${'Infinity' | 'NaN'}${string}`>;
type OldNumber = `${'[' | '('}${number},${number}${']' | ')'}`; // Zapatos 6.6.1's RangeString<number>
declare const customRange: db.RangeString<number>; // a range with a number bound, typed by hand

describe('range strings', () => {
  test("'empty' is a range string, as Postgres writes an empty range", () => {
    expectTypeOf<'empty'>().toExtend<db.NumberRangeString>();
    expectTypeOf<'empty'>().toExtend<db.DateRangeString>();
    expectTypeOf<'empty'>().toExtend<db.RangeString<number | ''>>();
    expectTypeOf<'[1,10)' | '(,)' | '[1,)'>().toExtend<db.NumberRangeString>();
    expectTypeOf<s.transfers.JSONSelectable['batch_sizes']>().toEqualTypeOf<db.NumberRangeString | null>();
    expectTypeOf<s.transfers.Selectable['value_days']>().toEqualTypeOf<db.DateRangeString | null>();
  });

  test("'empty' is taken as a value, in each write and filter", () => {
    db.insert('transfers', { from_account: 1, to_account: 2, amount: 1, batch_sizes: 'empty', fee_band: 'empty', valid_during: 'empty', value_days: 'empty' });
    db.update('transfers', { fee_band: 'empty' }, { note: 'x' });
    db.upsert('transfers', { id: 'x', from_account: 1, to_account: 2, amount: 1, valid_during: 'empty' }, 'id');
    db.select('transfers', { batch_sizes: 'empty', value_days: c.eq('empty'), fee_band: c.isIn(['empty', '[0,1.5]']) });
    db.select('transfers', { valid_during: db.param('empty') });
    expectTypeOf(db.select('transfers', { batch_sizes: 'empty' }).run(pool)).not.toBeAny();
  });

  test("a selected range compares with 'empty', and narrows to a bracketed one", () => {
    if (row.batch_sizes !== null && row.batch_sizes !== 'empty') {
      expectTypeOf(row.batch_sizes).toEqualTypeOf<Exclude<db.NumberRangeString, 'empty'>>();
    }
    if (jrow.value_days === 'empty') expectTypeOf(jrow.value_days).toEqualTypeOf<'empty'>();
  });

  test('only what Postgres writes: lowercase, no space', () => {
    // @ts-expect-error Postgres reads 'EMPTY', but writes 'empty'
    db.insert('transfers', { from_account: 1, to_account: 2, amount: 1, batch_sizes: 'EMPTY' });
    // @ts-expect-error nor with a space
    db.select('transfers', { value_days: ' empty' });
    // @ts-expect-error an empty string is no range
    db.select('transfers', { fee_band: '' });
    // @ts-expect-error a bracket and no closing one
    db.select('transfers', { batch_sizes: '[1,5' });
  });

  test('a selected range may be empty, so a type that starts with a bracket refuses it', () => {
    // @ts-expect-error 'empty' starts with no bracket
    const bracketed: `[${string}` | `(${string}` | null = row.batch_sizes;
    // @ts-expect-error nor once 'empty' is left out of the type
    const nonEmpty: Exclude<db.NumberRangeString, 'empty'> | null = jrow.batch_sizes;
    expectTypeOf(bracketed).not.toBeAny();
    expectTypeOf(nonEmpty).not.toBeAny();
  });

  test("a Record or a mapped type keyed by a range type requires an 'empty' key, unless Partial or Exclude", () => {
    // @ts-expect-error 'empty' is a key it requires
    const byPeriod: Record<db.DateRangeString, number> = {};
    // @ts-expect-error a mapped type too
    const mapped: { [K in db.DateRangeString]: number } = {};
    const partial: Partial<Record<db.DateRangeString, number>> = {};
    const nonEmpty: Record<Exclude<db.DateRangeString, 'empty'>, number> = {};
    if (row.value_days !== null) partial[row.value_days] = 1;
    if (row.value_days !== null && row.value_days !== 'empty') nonEmpty[row.value_days] = 1;
    expectTypeOf(byPeriod).not.toBeAny();
    expectTypeOf(mapped).not.toBeAny();
  });

  test("a type computed from a range type gives 'empty' or never, unless Exclude", () => {
    type Lower<R> = R extends `${'[' | '('}${infer L},${string}` ? L : R;
    type LowerOrNever<R> = R extends `${'[' | '('}${infer L},${string}` ? L : never;
    type LowerInline = db.NumberRangeString extends `${'[' | '('}${infer L},${string}` ? L : never;
    type LowerInTuple<R> = [R] extends [`${'[' | '('}${infer L},${string}`] ? L : never;
    type LowerInlineBack = Finite extends `${'[' | '('}${infer L},${string}` ? L : never;
    // @ts-expect-error a false branch that keeps the range keeps 'empty'
    expectTypeOf<Lower<db.NumberRangeString>>().toExtend<`${number}` | ''>();
    // @ts-expect-error 'empty' starts with no bracket
    expectTypeOf<db.NumberRangeString extends `[${string}` | `(${string}` ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<Lower<Finite>>().toEqualTypeOf<`${number}` | ''>();
    expectTypeOf<Exclude<db.NumberRangeString, 'empty'> extends `[${string}` | `(${string}` ? true : false>().toEqualTypeOf<true>();
    expectTypeOf<LowerOrNever<Finite>>().toEqualTypeOf<`${number}` | ''>();
    // @ts-expect-error written on the type itself, it does not distribute: never
    expectTypeOf<'1'>().toExtend<LowerInline>();
    // @ts-expect-error nor with its type parameter wrapped in a tuple
    expectTypeOf<'1'>().toExtend<LowerInTuple<db.NumberRangeString>>();
    expectTypeOf<LowerInlineBack>().toEqualTypeOf<`${number}` | ''>();
    expectTypeOf<LowerInTuple<Finite>>().toEqualTypeOf<`${number}` | ''>();
  });

  test('an infinite or NaN numeric bound is a range string, as Postgres writes it', () => {
    expectTypeOf<'[1,Infinity)' | '[-Infinity,1)' | '[-Infinity,Infinity]' | '(,Infinity)' | '[1,NaN]' | '[NaN,NaN]'>().toExtend<db.NumberRangeString>();
    expectTypeOf<'[1,Infinity)' | '[-Infinity,0)' | '[1,NaN]'>().toExtend<db.RangeString<number>>();
    expectTypeOf<db.NumberRangeString>().toEqualTypeOf<db.RangeString<number | ''>>();
    expectTypeOf<db.DateRangeString>().toEqualTypeOf<`${'[' | '('}${string},${string}${']' | ')'}` | 'empty'>();
    expectTypeOf<'[2026-01-01,infinity)' | '[-infinity,infinity]'>().toExtend<db.DateRangeString>();
  });

  test('an infinite or NaN numeric bound is taken as a value, in each write and filter', () => {
    db.insert('transfers', { from_account: 1, to_account: 2, amount: 1, fee_band: '[1,Infinity)' });
    db.update('transfers', { fee_band: '[1,NaN]' }, { note: 'x' });
    db.upsert('transfers', { id: 'x', from_account: 1, to_account: 2, amount: 1, fee_band: '[-Infinity,0)' }, 'id');
    db.select('transfers', { fee_band: '[-Infinity,Infinity]' });
    db.select('transfers', { fee_band: c.eq('[1,NaN]') });
    db.select('transfers', { fee_band: c.isIn(['[1,Infinity)', '[NaN,NaN]']) });
    db.select('transfers', { fee_band: db.param('(,Infinity)') });
    // characterization: int4range shares NumberRangeString, so the type takes a bound Postgres refuses there (22P02)
    db.insert('transfers', { from_account: 1, to_account: 2, amount: 1, batch_sizes: '[1,Infinity)' });
    expectTypeOf(jrow.fee_band === '[1,Infinity)' || row.fee_band === '[1,NaN]').toEqualTypeOf<boolean>();
    expectTypeOf(db.select('transfers', { fee_band: '[1,NaN]' }).run(pool)).not.toBeAny();
  });

  test('only the spellings Postgres writes: Infinity, -Infinity, NaN', () => {
    // @ts-expect-error Postgres reads 'infinity', but writes 'Infinity'
    db.select('transfers', { fee_band: '[1,infinity)' });
    // @ts-expect-error nor 'inf'
    db.select('transfers', { fee_band: '[1,inf)' });
    // @ts-expect-error nor '+Infinity'
    db.select('transfers', { fee_band: '[1,+Infinity)' });
    // @ts-expect-error nor 'nan'
    db.select('transfers', { fee_band: '[1,nan]' });
  });

  test('a selected numrange may have an infinite or NaN bound, so a hand-written finite type refuses it', () => {
    const toOld = (range: Old) => range;
    // @ts-expect-error 'Infinity' is no `${number}`
    const handWritten: Old | 'empty' | null = jrow.fee_band;
    // @ts-expect-error nor as a parameter
    if (row.fee_band !== null && row.fee_band !== 'empty') toOld(row.fee_band);
    // @ts-expect-error once 'empty' is left out, the infinite bounds are still there
    expectTypeOf<Exclude<db.NumberRangeString, 'empty'>>().toEqualTypeOf<Old>();
    expectTypeOf<Finite>().toEqualTypeOf<Old>();
    const asAlias: db.RangeString<number | ''> | null = jrow.fee_band;
    expectTypeOf(handWritten).not.toBeAny();
    expectTypeOf(asAlias).not.toBeAny();
  });

  test('a Record or a mapped type keyed by NumberRangeString requires its infinite keys, unless Partial or Exclude', () => {
    // @ts-expect-error '[Infinity,Infinity]', '(NaN,NaN)' and the others are keys it requires
    const byBand: Record<db.NumberRangeString, number> = { '(,)': 1, '(,]': 1, '[,)': 1, '[,]': 1, empty: 1 };
    // @ts-expect-error a mapped type too
    const mapped: { [K in db.NumberRangeString]: number } = { '(,)': 1, '(,]': 1, '[,)': 1, '[,]': 1, empty: 1 };
    const partial: Partial<Record<db.NumberRangeString, number>> = {};
    const finite: Record<Finite, number> = { '(,)': 1, '(,]': 1, '[,)': 1, '[,]': 1 };
    if (row.fee_band !== null) partial[row.fee_band] = 1;
    expectTypeOf(byBand).not.toBeAny();
    expectTypeOf(mapped).not.toBeAny();
    expectTypeOf(finite).not.toBeAny();
  });

  test('a type computed from NumberRangeString gives the infinite bounds too, unless Exclude', () => {
    type Lower<R> = R extends `${'[' | '('}${infer L},${string}` ? L : R;
    type LowerOrNever<R> = R extends `${'[' | '('}${infer L},${string}` ? L : never;
    type LowerInline = Exclude<db.NumberRangeString, 'empty'> extends `${'[' | '('}${infer L},${string}` ? L : never;
    type LowerInTuple<R> = [R] extends [`${'[' | '('}${infer L},${string}`] ? L : never;
    type Upper<R> = R extends `${string},${infer U extends number}${']' | ')'}` ? U : never;
    // @ts-expect-error a false branch of never keeps 'Infinity', '-Infinity' and 'NaN'
    expectTypeOf<LowerOrNever<db.NumberRangeString>>().toEqualTypeOf<`${number}` | ''>();
    // @ts-expect-error and on Exclude<…, 'empty'> too
    expectTypeOf<LowerOrNever<Exclude<db.NumberRangeString, 'empty'>>>().toEqualTypeOf<`${number}` | ''>();
    // @ts-expect-error on Exclude<…, 'empty'>, a false branch that keeps the range keeps them too
    expectTypeOf<Lower<Exclude<db.NumberRangeString, 'empty'>>>().toExtend<`${number}` | ''>();
    // @ts-expect-error and written on the type itself
    expectTypeOf<LowerInline>().toExtend<`${number}` | ''>();
    // @ts-expect-error and with its type parameter wrapped in a tuple
    expectTypeOf<LowerInTuple<Exclude<db.NumberRangeString, 'empty'>>>().toExtend<`${number}` | ''>();
    expectTypeOf<LowerOrNever<Finite>>().toEqualTypeOf<`${number}` | ''>();
    expectTypeOf<Upper<db.NumberRangeString>>().toEqualTypeOf<number>();
  });

  test('a type computed from a hand-written RangeString<number> gives the infinite bounds too, unless Exclude', () => {
    type Finite661 = Exclude<db.RangeString<number>, 'empty' | `${string}${'Infinity' | 'NaN'}${string}`>;
    type LowerOrNever<R> = R extends `${'[' | '('}${infer L},${string}` ? L : never;
    // @ts-expect-error '[Infinity,Infinity]', '(NaN,NaN)' and the other 34 are keys it requires
    const byNumber: Record<db.RangeString<number>, number> = { empty: 1 };
    // @ts-expect-error on Exclude<…, 'empty'> too
    const nonEmpty: Record<Exclude<db.RangeString<number>, 'empty'>, number> = {};
    // @ts-expect-error a value of it is no `${number}`-bounded range, even 'empty' aside
    const handWritten: OldNumber | 'empty' = customRange;
    // @ts-expect-error a false branch of never keeps 'Infinity', '-Infinity' and 'NaN'
    expectTypeOf<LowerOrNever<db.RangeString<number>>>().toExtend<`${number}`>();
    const finite: Record<Finite661, number> = {};
    const asAlias: db.RangeString<number> = customRange;
    expectTypeOf<Finite661>().toEqualTypeOf<OldNumber>();
    expectTypeOf<LowerOrNever<Finite661>>().toEqualTypeOf<`${number}`>();
    expectTypeOf(byNumber).not.toBeAny();
    expectTypeOf(nonEmpty).not.toBeAny();
    expectTypeOf(handWritten).not.toBeAny();
    expectTypeOf(finite).not.toBeAny();
    expectTypeOf(asAlias).not.toBeAny();
  });
});

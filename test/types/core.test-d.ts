// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the types of src/db/core.ts and src/db/conditions.ts on the
// fixture schema: sql<> generics, param / parent / self, the column constraint of a
// condition. Surprises (a type that accepts what the runtime refuses, or refuses
// what it accepts) are frozen with a `characterization:` comment.

import { describe, expectTypeOf, test, vi } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type * as pg from 'pg';

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

  // products.search, a tsvector typed any, shares its name with String's search(): a string passed as a
  // products.Whereable, so the table's SQL took any string, as in Zapatos 6.6.1 (#670)
  test('a table with a column named like a String member still checks its names (#670)', () => {
    const q = db.sql<s.products.SQL>`SELECT ${'search'}, ${['sku', 'title']} FROM ${'products'} WHERE ${{ search: db.sql`${db.self} @@ 'salt'` }}`;
    expectTypeOf(q).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.sql<s.products.SQL>`${[{ sku: 'a' }, 'sku', db.sql`x`]}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.sql<s.SQLForTable<'products'>>`${'search'}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.sql`${'search'} ${{ search: 1 }}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    const name = 'sku' as string;
    // @ts-expect-error 'serach' is not a column of products
    db.sql<s.products.SQL>`SELECT ${'serach'} FROM ${'products'}`;
    // @ts-expect-error 'serach' is not a column of products, in an array
    db.sql<s.products.SQL>`SELECT ${['sku', 'serach']} FROM ${'products'}`;
    // @ts-expect-error a string typed string is no name of products
    db.sql<s.products.SQL>`SELECT ${name} FROM ${'products'}`;
    // @ts-expect-error 'serach' is not a column, through SQLForTable
    db.sql<s.SQLForTable<'products'>>`SELECT ${'serach'}`;
    // a Whereable variable, of products or of every table, still passes
    const w = { sku: 'a' } as s.products.Whereable, every = w as s.Whereable;
    expectTypeOf(db.sql<s.products.SQL>`${w}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.sql`${every}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    // an object whose iterator is undefined is still a Whereable: the guard is undefined, not never
    const iterUndefined = { sku: 'a', [Symbol.iterator]: undefined };
    expectTypeOf(db.sql<s.products.SQL>`${iterUndefined}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    // a variable that shares no key with it is still refused
    const titel = { titel: 'a' };
    // @ts-expect-error 'titel' is not a column of products
    db.sql<s.products.SQL>`${titel}`;
  });

  // left by design (#674): the guard is in each table's SQL, not in db.SQL, where it refused a generic
  // `${{ ...w, id: 1 }}` on TypeScript 4.1 (review of #676); as a Whereable given as sql's own type argument, it
  // refused a forwarder `<I>(…) => db.sql<I>(…)`
  test('characterization: db.SQL, and a Whereable given as sql\'s own type argument, still take any string (#674)', () => {
    expectTypeOf(db.sql`${'serach'}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(db.sql<s.products.Whereable>`${'serach'}`).toEqualTypeOf<db.SQLFragment<any[], never>>();
  });

  test('a generic forwarder over a table\'s SQL and Whereable still compiles (#670)', () => {
    const forward = <T extends s.Table>(w: s.WhereableForTable<T>) => db.sql<s.SQLForTable<T>>`WHERE ${w}`;
    expectTypeOf(forward<'products'>({ sku: 'a' })).toEqualTypeOf<db.SQLFragment<any[], never>>();
  });

  // characterization: users.id and products.id are a number, transfers.id a string, accounts.id an int8. A
  // shortcut reads the key's contextual type across every table, and a bare template infers its Constraint from
  // that union, so the valid call is refused (TS2322), as in Zapatos 6.6.1. Any type argument leaves Constraint
  // `never`, which fits the column (R36, #493)
  test('characterization: a bare template is refused as the value of a column whose name other tables type otherwise, and passes with a type argument (#493)', () => {
    const two = 'users' as 'users' | 'products', three = 'users' as 'users' | 'products' | 'transfers';
    // @ts-expect-error valid at run time
    db.select('users', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.select('accounts', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.select('transfers', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.selectOne('users', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.count('users', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.deletes('users', { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.update('users', { display_name: 'Ada' }, { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.update('products', { id: db.sql`${db.self} + 1` }, { id: 1 });
    // @ts-expect-error valid at run time
    db.select(two, { id: db.sql`${db.self} IS NULL` });
    // @ts-expect-error valid at run time
    db.select(three, { id: db.sql`${db.self} IS NULL` });
    // the workaround the docs give: a type argument
    expectTypeOf(db.select('users', { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.users.JSONSelectable[]>>();
    expectTypeOf(db.select('users', { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).not.toBeAny();
    expectTypeOf(db.select('accounts', { id: db.sql<s.accounts.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.accounts.JSONSelectable[]>>();
    expectTypeOf(db.select('transfers', { id: db.sql<s.transfers.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.transfers.JSONSelectable[]>>();
    expectTypeOf(db.selectOne('users', { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.users.JSONSelectable | undefined>>();
    expectTypeOf(db.count('users', { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.deletes('users', { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.users.JSONSelectable[]>>();
    expectTypeOf(db.update('users', { display_name: 'Ada' }, { id: db.sql<s.users.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<s.users.JSONSelectable[]>>();
    expectTypeOf(db.update('products', { id: db.sql<s.products.SQL>`${db.self} + 1` }, { id: 1 })).toEqualTypeOf<db.SQLFragment<s.products.JSONSelectable[]>>();
    expectTypeOf(db.select(two, { id: db.sql<db.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<(s.users.JSONSelectable | s.products.JSONSelectable)[]>>();
    expectTypeOf(db.select(three, { id: db.sql<db.SQL>`${db.self} IS NULL` })).toEqualTypeOf<db.SQLFragment<(s.users.JSONSelectable | s.products.JSONSelectable | s.transfers.JSONSelectable)[]>>();
    // or a template built apart
    const isNull = db.sql`${db.self} IS NULL`;
    expectTypeOf(isNull).toEqualTypeOf<db.SQLFragment<any[], never>>();
    db.select('users', { id: isNull });
    db.select('users', { id: db.sql<db.SQL, any, number>`${db.self} IS NULL` });
  });

  test('a template whose Constraint is given is checked against the column (#493)', () => {
    // @ts-expect-error a string Constraint on an int column (users.id)
    db.select('users', { id: db.sql<db.SQL, any, string>`${db.self} IS NULL` });
    // @ts-expect-error a string on an int column
    db.select('users', { id: '1' });
    // @ts-expect-error Parameter<string> on an int column
    db.select('users', { id: db.param('1') });
    // @ts-expect-error a number is no SQL interpolation
    db.sql`SELECT ${5}`;
    // @ts-expect-error nor in a template typed by its table
    db.sql<s.users.SQL>`SELECT ${5}`;
  });

  test('a template with three type arguments, its wrappers and typeof sql keep their types (#493)', () => {
    // a caller's condition, as conditions.ts writes eq(): its Constraint is inferred from the column (#181)
    const myEq = <T>(a: T) => db.sql<db.SQL, boolean | null, T>`${db.self} = ${db.param(a)}`;
    expectTypeOf(myEq(1)).toEqualTypeOf<db.SQLFragment<boolean | null, number>>();
    db.select('users', { mood: myEq('happy'), id: myEq(1) });
    db.select('users', { mood: c.eq('happy') });
    // @ts-expect-error 'angry' is not a mood
    db.select('users', { mood: myEq('angry') });
    expectTypeOf<ReturnType<typeof db.sql>>().toEqualTypeOf<db.SQLFragment<unknown, unknown>>();
    expectTypeOf<Parameters<typeof db.sql>>().toEqualTypeOf<never>();  // as in Zapatos 6.6.1: NoInfer<unknown> in a rest
    const plain: (literals: TemplateStringsArray, ...expressions: db.SQL[]) => db.SQLFragment<number> = db.sql;
    expectTypeOf(plain`SELECT 1`).toEqualTypeOf<db.SQLFragment<number>>();
  });

  // sql has one generic signature, as in Zapatos 6.6.1: an overload would erase its type parameters in a generic
  // higher-order function (the last overload's, to `unknown`), and make a value written to 6.6.1's signature
  // no longer fit `typeof db.sql` (review of #520)
  test('a generic higher-order function over sql keeps its type parameters, as in Zapatos 6.6.1 (#493)', () => {
    const traced = <A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R => (...a) => f(...a);
    const tsql = traced(db.sql);
    expectTypeOf(tsql`SELECT 1`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(tsql`SELECT 1`.run(pool)).resolves.toEqualTypeOf<any[]>();
    expectTypeOf(tsql<db.SQL, number>`SELECT 1`).toEqualTypeOf<db.SQLFragment<number, never>>();
    expectTypeOf(tsql<db.SQL, boolean | null, number>`${db.self} = 1`).toEqualTypeOf<db.SQLFragment<boolean | null, number>>();
    // @ts-expect-error a number is no SQL interpolation, through the wrapper too
    tsql`SELECT ${5}`;
    const literals = null as unknown as TemplateStringsArray;
    expectTypeOf(Promise.resolve(literals).then(db.sql)).toEqualTypeOf<Promise<db.SQLFragment<any[], never>>>();
    // @ts-expect-error map() passes the index, a number, as an interpolation
    [literals].map(db.sql);
  });

  test('a value written to the signature of Zapatos 6.6.1 is a typeof sql (#493)', () => {
    // the NoInfer of Zapatos 6.6.1's declarations, which zapatos/db does not export
    type NI<T> = [T][T extends any ? 0 : never];
    function mySql<Interpolations = db.SQL, RunResult = pg.QueryResult['rows'], Constraint = never>(
      literals: TemplateStringsArray, ...expressions: NI<Interpolations>[]
    ): db.SQLFragment<RunResult, Constraint> {
      return db.sql<Interpolations, RunResult, Constraint>(literals, ...expressions);
    }
    const sql2: typeof db.sql = mySql;
    // its parameters typed by the context, under noImplicitAny
    const sql3: typeof db.sql = (literals, ...expressions) => db.sql(literals, ...expressions);
    expectTypeOf(sql2`SELECT 1`).toEqualTypeOf<db.SQLFragment<any[], never>>();
    expectTypeOf(sql3<db.SQL, number>`SELECT 1`).toEqualTypeOf<db.SQLFragment<number, never>>();
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
    // a Parameter is still a ParentColumn, as in Zapatos 6.6.1: param(undefined) fits a text column through it
    db.select('users', { display_name: db.param(undefined) });
    expectTypeOf([n, p, q]).not.toBeAny();
  });

  test('keyof a wrapper class gives its public members alone, as in Zapatos 6.6.1', () => {
    // the tag is private, so a spread or a mapped type never writes it out in a consumer's declarations (#582)
    expectTypeOf<keyof db.Parameter<number>>().toEqualTypeOf<'value' | 'cast'>();
    expectTypeOf<keyof db.DangerousRawString>().toEqualTypeOf<'value'>();
    expectTypeOf<keyof db.ColumnNames<string[]>>().toEqualTypeOf<'value'>();
    expectTypeOf<keyof db.ColumnValues<string[]>>().toEqualTypeOf<'value'>();
    expectTypeOf<keyof db.ParentColumn<'id'>>().toEqualTypeOf<'value'>();
    expectTypeOf({ ...db.raw('x') }).toEqualTypeOf<{ value: string }>();
    expectTypeOf({ ...db.param(1) }).toEqualTypeOf<{ value: number; cast?: boolean | string }>();
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

  test('all in a condition is refused, as Default is', () => {
    // the runtime throws on each while compiling (#619); 6.6.1 sent it as a string, 'Symbol(all)'
    // @ts-expect-error all is no value of a text column, in eq()
    db.select('users', { display_name: c.eq(db.all) });
    // @ts-expect-error nor in ne(), on an int column
    db.deletes('users', { id: c.ne(db.all) });
    // @ts-expect-error nor as a range's bound
    db.select('users', { id: c.between(1, db.all) });
    // @ts-expect-error nor as a pattern
    db.select('users', { display_name: c.like(db.all) });
    // @ts-expect-error nor in add()
    db.update('accounts', { lifetime_ops: c.add(db.all) }, { id: 1 });
    // @ts-expect-error nor in an array condition
    db.select('accounts', { scores: c.arrayContains(db.all) });
  });

  test('all as a Whereable value, in isIn, or in an array condition\'s array, is refused', () => {
    // the runtime throws on each while compiling (#633); 6.6.1 sent it as a string, 'Symbol(all)'
    // @ts-expect-error all is no value of a text column
    db.select('users', { display_name: db.all });
    // @ts-expect-error nor of an int column, in the where of update()
    db.update('users', { mood: 'ok' }, { id: db.all });
    // @ts-expect-error nor an item of isIn
    db.select('users', { display_name: c.isIn([db.all]) });
    // @ts-expect-error nor of isNotIn, in deletes()
    db.deletes('users', { display_name: c.isNotIn(['Ada', db.all]) });
    // @ts-expect-error nor an item of arrayContains
    db.select('accounts', { scores: c.arrayContains([db.all]) });
    // @ts-expect-error nor of arrayContainedIn
    db.select('accounts', { scores: c.arrayContainedIn([db.all]) });
    // @ts-expect-error nor of arrayOverlaps
    db.select('accounts', { scores: c.arrayOverlaps([db.all]) });
    // @ts-expect-error nor nested, in the 6.6.1 spelling
    db.select('accounts', { scores: c.arrayContains<number[]>([[db.all]]) });
  });

  test('Default, self, a wrapper or a Parameter as an item of an array condition is refused', () => {
    // the runtime throws on each while compiling (#636); 6.6.1 sent each in the array parameter, '{"Symbol(DEFAULT)"}'
    // or its JSON
    // @ts-expect-error Default is no item of an int4[] column's array
    db.select('accounts', { scores: c.arrayContains([db.Default]) });
    // @ts-expect-error nor self, in arrayContainedIn
    db.select('accounts', { scores: c.arrayContainedIn([1, db.self]) });
    // @ts-expect-error nor raw(), in arrayOverlaps
    db.select('accounts', { scores: c.arrayOverlaps([db.raw('1')]) });
    // @ts-expect-error nor cols()
    db.select('accounts', { scores: c.arrayContains([db.cols(['scores'])]) });
    // @ts-expect-error nor vals()
    db.select('accounts', { scores: c.arrayContains([db.vals([1])]) });
    // @ts-expect-error nor a Parameter
    db.select('accounts', { scores: c.arrayContains([db.param(1)]) });
    // @ts-expect-error nor nested, in the 6.6.1 spelling
    db.select('accounts', { scores: c.arrayContains<number[]>([[db.Default]]) });
    // @ts-expect-error nor on a text[] domain column
    db.select('users', { tags: c.arrayOverlaps(['a', db.Default]) });
  });

  test('array columns refuse parent() and fragments as array items', () => {
    // @ts-expect-error a parent reference is no integer
    db.select('accounts', { scores: c.arrayContains([db.parent('id')]) });
    // @ts-expect-error nor is a fragment
    db.select('accounts', { scores: c.arrayContains([db.sql`1`]) });
    // @ts-expect-error a fragment is no string either
    db.select('users', { tags: c.arrayContainedIn([db.sql`'b'`]) });
    // @ts-expect-error a parent reference beside an integer
    db.select('accounts', { scores: c.arrayOverlaps([1, db.parent('id')]) });
    // @ts-expect-error nor beside a string, on a text[] domain column
    db.select('users', { tags: c.arrayContainedIn(['a', db.sql`'b'`]) });
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

  test('add() is refused as an insert() value, which Postgres refuses too (42703); now and the boolean tests are accepted', () => {
    // Insertable takes a SQLFragment with no constraint, whatever its RunResult (#654): add() has a constraint
    // @ts-expect-error add() as an insert() value ("balance" + $1 in VALUES)
    db.insert('accounts', { owner_id: 1, balance: c.add(1) });
    // characterization: "c_bool" IS TRUE in VALUES, which Postgres refuses (42703), as an untyped sql`${db.self} IS TRUE`
    expectTypeOf(db.insert('extra.type_zoo', { c_bool: c.isTrue })).not.toBeAny();
    // characterization: and(), or() and not() over them or over a Whereable, the same (42703); not(eq()) keeps a constraint
    expectTypeOf(db.insert('extra.type_zoo', { c_bool: c.not({ c_bool: true }) })).not.toBeAny();
    // @ts-expect-error not() over eq() carries eq()'s constraint
    db.insert('extra.type_zoo', { c_bool: c.not(c.eq(true)) });
    expectTypeOf(db.insert('users', { email: 'a@b', display_name: 'A', created_at: c.now })).not.toBeAny();
  });

  test('array conditions are typed on the column', () => {
    const contains = c.arrayContains([1]), containedIn = c.arrayContainedIn(['a']), overlaps = c.arrayOverlaps(['a']);
    expectTypeOf(contains).toEqualTypeOf<db.SQLFragment<boolean | null, number[]>>();
    expectTypeOf(contains).not.toBeAny();
    expectTypeOf(containedIn).toEqualTypeOf<db.SQLFragment<boolean | null, string[]>>();
    expectTypeOf(containedIn).not.toBeAny();
    expectTypeOf(overlaps).toEqualTypeOf<db.SQLFragment<boolean | null, string[]>>();
    expectTypeOf(overlaps).not.toBeAny();
    db.select('accounts', { scores: contains });
    db.select('users', { tags: containedIn });
    db.select('extra.type_zoo', { c_text_array: overlaps, c_point: contains });
    db.select('accounts', { scores: c.arrayContains<number[]>([[1]]) });
    db.select('accounts', { scores: c.arrayContains([[1]] as const) });
    db.select('extra.type_zoo', { c_jsonb: c.arrayContains([1]) });
    db.select('extra.type_zoo', { c_jsonb: c.arrayContainedIn([1]) });
    db.select('extra.type_zoo', { c_jsonb: c.arrayOverlaps([1]) });
    // @ts-expect-error Date is not a JSON value
    db.select('extra.type_zoo', { c_jsonb: c.arrayContains([new Date()]) });
    // @ts-expect-error Date is not a JSON value
    db.select('extra.type_zoo', { c_jsonb: c.arrayContainedIn([new Date()]) });
    // @ts-expect-error Date is not a JSON value
    db.select('extra.type_zoo', { c_jsonb: c.arrayOverlaps([new Date()]) });
    const scores: readonly number[] = [1];
    db.select('accounts', { scores: c.arrayOverlaps(scores) });
    // @ts-expect-error a string on an int4[] column
    db.select('accounts', { scores: c.arrayContains(['a']) });
    // @ts-expect-error a number on the tag_list domain
    db.select('users', { tags: c.arrayContainedIn([1]) });
    // @ts-expect-error a number on a text[] column
    db.select('extra.type_zoo', { c_text_array: c.arrayOverlaps([1]) });
    // @ts-expect-error owner_id is a scalar
    db.select('accounts', { owner_id: c.arrayContains([1]) });

    const parentCondition = <P extends db.ParentColumn>(p: P) => c.arrayOverlaps(p);
    expectTypeOf(parentCondition(db.parent())).toEqualTypeOf<db.SQLFragment<boolean | null, never>>();
    db.select('accounts', { scores: parentCondition(db.parent('scores')) });
    // An empty array inferred as never[] or a parent reference leaves the scalar unchecked.
    const empty: never[] = [];
    db.select('accounts', { owner_id: c.arrayContains([]) });
    db.select('accounts', { owner_id: c.arrayContainedIn(empty) });
    db.select('accounts', { owner_id: c.arrayOverlaps(db.parent('scores')) });
  });

  test('array conditions passed as callbacks or stored with a 6.6.1 annotation', () => {
    const mapped = [[1]].map(c.arrayContains), wrapped = [[1]].map(xs => c.arrayContains(xs));
    expectTypeOf(mapped).toEqualTypeOf<db.SQLFragment<boolean | null, unknown[]>[]>();
    expectTypeOf(wrapped).toEqualTypeOf<db.SQLFragment<boolean | null, number[]>[]>();
    const stored = c.arrayContains([1]);
    // @ts-expect-error the stored condition now constrains the whole array
    const oldResult: db.SQLFragment<boolean | null, number> = stored;
    const oldMock = <T>(_a: T[] | db.ParentColumn) => db.sql<db.SQL, boolean | null, T>`TRUE`;
    // @ts-expect-error the 6.6.1 mock cannot implement the new overloads
    const mock: typeof c.arrayContains = oldMock;
    void [oldResult, mock];
  });

  test('array conditions on enum labels', () => {
    const happy: db.SQLFragment<boolean | null, s.mood[]> = c.arrayContains(['happy'] as const);
    // @ts-expect-error 'glad' is not a mood
    const glad: typeof happy = c.arrayContains(['glad'] as const);
    void glad;
  });

  test('array condition operand and wrapper migrations', () => {
    type Operand = Parameters<typeof c.arrayContains>[0];
    // @ts-expect-error Parameters reads the array overload
    const oldOperand: Operand = db.parent('scores');
    const operand: Operand | db.ParentColumn = db.parent('scores');
    const contains = <T extends number[]>(xs: T[]) => {
      const condition = c.arrayContains(xs);
      // @ts-expect-error the conditional return type is deferred for T
      const oldResult: db.SQLFragment<boolean | null, T> = condition;
      void oldResult;
      return condition;
    };
    db.select('accounts', { scores: contains([[1]]) });
    void [oldOperand, operand];
  });

  test('characterization: {}, { value } and param() of a column name pass an array condition as its ParentColumn', () => {
    // characterization (#570): ParentColumn's members are all optional, so these fit it, as in Zapatos 6.6.1. {} and
    // { value: undefined } run as the empty array ('{}'); { value: 'id' } and param('id') are refused by Postgres (22P02),
    // and under castObjectParamsToJson the objects too (42883). Telling param('id') apart takes a second type parameter,
    // which refuses `<P extends db.ParentColumn>(p: P) => arrayOverlaps(p)`, a call 6.6.1 compiles and runs with parent()
    db.select('accounts', { scores: c.arrayContains({}) });
    db.select('accounts', { scores: c.arrayContainedIn({ value: undefined }) });
    db.select('accounts', { scores: c.arrayOverlaps({ value: 'id' }) });
    db.select('accounts', { scores: c.arrayContains(db.param('id')) });
    expectTypeOf(c.arrayOverlaps(db.param('id'))).toEqualTypeOf<db.SQLFragment<boolean | null, never>>();
    // @ts-expect-error a Parameter of an array is no ParentColumn
    db.select('accounts', { scores: c.arrayContains(db.param([1])) });
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

// A client that isn't pg's: run() sends it pg's query object, { text, values, name? }, and reads `rows` (#695)
interface MigrationClient {  // a migration tool's client, typed with pg's own overloads
  query(queryConfig: pg.QueryArrayConfig, values?: any[]): Promise<pg.QueryArrayResult>;
  query(queryConfig: pg.QueryConfig): Promise<pg.QueryResult>;
  query(queryTextOrConfig: string | pg.QueryConfig, values?: any[]): Promise<pg.QueryResult>;
}
declare const
  pgPool: pg.Pool, pgPoolClient: pg.PoolClient, pgClient: pg.Client, pgClientBase: pg.ClientBase,
  txnClient: db.TxnClientForSerializable, migrationClient: MigrationClient;

describe('QueryableLike: what run() takes (#695)', () => {
  const
    q = db.sql<db.SQL, number[]>`SELECT 1`,
    fake = { query: async () => ({ rows: [{ result: [] }] }) },
    configStub = { query: async (query: { text: string; values?: unknown[] }) => ({ rows: [query.text] }) };

  test('pg pools and clients, as in Zapatos 6.6.1, and any client with pg\'s query object', () => {
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(pgPool)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(pgPoolClient)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(pgClient)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(pgClientBase)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(txnClient)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(<Q extends db.Queryable>(queryable: Q) => q.run(queryable)).returns.resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(migrationClient)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(fake)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(q.run(configStub)).resolves.toEqualTypeOf<number[]>();
    expectTypeOf(db.select('users', db.all).run(fake)).toEqualTypeOf(db.select('users', db.all).run(pool));
    expectTypeOf(db.select('users', db.all).run(fake)).resolves.not.toBeAny();
    const typed: db.QueryableLike = fake;
    expectTypeOf(q.run(typed)).resolves.toEqualTypeOf<number[]>();
  });

  test('a client whose query() takes something else, or gives no rows', () => {
    // @ts-expect-error a query() that takes the text alone, as PGlite's query(text, params): run() sends an object
    q.run({ query: async (text: string, values?: unknown[]) => ({ rows: [text, values] }) });
    const postgresJsLike = { unsafe: async (text: string, values?: unknown[]) => [text, values] };
    // @ts-expect-error no query(), as postgres.js's sql, which runs a text through unsafe()
    q.run(postgresJsLike);
    // @ts-expect-error a result without rows
    q.run({ query: async () => ({ row: [] }) });
    // @ts-expect-error a result that isn't a promise
    q.run({ query: () => ({ rows: [] }) });
    // @ts-expect-error nothing to query
    q.run({});
    // @ts-expect-error a query() that needs more than run() sends: a name, which an unprepared fragment has not
    q.run({ query: async (query: { text: string; values: any[]; name: string }) => ({ rows: [query.name.toUpperCase()] }) });
    // @ts-expect-error transaction() still takes pg's pools and clients only: run time calls connect() (#696)
    void db.serializable(fake, async () => 1);
  });

  test('Queryable, and a function typed for it assigned to run, are unchanged; run\'s parameter read off it moves', () => {
    expectTypeOf<db.Queryable>().toEqualTypeOf<pg.ClientBase | pg.Pool>();
    expectTypeOf<keyof db.Queryable>().toEqualTypeOf<keyof (pg.ClientBase | pg.Pool)>();
    expectTypeOf<ReturnType<typeof q.run>>().toEqualTypeOf<Promise<number[]>>();
    // run is typed as a method is, its parameter checked both ways: a function typed for Queryable may still be
    // assigned to it, or override it, as in 6.6.1
    q.run = async (queryable: db.Queryable) => { void queryable; return []; };
    const typed: typeof q.run = async (queryable: db.Queryable) => { void queryable; return []; };
    const contextual: typeof q.run = async queryable => { expectTypeOf(queryable).toEqualTypeOf<db.QueryableLike>(); return []; };
    // @ts-expect-error a contextual arrow's parameter, Queryable in 6.6.1, is QueryableLike: pg's query(text) moves
    const readsPg: typeof q.run = async queryable => { await queryable.query('SELECT 1'); return []; };
    class Traced<R> extends db.SQLFragment<R> {
      run = async (queryable: db.Queryable, force?: boolean): Promise<R> => { void queryable; void force; return undefined as unknown as R; };
    }
    expectTypeOf(new Traced<number>([], []).run(pgPool)).resolves.toEqualTypeOf<number>();
    void typed; void contextual; void readsPg;
    // run()'s parameter, read off the value, was Queryable
    expectTypeOf<Parameters<typeof q.run>[0]>().toEqualTypeOf<db.QueryableLike>();
  });

  test('a spy copies run as a function type: its parameter is checked one way, so a body casts to Queryable', () => {
    vi.spyOn(q, 'run').mockImplementation(async queryable => {
      const r = await (queryable as db.Queryable).query('SELECT 1');
      return [r.rowCount ?? 0];
    });
    vi.spyOn(q, 'run').mockImplementation(async (queryable: db.QueryableLike) => { void queryable; return []; });
    // @ts-expect-error a spy's implementation typed for Queryable, which 6.6.1 took: QueryableLike is not a Queryable
    vi.spyOn(q, 'run').mockImplementation(async (queryable: db.Queryable) => { void queryable; return []; });
  });
});

// parent() and ParentColumn on a generic column: each type a call got before is kept, and no generic column is related
// to the global Column union, which costs seconds on a schema of a thousand column names (#918, note 016)
describe('parent() on a generic column (#918)', () => {
  test('a literal, a union of literals, no column, any and a column of one table keep their types', () => {
    expectTypeOf(db.parent('id')).toEqualTypeOf<db.ParentColumn<'id'>>();
    expectTypeOf(db.parent('id' as 'id' | 'email')).toEqualTypeOf<db.ParentColumn<'id' | 'email'>>();
    expectTypeOf(db.parent()).toEqualTypeOf<db.ParentColumn<s.Column | undefined>>();
    expectTypeOf(db.parent(undefined)).toEqualTypeOf<db.ParentColumn<undefined>>();
    expectTypeOf(db.parent('id' as any)).toEqualTypeOf<db.ParentColumn<any>>();
    expectTypeOf(db.parent('id' as s.ColumnForTable<'users'>)).toEqualTypeOf<db.ParentColumn<s.users.Column>>();
    expectTypeOf(db.parent('id' as s.Column)).toEqualTypeOf<db.ParentColumn<s.Column>>();
    expectTypeOf(db.parent<s.users.Column>('id')).toEqualTypeOf<db.ParentColumn<s.users.Column>>();
    expectTypeOf(db.parent('id').value).toEqualTypeOf<'id' | undefined>();
    expectTypeOf(db.parent('id')).not.toBeAny();
  });

  test('a generic column gives the ParentColumn of that column', () => {
    const parentOf = <T extends s.Table>(col: s.ColumnForTable<T>) => {
      const p = db.parent(col);
      expectTypeOf(p).toEqualTypeOf<db.ParentColumn<s.ColumnForTable<T>>>();
      const value: s.ColumnForTable<T> | undefined = p.value;
      void value;
      return p;
    };
    expectTypeOf(parentOf<'users'>('id')).toEqualTypeOf<db.ParentColumn<s.users.Column>>();
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: parentOf<'users'>('id') }) } });
    // @ts-expect-error sku is no column of users
    parentOf<'users'>('sku');
  });

  test('refuses a name that is no column, a string, and the same as a Whereable value', () => {
    const name: string = 'id';
    // @ts-expect-error 'nope' is no column of any table
    db.parent('nope');
    // @ts-expect-error a string is no column name
    db.parent(name);
    // @ts-expect-error a ParentColumn of no column is no Whereable value
    db.select('users', { id: db.parent('nope') });
    // @ts-expect-error sku is no column of users
    db.parent<s.users.Column>('sku');
    // @ts-expect-error new ParentColumn() checks its column too
    new db.ParentColumn('nope');
    // @ts-expect-error and as a Whereable value
    db.select('users', { id: new db.ParentColumn('nope') });
  });

  test('an instantiation expression of parent() takes the columns of one table', () => {
    const parentOf = db.parent<s.users.Column>;
    expectTypeOf(parentOf('id')).toEqualTypeOf<db.ParentColumn<s.users.Column>>();
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: parentOf('id') }) } });
    // @ts-expect-error sku is no column of users
    parentOf('sku');
  });

  test('an explicit type argument is a list of columns, never a table, as in Zapatos 6.6.1', () => {
    // @ts-expect-error a table is no list of columns
    db.parent<'users'>('id');
    // @ts-expect-error neither as an instantiation expression
    db.parent<'users'>;
    // @ts-expect-error one type argument, as in Zapatos 6.6.1
    db.parent<s.users.Column, 'users'>('id');
    expectTypeOf(db.parent<s.users.Column | s.accounts.Column>('owner_id')).toEqualTypeOf<db.ParentColumn<s.users.Column | s.accounts.Column>>();
  });

  test('parent as a value infers the columns, as in Zapatos 6.6.1', () => {
    const cols: s.users.Column[] = ['id', 'email'];
    const ps: db.ParentColumn<s.users.Column>[] = cols.map(db.parent);
    const arrow: db.ParentColumn<s.users.Column>[] = cols.map(col => db.parent(col));
    const literals: db.ParentColumn<'id' | 'email'>[] = (['id', 'email'] as const).map(db.parent);
    expectTypeOf(cols.map(db.parent)).toEqualTypeOf<db.ParentColumn<s.users.Column>[]>();
    expectTypeOf([ps, arrow, literals]).not.toBeAny();
    db.select('users', db.all, { lateral: { n: db.count('accounts', { owner_id: c.isIn(cols.map(db.parent)) }) } });
  });

  test('the bare ParentColumn: its value is any column, and its type argument any string (note 016)', () => {
    expectTypeOf<db.ParentColumn['value']>().toEqualTypeOf<s.Column | undefined>();
    expectTypeOf<db.ParentColumn>().toEqualTypeOf<db.ParentColumn<string | undefined>>();
    expectTypeOf(new db.ParentColumn()).toEqualTypeOf<db.ParentColumn>();
    expectTypeOf(new db.ParentColumn('id')).toEqualTypeOf<db.ParentColumn<'id'>>();
    const bare: db.ParentColumn = db.parent('id');
    // @ts-expect-error a bare ParentColumn is no ParentColumn<s.Column | undefined>: they are compared by variance
    const full: db.ParentColumn<s.Column | undefined> = bare;
    const fromParent: db.ParentColumn<s.Column | undefined> = db.parent();
    expectTypeOf([full, fromParent]).not.toBeAny();
  });

  test('characterization: a type argument that is no column passes ParentColumn, whose value stays a column (note 016)', () => {
    // Zapatos 6.6.1 refused each with TS2344; without a cast, value holds no name that is no column, so the SQL is that
    // of parent() with no column
    expectTypeOf(new db.ParentColumn<'nope'>().value).toEqualTypeOf<undefined>();
    expectTypeOf(new db.ParentColumn<string>().value).toEqualTypeOf<s.Column | undefined>();
    db.select('users', { id: new db.ParentColumn<'nope'>() });
    // @ts-expect-error its value is still a column
    new db.ParentColumn<'nope'>('nope');
    // @ts-expect-error and a ParentColumn of no column is still no ParentColumn of a column
    const id: db.ParentColumn<'id'> = new db.ParentColumn<'nope'>();
    void id;
  });

  test('a helper generic over a table takes the caller\'s parent(), checked against that table (#931)', () => {
    // the docs' pattern: the caller's literal parent('id') is checked, and the helper relates no generic column
    const accountOf = <T extends s.Table>(col: db.ParentColumn<s.ColumnForTable<T>>) =>
      db.selectExactlyOne('accounts', { owner_id: col });
    const q = db.select('users', db.all, { lateral: { account: accountOf<'users'>(db.parent('id')) } });
    expectTypeOf<Run<typeof q>[number]['account']>().toEqualTypeOf<s.accounts.JSONSelectable>();
    expectTypeOf(accountOf<'users'>(db.parent('id'))).not.toBeAny();
    // @ts-expect-error sku is no column of users
    accountOf<'users'>(db.parent('sku'));
    // @ts-expect-error 'nope' is no column of any table
    accountOf<'users'>(db.parent('nope'));
  });
});

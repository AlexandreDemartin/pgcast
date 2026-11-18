// Copyright (C) 2026 Alexandre Demartin
//
// Types of the conditions of src/db/conditions.ts added by pgcast, on the fixture schema: the
// value is checked against the column, as for the conditions of Zapatos 6.6.1 (test/types/core.test-d.ts).

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type { PgPreferences } from 'zapatos/custom';

const c = db.conditions;

describe('eqAny()', () => {
  test('takes an array of the column type, or parent(), and gives a condition on that type', () => {
    expectTypeOf(c.eqAny([1, 2])).toEqualTypeOf<db.SQLFragment<boolean | null, number>>();
    expectTypeOf(c.eqAny([1, 2])).not.toBeAny();
    expectTypeOf(c.eqAny(db.parent('scores'))).toEqualTypeOf<db.SQLFragment<boolean | null, never>>();
    const ids: readonly number[] = [1, 2];
    expectTypeOf(db.select('users', {
      id: c.eqAny(ids), display_name: c.eqAny(['Ada']), mood: c.eqAny(['ok', 'happy']), email: c.eqAny(['a@b']),
      settings: c.eqAny([{ theme: 'dark' }, '{}']), created_at: c.eqAny([new Date(), '2026-01-01T00:00:00Z']),
    }).run).returns.resolves.not.toBeAny();
    db.select('accounts', { id: c.eqAny([1, '2', BigInt(3)]), overdraft_limit: c.eqAny([100]), opened_on: c.eqAny([new Date()]) });
    db.select('users', { id: c.eqAny([]) });
    db.select('users', { id: c.not(c.eqAny([1])) });
    db.select('accounts', db.all, { lateral: { owners: db.select('users', { id: c.eqAny(db.parent('scores')) }) } });
  });

  test('refuses an item of another type, one value, or a list that is not an array', () => {
    // @ts-expect-error a string item on an int column
    db.select('users', { id: c.eqAny(['1']) });
    // @ts-expect-error a label that is not one of the enum's
    db.select('users', { mood: c.eqAny(['nope']) });
    // @ts-expect-error a number item on a text column
    db.select('users', { display_name: c.eqAny([1]) });
    // @ts-expect-error one value in place of the list
    db.select('users', { id: c.eqAny(1) });
    // @ts-expect-error a Set
    db.select('users', { id: c.eqAny(new Set([1])) });
    // @ts-expect-error a Parameter of the array
    db.select('users', { id: c.eqAny(db.param([1])) });
    // @ts-expect-error a sql fragment in place of the array
    db.select('users', { id: c.eqAny(db.sql`ARRAY[1]`) });
  });

  test('refuses Default, self, raw(), cols() and vals() as items, as isIn() does', () => {
    // @ts-expect-error Default
    db.select('users', { id: c.eqAny([db.Default]) });
    // @ts-expect-error self
    db.select('users', { display_name: c.eqAny([db.self]) });
    // @ts-expect-error raw()
    db.select('users', { display_name: c.eqAny([db.raw("'Ada'")]) });
    // @ts-expect-error cols()
    db.select('users', { display_name: c.eqAny([db.cols('Ada')]) });
    // @ts-expect-error vals()
    db.select('users', { id: c.eqAny([db.vals(1)]) });
    // @ts-expect-error all
    db.select('users', { display_name: c.eqAny([db.all]) });
  });

  test('characterization: a Parameter, a sql fragment or parent() item passes the type, and throws as the query compiles', () => {
    // characterization: the Whereable takes each of them as a value (isIn() compiles them), so the item type does too;
    // one array parameter cannot hold them (test/unit/conditions.test.ts). A type that refuses Parameter and parent()
    // by their shape would refuse the jsonb items {} and { value: 1 } too, and a check on T, by their tag, a forwarder
    // `<T extends number>(ids: readonly T[]) => eqAny(ids)`, T being deferred there (#570)
    db.select('users', { settings: c.eqAny([{}, { value: 1 }]) });
    db.select('users', { id: c.eqAny([db.param(1)]), display_name: c.eqAny([db.sql`'Ada'`]), email: c.eqAny([db.parent('email')]) });
  });

  test('characterization: {}, { value } and param() of a column name pass as the ParentColumn, and throw as the query compiles', () => {
    // characterization (#570): ParentColumn's members are all optional, so these fit it, and take the overload of
    // parent(); eqAny() throws on each as the query compiles (test/unit/conditions.test.ts), before any query, and runs
    // an array typed `object`. Refusing them takes a conditional type on that overload, for about 10 % more
    // instantiations per eqAny(parent()) call
    expectTypeOf(c.eqAny({})).toEqualTypeOf<db.SQLFragment<boolean | null, never>>();
    expectTypeOf(c.eqAny(db.param('id'))).toEqualTypeOf<db.SQLFragment<boolean | null, never>>();
    db.select('users', { id: c.eqAny({}), display_name: c.eqAny({ value: 'id' }), email: c.eqAny(db.param('id')) });
    const lookalike: object = [1, 2];
    db.select('users', { id: c.eqAny(lookalike) });
    // @ts-expect-error a Parameter of a string that is no column name is no ParentColumn
    db.select('users', { id: c.eqAny(db.param('Ada')) });
  });
});

describe('likeAny() and ilikeAny()', () => {
  test('take an array of patterns, as like() and ilike() take one, and give a condition on a text-like column', () => {
    expectTypeOf(c.ilikeAny(['a%', 'b%'])).toEqualTypeOf<db.SQLFragment<boolean | null, 'a%' | 'b%'>>();
    expectTypeOf(c.ilikeAny(['a%', 'b%'])).not.toBeAny();
    expectTypeOf(c.likeAny(['a%'])).toEqualTypeOf<db.SQLFragment<boolean | null, 'a%'>>();
    expectTypeOf(c.likeAny(['a%'])).not.toBeAny();
    const patterns: readonly string[] = ['a%', 'b%'];
    expectTypeOf(c.likeAny(patterns)).toEqualTypeOf<db.SQLFragment<boolean | null, string>>();
    expectTypeOf(c.ilikeAny(patterns)).toEqualTypeOf<db.SQLFragment<boolean | null, string>>();
    expectTypeOf(db.select('users', { display_name: c.ilikeAny(patterns), email: c.likeAny(['%@example.com']) }).run)
      .returns.resolves.not.toBeAny();
    db.select('extra.type_zoo', { c_text: c.likeAny(patterns), c_varchar: c.ilikeAny(['a%']), c_char: c.likeAny(['A_a%']), c_citext: c.ilikeAny(['a%']) });
    db.select('users', { display_name: c.ilikeAny([]) });
    db.select('users', { display_name: c.not(c.ilikeAny(patterns)) });
    db.select('users', { display_name: c.or(c.likeAny(['A%']), c.ilikeAny(['b%'])) });
  });

  test('characterization: an enum column takes a pattern that is one of its labels, as like(), and Postgres refuses it (42883)', () => {
    db.select('users', { mood: c.likeAny(['ok']), display_name: c.like('A%') });
    db.select('users', { mood: c.like('ok') });
  });

  test('refuse a number column, an item that is no string, one pattern, and a list that is not an array', () => {
    // @ts-expect-error an int column
    db.select('users', { id: c.ilikeAny(['1%']) });
    // @ts-expect-error an int column, as like()
    db.select('users', { id: c.likeAny(['1%']) });
    // @ts-expect-error a pattern that is no label of the enum, as like()
    db.select('users', { mood: c.ilikeAny(['h%']) });
    // @ts-expect-error a number item
    db.select('users', { display_name: c.likeAny([1]) });
    // @ts-expect-error a null item, with strictNullChecks
    db.select('users', { display_name: c.ilikeAny(['a%', null]) });
    // @ts-expect-error one pattern in place of the list
    db.select('users', { display_name: c.ilikeAny('a%') });
    // @ts-expect-error a Set
    db.select('users', { display_name: c.likeAny(new Set(['a%'])) });
    // @ts-expect-error a Parameter of the array
    db.select('users', { display_name: c.ilikeAny(db.param(['a%'])) });
    // @ts-expect-error parent(), which eqAny() takes
    db.select('users', { display_name: c.ilikeAny(db.parent('tags')) });
    // @ts-expect-error a sql fragment in place of the array
    db.select('users', { display_name: c.likeAny(db.sql`ARRAY['a%']`) });
  });

  test('refuse Default, self, all, raw(), cols(), vals(), a Parameter and a fragment as items', () => {
    // @ts-expect-error Default
    db.select('users', { display_name: c.ilikeAny([db.Default]) });
    // @ts-expect-error self
    db.select('users', { display_name: c.ilikeAny([db.self]) });
    // @ts-expect-error all
    db.select('users', { display_name: c.likeAny([db.all]) });
    // @ts-expect-error raw()
    db.select('users', { display_name: c.likeAny([db.raw("'a%'")]) });
    // @ts-expect-error cols()
    db.select('users', { display_name: c.ilikeAny([db.cols('a%')]) });
    // @ts-expect-error vals()
    db.select('users', { display_name: c.ilikeAny([db.vals('a%')]) });
    // @ts-expect-error a Parameter
    db.select('users', { display_name: c.ilikeAny([db.param('a%')]) });
    // @ts-expect-error a sql fragment
    db.select('users', { display_name: c.likeAny([db.sql`'a%'`]) });
  });
});

describe('websearchToTsquery()', () => {
  test('gives a condition on a tsvector column, whose placeholder is any as generated', () => {
    expectTypeOf(c.websearchToTsquery('english', 'salt')).toEqualTypeOf<db.SQLFragment<boolean | null, db.conditions.TsvectorColumn>>();
    expectTypeOf(c.websearchToTsquery('english', 'salt')).not.toBeAny();
    expectTypeOf(db.select('products', { search: c.websearchToTsquery('simple', 'shirt') }).run).returns.resolves.not.toBeAny();
    db.select('products', { search: c.and(c.websearchToTsquery('simple', 'shirt'), c.isNotNull) });
    db.select('products', { search: c.not(c.websearchToTsquery('simple', 'shirt')) });
    db.count('extra.type_zoo', { c_tsvector: c.websearchToTsquery('simple', 'shirt') });
    db.sql<s.products.SQL>`SELECT ${'id'} FROM ${'products'} WHERE ${{ search: c.websearchToTsquery('simple', 'shirt') }}`;
    const config: string = 'english', query: string = 'salt';
    db.select('products', { search: c.websearchToTsquery(config, query) });
  });

  test('refuses a column of another type: text, citext, a domain over citext, an int, jsonb, an enum, a timestamptz', () => {
    // @ts-expect-error a text column: Postgres would run `text @@ tsquery` with the default configuration
    db.select('products', { title: c.websearchToTsquery('simple', 'shirt') });
    // @ts-expect-error a citext column, typed string
    db.select('extra.type_zoo', { c_citext: c.websearchToTsquery('simple', 'shirt') });
    // @ts-expect-error a domain over citext, its placeholder string as generated
    db.select('users', { email: c.websearchToTsquery('simple', 'ada') });
    // @ts-expect-error an int column
    db.select('users', { id: c.websearchToTsquery('simple', 'ada') });
    // @ts-expect-error a jsonb column
    db.select('users', { settings: c.websearchToTsquery('simple', 'dark') });
    // @ts-expect-error an enum column
    db.select('users', { mood: c.websearchToTsquery('simple', 'happy') });
    // @ts-expect-error a timestamptz column
    db.select('users', { created_at: c.websearchToTsquery('simple', 'today') });
  });

  test('characterization: takes any column typed any, an xml column too, which Postgres refuses (42883)', () => {
    db.select('extra.type_zoo', { c_xml: c.websearchToTsquery('simple', 'shirt') });
  });

  test('takes the type it is given, for a project that edited its PgTsvector placeholder', () => {
    // an edited placeholder, `string`, types the column as a text column: the explicit T names it
    expectTypeOf(c.websearchToTsquery<string>('english', 'salt')).toEqualTypeOf<db.SQLFragment<boolean | null, string>>();
    db.select('products', { title: c.websearchToTsquery<string>('simple', 'shirt') });
    // @ts-expect-error and() does not lend it the column's type
    db.select('products', { title: c.and(c.websearchToTsquery('simple', 'shirt')) });
  });

  test('refuses a configuration or a query that is not a string', () => {
    // @ts-expect-error no configuration
    c.websearchToTsquery('salt');
    // @ts-expect-error a number query
    c.websearchToTsquery('english', 42);
    // @ts-expect-error a null query
    c.websearchToTsquery('english', null);
    // @ts-expect-error a Parameter configuration
    c.websearchToTsquery(db.param('english'), 'salt');
    // @ts-expect-error a sql fragment query
    c.websearchToTsquery('english', db.sql`'salt'`);
    // @ts-expect-error parent() as the query
    c.websearchToTsquery('english', db.parent('title'));
    // @ts-expect-error Default as the configuration
    c.websearchToTsquery(db.Default, 'salt');
    // @ts-expect-error all as the configuration
    c.websearchToTsquery(db.all, 'salt');
    // @ts-expect-error an array as the query
    c.websearchToTsquery('english', ['salt', 'orchard']);
  });
});

describe('jsonbContains()', () => {
  test('takes a JSON value, and gives a condition on JSONValue that a jsonb column takes', () => {
    expectTypeOf(c.jsonbContains({ theme: 'dark' })).toEqualTypeOf<db.SQLFragment<boolean | null, db.JSONValue>>();
    expectTypeOf(c.jsonbContains({ theme: 'dark' })).not.toBeAny();
    expectTypeOf(db.select('users', { settings: c.jsonbContains({ theme: 'dark', sizes: [1, 2], nested: { a: null } }) }).run)
      .returns.resolves.not.toBeAny();
    db.select('users', { settings: c.jsonbContains('dark') });
    db.select('users', { settings: c.jsonbContains(1) });
    db.select('users', { settings: c.jsonbContains(true) });
    db.select('users', { settings: c.jsonbContains(null) });
    db.select('users', { settings: c.jsonbContains(['dark']) });
    db.select('users', { settings: c.jsonbContains({}) });
    db.select('users', { settings: c.not(c.jsonbContains({ theme: 'dark' })) });
    db.select('events', { payload: c.jsonbContains({ user: 1 }) });
    db.select('extra.type_zoo', { c_jsonb: c.jsonbContains([{ a: 1 }]) });
    const fromJSON: db.JSONValue = JSON.parse('{"theme":"dark"}');
    db.select('users', { settings: c.jsonbContains(fromJSON) });
  });

  test('refuses a column of another type', () => {
    // @ts-expect-error a text column
    db.select('users', { display_name: c.jsonbContains('Ada') });
    // @ts-expect-error an int column
    db.select('users', { id: c.jsonbContains(1) });
    // @ts-expect-error a jsonb[] column
    db.select('extra.type_zoo', { c_jsonb_array: c.jsonbContains([{ a: 1 }]) });
    // @ts-expect-error a text[] column
    db.select('extra.type_zoo', { c_text_array: c.jsonbContains(['a']) });
    // @ts-expect-error a bool column
    db.select('extra.type_zoo', { c_bool: c.jsonbContains(true) });
  });

  test('refuses what is no JSON value', () => {
    // @ts-expect-error a Date, which JSON.stringify writes as a string
    db.select('users', { settings: c.jsonbContains(new Date()) });
    // @ts-expect-error a bigint, which JSON.stringify refuses
    db.select('users', { settings: c.jsonbContains(BigInt(1)) });
    // @ts-expect-error undefined, sent as NULL
    db.select('users', { settings: c.jsonbContains(undefined) });
    // @ts-expect-error a key holding undefined, which JSON.stringify leaves out
    db.select('users', { settings: c.jsonbContains({ theme: undefined }) });
    // @ts-expect-error a function
    db.select('users', { settings: c.jsonbContains(() => 1) });
  });

  test('refuses Default, self, param(), parent(), a sql fragment, raw(), cols() and vals()', () => {
    // @ts-expect-error Default
    db.select('users', { settings: c.jsonbContains(db.Default) });
    // @ts-expect-error self
    db.select('users', { settings: c.jsonbContains(db.self) });
    // @ts-expect-error all
    db.select('users', { settings: c.jsonbContains(db.all) });
    // @ts-expect-error param()
    db.select('users', { settings: c.jsonbContains(db.param({ theme: 'dark' })) });
    // @ts-expect-error parent()
    db.select('users', { settings: c.jsonbContains(db.parent('settings')) });
    // @ts-expect-error a sql fragment
    db.select('users', { settings: c.jsonbContains(db.sql`'{}'`) });
    // @ts-expect-error raw()
    db.select('users', { settings: c.jsonbContains(db.raw("'{}'")) });
    // @ts-expect-error cols()
    db.select('users', { settings: c.jsonbContains(db.cols(['a'])) });
    // @ts-expect-error vals()
    db.select('users', { settings: c.jsonbContains(db.vals(['a'])) });
  });

  test('characterization: a json column passes the type, both being JSONValue, and Postgres refuses it (42883)', () => {
    db.select('extra.type_zoo', { c_json: c.jsonbContains({}) });
  });
});

describe('jsonbContains() on a jsonb domain whose placeholder is narrowed', () => {
  // extra.type_zoo.c_jsonb_domain, of the domain preferences: its placeholder is an interface with a required key
  // (./custom/PgPreferences.d.ts), so JSONValue does not fit it, and a value it contains need not hold every key
  test('takes the column type as its type argument, and any JSON value', () => {
    expectTypeOf(c.jsonbContains<PgPreferences>({ sizes: [1] })).toEqualTypeOf<db.SQLFragment<boolean | null, PgPreferences>>();
    expectTypeOf(c.jsonbContains<PgPreferences>({ sizes: [1] })).not.toBeAny();
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbContains<PgPreferences>({ theme: 'dark' }) });
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbContains<PgPreferences>({ sizes: [1] }) });
    db.select('extra.type_zoo', { c_jsonb_domain: c.not(c.jsonbContains<PgPreferences>({ theme: 'dark' })) });
    db.update('extra.type_zoo', { c_bool: true }, { c_jsonb_domain: c.jsonbContains<PgPreferences>({ theme: 'dark' }) });
  });

  test('refuses it without the type argument, and the type argument on another column', () => {
    // @ts-expect-error the condition's JSONValue, wider than the placeholder
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbContains({ theme: 'dark' }) });
    // @ts-expect-error a text column, the type argument naming another column's type
    db.select('users', { display_name: c.jsonbContains<PgPreferences>({ theme: 'dark' }) });
    // @ts-expect-error a Date, no JSON value, with the type argument too
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbContains<PgPreferences>(new Date()) });
  });
});

describe('jsonbPathExists()', () => {
  test('takes a path and an object of variables, and gives a condition on JSONValue that a jsonb column takes', () => {
    expectTypeOf(c.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' })).toEqualTypeOf<db.SQLFragment<boolean | null, db.JSONValue>>();
    expectTypeOf(c.jsonbPathExists('$.theme')).not.toBeAny();
    expectTypeOf(db.select('users', { settings: c.jsonbPathExists('$.theme ? (@ == $theme)', { theme: 'dark' }) }).run)
      .returns.resolves.not.toBeAny();
    expectTypeOf<Parameters<typeof c.jsonbPathExists>>().toEqualTypeOf<[path: string, vars?: db.JSONObject]>();
    db.select('users', { settings: c.jsonbPathExists('$.theme') });
    db.select('users', { settings: c.jsonbPathExists('$.theme', undefined) });
    db.select('users', { settings: c.jsonbPathExists('$ ? (@.n < $n && @.tags == $tags)', { n: 1, tags: ['a', null], o: { b: false } }) });
    db.select('users', { settings: c.not(c.jsonbPathExists('$.theme')) });
    db.select('events', { payload: c.jsonbPathExists('$.user ? (@ == $user)', { user: 1 }) });
    const path: string = '$.theme', fromJSON: db.JSONObject = JSON.parse('{"theme":"dark"}');
    db.select('users', { settings: c.jsonbPathExists(path, fromJSON) });
  });

  test('refuses a column of another type', () => {
    // @ts-expect-error a text column
    db.select('users', { display_name: c.jsonbPathExists('$') });
    // @ts-expect-error an int column
    db.select('users', { id: c.jsonbPathExists('$') });
    // @ts-expect-error a jsonb[] column
    db.select('extra.type_zoo', { c_jsonb_array: c.jsonbPathExists('$') });
    // @ts-expect-error a text[] column
    db.select('extra.type_zoo', { c_text_array: c.jsonbPathExists('$') });
  });

  test('refuses a path that is no string, and variables that are no object of JSON values', () => {
    // @ts-expect-error no path
    db.select('users', { settings: c.jsonbPathExists() });
    // @ts-expect-error a number as the path
    db.select('users', { settings: c.jsonbPathExists(1) });
    // @ts-expect-error param() as the path
    db.select('users', { settings: c.jsonbPathExists(db.param('$')) });
    // @ts-expect-error a sql fragment as the path
    db.select('users', { settings: c.jsonbPathExists(db.sql`'$'`) });
    // @ts-expect-error parent() as the path
    db.select('users', { settings: c.jsonbPathExists(db.parent('display_name')) });
    // @ts-expect-error an array as the variables, which Postgres refuses (22023)
    db.select('users', { settings: c.jsonbPathExists('$', ['dark']) });
    // @ts-expect-error a string as the variables
    db.select('users', { settings: c.jsonbPathExists('$', 'dark') });
    // @ts-expect-error null as the variables
    db.select('users', { settings: c.jsonbPathExists('$', null) });
    // @ts-expect-error a variable holding undefined, which JSON.stringify leaves out
    db.select('users', { settings: c.jsonbPathExists('$', { theme: undefined }) });
    // @ts-expect-error a variable holding a Date
    db.select('users', { settings: c.jsonbPathExists('$', { day: new Date() }) });
    // @ts-expect-error a variable holding a bigint
    db.select('users', { settings: c.jsonbPathExists('$', { n: BigInt(1) }) });
    // @ts-expect-error param() as the variables
    db.select('users', { settings: c.jsonbPathExists('$', db.param({ theme: 'dark' })) });
    // @ts-expect-error a variable holding param()
    db.select('users', { settings: c.jsonbPathExists('$', { theme: db.param('dark') }) });
  });

  test('characterization: a json column passes the type, both being JSONValue, and Postgres refuses it (42883)', () => {
    db.select('extra.type_zoo', { c_json: c.jsonbPathExists('$') });
  });
});

describe('jsonbPathExists() on a jsonb domain whose placeholder is narrowed', () => {
  test('takes the column type as its type argument', () => {
    expectTypeOf(c.jsonbPathExists<PgPreferences>('$.theme')).toEqualTypeOf<db.SQLFragment<boolean | null, PgPreferences>>();
    expectTypeOf(c.jsonbPathExists<PgPreferences>('$.theme')).not.toBeAny();
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbPathExists<PgPreferences>('$.theme ? (@ == $theme)', { theme: 'dark' }) });
    db.update('extra.type_zoo', { c_bool: true }, { c_jsonb_domain: c.not(c.jsonbPathExists<PgPreferences>('$.sizes')) });
  });

  test('refuses it without the type argument, and the type argument on another column', () => {
    // @ts-expect-error the condition's JSONValue, wider than the placeholder
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbPathExists('$.theme') });
    // @ts-expect-error a text column, the type argument naming another column's type
    db.select('users', { display_name: c.jsonbPathExists<PgPreferences>('$.theme') });
    // @ts-expect-error an array as the variables, with the type argument too
    db.select('extra.type_zoo', { c_jsonb_domain: c.jsonbPathExists<PgPreferences>('$', ['dark']) });
  });
});

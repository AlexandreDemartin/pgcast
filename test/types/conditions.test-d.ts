// Copyright (C) 2026 Alexandre Demartin
//
// Types of the conditions of src/db/conditions.ts added by pgcast, on the fixture schema: the
// value is checked against the column, as for the conditions of Zapatos 6.6.1 (test/types/core.test-d.ts).

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';

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
  });

  test('characterization: a Parameter, a sql fragment or parent() item passes the type, and throws as the query compiles', () => {
    // characterization: the Whereable takes each of them as a value (isIn() compiles them), so the item type does too;
    // one array parameter cannot hold them (test/unit/conditions.test.ts). A type that refuses Parameter and parent()
    // by their shape would refuse the jsonb items {} and { value: 1 } too
    db.select('users', { settings: c.eqAny([{}, { value: 1 }]) });
    db.select('users', { id: c.eqAny([db.param(1)]), display_name: c.eqAny([db.sql`'Ada'`]), email: c.eqAny([db.parent('email')]) });
  });
});

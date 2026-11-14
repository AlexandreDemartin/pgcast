// Copyright (C) 2026 Alexandre Demartin
//
// The types of sum(), avg(), min() and max() with aggregatesTypedByColumn declared in ConfigTypes,
// on the fixture schema: null on an empty set, and min / max typed by their column, as pg parses it
// at top level, as JSON nested in a query. Without the declaration: ../types/shortcuts.test-d.ts.

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}

declare const pool: db.Queryable;

/** RunResult of a SQLFragment. */
type Run<Q> = Q extends db.SQLFragment<infer R, any> ? R : never;

describe('with aggregatesTypedByColumn declared', () => {
  test('sum and avg: a number or null; count: a number', () => {
    const total = db.sum('accounts', db.all, { columns: ['balance'] });
    expectTypeOf(total.run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.avg('accounts', db.all, { columns: ['ratio'] }).run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.count('accounts', db.all).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(total.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error the sum of no row is null, not a number
    total.run(pool).then((n): number => n);
  });

  test('min and max at top level: the Selectable type of their column, or null', () => {
    const earliest = db.min('events', db.all, { columns: ['occurred_on'] });
    expectTypeOf(earliest.run(pool)).resolves.toEqualTypeOf<Date | null>();
    expectTypeOf(db.max('users', db.all, { columns: ['display_name'] }).run(pool)).resolves.toEqualTypeOf<string | null>();
    expectTypeOf(db.max('accounts', db.all, { columns: ['balance'] }).run(pool)).resolves.toEqualTypeOf<s.accounts.Selectable['balance'] | null>();
    expectTypeOf(db.min('accounts', db.all, { columns: ['lifetime_ops'] }).run(pool)).resolves.toEqualTypeOf<db.Int8String | null>();
    expectTypeOf(db.max('accounts', db.all, { columns: ['ratio'] }).run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(earliest.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error a date's min is a Date, not a number
    earliest.run(pool).then((d): number | null => d);
    // @ts-expect-error a text's max is a string, not a number
    db.max('users', db.all, { columns: ['display_name'] }).run(pool).then((t): number | null => t);
    // @ts-expect-error a numeric comes as a string at top level
    db.max('accounts', db.all, { columns: ['balance'] }).run(pool).then((b): number | null => b);
  });

  test('nested in a lateral or as an extra: the JSONSelectable type of their column, or null', () => {
    const q = db.selectOne('users', { id: 1 }, {
      columns: ['id'],
      extras: { latest: db.max('events', db.all, { columns: ['occurred_on'] }) },
      lateral: {
        first: db.min('events', db.all, { columns: ['occurred_on'] }),
        name: db.max('users', db.all, { columns: ['display_name'] }),
        top: db.max('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
        total: db.sum('accounts', { owner_id: db.parent('id') }, { columns: ['balance'] }),
      },
    });
    type Row = NonNullable<Run<typeof q>>;
    expectTypeOf<Row['latest']>().toEqualTypeOf<db.DateString | null>();
    expectTypeOf<Row['first']>().toEqualTypeOf<db.DateString | null>();
    expectTypeOf<Row['name']>().toEqualTypeOf<string | null>();
    expectTypeOf<Row['top']>().toEqualTypeOf<number | null>();
    expectTypeOf<Row['total']>().toEqualTypeOf<number | null>();
    const nested = db.min('events', db.all, { columns: ['occurred_on'] });
    expectTypeOf<db.RunResultForSQLFragment<typeof nested>>().toEqualTypeOf<db.DateString | null>();
    // @ts-expect-error nested, a date comes back as a string, not a Date
    expectTypeOf<Row['first']>().toEqualTypeOf<Date | null>();
    // @ts-expect-error nested, a numeric comes back as a number, not a string
    expectTypeOf<Row['top']>().toEqualTypeOf<db.NumericString | null>();
  });

  test('passed through a single lateral: the Selectable type from selectOne and selectExactlyOne, the JSONSelectable one from select', () => {
    // selectOne() and selectExactlyOne() hand the passed-through column over as pg parses it; select() wraps it in jsonb_agg()
    const earliest = db.min('events', db.all, { columns: ['occurred_on'] });
    const one = db.selectOne('users', db.all, { lateral: earliest });
    expectTypeOf(one.run(pool)).resolves.toEqualTypeOf<Date | null | undefined>();
    expectTypeOf(db.selectExactlyOne('users', db.all, { lateral: db.max('accounts', db.all, { columns: ['balance'] }) }).run(pool))
      .resolves.toEqualTypeOf<db.NumericString | null>();
    expectTypeOf(db.select('users', db.all, { lateral: earliest }).run(pool)).resolves.toEqualTypeOf<(db.DateString | null)[]>();
    expectTypeOf(db.selectOne('users', db.all, { lateral: db.sum('accounts', db.all, { columns: ['balance'] }) }).run(pool))
      .resolves.toEqualTypeOf<number | null | undefined>();
    expectTypeOf(one.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error passed through selectOne(), a date comes as a Date, not a string
    one.run(pool).then((d): db.DateString | null | undefined => d);
  });

  test('calls that compile under 6.6.1 still compile, and throw at run time', () => {
    expectTypeOf(db.max('accounts', db.all)).not.toBeAny();
    expectTypeOf(db.min('accounts', db.all, { columns: ['balance', 'ratio'] })).not.toBeAny();
    const cols: s.accounts.Column[] = ['balance'];
    expectTypeOf(db.max('accounts', db.all, { columns: cols }).run(pool)).resolves.not.toBeAny();
  });
});

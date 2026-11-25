// Copyright (C) 2026 Alexandre Demartin
//
// The types of sum(), avg(), min() and max(), typed by column, on the fixture schema: null on an empty
// set, and min / max typed by their column, as pg parses it at top level, as JSON nested in a query.
// The only types from 8.0, which removed aggregatesTypedByColumn and ConfigTypes (decision 019 § 3).

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

declare const pool: db.Queryable;

/** RunResult of a SQLFragment. */
type Run<Q> = Q extends db.SQLFragment<infer R, any> ? R : never;

describe('aggregates typed by column', () => {
  test('sum and avg: a number or null; count: a number', () => {
    const total = db.sum('accounts', db.all, { columns: ['balance'] });
    expectTypeOf(total.run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.avg('accounts', db.all, { columns: ['ratio'] }).run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.count('accounts', db.all).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(total.run(pool)).resolves.not.toBeAny();
    // options that can leave no row (#163) give null then, 0 for count(), which the types already hold
    expectTypeOf(db.sum('accounts', db.all, { columns: ['balance'], limit: 0 }).run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.min('events', db.all, { columns: ['occurred_on'], having: db.sql`false` }).run(pool)).resolves.toEqualTypeOf<Date | null>();
    expectTypeOf(db.count('accounts', db.all, { offset: 1 }).run(pool)).resolves.toEqualTypeOf<number>();
    // @ts-expect-error the sum of no row is null, not a number
    total.run(pool).then((n): number => n);
    // @ts-expect-error TS18047: arithmetic on the sum needs its null handled first, `?? 0`
    total.run(pool).then(n => n + 1);
    expectTypeOf(total.run(pool).then(n => (n ?? 0) + 1)).resolves.toEqualTypeOf<number>();
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

  test('passed through by selectRows(): each row typed as selectOne() types its row, not as select() does', () => {
    const mapOfSelect = () => db.select('users', db.all, { columns: ['id'], lateral: { earliest: db.min('events', db.all, { columns: ['occurred_on'] }) } });
    // selectRows() is select()'s query without jsonb_agg(): each row hands the passed-through column over as pg parses it
    const earliest = db.min('events', db.all, { columns: ['occurred_on'] });
    const rows = db.selectRows('users', db.all, { lateral: earliest });
    expectTypeOf(rows.run(pool)).resolves.toEqualTypeOf<(Date | null)[]>();
    const one = db.selectOne('users', db.all, { lateral: earliest });
    expectTypeOf(rows.run(pool)).resolves.toEqualTypeOf<Exclude<Run<typeof one>, undefined>[]>();
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.max('accounts', db.all, { columns: ['balance'] }) }).run(pool))
      .resolves.toEqualTypeOf<(db.NumericString | null)[]>();
    expectTypeOf(rows.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error passed through selectRows(), a date comes as a Date, not the string select() gives
    rows.run(pool).then((d): (db.DateString | null)[] => d);
    // a lateral map is JSON, as in select()
    const map = db.selectRows('users', db.all, { columns: ['id'], lateral: { earliest } });
    expectTypeOf(map.run(pool)).resolves.toEqualTypeOf<Run<typeof map>>();
    expectTypeOf<Run<typeof map>>().toEqualTypeOf<Run<ReturnType<typeof mapOfSelect>>>();
    expectTypeOf<Run<typeof map>[number]['earliest']>().toEqualTypeOf<db.DateString | null>();
  });

  test('passed through by selectRows(): min() and max() typed by column; a lateral typed number refused (#749)', () => {
    const p = db.parent('id');
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.min('accounts', { owner_id: p }, { columns: ['ratio'] }) }).run(pool))
      .resolves.toEqualTypeOf<(number | null)[]>();
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.max('accounts', { owner_id: p }, { columns: ['lifetime_ops'] }) }).run(pool))
      .resolves.toEqualTypeOf<(db.Int8String | null)[]>();
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.max('accounts', { owner_id: p }, { columns: ['opened_on'] }) }).run(pool))
      .resolves.toEqualTypeOf<(Date | null)[]>();
    // a selectOne() passing a typed min() through keeps its brand, and its column comes as pg parses it
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.selectOne('accounts', { owner_id: p }, { lateral: db.min('events', db.all, { columns: ['occurred_on'] }) }) }).run(pool))
      .resolves.toEqualTypeOf<(Date | null)[]>();
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.sql<db.SQL, db.Int8String>`SELECT 7::int8 AS result` }).run(pool))
      .resolves.toEqualTypeOf<db.Int8String[]>();
    expectTypeOf(db.selectRows('users', db.all, { lateral: db.sql<db.SQL, Date>`SELECT now() AS result` }).run(pool))
      .resolves.toEqualTypeOf<Date[]>();
    // @ts-expect-error count() passed through: pg gives its bigint as a string
    db.selectRows('users', db.all, { lateral: db.count('accounts', { owner_id: p }) });
    // @ts-expect-error sum() passed through, typed number | null: pg gives a numeric as a string
    db.selectRows('users', db.all, { lateral: db.sum('accounts', { owner_id: p }, { columns: ['balance'] }) });
    // @ts-expect-error avg() passed through, typed number | null: pg gives a numeric as a string
    db.selectRows('users', db.all, { lateral: db.avg('accounts', { owner_id: p }, { columns: ['balance'] }) });
    // @ts-expect-error a sql template typed number: the type cannot tell it from count()
    db.selectRows('users', db.all, { lateral: db.sql<db.SQL, number>`SELECT 7::int8 AS result` });
  });

  test('passed through a selectOne() or selectExactlyOne() nested in a lateral or as an extra: the JSONSelectable type, or null', () => {
    // nested in turn, the passed-through column comes back as JSON, as a min() or max() nested directly does
    const earliest = db.min('events', db.all, { columns: ['occurred_on'] });
    const top = db.max('accounts', db.all, { columns: ['balance'] });
    const q = db.select('users', db.all, {
      columns: ['id'],
      extras: {
        firstAsExtra: db.selectExactlyOne('users', db.all, { lateral: earliest }),
        topAsExtra: db.selectOne('users', db.all, { lateral: top }),
      },
      lateral: {
        first: db.selectOne('users', db.all, { lateral: earliest }),
        top: db.selectExactlyOne('users', db.all, { lateral: top }),
      },
    });
    type Row = Run<typeof q>[number];
    expectTypeOf<Row['first']>().toEqualTypeOf<db.DateString | null>();
    expectTypeOf<Row['firstAsExtra']>().toEqualTypeOf<db.DateString | null>();
    expectTypeOf<Row['top']>().toEqualTypeOf<number | null>();
    expectTypeOf<Row['topAsExtra']>().toEqualTypeOf<number | null>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error nested in turn, a date comes back as a string, not a Date
    expectTypeOf<Row['first']>().toEqualTypeOf<Date | null>();
    // @ts-expect-error nested in turn, a numeric comes back as a number, not a string
    expectTypeOf<Row['topAsExtra']>().toEqualTypeOf<db.NumericString | null>();
    // passed through again: as it is by selectOne(), as JSON by select()
    const one = db.selectOne('users', db.all, { lateral: earliest });
    expectTypeOf(db.selectOne('users', db.all, { lateral: one }).run(pool)).resolves.toEqualTypeOf<Date | null | undefined>();
    expectTypeOf(db.select('users', db.all, { lateral: one }).run(pool)).resolves.toEqualTypeOf<(db.DateString | null)[]>();
  });

  test('a copy resolves to the aggregate\'s result: the column\'s value, or null', () => {
    expectTypeOf(db.sum('accounts', db.all, { columns: ['balance'] }).copy().run(pool)).resolves.toEqualTypeOf<number | null>();
    expectTypeOf(db.min('events', db.all, { columns: ['occurred_on'] }).copy().run(pool)).resolves.toEqualTypeOf<Date | null>();
    expectTypeOf(db.max('accounts', db.all, { columns: ['lifetime_ops'] }).copy().run(pool)).resolves.toEqualTypeOf<db.Int8String | null>();
    // @ts-expect-error the copied min of a date is a Date or null, not a number
    db.min('events', db.all, { columns: ['occurred_on'] }).copy().run(pool).then((n): number => n);
  });

  test('after withCTEs(): the column\'s value at top level, its JSON type nested, as without', async () => {
    const recent = db.sql`SELECT 1`, earliest = db.withCTEs({ recent }, db.min('events', db.all, { columns: ['occurred_on'] }));
    expectTypeOf(earliest.run(pool)).resolves.toEqualTypeOf<Date | null>();
    const user = await db.selectExactlyOne('users', db.all, { extras: { e: earliest }, lateral: { l: earliest } }).run(pool);
    expectTypeOf(user.e).toEqualTypeOf<db.DateString | null>();
    expectTypeOf(user.l).toEqualTypeOf<db.DateString | null>();
    expectTypeOf(db.selectOne('users', db.all, { lateral: earliest }).run(pool)).resolves.toEqualTypeOf<Date | null | undefined>();
    expectTypeOf(db.select('users', db.all, { lateral: earliest }).run(pool)).resolves.toEqualTypeOf<(db.DateString | null)[]>();
    // @ts-expect-error nested, the min of a date comes back as JSON, a string, not a Date
    expectTypeOf(user.l).toEqualTypeOf<Date | null>();
  });

  test('calls that compile under 6.6.1 still compile, and throw at run time', () => {
    expectTypeOf(db.max('accounts', db.all)).not.toBeAny();
    expectTypeOf(db.min('accounts', db.all, { columns: ['balance', 'ratio'] })).not.toBeAny();
    const cols: s.accounts.Column[] = ['balance'];
    expectTypeOf(db.max('accounts', db.all, { columns: cols }).run(pool)).resolves.not.toBeAny();
  });
});

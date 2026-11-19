// Copyright (C) 2026 Alexandre Demartin

import { expectTypeOf } from 'vitest';
import * as db from 'pgcast/db';
import * as zapatos from 'zapatos/db';

declare module 'pgcast/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}

declare const pool: db.Queryable;
db.setConfig({ aggregatesTypedByColumn: false });
const p = db.parent('id');
const first = db.min('events', db.all, { columns: ['occurred_on'] });
const results = Promise.all([
  db.count('users', db.all).run(pool),
  db.sum('accounts', db.all, { columns: ['balance'] }).run(pool),
  db.avg('accounts', db.all, { columns: ['ratio'] }).run(pool),
  first.run(pool),
  zapatos.max('users', db.all, { columns: ['display_name'] }).run(pool),
]);
expectTypeOf(results).resolves.toEqualTypeOf<[number, number, number, number, number]>();
expectTypeOf<Awaited<typeof results>[number]>().not.toBeAny();
expectTypeOf(db.selectOne('users', db.all, { lateral: first }).run(pool)).resolves.toEqualTypeOf<number | undefined>();
const keyed = db.select('users', db.all, { columns: [], lateral: { first } });
expectTypeOf<Awaited<ReturnType<typeof keyed.run>>[number]['first']>().toEqualTypeOf<number>();
// @ts-expect-error Number() converts a date to epoch milliseconds
first.run(pool).then((n): Date | null => n);
// @ts-expect-error min() of a number passed through, typed number but not by its column
db.selectRows('users', db.all, { lateral: db.min('accounts', { owner_id: p }, { columns: ['ratio'] }) });
// @ts-expect-error max() of an int8 passed through: pg gives it as a string
db.selectRows('users', db.all, { lateral: db.max('accounts', { owner_id: p }, { columns: ['lifetime_ops'] }) });
// @ts-expect-error min() of a date passed through: pg gives a Date
db.selectRows('users', db.all, { lateral: db.min('events', db.all, { columns: ['occurred_on'] }) });

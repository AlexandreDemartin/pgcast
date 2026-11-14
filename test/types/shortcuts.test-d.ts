// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the types of src/db/shortcuts.ts on the fixture schema:
// what each shortcut returns, and the calls it refuses.

import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

declare const pool: db.Queryable;

/** RunResult of a SQLFragment. */
type Run<Q> = Q extends db.SQLFragment<infer R, any> ? R : never;

describe('select', () => {
  test('all columns: JSONSelectable[]', () => {
    const q = db.select('users', db.all);
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test('columns: only those columns', () => {
    const q = db.select('accounts', db.all, { columns: ['id', 'balance'] });
    expectTypeOf<Run<typeof q>[number]>().toEqualTypeOf<Pick<s.accounts.JSONSelectable, 'id' | 'balance'>>();
    expectTypeOf<Run<typeof q>>().not.toBeAny();
  });

  test('extras: a fragment and a column name', () => {
    const q = db.select('users', db.all, {
      columns: ['id'],
      extras: { up: db.sql<s.users.SQL, string>`upper(${'display_name'})`, mail: 'email' },
    });
    expectTypeOf<Run<typeof q>[number]>()
      .toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'> & { up: string; mail: string }>();
  });

  test('lateral, object: one key per subquery', () => {
    const q = db.select('users', db.all, {
      lateral: { accounts: db.select('accounts', { owner_id: db.parent('id') }) },
    });
    expectTypeOf<Run<typeof q>[number]['accounts']>().toEqualTypeOf<s.accounts.JSONSelectable[]>();
    expectTypeOf<Run<typeof q>[number]['display_name']>().toEqualTypeOf<string>();
  });

  test('lateral, passthru: the subquery result replaces the row', () => {
    const q = db.select('users', db.all, { lateral: db.count('accounts', { owner_id: db.parent('id') }) });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<number[]>();
  });

  test('lateral, nested: selectOne in select, select in selectOne', () => {
    const q = db.select('users', db.all, {
      lateral: {
        first: db.selectOne('accounts', { owner_id: db.parent('id') }, {
          lateral: { out: db.select('transfers', { from_account: db.parent('id') }, { columns: ['amount'] }) },
        }),
      },
    });
    type First = Run<typeof q>[number]['first'];
    // a selectOne in a lateral can be null (LEFT JOIN): undefined becomes null
    expectTypeOf<NonNullable<First>['out']>().toEqualTypeOf<Pick<s.transfers.JSONSelectable, 'amount'>[]>();
    expectTypeOf<First>()
      .toEqualTypeOf<(s.accounts.JSONSelectable & { out: Pick<s.transfers.JSONSelectable, 'amount'>[] }) | null>();
  });

  test('refuses an unknown column, table, order direction or lock', () => {
    // @ts-expect-error 'nope' is not a table
    db.select('nope', db.all);
    // @ts-expect-error 'nope' is not a column of users (Whereable)
    db.select('users', { nope: 1 });
    // @ts-expect-error 'nope' is not a column of users (columns)
    db.select('users', db.all, { columns: ['nope'] });
    // @ts-expect-error 'UP' is not ASC / DESC
    db.select('users', db.all, { order: { by: 'id', direction: 'UP' } });
    // @ts-expect-error 'nope' is not a column of users (order.by)
    db.select('users', db.all, { order: { by: 'nope', direction: 'ASC' } });
    // @ts-expect-error 'DELETE' is not a lock strength
    db.select('users', db.all, { lock: { for: 'DELETE' } });
    // @ts-expect-error 'nope' is neither a table nor the alias (lock.of)
    db.select('users', db.all, { lock: { for: 'UPDATE', of: 'nope' } });
    // @ts-expect-error 'nope' is not a column of users (distinct)
    db.select('users', db.all, { distinct: 'nope' });
    // @ts-expect-error 'nope' is not a column of users (groupBy)
    db.select('users', db.all, { groupBy: 'nope' });
  });

  test('lock.of accepts the alias', () => {
    const q = db.select('users', db.all, { alias: 'u', lock: { for: 'UPDATE', of: 'u' } });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable[]>();
  });
});

describe('selectOne, selectExactlyOne, count', () => {
  test('selectOne: the row or undefined', () => {
    const q = db.selectOne('users', { id: 1 });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable | undefined>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test('selectExactlyOne: the row', () => {
    const q = db.selectExactlyOne('users', { id: 1 });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test('count, sum: number', () => {
    expectTypeOf(db.count('users', db.all).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.sum('accounts', db.all, { columns: ['balance'] }).run(pool)).resolves.toEqualTypeOf<number>();
  });

  test('aggregates: one column, as a literal, a tuple or an array of unknown length', () => {
    const cols: s.accounts.Column[] = ['balance'];
    const roCols: readonly s.accounts.Column[] = ['balance'];
    const one = ['balance'] as const;
    expectTypeOf(db.count('users', db.all, { columns: ['manager_id'] }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.sum('accounts', db.all, { columns: one }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.avg('accounts', db.all, { columns: cols }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.max('accounts', db.all, { columns: roCols }).run(pool)).resolves.not.toBeAny();
    // a generic wrapper, and an aggregate picked at run time
    const sumOf = <C extends readonly s.accounts.Column[]>(columns: C) => db.sum('accounts', db.all, { columns });
    expectTypeOf(sumOf(['balance']).run(pool)).resolves.toEqualTypeOf<number>();
    const pick = Math.random() > 0.5 ? db.sum : db.count;
    expectTypeOf(pick('accounts', db.all, { columns: ['balance'] }).run(pool)).resolves.toEqualTypeOf<number>();
  });

  test('aggregates keep the type of Zapatos 6.6.1: several columns and a passthru lateral compile, and throw at run time', () => {
    // the owner's decision on #34: nothing that compiles under Zapatos 6.6.1 stops compiling
    const n = db.count('accounts', { owner_id: db.parent('id') });
    expectTypeOf(db.count('users', db.all, { columns: ['id', 'mood'] })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.sum('accounts', db.all, { columns: ['balance', 'ratio'] as const })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.count('users', db.all, { lateral: n })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.count('users', db.all, { lateral: { n } }).run(pool)).resolves.toEqualTypeOf<number>();
  });

  test('aggregates take options typed with the types of Zapatos 6.6.1', () => {
    // a generic forwarder, as a pagination helper writes it
    const countOf = <T extends s.Table, C extends db.ColumnsOption<T>, L extends db.LateralOption<C, E>, E extends db.ExtrasOption<T>, A extends string>(
      table: T, where: s.WhereableForTable<T> | db.SQLFragment<any> | db.AllType, options: db.SelectOptionsForTable<T, C, L, E, A>) =>
      db.count(table, where, options);
    expectTypeOf(countOf('users', db.all, { limit: 10 }).run(pool)).resolves.toEqualTypeOf<number>();
    // an annotated {}, and columns under LateralOption
    const none: db.SelectOptionsForTable<'users', undefined, db.LateralOption<undefined, undefined>, undefined, never> = {};
    expectTypeOf(db.count('users', db.all, none)).toEqualTypeOf<db.SQLFragment<number>>();
    const balance: db.SelectOptionsForTable<'accounts', db.ColumnsOption<'accounts'>, db.LateralOption<db.ColumnsOption<'accounts'>, undefined>, undefined, never> = { columns: ['balance'] };
    expectTypeOf(db.sum('accounts', db.all, balance)).toEqualTypeOf<db.SQLFragment<number>>();
    // a union holding a two-column tuple, whose value has one
    const oneOrTwo: ['balance'] | ['balance', 'ratio'] = ['balance'];
    expectTypeOf(db.sum('accounts', db.all, { columns: oneOrTwo })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.sum('accounts', db.all, { columns: Math.random() > 0.5 ? ['balance'] : ['balance', 'ratio'] })).toEqualTypeOf<db.SQLFragment<number>>();
    // a hand-written signature of 6.6.1's shape
    type Agg661 = <T extends s.Table, C extends db.ColumnsOption<T>, L extends db.LateralOption<C, E>, E extends db.ExtrasOption<T>, A extends string>(
      table: T, where: s.WhereableForTable<T> | db.SQLFragment<any> | db.AllType, options?: db.SelectOptionsForTable<T, C, L, E, A>) => db.SQLFragment<number>;
    const agg: Agg661 = db.count;
    expectTypeOf(agg('users', db.all)).toEqualTypeOf<db.SQLFragment<number>>();
  });

  test('sum, avg, min, max without columns compile as in 6.6.1, and throw at run time', () => {
    expectTypeOf(db.sum('accounts', db.all)).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.avg('accounts', db.all, { columns: undefined })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.min).toEqualTypeOf<db.NumericAggregateSignatures>();
  });
});

describe('insert', () => {
  test('one row: JSONSelectable; an array: JSONSelectable[]', () => {
    const one = db.insert('users', { email: 'a@b', display_name: 'A' });
    const many = db.insert('users', [{ email: 'a@b', display_name: 'A' }]);
    expectTypeOf(one.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(many.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(one.run(pool)).resolves.not.toBeAny();
  });

  test('returning: only those columns', () => {
    const q = db.insert('users', { email: 'a@b', display_name: 'A' }, { returning: ['id'] });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'>>();
  });

  test('refuses a missing required column, an identity ALWAYS or a generated column', () => {
    // @ts-expect-error email is required
    db.insert('users', { display_name: 'A' });
    // @ts-expect-error users.id is GENERATED ALWAYS
    db.insert('users', { id: 1, email: 'a@b', display_name: 'A' });
    // @ts-expect-error price_with_vat_cents is generated
    db.insert('products', { sku: 'x', price_cents: 1, price_with_vat_cents: 1 });
  });
});

describe('upsert', () => {
  const row = { email: 'a@b', display_name: 'A' };

  test('adds $action by default', () => {
    const q = db.upsert('users', row, 'email');
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test("reportAction: 'suppress' drops $action", () => {
    const q = db.upsert('users', row, 'email', { reportAction: 'suppress' });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
  });

  test('updateColumns: [] (DO NOTHING) adds undefined for one row, not for an array', () => {
    const one = db.upsert('users', row, 'email', { updateColumns: [] });
    expectTypeOf(one.run(pool)).resolves.toEqualTypeOf<(s.users.JSONSelectable & db.UpsertAction) | undefined>();
    const many = db.upsert('users', [row], 'email', { updateColumns: db.doNothing });
    expectTypeOf(many.run(pool)).resolves.toEqualTypeOf<(s.users.JSONSelectable & db.UpsertAction)[]>();
  });

  test('refuses an unknown conflict column; constraint<T>() refuses an index of another table', () => {
    // @ts-expect-error 'nope' is not a column of users
    db.upsert('users', row, 'nope');
    // @ts-expect-error accounts_pkey is not a unique index of users (refused by constraint(), not by upsert)
    db.constraint<'users'>('accounts_pkey');
  });

  test("constraint() refuses another schema's unique index of the same name", () => {
    // shared_name_idx: unique on extra.articles, a plain index on public.transfers
    const transfer = { from_account: 1, to_account: 2, amount: 1 };
    db.upsert('extra.articles', { author_id: 1, body: 'b' }, db.constraint('shared_name_idx'));
    // @ts-expect-error shared_name_idx is not a unique index of transfers
    db.upsert('transfers', transfer, db.constraint('shared_name_idx'));
    // @ts-expect-error the same; given to the upsert of a table whose constraint has that name, 6.6.1 ran it
    const k = db.constraint<'transfers'>('shared_name_idx');
    db.upsert('extra.articles', { author_id: 1, body: 'b' }, k);
  });

  test('characterization: upsert accepts the constraint of another table', () => {
    // characterization: Constraint<'accounts'> passes as the conflict target of users;
    // at run time, ON CONSTRAINT accounts_pkey fails on users
    const k = db.constraint<'accounts'>('accounts_pkey');
    db.upsert('users', row, k);
    db.upsert('users', [row], k);
  });

  test('upsertRequiresSameKeys: an optional boolean of Config and setConfig', () => {
    db.setConfig({ upsertRequiresSameKeys: true });
    expectTypeOf(db.getConfig().upsertRequiresSameKeys).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<db.NewConfig['upsertRequiresSameKeys']>().toEqualTypeOf<boolean | undefined>();
    // a Config written for 6.6.1, without the key, still compiles
    const c: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
    };
    // @ts-expect-error a boolean, not a string
    const d: db.Config = { ...c, upsertRequiresSameKeys: 'yes' };
    void d;
    // @ts-expect-error a boolean, not a string
    db.setConfig({ upsertRequiresSameKeys: 'yes' });
  });
});

describe('undefinedMeansMissing', () => {
  test('an optional boolean of Config and setConfig', () => {
    db.setConfig({ undefinedMeansMissing: true });
    expectTypeOf(db.getConfig().undefinedMeansMissing).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<db.NewConfig['undefinedMeansMissing']>().toEqualTypeOf<boolean | undefined>();
    // a Config written for 6.6.1, without the key, still compiles
    const c: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
    };
    // @ts-expect-error a boolean, not a string
    const d: db.Config = { ...c, undefinedMeansMissing: 'yes' };
    void d;
    // @ts-expect-error a boolean, not a string
    db.setConfig({ undefinedMeansMissing: 'yes' });
  });
});

describe('selectExactlyOneChecksForSecondRow', () => {
  test('an optional boolean of Config and setConfig, which changes no type', () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    expectTypeOf(db.getConfig().selectExactlyOneChecksForSecondRow).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<db.NewConfig['selectExactlyOneChecksForSecondRow']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf(db.selectExactlyOne('users', { id: 1 }).run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    // a Config written for 6.6.1, without the key, still compiles
    const c: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
    };
    // @ts-expect-error a boolean, not a string
    const d: db.Config = { ...c, selectExactlyOneChecksForSecondRow: 'yes' };
    void d;
    // @ts-expect-error a boolean, not a string
    db.setConfig({ selectExactlyOneChecksForSecondRow: 'yes' });
  });
});

describe('update, deletes', () => {
  test('update: JSONSelectable[]', () => {
    const q = db.update('users', { display_name: 'B' }, { id: 1 });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    // @ts-expect-error users.id is GENERATED ALWAYS: not updatable
    db.update('users', { id: 2 }, { id: 1 });
  });

  test('deletes: JSONSelectable[], or the returning columns', () => {
    expectTypeOf(db.deletes('users', { id: 1 }).run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    const q = db.deletes('users', { id: 1 }, { returning: ['id'] });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'>[]>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test('a built-in object as the where: refused, unless it shares a member with a column', () => {
    // @ts-expect-error a Date shares no member with a column of users
    db.deletes('users', new Date());
    // @ts-expect-error nor does a Map
    db.update('users', { display_name: 'B' }, new Map());
    // the weak-type check takes an Error where a column is called `name`, as in orgs:
    // it type-checks, and throws at run time (#170; test/integration/injection.test.ts)
    db.deletes('orgs', new Error('x'));
    db.sql<s.orgs.SQL>`DELETE FROM ${'orgs'} WHERE ${new Error('x')}`;
  });
});

describe('parent() as a write value', () => {
  test('characterization: parent() as an insert(), upsert() or update() value is refused, except on a column typed any', () => {
    // a ParentColumn is no Parameter<T> (its tag, or in 6.6.1 its optional value), and no other member of an
    // Insertable or Updatable value; the runtime throws while compiling (test/integration/shortcuts.test.ts,
    // "parent() as an insert(), upsert() or update() value"). Same type in 6.6.1, with or without strict
    // @ts-expect-error parent() is no text value
    db.insert('users', { email: 'a@b', display_name: db.parent('id') });
    // @ts-expect-error nor a jsonb value
    db.insert('users', { email: 'a@b', display_name: 'A', settings: db.parent() });
    // @ts-expect-error nor an int value, in an array of rows
    db.insert('users', [{ email: 'a@b', display_name: 'A', manager_id: db.parent('id') }]);
    // @ts-expect-error nor an enum value, in upsert
    db.upsert('users', { email: 'a@b', display_name: 'A', mood: db.parent('mood') }, 'email');
    // @ts-expect-error nor a text value, in update
    db.update('users', { display_name: db.parent('id') }, { id: 1 });
    // @ts-expect-error nor a text[] value, in update
    db.update('users', { tags: db.parent() }, { id: 1 });
    // characterization: a column typed any (here a composite, whose zapatos/custom placeholder is any) takes it;
    // the call then throws before any query, where 6.6.1 sent '{"value":"id"}'
    const i = db.insert('users', { email: 'a@b', display_name: 'A', home: db.parent('id') });
    const u = db.upsert('users', { email: 'a@b', display_name: 'A', home: db.parent() }, 'email');
    const v = db.update('users', { home: db.parent('id') }, { id: 1 });
    expectTypeOf(i.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(u.run(pool)).resolves.not.toBeAny();
    expectTypeOf(v.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
  });
});

// `as const` makes a readonly tuple: the result is the row of those columns, as for a mutable array (R35)
describe('a readonly columns or returning', () => {
  const row = { email: 'a@b', display_name: 'A' };
  const cols = ['id', 'display_name'] as const;
  type Row = Pick<s.users.JSONSelectable, 'id' | 'display_name'>;

  test('select, selectOne, selectExactlyOne: those columns', () => {
    const q = db.select('users', db.all, { columns: cols });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<Row[]>();
    expectTypeOf(q.run(pool)).resolves.items.not.toBeNever();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    expectTypeOf(db.select('users', db.all, { columns: ['id', 'display_name'] }).run(pool)).resolves.toEqualTypeOf<Row[]>();
    expectTypeOf(db.selectOne('users', { id: 1 }, { columns: cols }).run(pool)).resolves.toEqualTypeOf<Row | undefined>();
    expectTypeOf(db.selectExactlyOne('users', { id: 1 }, { columns: cols }).run(pool)).resolves.toEqualTypeOf<Row>();
    const some: readonly s.users.Column[] = ['id'];
    expectTypeOf(db.select('users', db.all, { columns: some }).run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
  });

  test('with extras and lateral, and in a lateral', () => {
    const n = db.count('accounts', { owner_id: db.parent('id') });
    const q = db.select('users', db.all, { columns: cols, extras: { mail: 'email' }, lateral: { n } });
    expectTypeOf(q.run(pool)).resolves.items.toEqualTypeOf<Row & { mail: string } & { n: number }>();
    const owner = db.selectOne('users', { id: db.parent('owner_id') }, { columns: cols });
    expectTypeOf(db.select('accounts', db.all, { lateral: { owner } }).run(pool))
      .resolves.items.toHaveProperty('owner').toEqualTypeOf<Row | null>();
    const exact = db.selectExactlyOne('users', { id: db.parent('owner_id') }, { columns: cols });
    expectTypeOf(db.select('accounts', db.all, { lateral: exact }).run(pool)).resolves.toEqualTypeOf<Row[]>();
  });

  test('insert, update, deletes: those columns', () => {
    expectTypeOf(db.insert('users', row, { returning: cols }).run(pool)).resolves.toEqualTypeOf<Row>();
    expectTypeOf(db.insert('users', [row], { returning: cols }).run(pool)).resolves.toEqualTypeOf<Row[]>();
    expectTypeOf(db.insert('users', row, { returning: cols }).run(pool)).resolves.not.toBeNever();
    expectTypeOf(db.update('users', { display_name: 'B' }, { id: 1 }, { returning: cols }).run(pool)).resolves.toEqualTypeOf<Row[]>();
    expectTypeOf(db.deletes('users', { id: 1 }, { returning: cols }).run(pool)).resolves.toEqualTypeOf<Row[]>();
  });

  test("upsert: those columns, with $action unless reportAction: 'suppress'", () => {
    const q = db.upsert('users', row, 'email', { returning: cols });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<Row & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeNever();
    expectTypeOf(db.upsert('users', [row], 'email', { returning: cols }).run(pool)).resolves.toEqualTypeOf<(Row & db.UpsertAction)[]>();
    const quiet = db.upsert('users', row, 'email', { returning: cols, reportAction: 'suppress' });
    expectTypeOf(quiet.run(pool)).resolves.toEqualTypeOf<Row>();
  });

  test('the result types take a readonly tuple', () => {
    type C = typeof cols;
    expectTypeOf<db.FullSelectReturnTypeForTable<'users', C, undefined, undefined, db.SelectResultMode.Many>>().toEqualTypeOf<Row[]>();
    expectTypeOf<db.ReturningTypeForTable<'users', C, undefined>>().toEqualTypeOf<Row>();
    expectTypeOf<db.UpsertReturnableForTable<'users', C, undefined, undefined>>().toEqualTypeOf<Row & db.UpsertAction>();
    expectTypeOf<db.JSONOnlyColsForTable<'users', C>>().toEqualTypeOf<Row>();
  });

  test('refuses a type the query does not return', async () => {
    const q = db.select('users', db.all, { columns: ['id', 'display_name'] as const });
    // @ts-expect-error no_such_column is not among the columns
    const wrong: Promise<{ no_such_column: Date }[]> = q.run(pool);
    const rows = await q.run(pool);
    // @ts-expect-error the rows are objects, not numbers
    const numbers: number[] = rows;
    const one = await db.selectExactlyOne('users', { id: 1 }, { columns: cols }).run(pool);
    // @ts-expect-error users.id is a number
    const typed: { id: string } = one;
    // @ts-expect-error only id and display_name come back, not the whole row
    const whole: s.users.JSONSelectable[] = rows;
    const mutable: s.users.Column[] = ['email'];
    const either = await db.select('users', db.all, { columns: Math.random() > 0.5 ? cols : mutable }).run(pool);
    // @ts-expect-error email is missing when cols is chosen
    either[0]?.email;
    void [wrong, numbers, typed, whole];
  });

  // 6.6.1's never[] dropped out of the union, leaving the whole row; now the union keeps the narrower row
  test('a union with a query without columns: those columns', async () => {
    const f = Math.random() > 0.5 ? db.select('users', db.all, { columns: cols }) : db.select('users', db.all);
    const rows = await f.run(pool);
    expectTypeOf(rows).toEqualTypeOf<Row[]>();
    // @ts-expect-error email is missing when the first query runs
    rows[0]?.email;
    const row: Partial<s.users.JSONSelectable> | undefined = rows[0];
    expectTypeOf(row?.email).toEqualTypeOf<string | undefined>();
  });

  // 6.6.1 made a type computed from the row never, which took any key
  test('a type computed from the row: those columns', () => {
    const cards = db.select('users', db.all, { columns: cols });
    type Card = Awaited<ReturnType<typeof cards.run>>[number];
    expectTypeOf<Card>().toEqualTypeOf<Row>();
    // @ts-expect-error email is not a key of the row
    const key: keyof Card = 'email';
    // @ts-expect-error the row has no email
    const mail: Card['email'] = 'a@b';
    void [key, mail];
  });
});

describe('truncate', () => {
  test('undefined; refuses an option that is not a keyword', () => {
    expectTypeOf(db.truncate('users', 'RESTART IDENTITY', 'CASCADE').run(pool)).resolves.toEqualTypeOf<undefined>();
    // @ts-expect-error 'DROP' is not a TRUNCATE option
    db.truncate('users', 'DROP');
  });

  test('refuses an order Postgres refuses', () => {
    // @ts-expect-error the identity option comes first
    db.truncate('users', 'CASCADE', 'RESTART IDENTITY');
    // @ts-expect-error one identity option at most
    db.truncate('users', 'RESTART IDENTITY', 'CONTINUE IDENTITY');
    // @ts-expect-error one foreign key option at most
    db.truncate('users', 'CASCADE', 'RESTRICT');
    // @ts-expect-error two options at most
    db.truncate('users', 'RESTART IDENTITY', 'CASCADE', 'CASCADE');
  });
});

// The result types, written out as a test helper writes a fake result: each must equal what .run() resolves to.
describe('result types', () => {
  const row = { email: 'a@b', display_name: 'A' };
  const up = db.sql<s.users.SQL, string>`upper(${'display_name'})`;

  test('FullSelectReturnTypeForTable, Many: select', () => {
    type R = db.FullSelectReturnTypeForTable<'users', undefined, undefined, undefined, db.SelectResultMode.Many>;
    expectTypeOf(db.select('users', db.all).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf<R>().not.toBeAny();
  });

  test('FullSelectReturnTypeForTable, One: selectOne', () => {
    type R = db.FullSelectReturnTypeForTable<'users', undefined, undefined, undefined, db.SelectResultMode.One>;
    expectTypeOf(db.selectOne('users', { id: 1 }).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<s.users.JSONSelectable | undefined>();
  });

  test('FullSelectReturnTypeForTable, ExactlyOne: selectExactlyOne', () => {
    type R = db.FullSelectReturnTypeForTable<'users', undefined, undefined, undefined, db.SelectResultMode.ExactlyOne>;
    expectTypeOf(db.selectExactlyOne('users', { id: 1 }).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<s.users.JSONSelectable>();
    // @ts-expect-error ExactlyOne has no undefined
    const none: R = undefined;
    void none;
  });

  test('FullSelectReturnTypeForTable, Numeric: count', () => {
    type R = db.FullSelectReturnTypeForTable<'users', undefined, undefined, undefined, db.SelectResultMode.Numeric>;
    expectTypeOf(db.count('users', db.all).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<number>();
  });

  test('FullSelectReturnTypeForTable: columns and extras', () => {
    type E = { up: db.SQLFragment<string>; mail: 'email' };
    type R = db.FullSelectReturnTypeForTable<'users', ['id'], undefined, E, db.SelectResultMode.Many>;
    const q = db.select('users', db.all, { columns: ['id'], extras: { up, mail: 'email' } });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R[number]>().toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'> & { up: string; mail: string }>();
    // @ts-expect-error display_name is not among the columns
    const fake: R = [{ id: 1, display_name: 'A', up: 'A', mail: 'a@b' }];
    void fake;
  });

  test('FullSelectReturnTypeForTable: a lateral object and a passthru lateral', () => {
    const accounts = db.select('accounts', { owner_id: db.parent('id') });
    type L = { accounts: typeof accounts };
    type R = db.FullSelectReturnTypeForTable<'users', undefined, L, undefined, db.SelectResultMode.Many>;
    expectTypeOf(db.select('users', db.all, { lateral: { accounts } }).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R[number]['accounts']>().toEqualTypeOf<s.accounts.JSONSelectable[]>();

    const n = db.count('accounts', { owner_id: db.parent('id') });
    type P = db.FullSelectReturnTypeForTable<'users', undefined, typeof n, undefined, db.SelectResultMode.Many>;
    expectTypeOf(db.select('users', db.all, { lateral: n }).run(pool)).resolves.toEqualTypeOf<P>();
    expectTypeOf<P>().toEqualTypeOf<number[]>();
  });

  test('FullSelectReturnTypeForTable refuses an unknown column', () => {
    // @ts-expect-error 'nope' is not a column of users
    expectTypeOf<db.FullSelectReturnTypeForTable<'users', ['nope'], undefined, undefined, db.SelectResultMode.Many>>();
  });

  test('ReturningTypeForTable: insert, update and deletes, per row', () => {
    type R = db.ReturningTypeForTable<'users', undefined, undefined>;
    expectTypeOf(db.insert('users', row).run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf(db.insert('users', [row]).run(pool)).resolves.toEqualTypeOf<R[]>();
    expectTypeOf(db.update('users', { display_name: 'B' }, { id: 1 }).run(pool)).resolves.toEqualTypeOf<R[]>();
    expectTypeOf(db.deletes('users', { id: 1 }).run(pool)).resolves.toEqualTypeOf<R[]>();
    expectTypeOf<R>().toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf<R>().not.toBeAny();
  });

  test('ReturningTypeForTable: returning and extras', () => {
    type E = { up: db.SQLFragment<string>; mail: 'email' };
    type R = db.ReturningTypeForTable<'users', ['id'], E>;
    const q = db.insert('users', row, { returning: ['id'], extras: { up, mail: 'email' } });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<R>();
    const d = db.deletes('users', { id: 1 }, { returning: ['id'], extras: { up, mail: 'email' } });
    expectTypeOf(d.run(pool)).resolves.toEqualTypeOf<R[]>();
    expectTypeOf<R>().toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'> & { up: string; mail: string }>();
  });

  test('ReturningTypeForTable refuses an unknown column and a row missing one', () => {
    // @ts-expect-error 'nope' is not a column of users
    expectTypeOf<db.ReturningTypeForTable<'users', ['nope'], undefined>>();
    // @ts-expect-error id is missing
    const fake: db.ReturningTypeForTable<'users', ['id', 'email'], undefined> = { email: 'a@b' };
    void fake;
  });

  test('UpsertReturnableForTable: $action by default', () => {
    type R = db.UpsertReturnableForTable<'users', undefined, undefined, undefined>;
    expectTypeOf(db.upsert('users', row, 'email').run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf(db.upsert('users', [row], 'email').run(pool)).resolves.toEqualTypeOf<R[]>();
    expectTypeOf<R>().toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf<R>().not.toBeAny();
    // @ts-expect-error $action is missing
    const fake: db.UpsertReturnableForTable<'users', ['id'], undefined, undefined> = { id: 1 };
    void fake;
  });

  test("UpsertReturnableForTable: no $action with reportAction: 'suppress'", () => {
    type R = db.UpsertReturnableForTable<'users', ['id'], undefined, 'suppress'>;
    const q = db.upsert('users', row, 'email', { returning: ['id'], reportAction: 'suppress' });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'>>();
    // @ts-expect-error 'keep' is not a reportAction
    expectTypeOf<db.UpsertReturnableForTable<'users', undefined, undefined, 'keep'>>();
  });

  test('RunResultForSQLFragment: a lateral key, undefined read as null', () => {
    const first = db.selectOne('accounts', { owner_id: db.parent('id') });
    type R = db.RunResultForSQLFragment<typeof first>;
    const q = db.select('users', db.all, { lateral: { first } });
    expectTypeOf(q.run(pool)).resolves.items.toHaveProperty('first').toEqualTypeOf<R>();
    expectTypeOf<R>().toEqualTypeOf<s.accounts.JSONSelectable | null>();
    expectTypeOf<R>().not.toBeAny();
    // @ts-expect-error not a SQLFragment
    expectTypeOf<db.RunResultForSQLFragment<string>>();
  });
});

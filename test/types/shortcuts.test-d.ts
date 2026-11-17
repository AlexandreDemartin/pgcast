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

  // products.search, a tsvector typed any, shares its name with String's search(): a string passed as a
  // products.Whereable, so as the where of every shortcut and condition, as in Zapatos 6.6.1 (#670)
  test('refuses a string as the where of a table with a column named like a String member (#670)', () => {
    const c = db.conditions;
    expectTypeOf(db.select('products', { search: db.sql`${db.self} @@ 'salt'` })).toEqualTypeOf<db.SQLFragment<s.products.JSONSelectable[]>>();
    expectTypeOf(db.select('products', c.and({ sku: 'a' }, c.not({ title: 'b' })))).toEqualTypeOf<db.SQLFragment<s.products.JSONSelectable[]>>();
    expectTypeOf(db.count('products', db.all, { groupBy: 'sku', having: { sku: 'a' } } as const)).not.toBeAny();
    // @ts-expect-error a string is no Whereable (select)
    db.select('products', 'serach');
    // @ts-expect-error a string is no Whereable (selectOne)
    db.selectOne('products', 'serach');
    // @ts-expect-error a string is no Whereable (selectExactlyOne)
    db.selectExactlyOne('products', 'serach');
    // @ts-expect-error a string is no Whereable (count)
    db.count('products', 'serach');
    // @ts-expect-error a string is no Whereable (sum)
    db.sum('products', 'serach', { columns: ['price_cents'] });
    // @ts-expect-error a string is no Whereable (update)
    db.update('products', { sku: 'a' }, 'serach');
    // @ts-expect-error a string is no Whereable (deletes)
    db.deletes('products', 'serach');
    // @ts-expect-error 'serach' is not a column of products (order.by, a SQLForTable)
    db.select('products', db.all, { order: { by: 'serach', direction: 'ASC' } });
    // @ts-expect-error a string is no Whereable (having)
    db.select('products', db.all, { groupBy: 'sku', having: 'serach' });
    // @ts-expect-error a string is no Whereable (and)
    c.and('serach');
    // @ts-expect-error a string is no Whereable (or)
    c.or({ sku: 'a' }, 'serach');
    // @ts-expect-error a string is no Whereable (not)
    c.not('serach');
    // @ts-expect-error a string is no Whereable (exists)
    c.exists('products', 'serach');
    // @ts-expect-error a string is no Whereable (isInSelect)
    c.isInSelect('products', 'serach', 'id');
    // a variable that shares no key with it is still refused
    const titel = { titel: 'a' };
    // @ts-expect-error 'titel' is not a column of products
    db.select('products', titel);
  });

  test('a generic forwarder over the where of a shortcut or a condition still compiles (#670)', () => {
    const forward = <T extends s.Table>(table: T, where: s.WhereableForTable<T>) =>
      [db.select(table, where), db.selectOne(table, where), db.count(table, where), db.deletes(table, where),
        db.conditions.exists(table, where)];
    forward('products', { sku: 'a' });
    const any = (...where: s.Whereable[]) => [db.conditions.and(...where), db.conditions.or(...where), db.conditions.not(where[0]!)];
    any({ sku: 'a' });
  });

  test('lock.of accepts the alias', () => {
    const q = db.select('users', db.all, { alias: 'u', lock: { for: 'UPDATE', of: 'u' } });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable[]>();
  });

  test('order is typed by OrderSpecForTable, which zapatos/db exports (#580)', () => {
    type Order = db.SelectOptionsForTable<'users', undefined, undefined, undefined, never>['order'];
    expectTypeOf<Order>().toEqualTypeOf<db.OrderSpecForTable<'users'> | db.OrderSpecForTable<'users'>[] | undefined>();
    expectTypeOf<db.OrderSpecForTable<'users'>>().not.toBeAny();
    expectTypeOf<db.OrderSpecForTable<'users'>['by']>().toEqualTypeOf<s.users.SQL>();
    const spec: db.OrderSpecForTable<'users'> = { by: 'display_name', direction: 'DESC', nulls: 'LAST' };
    db.select('users', db.all, { order: [spec] });
    const orderBy = (o: db.OrderSpecForTable<'users'>) => o;
    // @ts-expect-error 'UP' is not ASC / DESC (a value typed by OrderSpecForTable)
    orderBy({ by: 'id', direction: 'UP' });
    // @ts-expect-error an interface has no implicit index signature (an object type alias would pass)
    const asRecord: Record<string, unknown> = null as unknown as Exclude<NonNullable<Order>, unknown[]>;
    void asRecord;
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
    // options that can leave no row (#163) give 0 then, which the type already holds
    expectTypeOf(db.count('users', db.all, { offset: 1 }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.max('accounts', { id: -1 }, { columns: ['balance'], groupBy: 'owner_id' }).run(pool)).resolves.toEqualTypeOf<number>();
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

  test('without aggregatesTypedByColumn declared in ConfigTypes, min and max are a number, as in 6.6.1, nested too', () => {
    expectTypeOf<db.ConfigTypes>().toEqualTypeOf<{}>();
    expectTypeOf(db.min('events', db.all, { columns: ['occurred_on'] }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.max('users', db.all, { columns: ['display_name'] })).toEqualTypeOf<db.SQLFragment<number>>();
    expectTypeOf(db.sum).toEqualTypeOf<db.NumericAggregateSignatures>();
    expectTypeOf(db.max).toEqualTypeOf<db.NumericAggregateSignatures>();
    const q = db.selectOne('users', db.all, { lateral: { first: db.min('events', db.all, { columns: ['occurred_on'] }) } });
    expectTypeOf<NonNullable<Run<typeof q>>['first']>().toEqualTypeOf<number>();
  });

  test('characterization: nested, a count() whose query can return no row is a number, as in 6.6.1, though it gives null (#420)', () => {
    const n = db.count('accounts', { owner_id: db.parent('id') }, { groupBy: 'owner_id' });
    const many = db.select('users', db.all, {
      columns: ['id'],
      lateral: {
        groupBy: n,
        having: db.count('accounts', { owner_id: db.parent('id') }, { having: db.sql`false` }),
        offset: db.count('accounts', { owner_id: db.parent('id') }, { offset: 1 }),
        limit: db.count('accounts', { owner_id: db.parent('id') }, { limit: 0 }),
      },
    });
    type Row = Run<typeof many>[number];
    expectTypeOf<Row['groupBy']>().toEqualTypeOf<number>();
    expectTypeOf<Row['having']>().toEqualTypeOf<number>();
    expectTypeOf<Row['offset']>().toEqualTypeOf<number>();
    expectTypeOf<Row['limit']>().toEqualTypeOf<number>();
    expectTypeOf<Row>().not.toBeAny();
    const one = db.selectOne('users', { id: 3 }, { columns: ['id'], lateral: { n } });
    expectTypeOf<NonNullable<Run<typeof one>>['n']>().toEqualTypeOf<number>();
    const exactlyOne = db.selectExactlyOne('users', { id: 3 }, { columns: ['id'], lateral: { n } });
    expectTypeOf<Run<typeof exactlyOne>['n']>().toEqualTypeOf<number>();
    // passed through as the single lateral, and as an extras value
    expectTypeOf(db.selectOne('users', { id: 3 }, { lateral: n }).run(pool)).resolves.toEqualTypeOf<number | undefined>();
    expectTypeOf(db.selectExactlyOne('users', { id: 3 }, { lateral: n }).run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.select('users', db.all, { lateral: n }).run(pool)).resolves.toEqualTypeOf<number[]>();
    const extras = db.select('users', db.all, { columns: ['id'], extras: { n: db.count('accounts', db.sql`${'owner_id'} = ${'users'}.${'id'}`, { groupBy: 'owner_id' }) } });
    expectTypeOf<Run<typeof extras>[number]['n']>().toEqualTypeOf<number>();
    // at top level, run() gives 0 for no row (#163)
    expectTypeOf(n.run(pool)).resolves.toEqualTypeOf<number>();
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

  test('takes a fragment whose result is typed as a value (#654)', () => {
    const
      text = db.sql<s.users.SQL, string>`'A'`,
      int = db.sql<s.users.SQL, number>`1`,
      count = db.sql<s.users.SQL, number>`(${db.count('users', db.all)})`,
      one = db.insert('users', { email: 'a@b', display_name: text, manager_id: int }),
      many = db.insert('users', [{ email: 'a@b', display_name: text, manager_id: count }]);
    expectTypeOf(one.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(many.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(one.run(pool)).resolves.not.toBeAny();
  });

  test('takes a shortcut as a value, which compiles in parentheses (#656)', () => {
    const
      count = db.count('users', db.all),
      inserted = db.insert('users', { email: 'a@b', manager_id: count, display_name: 'A' }),
      upserted = db.upsert('users', { email: 'a@b', manager_id: count, display_name: 'A' }, 'email', { updateValues: { manager_id: count } }),
      updated = db.update('users', { manager_id: count, settings: db.selectOne('users', { id: 1 }) }, { id: 2 });
    expectTypeOf(inserted.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(upserted.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(updated.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
  });

  test('refuses a fragment that carries a constraint', () => {
    const constrained = db.sql<s.users.SQL, string, number>`'A'`;
    // @ts-expect-error the Insertable slot takes a fragment's result, not its constraint
    db.insert('users', { email: 'a@b', display_name: constrained });
  });
});

describe('upsert', () => {
  const row = { email: 'a@b', display_name: 'A' };

  test('adds $action by default', () => {
    const q = db.upsert('users', row, 'email');
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
  });

  test('takes a fragment whose result is typed as a value (#654)', () => {
    const
      text = db.sql<s.users.SQL, string>`'A'`,
      count = db.sql<s.users.SQL, number>`(${db.count('users', db.all)})`,
      one = db.upsert('users', { email: 'a@b', display_name: text, manager_id: count }, 'email'),
      many = db.upsert('users', [{ email: 'a@b', display_name: text }], 'email');
    expectTypeOf(one.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(many.run(pool)).resolves.toEqualTypeOf<(s.users.JSONSelectable & db.UpsertAction)[]>();
    expectTypeOf(one.run(pool)).resolves.not.toBeAny();
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

  test('characterization: undefined for an updateColumns typed empty, not for a Column[], as in 6.6.1 (#402)', () => {
    type Row = s.users.JSONSelectable & db.UpsertAction;
    const asConst = db.upsert('users', row, 'email', { updateColumns: [] as const });
    expectTypeOf(asConst.run(pool)).resolves.toEqualTypeOf<Row | undefined>();
    const none: never[] = [];
    expectTypeOf(db.upsert('users', row, 'email', { updateColumns: none }).run(pool)).resolves.toEqualTypeOf<Row | undefined>();
    expectTypeOf(db.upsert('users', row, 'email', { updateColumns: db.doNothing }).run(pool))
      .resolves.toEqualTypeOf<Row | undefined>();
    // a Column[] may be empty at run time, then DO NOTHING gives undefined (integration test): the docs say so
    const computed: s.users.Column[] = [];
    const q = db.upsert('users', row, 'email', { updateColumns: computed });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<Row>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    expectTypeOf(db.upsert('users', row, 'email', { updateColumns: computed, returning: ['id'] }).run(pool))
      .resolves.toEqualTypeOf<{ id: number } & db.UpsertAction>();
    expectTypeOf(db.upsert('users', [row], 'email', { updateColumns: computed }).run(pool)).resolves.toEqualTypeOf<Row[]>();
    const unchecked = async () => {
      const r = await db.upsert('users', row, 'email', { updateColumns: db.doNothing }).run(pool);
      // @ts-expect-error doNothing: one row may come back undefined, so it must be checked first
      return r.id;
    };
    expectTypeOf(unchecked).not.toBeAny();
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

  test('updateValues refuses cols() and vals() of a primitive, which throw while compiling (#503)', () => {
    // since #244, cols() and vals() of a primitive throw while compiling, so run() rejects (test/unit/core.test.ts,
    // "updateValuesCols"); under 6.6.1, Postgres refused the SQL (42703, 42601), but for vals() of one character
    // @ts-expect-error cols() of a string, on a text column: it compiled to "0", "1"…
    db.upsert('users', row, 'email', { updateValues: { display_name: db.cols('display_name') } });
    // @ts-expect-error vals() of a string, on a text column
    db.upsert('users', row, 'email', { updateValues: { display_name: db.vals('x') } });
    // @ts-expect-error cols() of a number, on an int column: it compiled to nothing, `ROW(…, )`
    db.upsert('users', row, 'email', { updateValues: { manager_id: db.cols(1) } });
    // @ts-expect-error vals() of a number, on an int column
    db.upsert('users', row, 'email', { updateValues: { manager_id: db.vals(1) } });
    // @ts-expect-error vals() of an enum label
    db.upsert('users', row, 'email', { updateValues: { mood: db.vals('ok') } });
    // @ts-expect-error cols() of a string, on jsonb, whose type also takes objects and arrays
    db.upsert('users', row, 'email', { updateValues: { settings: db.cols('x') } });
    // @ts-expect-error vals(null), on jsonb
    db.upsert('users', row, 'email', { updateValues: { settings: db.vals(null) } });
    // @ts-expect-error vals() of a boolean, on jsonb
    db.upsert('users', row, 'email', { updateValues: { settings: db.vals(true) } });
    // @ts-expect-error vals() of a string, on int8
    db.upsert('accounts', {} as s.accounts.Insertable, 'id', { updateValues: { lifetime_ops: db.vals('1') } });
    const big = null as unknown as bigint;  // no 1n literal: the tests target ES2019
    // @ts-expect-error vals() of a bigint, on int8
    db.upsert('accounts', {} as s.accounts.Insertable, 'id', { updateValues: { lifetime_ops: db.vals(big) } });
    const name: string = 'display_name';
    // @ts-expect-error cols() of a string held in a variable
    db.upsert('users', row, 'email', { updateValues: { display_name: db.cols(name) } });
    const either = null as unknown as string | string[];
    // @ts-expect-error vals() of a value that may be a string, on jsonb
    db.upsert('users', row, 'email', { updateValues: { settings: db.vals(either) } });
    const built = { display_name: db.cols('display_name') };
    // @ts-expect-error an updateValues built apart
    db.upsert('users', row, 'email', { updateValues: built });
  });

  test('updateValues still takes cols() and vals() of an object or an array, and raw(), where 6.6.1 took them', () => {
    const q = db.upsert('users', row, 'email', { updateValues: { settings: db.vals({ a: 1 }) } });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    db.upsert('users', row, 'email', { updateValues: { settings: db.vals([1]) } });
    db.upsert('users', row, 'email', { updateValues: { settings: db.cols({ a: 1 }) } });
    db.upsert('users', row, 'email', { updateValues: { tags: db.cols(['users.tags']) } });
    db.upsert('users', row, 'email', { updateValues: { tags: db.vals(['a']) } });
    db.upsert('users', row, 'email', { updateValues: { display_name: db.raw(`upper('a')`), settings: db.raw(`'{}'`) } });
    // param(x) keeps its literal type beside them
    db.upsert('accounts', {} as s.accounts.Insertable, 'id', { updateValues: { opened_on: db.param('2020-01-01'), lifetime_ops: db.param('1') } });
  });

  test('updateValues takes cols() and vals() of an argument typed any, as 6.6.1 did, and refuses one typed unknown', () => {
    // JSON.parse() gives any, which may hold an array at run time: vals(['Ada']) stores 'Ada', under 6.6.1 too
    const parsed = JSON.parse('["Ada"]');
    const q = db.upsert('users', row, 'email', { updateValues: { display_name: db.vals(parsed) } });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    db.upsert('users', row, 'email', { updateValues: { display_name: db.cols(parsed) } });
    db.upsert('users', row, 'email', { updateValues: { manager_id: db.vals(parsed) } });
    db.upsert('users', row, 'email', { updateValues: { mood: db.param('ok'), settings: db.vals(parsed) } });
    const unknown = null as unknown;
    // @ts-expect-error vals() of an argument typed unknown, refused by 6.6.1 too
    db.upsert('users', row, 'email', { updateValues: { display_name: db.vals(unknown) } });
    // @ts-expect-error the same, on jsonb
    db.upsert('users', row, 'email', { updateValues: { settings: db.vals(unknown) } });
  });

  test('updateValues refuses cols() and vals() of a Date or a Buffer, which compile their own keys (#514)', () => {
    // a Date has no own key: ROW(…, ), 42601; a Buffer compiles its indexes, "0", "1" (42703), or its bytes, one
    // parameter each: 42601 but for one byte, whose number is stored, `97` for Buffer.from('a'), under 6.6.1 too
    const date = new Date();
    // @ts-expect-error cols() of a Date, on a timestamptz column
    db.upsert('users', row, 'email', { updateValues: { created_at: db.cols(date) } });
    // @ts-expect-error vals() of a Date, on a timestamptz column
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(date) } });
    // @ts-expect-error vals() of a Date, on a date column
    db.upsert('accounts', {} as s.accounts.Insertable, 'id', { updateValues: { opened_on: db.vals(date) } });
    class Premiere extends Date { }
    // @ts-expect-error vals() of a subclass of Date
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(new Premiere()) } });
    // a Date with one own enumerable field compiles to `ROW(…, $2)` and stores that field, under 6.6.1 too
    class Stamp extends Date { iso = '2021-06-01T00:00:00Z'; }
    // @ts-expect-error vals() of a subclass of Date with a field of its own
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(new Stamp()) } });
    // @ts-expect-error vals() of a Date given a field
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(Object.assign(date, { iso: '2021-06-01T00:00:00Z' })) } });
    const zoo = { c_text: 'a' };
    // @ts-expect-error cols() of a Buffer, on a bytea column
    db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: db.cols(Buffer.from('a')) } });
    // @ts-expect-error vals() of a one-byte Buffer, on a bytea column: it stored the bytes of '97'
    db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: db.vals(Buffer.from('a')) } });
    // @ts-expect-error vals() of an empty Buffer
    db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: db.vals(Buffer.alloc(0)) } });
    // @ts-expect-error a generic forwarder of a Date
    const forward = <V extends Date>(v: V) => db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(v) } });
    const built = { created_at: db.vals(date) };
    // @ts-expect-error an updateValues built apart
    db.upsert('users', row, 'email', { updateValues: built });
    void forward;
  });

  test('updateValues still takes a Date or a Buffer as a value, in param(), and vals() of an argument typed any', () => {
    const q = db.upsert('users', row, 'email', { updateValues: { created_at: new Date() } });
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    db.upsert('users', row, 'email', { updateValues: { created_at: db.param(new Date()) } });
    const zoo = { c_text: 'a' };
    const z = db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: Buffer.from('a') } });
    expectTypeOf(z.run(pool)).resolves.toEqualTypeOf<s.extra.type_zoo.JSONSelectable & db.UpsertAction>();
    expectTypeOf(z.run(pool)).resolves.not.toBeAny();
    db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: db.param(Buffer.from('a')) } });
    // JSON.parse() gives any, as in #503: still taken, on the columns whose writes take a Date or a Buffer too
    const parsed = JSON.parse('["2020-01-01"]');
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(parsed) } });
    db.upsert('users', row, 'email', { updateValues: { created_at: db.cols(parsed) } });
    db.upsert('extra.type_zoo', zoo, 'id', { updateValues: { c_bytea: db.vals(parsed) } });
    const unknown = null as unknown;
    // @ts-expect-error vals() of an argument typed unknown, refused by 6.6.1 too
    db.upsert('users', row, 'email', { updateValues: { created_at: db.vals(unknown) } });
  });

  test('characterization: updateValues takes cols() and vals() of a primitive or a Date on a column typed any', () => {
    // a zapatos/custom placeholder left as generated is any, so the whole slot is any and refuses nothing, #514's
    // Date and Buffer too: vals(new Date()) compiles to `ROW(…, )`, 42601, as under 6.6.1
    db.upsert('extra.type_zoo', { c_text: 'a' }, 'id', { updateValues: { c_bit: db.cols('x'), c_point: db.vals(1) } });
    db.upsert('extra.type_zoo', { c_text: 'a' }, 'id', { updateValues: { c_point: db.vals(new Date()), c_bit: db.cols(Buffer.from('a')) } });
  });

  test('updateValues in a function generic over the table takes the values 6.6.1 took (#533)', () => {
    const date = new Date();
    const one = <T extends 'users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>, uv: s.users.Updatable) => {
      db.upsert(t, r, c, { updateValues: { created_at: '2020-01-01T00:00:00Z' } });
      db.upsert(t, r, c, { updateValues: { created_at: db.Default } });
      db.upsert(t, r, c, { updateValues: { created_at: db.sql`now()` } });
      db.upsert(t, r, c, { updateValues: { created_at: db.param(date) } });
      db.upsert(t, r, c, { updateValues: { mood: 'happy', manager_id: null } });
      db.upsert(t, r, c, { updateValues: {} });
      db.upsert(t, r, c, { updateValues: uv });
      const built = { created_at: date };
      db.upsert(t, r, c, { updateValues: built });
      db.upsert(t, r, c, { updateValues: { display_name: db.raw(`upper('a')`), settings: db.vals({ a: 1 }) } });
      db.upsert(t, r, c, { updateValues: { created_at: JSON.parse('"2020-01-01T00:00:00Z"') } });
      db.upsert(t, [r], c, { updateValues: { created_at: date } });
      return db.upsert(t, r, c, { updateValues: { created_at: date } });
    };
    const q = one('users', row, 'email', {});
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    const two = <T extends 'users' | 'active_users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: { created_at: date } });
      db.upsert(t, r, c, { updateValues: { created_at: '2020-01-01T00:00:00Z', mood: 'happy' } });
      db.upsert(t, r, c, { updateValues: { created_at: db.Default } });
      db.upsert(t, r, c, { updateValues: { display_name: db.raw(`upper('a')`) } });
    };
    const every = <T extends s.Table>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: {} });
    };
    const users = { email: 'a@b', display_name: 'A' };
    const issue = <T extends 'users'>(t: T, date: Date) =>
      db.upsert(t, users, 'email', { updateValues: { created_at: date } });
    void two; void every; void issue;
  });

  test('characterization: over every table, updateValues takes any, which 6.6.1 refused (#533)', () => {
    // 6.6.1 refused each (TS2769); with strict off, it also takes null and undefined, which 6.6.1 refused and this strict program cannot show.
    // cols() and vals() of any are refused there, as by 6.6.1, since the lookup resolves through T's constraint (#538)
    const anyV = JSON.parse('1');
    const every = <T extends s.Table>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: { created_at: anyV } });
      db.upsert(t, r, c, { updateValues: { created_at: JSON.parse('1') } });
      // @ts-expect-error cols() of any, refused as by 6.6.1
      db.upsert(t, r, c, { updateValues: { created_at: db.cols(anyV) } });
      // @ts-expect-error vals() of any, refused as by 6.6.1
      db.upsert(t, r, c, { updateValues: { created_at: db.vals(anyV) } });
      // @ts-expect-error a number, refused as by 6.6.1
      db.upsert(t, r, c, { updateValues: { created_at: 1 } });
    };
    void every;
  });

  test('updateValues in a function generic over the table refuses what a concrete table refuses (#533)', () => {
    const date = new Date();
    const one = <T extends 'users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      // @ts-expect-error an unknown key
      db.upsert(t, r, c, { updateValues: { nope: 1 } });
      // @ts-expect-error a number, on a timestamptz column
      db.upsert(t, r, c, { updateValues: { created_at: 1 } });
      // @ts-expect-error null, on a NOT NULL column
      db.upsert(t, r, c, { updateValues: { created_at: null } });
      // @ts-expect-error a label the enum lacks
      db.upsert(t, r, c, { updateValues: { mood: 'glad' } });
      // @ts-expect-error a value typed unknown
      db.upsert(t, r, c, { updateValues: null as unknown });
      // @ts-expect-error raw(), on a timestamptz column, whose value type takes no string
      db.upsert(t, r, c, { updateValues: { created_at: db.raw('now()') } });
      // @ts-expect-error raw(), on an int column
      db.upsert(t, r, c, { updateValues: { manager_id: db.raw('1') } });
      // @ts-expect-error cols() of a string, which throws while compiling (#503); 6.6.1 took it here, its wrappers being structural
      db.upsert(t, r, c, { updateValues: { display_name: db.cols('display_name') } });
      // @ts-expect-error cols() of a Date, which compiles its own keys (#514)
      db.upsert(t, r, c, { updateValues: { created_at: db.cols(date) } });
      // @ts-expect-error vals() of a Date
      db.upsert(t, r, c, { updateValues: { created_at: db.vals(date) } });
    };
    const two = <T extends 'users' | 'active_users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      // @ts-expect-error an unknown key
      db.upsert(t, r, c, { updateValues: { nope: 1 } });
      // @ts-expect-error cols() of a string
      db.upsert(t, r, c, { updateValues: { display_name: db.cols('display_name') } });
    };
    void one; void two;
  });

  test('characterization: in a function generic over the table, updateValues takes an unknown key beside a known one; typed first, it is refused', () => {
    // 6.6.1 refused it: its updateValues was the lookup alone, whose excess-property check a union skips (#533)
    const date = new Date();
    const one = <T extends 'users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: { created_at: date, nope: 1 } });
      // @ts-expect-error typed first, the unknown key is refused
      const uv: s.UpdatableForTable<T> = { created_at: date, nope: 1 };
      db.upsert(t, r, c, { updateValues: uv });
    };
    void one;
  });

  test('updateValues takes param() of a string literal on a column typed only by string or template literals, as 6.6.1 does (#538)', () => {
    // an enum, time, timetz, a domain typed Int8String: in a function generic over the table, and over every table,
    // the literal widened to string, so param() gave Parameter<string>. A union with number or Date (int8) took it
    const users = <T extends 'users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, [r], c, { updateValues: { mood: db.param('sad') } });
      db.upsert(t, r, c, { updateValues: { mood: db.param('sad' as const) } });
      db.upsert(t, r, c, { updateValues: { mood: db.param<s.mood>('sad') } });
      return db.upsert(t, r, c, { updateValues: { mood: db.param('sad') } });
    };
    const q = users('users', row, 'email');
    expectTypeOf(q.run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable & db.UpsertAction>();
    expectTypeOf(q.run(pool)).resolves.not.toBeAny();
    const zoo = <T extends 'extra.type_zoo'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: { c_time: db.param('12:00:00') } });
      db.upsert(t, r, c, { updateValues: { c_time: db.param('12:00:00' as const) } });
      db.upsert(t, r, c, { updateValues: { c_timetz: db.param('12:00:00+00') } });
      db.upsert(t, r, c, { updateValues: { c_timetz: db.param('12:00:00+00' as const) } });
      db.upsert(t, r, c, { updateValues: { c_int8_domain: db.param('1') } });
      db.upsert(t, r, c, { updateValues: { c_int8_domain: db.param('1' as const) } });
      db.upsert(t, r, c, { updateValues: { c_int8: db.param('1') } });
      db.upsert(t, [r], c, { updateValues: { c_time: db.param('12:00:00'), c_timetz: db.param('12:00:00+00') } });
    };
    const two = <T extends 'extra.type_zoo' | 'users'>(t: T, r: s.InsertableForTable<T>, c: s.ColumnForTable<T>) => {
      db.upsert(t, r, c, { updateValues: { mood: db.param('sad') } });
      db.upsert(t, r, c, { updateValues: { c_time: db.param('12:00:00') } });
      db.upsert(t, r, c, { updateValues: { c_timetz: db.param('12:00:00+00') } });
      db.upsert(t, r, c, { updateValues: { c_int8_domain: db.param('1') } });
    };
    void zoo; void two;
    const every = null! as s.Table, everyRow = null! as s.InsertableForTable<s.Table>, everyColumn = null! as s.ColumnForTable<s.Table>;
    const all = db.upsert(every, everyRow, everyColumn, { updateValues: { mood: db.param('sad') } });
    expectTypeOf(all).toEqualTypeOf(db.upsert(every, everyRow, everyColumn, { updateValues: { mood: db.param<s.mood>('sad') } }));
    expectTypeOf(all).not.toBeAny();
    db.upsert(every, everyRow, everyColumn, { updateValues: { c_time: db.param('12:00:00') } });
    db.upsert(every, everyRow, everyColumn, { updateValues: { c_timetz: db.param('12:00:00+00') } });
    db.upsert(every, everyRow, everyColumn, { updateValues: { c_int8_domain: db.param('1') } });
    db.upsert(every, [everyRow], everyColumn, { updateValues: { mood: db.param('sad') } });
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

describe('transactionRequiresCommit', () => {
  test('an optional boolean of Config and setConfig', () => {
    db.setConfig({ transactionRequiresCommit: true });
    expectTypeOf(db.getConfig().transactionRequiresCommit).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<db.NewConfig['transactionRequiresCommit']>().toEqualTypeOf<boolean | undefined>();
    // a Config written for 6.6.1, without the key, still compiles
    const c: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
    };
    // @ts-expect-error a boolean, not a string
    const d: db.Config = { ...c, transactionRequiresCommit: 'yes' };
    void d;
    // @ts-expect-error a boolean, not a string
    db.setConfig({ transactionRequiresCommit: 'yes' });
  });
});

describe('transactionRequiresIdleClient', () => {
  test('an optional boolean of Config and setConfig', () => {
    db.setConfig({ transactionRequiresIdleClient: true });
    expectTypeOf(db.getConfig().transactionRequiresIdleClient).toEqualTypeOf<boolean | undefined>();
    expectTypeOf<db.NewConfig['transactionRequiresIdleClient']>().toEqualTypeOf<boolean | undefined>();
    // a Config written for 6.6.1, without the key, still compiles
    const c: db.Config = {
      transactionAttemptsMax: 5,
      transactionRetryDelay: { minMs: 25, maxMs: 250 },
      castArrayParamsToJson: false,
      castObjectParamsToJson: false,
    };
    // @ts-expect-error a boolean, not a string
    const d: db.Config = { ...c, transactionRequiresIdleClient: 'yes' };
    void d;
    // @ts-expect-error a boolean, not a string
    db.setConfig({ transactionRequiresIdleClient: 'yes' });
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

  test('db.all as the where: refused, sql`TRUE` taken (#637)', () => {
    // @ts-expect-error db.all is the filter of select() and its kin only
    db.deletes('users', db.all);
    // @ts-expect-error nor update()'s
    db.update('users', { display_name: 'B' }, db.all);
    expectTypeOf(db.deletes('users', db.sql`TRUE`).run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(db.update('users', { display_name: 'B' }, db.sql`TRUE`).run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
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

// without lateral, L takes its constraint, LateralOption<C, E>, which stays unresolved while C or E is generic (#284)
describe('a function generic over columns or extras', () => {
  test('characterization: without lateral, each column is any inside the function, as in 6.6.1; its callers get the row', async () => {
    const many = async <C extends db.ColumnsOption<'users'>>(columns: C) => {
      const rows = await db.select('users', db.all, { columns }).run(pool);
      expectTypeOf(rows[0]!.id).toBeAny();
      expectTypeOf(rows[0]!.no_such_column).toBeAny();
      return rows;
    };
    const one = async <C extends db.ColumnsOption<'users'>>(columns: C) => {
      const row = await db.selectOne('users', { id: 1 }, { columns }).run(pool);
      expectTypeOf(row!.id).toBeAny();
      expectTypeOf(row!.no_such_column).toBeAny();
      return row;
    };
    const exactlyOne = async <C extends db.ColumnsOption<'users'>>(columns: C) => {
      const row = await db.selectExactlyOne('users', { id: 1 }, { columns }).run(pool);
      expectTypeOf(row.id).toBeAny();
      expectTypeOf(row.no_such_column).toBeAny();
      return row;
    };
    type Card = Pick<s.users.JSONSelectable, 'id' | 'email'>;
    expectTypeOf(await many(['id', 'email'])).toEqualTypeOf<Card[]>();
    expectTypeOf(await one(['id', 'email'])).toEqualTypeOf<Card | undefined>();
    expectTypeOf(await exactlyOne(['id', 'email'])).toEqualTypeOf<Card>();
    expectTypeOf(await many(['id', 'email'])).not.toBeAny();
  });

  test('characterization: a generic extras, with or without generic columns, gives any without lateral, as in 6.6.1; its callers get the row', async () => {
    const extrasOnly = async <E extends db.ExtrasOption<'users'>>(extras: E) => {
      const rows = await db.select('users', db.all, { extras }).run(pool);
      const one = await db.selectOne('users', { id: 1 }, { extras }).run(pool);
      const exactlyOne = await db.selectExactlyOne('users', { id: 1 }, { extras }).run(pool);
      expectTypeOf(rows[0]!.id).toBeAny();
      expectTypeOf(rows[0]!.no_such_column).toBeAny();
      expectTypeOf(one!.no_such_column).toBeAny();
      expectTypeOf(exactlyOne.no_such_column).toBeAny();
      return rows;
    };
    const both = async <C extends db.ColumnsOption<'users'>, E extends db.ExtrasOption<'users'>>(columns: C, extras: E) => {
      const rows = await db.select('users', db.all, { columns, extras }).run(pool);
      const one = await db.selectOne('users', { id: 1 }, { columns, extras }).run(pool);
      const exactlyOne = await db.selectExactlyOne('users', { id: 1 }, { columns, extras }).run(pool);
      expectTypeOf(rows[0]!.id).toBeAny();
      expectTypeOf(rows[0]!.no_such_column).toBeAny();
      expectTypeOf(one!.no_such_column).toBeAny();
      expectTypeOf(exactlyOne.no_such_column).toBeAny();
      return rows;
    };
    const extras = { up: db.sql<s.users.SQL, string>`upper(${'display_name'})` };
    expectTypeOf(await extrasOnly(extras)).toEqualTypeOf<(s.users.JSONSelectable & { up: string })[]>();
    expectTypeOf(await both(['id'], extras)).toEqualTypeOf<(Pick<s.users.JSONSelectable, 'id'> & { up: string })[]>();
  });

  test('lateral: undefined types the rows inside the function', async () => {
    const cards = async <C extends db.ColumnsOption<'users'>>(columns: C) => {
      const rows = await db.select('users', db.all, { columns, lateral: undefined }).run(pool);
      const one = await db.selectOne('users', { id: 1 }, { columns, lateral: undefined }).run(pool);
      const exactlyOne = await db.selectExactlyOne('users', { id: 1 }, { columns, lateral: undefined }).run(pool);
      expectTypeOf(rows[0]!.id).toEqualTypeOf<number>();
      expectTypeOf(one!.id).toEqualTypeOf<number>();
      expectTypeOf(exactlyOne.id).toEqualTypeOf<number>();
      // @ts-expect-error users.id is a number
      const created: Date = rows[0]!.id;
      // @ts-expect-error users has no such column
      void one!.no_such_column;
      // @ts-expect-error users has no such column
      void exactlyOne.no_such_column;
      return created;
    };
    void cards;
  });

  test('lateral: undefined types the rows with a generic extras too, and refuses its keys', async () => {
    const extrasOnly = async <E extends { up: db.SQLFragment<string> }>(extras: E) => {
      const rows = await db.select('users', db.all, { extras, lateral: undefined }).run(pool);
      expectTypeOf(rows[0]!.id).toEqualTypeOf<number>();
      // @ts-expect-error a key of a generic extras is refused
      return rows[0]!.up;
    };
    const both = async <C extends db.ColumnsOption<'users'>, E extends { up: db.SQLFragment<string> }>(columns: C, extras: E) => {
      const rows = await db.select('users', db.all, { columns, extras, lateral: undefined }).run(pool);
      expectTypeOf(rows[0]!.id).toEqualTypeOf<number>();
      // @ts-expect-error a key of a generic extras is refused
      return rows[0]!.up;
    };
    void [extrasOnly, both];
  });

  test('characterization: a generic lateral of its own keeps any', async () => {
    const card = async <C extends db.ColumnsOption<'users'>, L extends db.LateralOption<C, db.ExtrasOption<'users'>>>(columns?: C, lateral?: L) => {
      const row = await db.selectOne('users', { id: 1 }, { columns, lateral }).run(pool);
      expectTypeOf(row!.no_such_column).toBeAny();
    };
    void card;
  });
});

describe('a function generic over the table', () => {
  test('characterization: a Whereable written in place is refused (TS2353), as in Zapatos 6.6.1 (#518)', () => {
    // while K is generic, TypeScript checks the object's keys against SQLFragment alone
    const inPlace = <K extends 'users' | 'products'>(table: K) => {
      // @ts-expect-error select(): 'id' does not exist in type 'SQLFragment<any, never>'
      db.select(table, { id: 1 });
      // @ts-expect-error selectOne()
      db.selectOne(table, { id: 1 });
      // @ts-expect-error selectExactlyOne()
      db.selectExactlyOne(table, { id: 1 });
      // @ts-expect-error count()
      db.count(table, { id: 1 });
      // @ts-expect-error deletes()
      db.deletes(table, { id: 1 });
      // @ts-expect-error update(), its where
      db.update(table, {}, { id: 1 });
      // @ts-expect-error having
      db.select(table, db.all, { groupBy: 'id', having: { id: 1 } });
      // @ts-expect-error a sql value, with its type argument (a bare one is #493's)
      db.select(table, { id: db.sql<db.SQL>`${db.self} = 1` });
      // @ts-expect-error over a single table too
      (<L extends 'users'>(t: L) => db.select(t, { id: 1 }));
    };
    void inPlace;
  });

  test('a Whereable typed first type-checks in each shortcut, refuses a key that no table has, and passes a column that only one has (#518)', () => {
    const byId = <K extends 'users' | 'products'>(table: K) => {
      const where: s.WhereableForTable<K> = { id: 1 };
      // @ts-expect-error a key that no table has
      const typo: s.WhereableForTable<K> = { id: 1, nope: 2 };
      // @ts-expect-error a value of another type
      const wrong: s.WhereableForTable<K> = { id: 'x' };
      // only products has sku, so Postgres refuses it on users (42703)
      const oneTable: s.WhereableForTable<K> = { sku: 'x' };
      void [typo, wrong, db.select(table, oneTable)];
      void [db.selectOne(table, where), db.selectExactlyOne(table, where), db.count(table, where), db.deletes(table, where)];
      void [db.update(table, {}, where), db.select(table, db.all, { groupBy: 'id', having: where })];
      return db.select(table, where);
    };
    const q = byId('users');
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf<Run<typeof q>>().not.toBeAny();
  });

  test('a forwarder over WhereableForTable<T> and typeof select type-check, as in Zapatos 6.6.1 (#518)', () => {
    const forward = <T extends s.Table>(table: T, where: s.WhereableForTable<T> | db.SQLFragment<any> | db.AllType) =>
      db.select(table, where);
    const forwardCount = <T extends s.Table>(table: T, where: s.WhereableForTable<T>) => db.count(table, where);
    const q = forward('users', { id: 1 });
    expectTypeOf<Run<typeof q>>().toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf<Run<typeof q>>().not.toBeAny();
    expectTypeOf(forwardCount('products', { id: 1 })).toEqualTypeOf<db.SQLFragment<number>>();
    // @ts-expect-error a key that the table lacks, at the call site
    forward('users', { nope: 1 });
    const select: typeof db.select = db.select;
    void select;
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

describe('copy()', () => {
  test('a copy of a shortcut resolves to the shortcut\'s result', () => {
    const row = { email: 'a@b', display_name: 'A' };
    expectTypeOf(db.count('users', db.all).copy().run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.sum('accounts', db.all, { columns: ['balance'] }).copy().run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.max('accounts', db.all, { columns: ['balance'] }).copy().run(pool)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.select('users', db.all).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(db.selectOne('users', { id: 1 }).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable | undefined>();
    expectTypeOf(db.selectExactlyOne('users', { id: 1 }).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(db.insert('users', row).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable>();
    expectTypeOf(db.insert('users', [row]).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(db.upsert('users', row, 'email', { returning: ['id'] }).copy().run(pool))
      .resolves.toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'> & db.UpsertAction>();
    expectTypeOf(db.update('users', { display_name: 'B' }, { id: 1 }).copy().run(pool)).resolves.toEqualTypeOf<s.users.JSONSelectable[]>();
    expectTypeOf(db.deletes('users', { id: 1 }, { returning: ['id'] }).copy().run(pool)).resolves.toEqualTypeOf<Pick<s.users.JSONSelectable, 'id'>[]>();
    expectTypeOf(db.truncate('users').copy().run(pool)).resolves.toEqualTypeOf<undefined>();
    expectTypeOf(db.selectOne('users', { id: 1 }).copy({ parentTable: 'u' }).run(pool)).resolves.not.toBeAny();
    // @ts-expect-error a copied count is a number, not the rows
    db.count('users', db.all).copy().run(pool).then((rows): { result: string }[] => rows);
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
    // as in 6.6.1: any, an unknown result, and a nested count
    expectTypeOf<db.RunResultForSQLFragment<any>>().toEqualTypeOf<{} | null>();
    expectTypeOf<db.RunResultForSQLFragment<db.SQLFragment<unknown>>>().toEqualTypeOf<{} | null>();
    expectTypeOf<db.RunResultForSQLFragment<ReturnType<typeof db.count>>>().toEqualTypeOf<number>();
  });
});

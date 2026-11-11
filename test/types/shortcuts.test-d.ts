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

  test('characterization: upsert accepts the constraint of another table', () => {
    // characterization: Constraint<'accounts'> passes as the conflict target of users;
    // at run time, ON CONSTRAINT accounts_pkey fails on users
    const k = db.constraint<'accounts'>('accounts_pkey');
    db.upsert('users', row, k);
    db.upsert('users', [row], k);
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
});

describe('truncate', () => {
  test('undefined; refuses an option that is not a keyword', () => {
    expectTypeOf(db.truncate('users', 'RESTART IDENTITY', 'CASCADE').run(pool)).resolves.toEqualTypeOf<undefined>();
    // @ts-expect-error 'DROP' is not a TRUNCATE option
    db.truncate('users', 'DROP');
  });
});

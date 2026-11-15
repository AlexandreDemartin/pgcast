// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the types of src/db/transaction.ts: which client each level accepts.

import type * as pg from 'pg';
import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type { satisfying } from '../helpers/isolation';

declare const pool: pg.Pool;
declare const plain: pg.PoolClient;
declare const client: pg.Client;
declare function countBookings(txnClient: db.TxnClientForRepeatableRead): Promise<number>;
declare function countSeats(txnClient: db.TxnClientForSerializableRO): Promise<number>;

describe('the client of a transaction', () => {
  test('the callback gets the client of its level', () => {
    expectTypeOf(db.serializable(pool, async () => 1)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.serializable(pool, async () => 1)).resolves.not.toBeAny();
    void db.serializable(pool, async c => { expectTypeOf(c).toEqualTypeOf<db.TxnClientForSerializable>(); });
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, async c => { expectTypeOf(c).toEqualTypeOf<db.TxnClientForReadCommitted>(); });
  });

  // #177: passed through, it runs at the outer level; transactionRequiresSatisfyingLevel refuses it at run time
  test('a shortcut takes the client of a level that does not satisfy its own, typed as its own level, as in Zapatos 6.6.1', () => {
    void db.readCommitted(pool, rc => db.serializable(rc, async s => { expectTypeOf(s).toEqualTypeOf<db.TxnClientForSerializable>(); }));
    void db.readCommitted(pool, rc => db.transaction(rc, db.IsolationLevel.Serializable, async s => {
      expectTypeOf(s).toEqualTypeOf<db.TxnClientForSerializable>();
    }));
  });

  test('a parameter typed TxnClientFor… takes the client of a level that satisfies it, not another', () => {
    void db.serializable(pool, c => countBookings(c));
    void db.repeatableRead(pool, c => countBookings(c));
    // @ts-expect-error READ COMMITTED does not satisfy REPEATABLE READ
    void db.readCommitted(pool, c => countBookings(c));
    // @ts-expect-error READ ONLY does not satisfy a read-write level
    void db.repeatableReadRO(pool, c => countBookings(c));
  });

  // The runtime tests check transactionRequiresSatisfyingLevel against this table, pair by pair (test/integration/transaction.test.ts)
  test('the table of levels that satisfy another holds every level IsolationSatisfying lists, and SerializableRODeferrable in three more rows', () => {
    type Row<K extends db.IsolationLevel> = (typeof satisfying)[`${K}`][number];
    type Missing = { [K in db.IsolationLevel]: Exclude<`${db.IsolationSatisfying<K>}`, Row<K>> }[db.IsolationLevel];
    type Extra<K extends db.IsolationLevel> = Exclude<Row<K>, `${db.IsolationSatisfying<K>}`>;
    expectTypeOf<Missing>().toBeNever();
    expectTypeOf<Extra<db.IsolationLevel.SerializableRO | db.IsolationLevel.RepeatableReadRO | db.IsolationLevel.ReadCommittedRO>>()
      .toEqualTypeOf<'SERIALIZABLE, READ ONLY, DEFERRABLE'>();
    expectTypeOf<Extra<db.IsolationLevel.SerializableRO>>().toEqualTypeOf<'SERIALIZABLE, READ ONLY, DEFERRABLE'>();
    expectTypeOf<Extra<db.IsolationLevel.RepeatableReadRO>>().toEqualTypeOf<'SERIALIZABLE, READ ONLY, DEFERRABLE'>();
    expectTypeOf<Extra<db.IsolationLevel.ReadCommittedRO>>().toEqualTypeOf<'SERIALIZABLE, READ ONLY, DEFERRABLE'>();
    expectTypeOf<Extra<db.IsolationLevel.Serializable | db.IsolationLevel.RepeatableRead | db.IsolationLevel.ReadCommitted | db.IsolationLevel.SerializableRODeferrable>>()
      .toBeNever();
  });

  // #489: the type leaves SerializableRODeferrable out of the levels that satisfy the three read-only ones
  test('a parameter typed TxnClientForSerializableRO refuses the client of serializableRODeferrable(), as in Zapatos 6.6.1', () => {
    void db.serializableRO(pool, c => countSeats(c));
    // @ts-expect-error IsolationSatisfying<SerializableRO> leaves SerializableRODeferrable out
    void db.serializableRODeferrable(pool, c => countSeats(c));
    void db.serializableRODeferrable(pool, c => db.serializableRO(c, async () => 1));  // through Queryable
  });

  // _zapatos is optional (website/transaction.md § TxnClient), as in Zapatos 6.6.1
  test('a plain pg.PoolClient passes as a TxnClient, with or without a transaction open on it', () => {
    void countBookings(plain);
    const c: db.TxnClientForSerializable = plain;
    void c;
    // @ts-expect-error a pg.Client is not a pg.PoolClient: it has no release()
    void countBookings(client);
  });
});

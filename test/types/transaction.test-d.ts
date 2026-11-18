// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the types of src/db/transaction.ts: which client each level accepts.

import type * as pg from 'pg';
import { describe, expectTypeOf, test } from 'vitest';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type { satisfying } from '../helpers/isolation';

declare const pool: pg.Pool;
declare const plain: pg.PoolClient;
declare const client: pg.Client;
declare function countBookings(txnClient: db.TxnClientForRepeatableRead): Promise<number>;
declare function countSeats(txnClient: db.TxnClientForSerializableRO): Promise<number>;
declare function countFilms(txnClient: db.TxnClientForRepeatableReadRO): Promise<number>;
declare function countTags(txnClient: db.TxnClientForReadCommittedRO): Promise<number>;
declare function countSeatsAnyRO(txnClient: db.TxnClientForSerializableRO | db.TxnClientForSerializableRODeferrable): Promise<number>;

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

  // #489: the type leaves SerializableRODeferrable out of the levels that satisfy the three read-only ones, as in
  // Zapatos 6.6.1: counting it in, a function that takes a TxnClientForSerializableRO would read it in its own
  // _zapatos.isolationLevel, and so would these levels' callbacks, which code may read (website/transaction.md)
  test('a parameter typed TxnClientFor… of the three other read-only levels refuses the client of serializableRODeferrable(), as in Zapatos 6.6.1', () => {
    void db.serializableRO(pool, c => countSeats(c));
    // @ts-expect-error IsolationSatisfying<SerializableRO> leaves SerializableRODeferrable out
    void db.serializableRODeferrable(pool, c => countSeats(c));
    // @ts-expect-error IsolationSatisfying<RepeatableReadRO> leaves SerializableRODeferrable out
    void db.serializableRODeferrable(pool, c => countFilms(c));
    // @ts-expect-error IsolationSatisfying<ReadCommittedRO> leaves SerializableRODeferrable out
    void db.serializableRODeferrable(pool, c => countTags(c));
    // @ts-expect-error READ ONLY does not satisfy a read-write level
    void db.serializableRODeferrable(pool, c => countBookings(c));
    void db.serializableRODeferrable(pool, c => db.serializableRO(c, async () => 1));  // through Queryable
  });

  test('a parameter typed as the union of TxnClientForSerializableRO and TxnClientForSerializableRODeferrable takes both clients', () => {
    void db.serializableRO(pool, c => countSeatsAnyRO(c));
    void db.serializableRODeferrable(pool, c => countSeatsAnyRO(c));
    // @ts-expect-error REPEATABLE READ, READ ONLY satisfies neither
    void db.repeatableReadRO(pool, c => countSeatsAnyRO(c));
  });

  test('TxnClientForSerializableRO, …RepeatableReadRO and …ReadCommittedRO give the isolation levels of Zapatos 6.6.1, SerializableRODeferrable left out', () => {
    expectTypeOf<NonNullable<db.TxnClientForSerializableRO['_zapatos']>['isolationLevel']>().toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.SerializableRO>();
    expectTypeOf<NonNullable<db.TxnClientForRepeatableReadRO['_zapatos']>['isolationLevel']>().toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.RepeatableRead | db.IsolationLevel.SerializableRO | db.IsolationLevel.RepeatableReadRO>();
    expectTypeOf<NonNullable<db.TxnClientForReadCommittedRO['_zapatos']>['isolationLevel']>().toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.RepeatableRead | db.IsolationLevel.ReadCommitted | db.IsolationLevel.SerializableRO | db.IsolationLevel.RepeatableReadRO | db.IsolationLevel.ReadCommittedRO>();
  });

  test('the callbacks of serializableRO(), repeatableReadRO() and readCommittedRO() get the isolation levels of Zapatos 6.6.1, SerializableRODeferrable left out', () => {
    void db.serializableRO(pool, async c => {
      expectTypeOf(c._zapatos!.isolationLevel).toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.SerializableRO>();
    });
    void db.repeatableReadRO(pool, async c => {
      expectTypeOf(c._zapatos!.isolationLevel).toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.RepeatableRead | db.IsolationLevel.SerializableRO | db.IsolationLevel.RepeatableReadRO>();
    });
    void db.readCommittedRO(pool, async c => {
      expectTypeOf(c._zapatos!.isolationLevel).toEqualTypeOf<db.IsolationLevel.Serializable | db.IsolationLevel.RepeatableRead | db.IsolationLevel.ReadCommitted | db.IsolationLevel.SerializableRO | db.IsolationLevel.RepeatableReadRO | db.IsolationLevel.ReadCommittedRO>();
    });
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

type OtherClient = {
  query: (query: { text: string; values?: unknown[] }) => Promise<{ rows: any[]; command: string }>;
  release: () => void;
  exec: (text: string) => Promise<void>;
};
type TxnOther<L extends db.IsolationLevel> = db.TxnClientLike<OtherClient, db.IsolationSatisfying<L>>;
type Fails = OtherClient['query'];
interface MyPool extends pg.Pool { extra: number }
interface MyClient extends pg.ClientBase { extra: number }
declare const other: { connect: () => Promise<OtherClient> };
declare const txn: db.TxnClientForSerializable;
declare const txnRC: db.TxnClientForReadCommitted;
declare const txnAny: db.TxnClient<db.IsolationLevel>;
declare const clientBase: pg.ClientBase;
declare const queryable: db.Queryable;
declare const myPool: MyPool;
declare const myClient: MyClient;
declare const anyValue: any;
declare const queryableLike: db.QueryableLike;
declare const poolLike: db.PoolLike;
declare const typedPool: db.PoolLike<OtherClient>;
const literal = { connect: async () => ({ query: async (_: { text: string }) => ({ rows: [1], command: 'COMMIT' }), release() {} }) };
type LiteralClient = Awaited<ReturnType<typeof literal.connect>>;

// #696: transaction() and the level functions also take a pool of another driver (db.PoolLike), whose client the
// callback gets, marked (db.TxnClientLike); a pg queryable still gives the TxnClient… of Zapatos 6.6.1
describe('a pool that is not pg’s', () => {
  test('the callback gets the pool’s client, marked, at each level', () => {
    void db.transaction(other, db.IsolationLevel.ReadCommitted, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>(); });
    void db.serializable(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); });
    void db.repeatableRead(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.RepeatableRead>>(); });
    void db.readCommitted(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>(); });
    void db.serializableRO(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.SerializableRO>>(); });
    void db.repeatableReadRO(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.RepeatableReadRO>>(); });
    void db.readCommittedRO(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommittedRO>>(); });
    void db.serializableRODeferrable(other, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.SerializableRODeferrable>>(); });
    void db.serializable(literal, async c => { expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<LiteralClient, db.IsolationLevel.Serializable>>(); });
    void db.serializable(typedPool, async c => { expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); });
    void db.serializable(poolLike, async c => { expectTypeOf(c).toEqualTypeOf<db.TxnClientLike<Awaited<ReturnType<db.PoolLike['connect']>>, db.IsolationLevel.Serializable>>(); });
    const forwarder = <P extends db.PoolLike<OtherClient>>(p: P) => db.serializable(p, async c => c);
    expectTypeOf(forwarder(other)).resolves.toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>();
    const levels = <M extends db.IsolationLevel>(m: M) => db.transaction(other, m, async c => c);
    expectTypeOf(levels(db.IsolationLevel.ReadCommitted)).resolves.toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>();
  });

  test('the callback’s client runs a fragment, and has the pool client’s own members', () => {
    const run = db.serializable(other, c => db.select('users', db.all).run(c));
    expectTypeOf(run).resolves.toEqualTypeOf<s.JSONSelectableForTable<'users'>[]>();
    expectTypeOf(run).resolves.not.toBeAny();
    void db.serializable(other, async c => {
      c.release();
      expectTypeOf(c.exec).toEqualTypeOf<OtherClient['exec']>();
      expectTypeOf(c._zapatos).toEqualTypeOf<{ isolationLevel: db.IsolationLevel.Serializable; txnId: number } | undefined>();
    });
    // @ts-expect-error its query() takes pg's query object, not a string
    void db.serializable(other, c => c.query('SELECT 1'));
    // @ts-expect-error another driver's client is no TxnClientForRepeatableRead, which is a pg.PoolClient
    void db.serializable(other, c => countBookings(c));
  });

  test('a pg.Pool is a db.PoolLike, whose client is typed as PoolLike’s', () => {
    const asPoolLike: db.PoolLike = pool;
    void db.serializable(asPoolLike, async c => { expectTypeOf(c).not.toEqualTypeOf<db.TxnClientForSerializable>(); });
  });

  test('a pool is refused when its client has no release(), no command, or the wrong shape', () => {
    const fails = null as unknown as Fails;
    // @ts-expect-error a QueryableLike with no connect() is no pool: run time would throw connect is not a function
    void db.serializable(queryableLike, async () => 1);
    // @ts-expect-error its client has no release()
    void db.serializable({ connect: async () => ({ query: fails }) }, async () => 1);
    // @ts-expect-error its query() gives no command, which transaction() reads off its COMMIT (#190)
    void db.serializable({ connect: async () => ({ query: async (_: { text: string }) => ({ rows: [] }), release() {} }) }, async () => 1);
    // @ts-expect-error its connect() gives no promise
    void db.serializable({ connect: () => ({ query: fails, release() {} }) }, async () => 1);
    // @ts-expect-error its release() requires an argument, which transaction() does not pass
    void db.serializable({ connect: async () => ({ query: fails, release(_: Error) {} }) }, async () => 1);
  });

  // #696: not typed, as every typing tried moves a call of Zapatos 6.6.1 (website/transaction.md § Another driver's pool)
  test('the callback’s client is refused by a nested transaction(), which run time passes through', () => {
    // @ts-expect-error another driver's client, passed to a nested call
    void db.serializable(other, c => db.serializable(c, async () => 1));
  });
});

describe('the calls of Zapatos 6.6.1 keep their types (#696)', () => {
  test('each pg queryable gives the TxnClient… of its level', () => {
    expectTypeOf(db.serializable(pool, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(pool, async c => c)).resolves.not.toBeAny();
    expectTypeOf(db.serializable(plain, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(client, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(clientBase, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(txn, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(txnRC, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(txnAny, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(queryable, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(myPool, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(myClient, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(anyValue, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.transaction(queryable, db.IsolationLevel.RepeatableReadRO, async c => c)).resolves.toEqualTypeOf<db.TxnClientForRepeatableReadRO>();
  });

  test('generic forwarders, explicit type arguments and values keep them', () => {
    const forwarder = <Q extends db.Queryable>(q: Q) => db.serializable(q, async c => c);
    expectTypeOf(forwarder(pool)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    const levels = <M extends db.IsolationLevel>(q: db.Queryable, m: M) => db.transaction(q, m, async c => c);
    expectTypeOf(levels(pool, db.IsolationLevel.ReadCommitted)).resolves.toEqualTypeOf<db.TxnClient<db.IsolationSatisfying<db.IsolationLevel.ReadCommitted>>>();
    expectTypeOf(db.serializable<number>(pool, async () => 1)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.transaction<number, db.IsolationLevel.Serializable>(pool, db.IsolationLevel.Serializable, async () => 1)).resolves.toEqualTypeOf<number>();
    expectTypeOf([pool, pool].map(p => db.serializable(p, async c => c))).toEqualTypeOf<Promise<db.TxnClientForSerializable>[]>();
    const same: typeof db.serializable = db.serializable;
    void same;
    expectTypeOf<ReturnType<typeof db.serializable>>().toEqualTypeOf<Promise<unknown>>();
    expectTypeOf<Parameters<typeof db.serializable>[1]>().toEqualTypeOf<(client: db.TxnClientForSerializable) => Promise<unknown>>();
    expectTypeOf<Parameters<typeof db.transaction>[2]>().toEqualTypeOf<(client: db.TxnClient<db.IsolationSatisfying<db.IsolationLevel>>) => Promise<unknown>>();
    const viaParameters: Parameters<typeof db.serializable>[1] = async c => c.query('SELECT 1');
    void viaParameters;
    const mockImplementation = <F extends (...args: any) => any>(_: F, impl: (...args: Parameters<F>) => ReturnType<F>) => impl;
    void mockImplementation(db.serializable, async (_, callback) => callback(txn));
  });

  test('the two paths that move: the first parameter as a type, and an arrow given as the function', () => {
    const first = null as unknown as Parameters<typeof db.serializable>[0];
    // @ts-expect-error it is also a db.PoolLike, which has no query()
    void first.query('SELECT 1');
    // @ts-expect-error cb's client depends on the pool's type parameter, so a pg client is not assignable to it
    const contextual: typeof db.serializable = async (_, cb) => cb(txn);
    void contextual;
    // @ts-expect-error a function typed with 6.6.1's parameters does not take a db.PoolLike
    const typed: typeof db.serializable = async (_: db.Queryable | db.TxnClientForSerializable, cb: (c: db.TxnClientForSerializable) => Promise<any>) => cb(txn);
    void typed;
  });
});

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
declare function bookSeat(txnClient: db.TxnClientForSerializable): Promise<number>;
declare function wrap<F extends (...args: any) => any>(impl?: F): F;

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
declare class AppPool extends pg.Pool { connect(): Promise<pg.PoolClient & { tag: 1 }> }
interface MyClient extends pg.ClientBase { extra: number }
declare const other: { connect: () => Promise<OtherClient> };
declare const txn: db.TxnClientForSerializable;
declare const txnRC: db.TxnClientForReadCommitted;
declare const txnAny: db.TxnClient<db.IsolationLevel>;
declare const clientBase: pg.ClientBase;
declare const queryable: db.Queryable;
declare const myPool: MyPool;
declare const appPool: AppPool;
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
    expectTypeOf(db.transaction(other, db.IsolationLevel.ReadCommitted, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>();
      return 1;
    })).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.serializable(other, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>();
      return 1;
    })).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.repeatableRead(other, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.RepeatableRead>>();
      return 1;
    })).resolves.toEqualTypeOf<number>();
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

  // https://github.com/AlexandreDemartin/pgcast/issues/752: the explicit-result wrappers accepted by Zapatos 6.6.1
  test('a wrapper can pass each function’s first parameter with a result type argument', () => {
    const count = async () => 1;
    const wrappers = [
      (p: Parameters<typeof db.transaction>[0]) =>
        db.transaction<number, db.IsolationLevel.Serializable>(p, db.IsolationLevel.Serializable, count),
      (p: Parameters<typeof db.serializable>[0]) => db.serializable<number>(p, count),
      (p: Parameters<typeof db.repeatableRead>[0]) => db.repeatableRead<number>(p, count),
      (p: Parameters<typeof db.readCommitted>[0]) => db.readCommitted<number>(p, count),
      (p: Parameters<typeof db.serializableRO>[0]) => db.serializableRO<number>(p, count),
      (p: Parameters<typeof db.repeatableReadRO>[0]) => db.repeatableReadRO<number>(p, count),
      (p: Parameters<typeof db.readCommittedRO>[0]) => db.readCommittedRO<number>(p, count),
      (p: Parameters<typeof db.serializableRODeferrable>[0]) => db.serializableRODeferrable<number>(p, count),
    ];
    for (const run of wrappers) expectTypeOf(run(pool)).toEqualTypeOf<Promise<number>>();
  });

  test('annotating the callback’s return type lets TypeScript infer the pool’s client', () => {
    const result = db.serializable(other, async (c): Promise<number> => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>();
      return 1;
    });
    expectTypeOf(result).toEqualTypeOf<Promise<number>>();
  });

  test('a result type argument without a pool-client type argument gives the callback a pg client type', () => {
    void db.transaction<number, db.IsolationLevel.ReadCommitted>(other, db.IsolationLevel.ReadCommitted, async c => {
      expectTypeOf(c).toEqualTypeOf<db.TxnClientForReadCommitted>();
      return 1;
    });
    void db.serializable<number>(other, async c => {
      expectTypeOf(c).toEqualTypeOf<db.TxnClientForSerializable>();
      await c.query('SELECT 1');
      return 1;
    });
    void db.repeatableRead<number>(other, async c => {
      expectTypeOf(c).toEqualTypeOf<db.TxnClientForRepeatableRead>();
      return 1;
    });
  });

  test('naming the driver client alongside the result gives the callback that client type', () => {
    void db.transaction<number, db.IsolationLevel.ReadCommitted, OtherClient>(other, db.IsolationLevel.ReadCommitted, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>();
      return 1;
    });
    void db.serializable<number, OtherClient>(other, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>();
      // @ts-expect-error this driver's query() requires a query object
      await c.query('SELECT 1');
      return 1;
    });
    void db.repeatableRead<number, OtherClient>(other, async c => {
      expectTypeOf(c).toEqualTypeOf<TxnOther<db.IsolationLevel.RepeatableRead>>();
      return 1;
    });
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

});

declare const bare: OtherClient;
declare const withConnect: db.TxnClientLike<OtherClient & { connect: () => Promise<void> }, db.IsolationLevel.Serializable>;
declare const atAnyLevel: db.TxnClientLike<Awaited<ReturnType<db.PoolLike['connect']>>, db.IsolationLevel>;
declare function countUsers(txnClient: TxnOther<db.IsolationLevel.Serializable>): Promise<number>;
type Client = { query(q: db.SQLQuery): Promise<{ rows: any[]; command: string }>; release(): void };
type IndexedClient = OtherClient & { [key: string]: unknown };  // keyof holds every key, connect included
declare const indexed: db.PoolLike<IndexedClient>;
declare const p1: db.PoolLike<{
  query: (q: db.SQLQuery) => Promise<{ rows: any[]; command: string }>;
  release: () => void;
  connect?: never;
}>;

// #702: run time passes the client of another driver's transaction through a nested call; its callback gets that same
// client, typed at the outer level it runs at, as savepoint() gives it, where a pg client gets its own level, as in 6.6.1
describe('a nested call on another driver’s client (#702)', () => {
  test('the callback gets the client given, at the outer level, at each function', () => {
    void db.serializable(other, c => db.transaction(c, db.IsolationLevel.ReadCommitted, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.serializable(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.repeatableRead(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.readCommitted(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.serializableRO(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.repeatableReadRO(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.readCommittedRO(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    void db.serializable(other, c => db.serializableRODeferrable(c, async inner => { expectTypeOf(inner).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>(); }));
    const nested = db.readCommitted(other, c => db.serializable(c, async inner => inner));
    expectTypeOf(nested).resolves.toEqualTypeOf<TxnOther<db.IsolationLevel.ReadCommitted>>();
    expectTypeOf(nested).resolves.not.toBeAny();
    const run = db.serializable(other, c => db.readCommitted(c, inner => db.select('users', db.all).run(inner)));
    expectTypeOf(run).resolves.toEqualTypeOf<s.JSONSelectableForTable<'users'>[]>();
    expectTypeOf(run).resolves.not.toBeAny();
    expectTypeOf(db.serializable(literal, c => db.readCommitted(c, async inner => inner))).resolves.toEqualTypeOf<db.TxnClientLike<LiteralClient, db.IsolationLevel.Serializable>>();
    // the client of a db.PoolLike at any level has all the fallback's members except connect
    expectTypeOf(db.serializable(atAnyLevel, async inner => inner)).resolves.toEqualTypeOf<typeof atAnyLevel>();
  });

  test('a client whose type has a string index signature gets itself, its query() taking no string', () => {
    const bare: Client & Record<string, unknown> = { query: async () => ({ rows: [], command: 'SELECT' }), release() {} };
    // @ts-expect-error the index signature gives no transaction marker
    void db.serializable(bare, async () => 1);
    void db.serializable(indexed, c => db.readCommitted(c, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientLike<IndexedClient, db.IsolationLevel.Serializable>>(); }));
    // @ts-expect-error its query() takes pg's query object, not a string
    void db.serializable(indexed, c => db.readCommitted(c, inner => inner.query('SELECT 1')));
  });

  test('a client that declares connect?: never keeps its query type in a nested call', () => {
    // @ts-expect-error this driver's query() requires a query object
    void db.serializable(p1, c => db.readCommitted(c, inner => inner.query('SELECT 1')));
  });

  test('a pool can start a transaction at the level of the nested call', () => {
    type Client = Awaited<ReturnType<typeof p1.connect>>;
    type Serial = db.TxnClientLike<Client, db.IsolationLevel.Serializable>;
    // @ts-expect-error narrow the argument to the pool or the marked client first
    const read = (source: typeof p1 | Serial) => db.readCommitted(source, async c => c._zapatos!.isolationLevel);
    // @ts-expect-error the pool starts a READ COMMITTED transaction
    const level: Promise<db.IsolationLevel.Serializable> = read(p1);
    void level;
    // @ts-expect-error an explicit client type cannot give a pool a SERIALIZABLE transaction
    void db.readCommitted<number, Client, Serial>(p1, async (_: Serial) => 1);
    const nested = (c: Serial) => db.readCommitted(c, async inner => inner._zapatos!.isolationLevel);
    expectTypeOf(nested).returns.resolves.toEqualTypeOf<db.IsolationLevel.Serializable>();
  });

  test('a pool with client methods and a plain pg client can both start a fresh transaction', () => {
    type Serial = db.TxnClientLike<Client, db.IsolationLevel.Serializable>;
    type Pool = Client & db.PoolLike<Client>;
    // @ts-expect-error the pool has connect() even though it also has query() and release()
    const read = (source: Pool | Serial) => db.readCommitted(source, async c => c._zapatos!.isolationLevel);
    // @ts-expect-error a pool starts a READ COMMITTED transaction
    const level = (p: Pool): Promise<db.IsolationLevel.Serializable> => read(p);
    void level;
    // @ts-expect-error choosing Serial explicitly cannot give a plain pg client an outer transaction
    void db.readCommitted<db.IsolationLevel.Serializable, Client, Serial>(plain, async c => c._zapatos!.isolationLevel);
    // Explicit Serial asserts the outer level. A pool passed through this helper starts a READ COMMITTED transaction.
    const readAsSerial = <C extends Client>(source: C) =>
      db.readCommitted<db.IsolationLevel.Serializable, Client, Serial>(source, async c => c._zapatos!.isolationLevel);
    const throughPool = (p: Pool) => readAsSerial(p);
    expectTypeOf(throughPool).returns.toEqualTypeOf<Promise<db.IsolationLevel.Serializable>>();
    const nested = (c: Serial) => db.readCommitted(c, async inner => inner._zapatos!.isolationLevel);
    expectTypeOf(nested).returns.resolves.toEqualTypeOf<db.IsolationLevel.Serializable>();
  });

  test('the fallback client shape written out by a caller is still refused', () => {
    type Client = { query: (q: db.SQLQuery) => PromiseLike<{ rows: any[]; command: string }>; release: () => void };
    type Copy = db.TxnClientLike<Client, db.IsolationLevel> & { connect?: never };
    // @ts-expect-error this is the fallback type used when no client was inferred
    const read = (c: Copy) => db.serializable(c, async inner => inner);
    void read;
  });

  test('a union of different drivers’ marked clients must be narrowed first', () => {
    type Serial = db.TxnClientLike<OtherClient, db.IsolationLevel.Serializable>;
    type Second = db.TxnClientLike<LiteralClient & { driver: 'second' }, db.IsolationLevel.Serializable>;
    // @ts-expect-error the marked client could belong to pg
    const fromPgOrOther = (c: db.TxnClientForSerializable | Serial) => db.serializable(c, async inner => inner);
    // @ts-expect-error each driver has its own client type
    const fromEitherDriver = (c: Serial | Second) => db.serializable(c, async inner => inner);
    void fromPgOrOther;
    void fromEitherDriver;
  });

  test('a helper that takes the client, or a pool typed with its client, compiles', () => {
    const countTwice = (c: TxnOther<db.IsolationLevel.Serializable>) => db.serializable(c, inner => countUsers(inner));
    expectTypeOf(db.serializable(other, countTwice)).resolves.toEqualTypeOf<number>();
    const inPool = (p: db.PoolLike<OtherClient>, cb: (c: TxnOther<db.IsolationLevel.Serializable>) => Promise<number>) => db.serializable(p, cb);
    expectTypeOf(inPool(other, countTwice)).resolves.toEqualTypeOf<number>();
    expectTypeOf(inPool(other, countTwice)).resolves.not.toBeAny();
  });

  test('a bare client, a client with a connect(), a query() string, a pg-typed callback and a level not satisfied are refused', () => {
    // @ts-expect-error a client outside any transaction, whose type declares no _zapatos: run time would call its connect()
    void db.serializable(bare, async () => 1);
    // @ts-expect-error a client with a connect() is neither a pool's client nor a PoolLike
    void db.serializable(withConnect, async () => 1);
    // @ts-expect-error a client with no query() nor release(), though marked
    void db.serializable(null as unknown as db.TxnClientLike<{ exec: (text: string) => Promise<void> }, db.IsolationLevel.Serializable>, async () => 1);
    // @ts-expect-error its query() takes pg's query object, not a string
    void db.serializable(other, c => db.readCommitted(c, inner => inner.query('SELECT 1')));
    // @ts-expect-error another driver's client is no TxnClientForRepeatableRead
    void db.serializable(other, c => db.readCommitted(c, inner => countBookings(inner)));
    // @ts-expect-error the outer level, READ COMMITTED, does not satisfy SERIALIZABLE
    void db.readCommitted(other, c => db.serializable(c, inner => countUsers(inner)));
  });

  test('limitation: a helper generic over the pool’s client, or over the client, does not compile', () => {
    const overPool = <C>(p: db.PoolLike<C>, cb: (c: db.TxnClientLike<C, db.IsolationLevel.Serializable>) => Promise<number>) =>
      // @ts-expect-error the callback's client depends on C, left unresolved: type the pool db.PoolLike<OtherClient>
      db.serializable(p, cb);
    void overPool;
    const overClient = <C extends TxnOther<db.IsolationLevel.Serializable>>(c: C) =>
      // @ts-expect-error a client generic over another driver's: type it db.TxnClientLike<OtherClient, L>
      db.serializable(c, async () => 1);
    void overClient;
    const nestedOverPool = <C extends OtherClient>(p: db.PoolLike<C>) =>
      // @ts-expect-error the nested call's client depends on C, left unresolved: its callback would get pg's client
      db.serializable(p, c => db.readCommitted(c, inner => inner.query('SELECT 1')));
    void nestedOverPool;
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

  test('a pg.Pool subclass whose connect() gives a narrower client still gives the TxnClient… of its level', () => {
    expectTypeOf(db.serializable(appPool, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    // @ts-expect-error a TxnClientForSerializable has no tag, as in Zapatos 6.6.1
    void db.serializable(appPool, async c => c.tag);
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

  // #702: a value typed never, as in a branch TypeScript has ruled out, infers the client given as never
  test('a value typed never gives the callback the TxnClient… of its level', () => {
    expectTypeOf(db.serializable(null as never, async c => c)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.transaction(null as never, db.IsolationLevel.ReadCommitted, async c => c)).resolves.toEqualTypeOf<db.TxnClient<db.IsolationSatisfying<db.IsolationLevel.ReadCommitted>>>();
  });

  // #702: a function generic over any function infers the client given as any, as a Jest-shaped mock does
  test('a shortcut given to a function generic over its type still refuses what is no queryable', () => {
    const serializable = wrap(db.serializable);
    // @ts-expect-error a string is no queryable, as in Zapatos 6.6.1
    void serializable('not a pool', async () => 1);
    const transaction = wrap(db.transaction);
    // @ts-expect-error a string is no queryable, as in Zapatos 6.6.1
    void transaction('not a pool', db.IsolationLevel.Serializable, async () => 1);
    // the wrapped type resolves to unknown, as in Zapatos 6.6.1, but its callback gets the client of its level
    expectTypeOf(serializable(pool, async c => { expectTypeOf(c).toEqualTypeOf<db.TxnClientForSerializable>(); })).resolves.toEqualTypeOf<unknown>();
  });

  // #702: another driver's client is inferred from the first argument only when it has no connect(), which every pg value has
  test('inside a generic forwarder over a pg client or pool, the callback gets the TxnClient… of its level', () => {
    const overTxn = <C extends db.TxnClientForSerializable>(c: C) => db.serializable(c, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForSerializable>(); return bookSeat(inner); });
    const overPoolClient = <C extends pg.PoolClient>(c: C) => db.serializable(c, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForSerializable>(); return bookSeat(inner); });
    const overAnyTxn = <C extends db.TxnClient<db.IsolationLevel>>(c: C) => db.readCommitted(c, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForReadCommitted>(); });
    const overPool = <P extends pg.Pool>(p: P) => db.serializable(p, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForSerializable>(); return bookSeat(inner); });
    const overQueryable = <Q extends db.Queryable>(q: Q) => db.serializable(q, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForSerializable>(); return bookSeat(inner); });
    expectTypeOf(overTxn(txn)).resolves.toEqualTypeOf<number>();
    void [overPoolClient, overAnyTxn, overPool, overQueryable];
  });

  // the pool's client is inferred from the pool alone, never from the callback's own parameter (NoInfer), at each function
  test('a callback typed for a level the transaction does not satisfy is refused, by reference, annotated, forwarded or as a value', () => {
    expectTypeOf(db.serializable(pool, countBookings)).resolves.toEqualTypeOf<number>();
    // @ts-expect-error READ COMMITTED does not satisfy REPEATABLE READ
    void db.readCommitted(pool, countBookings);
    // @ts-expect-error READ ONLY does not satisfy a read-write level
    void db.repeatableReadRO(pool, countBookings);
    // @ts-expect-error IsolationSatisfying<SerializableRO> leaves SerializableRODeferrable out (#489)
    void db.serializableRODeferrable(pool, countSeats);
    // @ts-expect-error READ COMMITTED, READ ONLY does not satisfy SERIALIZABLE
    void db.readCommittedRO(pool, bookSeat);
    // @ts-expect-error REPEATABLE READ does not satisfy SERIALIZABLE, READ ONLY
    void db.repeatableRead(pool, countSeats);
    // @ts-expect-error SERIALIZABLE, READ ONLY does not satisfy SERIALIZABLE
    void db.serializableRO(pool, bookSeat);
    // @ts-expect-error a callback typed for another driver's client, given a pg pool: a pg client has no exec()
    void db.serializable(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at repeatableRead()
    void db.repeatableRead(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at readCommitted()
    void db.readCommitted(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at serializableRO()
    void db.serializableRO(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at repeatableReadRO()
    void db.repeatableReadRO(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at readCommittedRO()
    void db.readCommittedRO(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at serializableRODeferrable()
    void db.serializableRODeferrable(pool, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error at transaction()
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, async (c: OtherClient) => c.exec('SELECT 1'));
    // @ts-expect-error transaction() at READ COMMITTED
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, countBookings);
    // @ts-expect-error an arrow annotated with the wrong level
    void db.readCommitted(pool, async (c: db.TxnClientForRepeatableRead) => countBookings(c));
    // @ts-expect-error an annotated arrow that reads the level
    void db.readCommittedRO(pool, async (c: db.TxnClientForSerializable) => c._zapatos?.isolationLevel);
    const forwarder = <T>(cb: (c: db.TxnClientForRepeatableRead) => Promise<T>) =>
      // @ts-expect-error a forwarder's callback
      db.readCommitted(pool, cb);
    void forwarder;
    // @ts-expect-error inside a map()
    void [pool].map(p => db.readCommitted(p, countBookings));
    // @ts-expect-error on a plain client
    void db.readCommitted(plain, countBookings);
    // @ts-expect-error on a queryable typed any
    void db.readCommitted(anyValue, countBookings);
    // @ts-expect-error readCommitted() as a value typed for a REPEATABLE READ callback
    const asValue: (q: db.Queryable, cb: (c: db.TxnClientForRepeatableRead) => Promise<number>) => Promise<number> = db.readCommitted;
    void asValue;
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

// #723: savepoint() takes a transaction's client only, and gives its callback that client's own type, inferred from
// the client alone (NoInfer), as transaction() infers its pool's
describe('savepoint()', () => {
  test('the callback gets the client given, at each level, and the result is what the callback resolves to', () => {
    void db.serializable(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForSerializable>(); }));
    void db.repeatableRead(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForRepeatableRead>(); }));
    void db.readCommitted(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForReadCommitted>(); }));
    void db.serializableRO(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForSerializableRO>(); }));
    void db.repeatableReadRO(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForRepeatableReadRO>(); }));
    void db.readCommittedRO(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForReadCommittedRO>(); }));
    void db.serializableRODeferrable(pool, c => db.savepoint(c, async sp => { expectTypeOf(sp).toEqualTypeOf<db.TxnClientForSerializableRODeferrable>(); }));
    expectTypeOf(db.savepoint(txn, async () => 1)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.savepoint(txn, async () => 1)).resolves.not.toBeAny();
    expectTypeOf(db.savepoint(txn, async sp => sp)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf(db.serializable(pool, c => db.savepoint(c, () => db.select('users', db.all).run(c)))).resolves.toEqualTypeOf<s.JSONSelectableForTable<'users'>[]>();
  });

  test('nested, a TxnClientFor… function called inside, another driver’s client, a pg.PoolClient, forwarded and as a value', () => {
    void db.savepoint(txn, sp => db.savepoint(sp, async inner => { expectTypeOf(inner).toEqualTypeOf<db.TxnClientForSerializable>(); }));
    expectTypeOf(db.savepoint(txn, bookSeat)).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.savepoint(txn, sp => countBookings(sp))).resolves.toEqualTypeOf<number>();
    expectTypeOf(db.repeatableRead(pool, c => db.savepoint(c, countBookings))).resolves.toEqualTypeOf<number>();
    void db.serializable(other, c => db.savepoint(c, async sp => {
      expectTypeOf(sp).toEqualTypeOf<TxnOther<db.IsolationLevel.Serializable>>();
      expectTypeOf(sp.exec).toEqualTypeOf<OtherClient['exec']>();
    }));
    expectTypeOf(db.savepoint(plain, async sp => sp)).resolves.toEqualTypeOf<pg.PoolClient>();
    expectTypeOf(db.savepoint(txnAny, async sp => sp)).resolves.toEqualTypeOf<db.TxnClient<db.IsolationLevel>>();
    const forwarder = <C extends db.TxnClientForSerializable>(c: C) => db.savepoint(c, async sp => sp);
    expectTypeOf(forwarder(txn)).resolves.toEqualTypeOf<db.TxnClientForSerializable>();
    expectTypeOf([txn, txn].map(c => db.savepoint(c, bookSeat))).toEqualTypeOf<Promise<number>[]>();
    expectTypeOf(db.savepoint(anyValue, async () => 1)).resolves.toEqualTypeOf<number>();
  });

  test('refuses what is no transaction client, a callback typed for a level not satisfied, and a callback that returns no promise', () => {
    // @ts-expect-error a pg.Pool: no transaction is open on it
    void db.savepoint(pool, async () => 1);
    // @ts-expect-error a pg.Client is not a pg.PoolClient: it has no release()
    void db.savepoint(client, async () => 1);
    // @ts-expect-error a QueryableLike has no release()
    void db.savepoint(queryableLike, async () => 1);
    // @ts-expect-error a PoolLike is a pool
    void db.savepoint(poolLike, async () => 1);
    // @ts-expect-error another driver's pool
    void db.savepoint(other, async () => 1);
    // @ts-expect-error READ COMMITTED does not satisfy SERIALIZABLE
    void db.savepoint(txnRC, bookSeat);
    // @ts-expect-error the client of readCommitted() given to a callback typed for SERIALIZABLE
    void db.readCommitted(pool, c => db.savepoint(c, bookSeat));
    // @ts-expect-error an arrow annotated with the wrong level
    void db.savepoint(txnRC, async (sp: db.TxnClientForSerializable) => sp);
    // @ts-expect-error inside a map()
    void [txnRC].map(c => db.savepoint(c, bookSeat));
    // @ts-expect-error a TxnClient of any level does not satisfy SERIALIZABLE
    void db.savepoint(txnAny, bookSeat);
    // @ts-expect-error another driver's client is no TxnClientForRepeatableRead, which is a pg.PoolClient
    void db.serializable(other, c => db.savepoint(c, countBookings));
    // @ts-expect-error a callback that returns no promise
    void db.savepoint(txn, () => 1);
  });
});

// #724: advisoryXactLock() takes the client of a transaction, of any driver, and a key that pg_advisory_xact_lock takes
describe('advisoryXactLock()', () => {
  test('it takes the client of each shortcut, another driver’s, a pg.PoolClient, and resolves to void', () => {
    expectTypeOf(db.advisoryXactLock(txn, BigInt(42))).toEqualTypeOf<Promise<void>>();
    expectTypeOf(db.advisoryXactLock(txn, BigInt(42))).resolves.not.toBeAny();
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, c => db.advisoryXactLock(c, BigInt(42)));
    void db.serializable(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.repeatableRead(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.readCommitted(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.serializableRO(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.repeatableReadRO(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.readCommittedRO(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.serializableRODeferrable(pool, c => db.advisoryXactLock(c, BigInt(42)));
    void db.serializable(other, c => db.advisoryXactLock(c, BigInt(42)));
    void db.readCommitted(typedPool, c => db.advisoryXactLock(c, [1, 42]));
    void db.serializable(literal, c => db.advisoryXactLock(c, [1, 42]));
    void db.advisoryXactLock(txnRC, [1, 42]);
    void db.advisoryXactLock(txnAny, [1, 42]);
    void db.advisoryXactLock(plain, [1, 42]);
  });

  test('its key is a bigint, or a pair of numbers written inline, as const or in a readonly tuple', () => {
    const asConst = [1, 42] as const, tuple: readonly [number, number] = [1, 42], mutable: [number, number] = [1, 42];
    void db.advisoryXactLock(txn, BigInt(42));
    void db.advisoryXactLock(txn, null as unknown as bigint);
    void db.advisoryXactLock(txn, [1, 42]);
    void db.advisoryXactLock(txn, asConst);
    void db.advisoryXactLock(txn, tuple);
    void db.advisoryXactLock(txn, mutable);
    expectTypeOf<Parameters<typeof db.advisoryXactLock>[1]>().toEqualTypeOf<bigint | readonly [number, number]>();
  });

  test('a key of another type does not compile', () => {
    const numbers: number[] = [1, 42];
    // @ts-expect-error a number: a bigint is written BigInt(42)
    void db.advisoryXactLock(txn, 42);
    // @ts-expect-error a string
    void db.advisoryXactLock(txn, '42');
    // @ts-expect-error null, on which Postgres takes no lock
    void db.advisoryXactLock(txn, null);
    // @ts-expect-error a number[], whose length the type does not know
    void db.advisoryXactLock(txn, numbers);
    // @ts-expect-error one number
    void db.advisoryXactLock(txn, [1]);
    // @ts-expect-error three numbers
    void db.advisoryXactLock(txn, [1, 2, 3]);
  });

  test('a client that is no transaction’s does not compile', () => {
    // @ts-expect-error a pg.Pool, whose query would run on a client of its own, outside any transaction
    void db.advisoryXactLock(pool, BigInt(42));
    // @ts-expect-error a pg.Client
    void db.advisoryXactLock(client, BigInt(42));
    // @ts-expect-error a QueryableLike
    void db.advisoryXactLock(queryableLike, BigInt(42));
    // @ts-expect-error another driver's pool
    void db.advisoryXactLock(other, BigInt(42));
  });
});

// #738: setLocal() takes the client of a transaction, of any driver, and an object of strings: a value Postgres
// would take as a reset or as a driver's text does not compile, though an optional property does from TypeScript 4.2
describe('setLocal()', () => {
  const settings = { 'app.customer': 'Ada Quill' };
  test('it takes the client of each shortcut, another driver’s, a pg.PoolClient, and resolves to void', () => {
    expectTypeOf(db.setLocal(txn, settings)).toEqualTypeOf<Promise<void>>();
    expectTypeOf(db.setLocal(txn, settings)).resolves.not.toBeAny();
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, c => db.setLocal(c, settings));
    void db.serializable(pool, c => db.setLocal(c, settings));
    void db.repeatableRead(pool, c => db.setLocal(c, settings));
    void db.readCommitted(pool, c => db.setLocal(c, settings));
    void db.serializableRO(pool, c => db.setLocal(c, settings));
    void db.repeatableReadRO(pool, c => db.setLocal(c, settings));
    void db.readCommittedRO(pool, c => db.setLocal(c, settings));
    void db.serializableRODeferrable(pool, c => db.setLocal(c, settings));
    void db.serializable(other, c => db.setLocal(c, settings));
    void db.readCommitted(typedPool, c => db.setLocal(c, settings));
    void db.serializable(literal, c => db.setLocal(c, settings));
    void db.setLocal(txnRC, settings);
    void db.setLocal(txnAny, settings);
    void db.setLocal(plain, settings);
  });

  test('its settings are a literal, a computed name, a type alias, a Record, as const, the spread of an interface, or {}', () => {
    type Claims = { 'app.customer': string; role: string };
    interface Context { 'app.customer': string }
    const name: string = 'app.customer', claims: Claims = { 'app.customer': 'Ada Quill', role: 'cinema_customer' };
    const record: Record<string, string> = { 'app.customer': 'Ada Quill' }, asConst = { 'app.customer': 'Ada Quill' } as const;
    const context: Context = { 'app.customer': 'Ada Quill' };
    void db.setLocal(txn, { 'app.customer': 'Ada Quill', role: 'cinema_customer' });
    void db.setLocal(txn, { [name]: 'Ada Quill' });
    void db.setLocal(txn, claims);
    void db.setLocal(txn, record);
    void db.setLocal(txn, asConst);
    void db.setLocal(txn, { ...context });
    void db.setLocal(txn, {});
    expectTypeOf<Parameters<typeof db.setLocal>[1]>().toEqualTypeOf<{ readonly [name: string]: string }>();
  });

  // TypeScript 4.1 refuses it; from 4.2 an optional property fits an index signature, with or without
  // exactOptionalPropertyTypes, so an undefined in it reaches the run-time refusal
  test('an optional property compiles, as do a Partial and a Symbol key', () => {
    type Claims = { 'app.customer'?: string; role: string };
    const claims: Claims = { role: 'cinema_customer' }, partial: Partial<Record<'app.customer', string>> = {};
    void db.setLocal(txn, claims);
    void db.setLocal(txn, partial);
    void db.setLocal(txn, { [Symbol('app.customer')]: 'Ada Quill' });
  });

  test('a value that is not a string, or settings that are not an object of strings, do not compile', () => {
    interface Context { 'app.customer': string }
    const context: Context = { 'app.customer': 'Ada Quill' }, maybe: string | undefined = undefined;
    const map = new Map([['app.customer', 'Ada Quill']]), names: string[] = ['app.customer'];
    // @ts-expect-error a number, which Postgres would store as pg's text of it
    void db.setLocal(txn, { 'app.screening': 42 });
    // @ts-expect-error null, which Postgres would take as a reset
    void db.setLocal(txn, { 'app.customer': null });
    // @ts-expect-error undefined, which Postgres would take as a reset
    void db.setLocal(txn, { 'app.customer': undefined });
    // @ts-expect-error a string or undefined
    void db.setLocal(txn, { 'app.customer': maybe });
    // @ts-expect-error an interface, which has no index signature: spread it
    void db.setLocal(txn, context);
    // @ts-expect-error a Map, whose entries are no own properties
    void db.setLocal(txn, map);
    // @ts-expect-error a string
    void db.setLocal(txn, 'app.customer');
    // @ts-expect-error a string[]
    void db.setLocal(txn, names);
    // @ts-expect-error a Date
    void db.setLocal(txn, new Date());
  });

  test('a client that is no transaction’s does not compile', () => {
    // @ts-expect-error a pg.Pool, whose query would run on a client of its own, outside any transaction
    void db.setLocal(pool, settings);
    // @ts-expect-error a pg.Client
    void db.setLocal(client, settings);
    // @ts-expect-error a QueryableLike
    void db.setLocal(queryableLike, settings);
    // @ts-expect-error another driver's pool
    void db.setLocal(other, settings);
  });
});

// #743: the batch is the fragment's own RunResult, an array of rows; the client a transaction's
describe('cursor()', () => {
  const options = { batchSize: 100 };
  type Users = s.users.Selectable[];

  test('it yields the fragment’s RunResult, from an AsyncGenerator of it', () => {
    const typed = db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`;
    expectTypeOf(db.cursor(txn, typed, options)).toEqualTypeOf<AsyncGenerator<Users, void, undefined>>();
    void (async () => {
      for await (const users of db.cursor(txn, typed, options)) { expectTypeOf(users).toEqualTypeOf<Users>(); expectTypeOf(users).not.toBeAny(); }
      for await (const rows of db.cursor(txn, db.sql`SELECT 1`, options)) expectTypeOf(rows).toEqualTypeOf<any[]>();
      for await (const users of db.cursor(txn, db.select('users', db.all), options)) {
        expectTypeOf(users).toEqualTypeOf<s.users.JSONSelectable[]>();
        expectTypeOf(users).not.toBeAny();
      }
      const ids = db.select('users', db.all, { columns: ['id', 'email'] });
      for await (const users of db.cursor(txn, ids, options)) expectTypeOf(users).toEqualTypeOf<Awaited<ReturnType<typeof ids.run>>>();
      for await (const names of db.cursor(txn, db.sql<db.SQL, readonly string[]>`SELECT 1`, options)) expectTypeOf(names).toEqualTypeOf<readonly string[]>();
    })();
  });

  test('it takes the client of each shortcut, another driver’s, a pg.PoolClient', () => {
    const typed = db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`;
    void db.transaction(pool, db.IsolationLevel.ReadCommitted, async c => { db.cursor(c, typed, options); });
    void db.serializable(pool, async c => { db.cursor(c, typed, options); });
    void db.readCommittedRO(pool, async c => { db.cursor(c, typed, options); });
    void db.serializable(other, async c => { db.cursor(c, typed, options); });
    void db.readCommitted(typedPool, async c => { db.cursor(c, typed, options); });
    void db.cursor(txnRC, typed, options);
    void db.cursor(txnAny, typed, options);
    void db.cursor(plain, typed, options);
  });

  test('a generic forwarder and the function used as a value keep the batch type', () => {
    const forward = <R extends readonly unknown[]>(q: db.SQLFragment<R, any>) => db.cursor(txn, q, { batchSize: 10 });
    expectTypeOf(forward(db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`)).toEqualTypeOf<AsyncGenerator<Users, void, undefined>>();
    const all = [db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`].map(q => db.cursor(txn, q, options));
    expectTypeOf(all).toEqualTypeOf<AsyncGenerator<Users, void, undefined>[]>();
    expectTypeOf<Parameters<typeof db.cursor>[2]>().toEqualTypeOf<{ readonly batchSize: number }>();
  });

  test('a query whose result is no array of rows, a query that is no fragment, or a wrong size do not compile', () => {
    const typed = db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`;
    // @ts-expect-error selectOne(), whose result is one row or undefined
    void db.cursor(txn, db.selectOne('users', db.all), options);
    // @ts-expect-error selectExactlyOne(), whose result is one row
    void db.cursor(txn, db.selectExactlyOne('users', db.all), options);
    // @ts-expect-error count(), whose result is a number
    void db.cursor(txn, db.count('users', db.all), options);
    // @ts-expect-error a string
    void db.cursor(txn, 'SELECT 1', options);
    // @ts-expect-error a query object
    void db.cursor(txn, { text: 'SELECT 1', values: [] }, options);
    // @ts-expect-error no options
    void db.cursor(txn, typed);
    // @ts-expect-error no batchSize
    void db.cursor(txn, typed, {});
    // @ts-expect-error a string as batchSize
    void db.cursor(txn, typed, { batchSize: '100' });
  });

  // their result is an array, so the type takes them; Postgres refuses each DECLARE (42601)
  test('limitation: an insert() of rows, an update() and a deletes() compile, an insert() of one row does not', () => {
    const row = { email: 'ada@example.com', display_name: 'Ada' };
    void db.cursor(txn, db.insert('users', [row]), options);
    void db.cursor(txn, db.update('users', { display_name: 'Ada' }, { id: 1 }), options);
    void db.cursor(txn, db.deletes('users', { id: 1 }), options);
    // @ts-expect-error an insert() of one row, whose result is one row
    void db.cursor(txn, db.insert('users', row), options);
  });

  test('a client that is no transaction’s does not compile', () => {
    const typed = db.sql<s.users.SQL, Users>`SELECT * FROM ${'users'}`;
    // @ts-expect-error a pg.Pool, whose DECLARE would run outside any transaction
    void db.cursor(pool, typed, options);
    // @ts-expect-error a pg.Client
    void db.cursor(client, typed, options);
    // @ts-expect-error a QueryableLike
    void db.cursor(queryableLike, typed, options);
    // @ts-expect-error another driver's pool
    void db.cursor(other, typed, options);
  });
});

/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';
import { isDatabaseError } from './pgErrors';
import { mapWithSeparator, wait } from './utils';
import { sql, raw, param, SQLFragment } from './core';
import { getConfig } from './config';
import type { SQLQuery, TransactionEvent } from './config';
import type { Queryable } from './core';


export enum IsolationLevel {
  // these are the only meaningful values in Postgres: 
  // see https://www.postgresql.org/docs/11/sql-set-transaction.html
  Serializable = "SERIALIZABLE",
  RepeatableRead = "REPEATABLE READ",
  ReadCommitted = "READ COMMITTED",
  SerializableRO = "SERIALIZABLE, READ ONLY",
  RepeatableReadRO = "REPEATABLE READ, READ ONLY",
  ReadCommittedRO = "READ COMMITTED, READ ONLY",
  SerializableRODeferrable = "SERIALIZABLE, READ ONLY, DEFERRABLE"
}

export type IsolationSatisfying<T extends IsolationLevel> = {
  [IsolationLevel.Serializable]: IsolationLevel.Serializable;
  [IsolationLevel.RepeatableRead]: IsolationSatisfying<IsolationLevel.Serializable> | IsolationLevel.RepeatableRead;
  [IsolationLevel.ReadCommitted]: IsolationSatisfying<IsolationLevel.RepeatableRead> | IsolationLevel.ReadCommitted;
  [IsolationLevel.SerializableRO]: IsolationSatisfying<IsolationLevel.Serializable> | IsolationLevel.SerializableRO | IsolationLevel.SerializableRODeferrable;
  [IsolationLevel.RepeatableReadRO]: IsolationSatisfying<IsolationLevel.SerializableRO> | IsolationSatisfying<IsolationLevel.RepeatableRead> | IsolationLevel.RepeatableReadRO;
  [IsolationLevel.ReadCommittedRO]: IsolationSatisfying<IsolationLevel.RepeatableReadRO> | IsolationSatisfying<IsolationLevel.ReadCommitted> | IsolationLevel.ReadCommittedRO;
  [IsolationLevel.SerializableRODeferrable]: IsolationSatisfying<IsolationLevel.SerializableRO>;
}[T];

// For each nested request, the outer levels whose client it accepts. The type tests check each row against IsolationSatisfying.
// A Map, so that a level it doesn't know, a string from JavaScript ('constructor'), is passed through, as in Zapatos 6.6.1
const
  { Serializable: S, RepeatableRead: RR, ReadCommitted: RC, SerializableRO: SRO, RepeatableReadRO: RRRO,
    ReadCommittedRO: RCRO, SerializableRODeferrable: SROD } = IsolationLevel,
  satisfying = new Map<IsolationLevel, IsolationLevel[]>([
    [S, [S]], [RR, [S, RR]], [RC, [S, RR, RC]], [SRO, [S, SRO, SROD]], [RRRO, [S, RR, SRO, RRRO, SROD]],
    [RCRO, [S, RR, RC, SRO, RRRO, RCRO, SROD]], [SROD, [S, SRO, SROD]],
  ]);

/**
 * The client of a transaction, marked by `_zapatos` while `transaction()` runs it.
 * `_zapatos` is optional, as in Zapatos 6.6.1: any `pg.PoolClient` is accepted
 * where a `TxnClient` is asked for, with or without a transaction open on it.
 */
export interface TxnClient<T extends IsolationLevel> extends pg.PoolClient {
  _zapatos?: {
    isolationLevel: T;
    txnId: number;
  };
}

export type TxnClientForSerializable = TxnClient<IsolationSatisfying<IsolationLevel.Serializable>>;
export type TxnClientForRepeatableRead = TxnClient<IsolationSatisfying<IsolationLevel.RepeatableRead>>;
export type TxnClientForReadCommitted = TxnClient<IsolationSatisfying<IsolationLevel.ReadCommitted>>;
export type TxnClientForSerializableRO = TxnClient<IsolationSatisfying<IsolationLevel.SerializableRO>>;
export type TxnClientForRepeatableReadRO = TxnClient<IsolationSatisfying<IsolationLevel.RepeatableReadRO>>;
export type TxnClientForReadCommittedRO = TxnClient<IsolationSatisfying<IsolationLevel.ReadCommittedRO>>;
export type TxnClientForSerializableRODeferrable = TxnClient<IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>;

// a client of a PoolLike: a QueryableLike whose result also gives the command tag, which transaction() reads off its
// COMMIT (#190), and a release(), which it calls once done; properties, as QueryableLike's query, checked one way
type PoolClientLike = { query: (query: SQLQuery) => PromiseLike<{ rows: any[]; command: string }>; release: () => void };

/**
 * A pool of any driver, which `transaction()` takes as it takes a `pg.Pool`:
 * its `connect()` resolves to a client whose `query({ text, values })`
 * resolves to `{ rows, command }`, `command` holding the command tag
 * (`COMMIT`, or `ROLLBACK` when Postgres rolled the transaction back), and
 * which has a `release()`, called once the transaction ends. `C` is that
 * client's type; a `pg.Pool` is a `PoolLike` too.
 */
export interface PoolLike<C = PoolClientLike> {
  connect: () => PromiseLike<C extends PoolClientLike ? C : PoolClientLike>;
}

/**
 * The client of a `PoolLike`, `C`, as a `transaction()` callback gets it:
 * marked by `_zapatos` while the transaction runs, as a `TxnClient` is.
 */
export type TxnClientLike<C, T extends IsolationLevel> = C & {
  _zapatos?: {
    isolationLevel: T;
    txnId: number;
  };
};

// as in core.ts: the callbacks below read C through it, so that C is inferred from the pool alone, never from a
// callback's own parameter, which would let a callback typed for a level the transaction doesn't satisfy compile
type NoInfer<T> = [T][T extends any ? 0 : never];  // https://github.com/Microsoft/TypeScript/issues/14829

// the client a callback gets: C stays unknown for a pg queryable, which gives the named TxnClient… type, Pg, as
// do Parameters and infer, which read C as unknown, and so does a pg.PoolClient, from a pg.Pool subclass whose connect()
// is its own; a PoolLike's client otherwise, inferred from its connect()
type TxnClientOf<C, Pg, T extends IsolationLevel> = unknown extends C ? Pg : [C] extends [pg.PoolClient] ? Pg : TxnClientLike<C, T>;

// the client of another driver's transaction, given to a nested call, N: it has no connect(), which every pg value and
// pool has, so these fail the constraint, or infer nothing, and N stays PassedLike (#702)
type PassedLike = TxnClientLike<PoolClientLike, IsolationLevel> & { connect?: never };
// when inference finds no N, its default or constraint is PassedLike's own type object
type IsPassedLike<N> = (<X>() => X extends N ? 1 : 2) extends (<X>() => X extends PassedLike ? 1 : 2) ? true : false;
// A string index signature gives a client the _zapatos key. Check the marker's type too.
type Passed<N> = 0 extends 1 & N ? never : IsPassedLike<N> extends true ? never :
  '_zapatos' extends keyof N ? N['_zapatos'] extends PassedLike['_zapatos'] ? N : never : never;
// A pool and a marked client can share the pool parameter if both fit PoolLike.
// At run time a client with its own marker passes through at the outer level.
type WithPassed<N, Else> = ([Passed<N>] extends [never] ? Else : never) | Passed<N>;
// The constraint on N binds only the type argument. The client argument itself must exclude values with connect().
// Keeping N in the never branch lets TypeScript infer the whole client, including a caller's copy of PassedLike.
type WithPassedArgument<N, Else> = ([Passed<N>] extends [never] ? Else : never) |
  ([N] extends [never] ? N : Passed<N> & { connect?: never });

// the callback as the body of transaction() calls it: with the client of a PoolLike, which run time uses as a TxnClient
type Callback<T, M extends IsolationLevel> = (client: TxnClient<IsolationSatisfying<M>>) => Promise<T>;


function typeofQueryable(queryable: Queryable) {
  if (queryable instanceof pg.Pool) return 'pool';
  if (queryable instanceof pg.Client) return 'client';

  // only pg 7 makes `native` enumerable, so this runs with pg 7 only; from pg 8.0, a native client skips it and
  // is told apart by `_connected`, below. pg 7's `native` is a getter that loads pg-native (printing an error
  // when it is missing) and then turns into a value: still a getter, nobody has made a native client from it,
  // so it is not read (see https://github.com/AlexandreDemartin/pgcast/issues/268)
  const
    descriptor = Object.getOwnPropertyDescriptor(pg, 'native'),
    native: typeof pg.native = descriptor?.enumerable ? descriptor.value ?? null : null;

  if (native) {
    if (queryable instanceof native.Pool) return 'pool';
    if (queryable instanceof native.Client) return 'client';
  }

  // for pg < 8, and sometimes in 8.x for reasons that aren't clear, all the
  // instanceof checks fail: then we resort to testing for the private variable
  // `_connected`, which is defined (as a boolean) on clients (pure JS and
  // native) but not on pools

  if ((queryable as any)._connected === undefined) return 'pool';
  return 'client';
}

/**
 * The client's transaction status, as pg reads it from Postgres (from pg 8.21; pg-native 3.8): `I` outside a
 * transaction block, `T` inside one, `E` inside an aborted one; `undefined` when pg can't say.
 */
const transactionStatus = (client: pg.ClientBase) => {
  try { return (client as { getTransactionStatus?(): string | null }).getTransactionStatus?.() ?? undefined; }
  catch { return undefined; }  // a native client on pg-native < 3.8 lacks the method pg calls
};
const inBlock = (client: pg.ClientBase) => { const s = transactionStatus(client); return s === 'T' || s === 'E'; };

/**
 * The attempts `transaction()` makes for a `transactionAttemptsMax`, at least one. A value whose conversion throws
 * (a `Symbol`, from JavaScript) is returned as it is: comparing it after a 40001 / 40P01 throws, as in Zapatos 6.6.1.
 */
const attemptsMade = (max: number) => {
  try { return Math.max(1, Math.ceil(Number(max))) || 1; }
  catch { return max; }
};

let txnSeq = 0;
const savepointDepths = new WeakMap<object, number>();  // how many savepoint() calls each client is inside

type RetriedCode = Extract<TransactionEvent, { type: 'rollback' }>['code'];

/**
 * Provide a database client to the callback, whose queries are then wrapped in 
 * a database transaction. The transaction is committed, retried, or rolled back
 * as appropriate.
 *
 * When the callback catches a query error and Postgres answers `COMMIT` with
 * `ROLLBACK`, reject without retrying: nothing was saved.
 *
 * When a caller's client still reports a transaction block after an empty
 * query, reject before `START TRANSACTION`, leaving the caller's block open.
 *
 * Open the outer helper at the level you need. A later `SET TRANSACTION` leaves
 * its marker unchanged. If the marked level does not satisfy the nested request
 * (`IsolationSatisfying`), reject before its callback.
 *
 * Given a `PoolLike` of another driver, the callback gets its client, a
 * `TxnClientLike`, released once the transaction ends. Passed to a nested
 * call, that client is passed through, normally typed at the outer level. If
 * the client itself fits the `PoolLike` parameter, TypeScript types the callback's
 * client at the nested call's level. At run time the usual outer-level check
 * applies. Never give the nested call the pool, whose second client is another
 * transaction.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client (`pg.Client`, `pg.native.Client` or a `pg.PoolClient`, used
 * as is and not released), an existing transaction client to be passed
 * through, another driver's included, or the `PoolLike` of another driver,
 * whose client the callback gets. With that pool, a call specifying the result type
 * argument but omitting the pool-client type argument gives the callback pg's
 * transaction client type. You can annotate the callback's return type instead.
 * @param isolationLevel The desired isolation level (e.g.
 * `IsolationLevel.Serializable`)
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function transaction<T, M extends IsolationLevel, C = unknown, N extends PassedLike = PassedLike>(
  txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClient<IsolationSatisfying<M>> | PoolLike<C>>,
  isolationLevel: M,
  callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClient<IsolationSatisfying<M>>, IsolationSatisfying<M>>>) => Promise<T>
): Promise<T> {

  if (Object.prototype.hasOwnProperty.call(txnClientOrQueryable, '_zapatos')) {
    // if txnClientOrQueryable is a TxnClient, just pass it through: its callback runs at the outer transaction's level, as
    // Postgres can't change the isolation level once the transaction's first query has run (see https://github.com/AlexandreDemartin/pgcast/issues/177)
    const outer = (txnClientOrQueryable as TxnClient<IsolationLevel>)._zapatos?.isolationLevel;
    if (outer !== undefined && satisfying.has(outer) && satisfying.get(isolationLevel)?.includes(outer) === false) {
      throw new Error(`transaction() at ${isolationLevel} was given the client of a transaction at ${outer}, so its callback would run at ${outer}: open the outer transaction at a level that satisfies ${isolationLevel} (IsolationSatisfying)`);
    }
    return (callback as Callback<T, M>)(txnClientOrQueryable as TxnClient<IsolationSatisfying<M>>);
  }

  if (!Object.values(IsolationLevel).includes(isolationLevel)) throw new Error(`Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '${isolationLevel}'`);

  if (txnSeq >= Number.MAX_SAFE_INTEGER - 1) txnSeq = 0;  // wrap around

  const
    txnId = txnSeq++,
    // run time takes any object that is no pg client for a pool: a PoolLike is used as a pg.Pool is
    clientIsOurs = typeofQueryable(txnClientOrQueryable as Queryable) === 'pool',
    txnClient = (clientIsOurs ? await (txnClientOrQueryable as pg.Pool).connect() : txnClientOrQueryable) as TxnClient<M>;

  try {  // from here, every path releases a client checked out from the pool
    txnClient._zapatos = { isolationLevel, txnId };

    // a client of the caller's, inside a block of its own (BEGIN): our COMMIT or ROLLBACK would end that
    // transaction (see https://github.com/AlexandreDemartin/pgcast/issues/233)
    if (!clientIsOurs && inBlock(txnClient)) {
      // pg reads the status at each ReadyForQuery, so it can lag behind a query that just rejected (a failed
      // COMMIT): an empty query, which Postgres does not count as a query of the block, reads it again
      await sql``.run(txnClient);  // meanwhile, a call at the same moment sees the mark, and is passed through
      if (inBlock(txnClient)) throw new Error('transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()');
    }

    const
      config = getConfig(),
      { transactionListener, transactionEventListener } = config,
      // the attempts the loop below makes, so that its messages count them: one for 0, a negative or NaN, three
      // for 2.5 (see https://github.com/AlexandreDemartin/pgcast/issues/179); Number() keeps '3' and 3n working
      maxAttempts = attemptsMade(config.transactionAttemptsMax),
      { minMs, maxMs } = config.transactionRetryDelay;

    for (let attempt = 1; ; attempt++) {
      let result: T, commandTag: string | undefined;
      try {
        if (attempt > 1) {
          if (transactionListener) transactionListener(`Retrying transaction, attempt ${attempt} of ${maxAttempts}`, txnId);
          if (transactionEventListener) transactionEventListener({ type: 'retry', attempt, maxAttempts }, txnId);
        }

        await sql`START TRANSACTION ISOLATION LEVEL ${raw(isolationLevel)}`.run(txnClient);
        result = await (callback as Callback<T, M>)(txnClient as TxnClient<IsolationSatisfying<M>>);

        const commit = sql`COMMIT`;
        commit.runResultTransform = qr => { commandTag = qr.command; return qr.rows; };  // listeners get the rows, as before
        await commit.run(txnClient);

      } catch (err: any) {
        await sql`ROLLBACK`.run(txnClient);

        // on trapping the following two rollback error codes, see:
        // https://www.postgresql.org/message-id/1368066680.60649.YahooMailNeo@web162902.mail.bf1.yahoo.com
        // this is also a good read:
        // https://www.enterprisedb.com/blog/serializable-postgresql-11-and-beyond

        // a thrown null or undefined is rethrown as it is (#179); isDatabaseError() gives false for it since #178
        if (err != null && isDatabaseError(err, "TransactionRollback_SerializationFailure", "TransactionRollback_DeadlockDetected")) {
          // the listeners get the code as the message prints it, read once for both, where the message read it: a String
          // object, which isDatabaseError() also matches, is given to the event as its text (see https://github.com/AlexandreDemartin/pgcast/issues/725)
          if (attempt < maxAttempts) {
            const delayBeforeRetry = Math.round(minMs + (maxMs - minMs) * Math.random());
            if (transactionListener || transactionEventListener) {
              const code = `${err.code}` as RetriedCode;
              if (transactionListener) transactionListener(`Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms`, txnId);
              if (transactionEventListener) transactionEventListener({ type: 'rollback', code, attempt, maxAttempts, delayMs: delayBeforeRetry }, txnId);
            }
            await wait(delayBeforeRetry);
            continue;

          } else {
            if (transactionListener || transactionEventListener) {
              const code = `${err.code}` as RetriedCode;
              if (transactionListener) transactionListener(`Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up`, txnId);
              if (transactionEventListener) transactionEventListener({ type: 'giveUp', code, attempt, maxAttempts }, txnId);
            }
            throw err;
          }

        } else {
          throw err;
        }
      }

      // after a query error that the callback caught, the transaction is aborted: Postgres answers COMMIT
      // with the command tag ROLLBACK, not an error, and nothing was saved (see https://github.com/AlexandreDemartin/pgcast/issues/190)
      if (commandTag === 'ROLLBACK') {
        throw new Error('the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on');
      }

      return result;
    }

  } finally {
    delete txnClient._zapatos;
    if (clientIsOurs) txnClient.release();
  }
}

/**
 * Shortcut for `transaction` with isolation level `Serializable`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializable<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForSerializable | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForSerializable, IsolationSatisfying<IsolationLevel.Serializable>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.Serializable, callback as Callback<T, IsolationLevel.Serializable>);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableRead`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableRead<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForRepeatableRead | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForRepeatableRead, IsolationSatisfying<IsolationLevel.RepeatableRead>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.RepeatableRead, callback as Callback<T, IsolationLevel.RepeatableRead>);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommitted`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided 
 * to it
 */
export async function readCommitted<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForReadCommitted | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForReadCommitted, IsolationSatisfying<IsolationLevel.ReadCommitted>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.ReadCommitted, callback as Callback<T, IsolationLevel.ReadCommitted>);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRO<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForSerializableRO | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForSerializableRO, IsolationSatisfying<IsolationLevel.SerializableRO>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.SerializableRO, callback as Callback<T, IsolationLevel.SerializableRO>);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableReadRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableReadRO<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForRepeatableReadRO | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForRepeatableReadRO, IsolationSatisfying<IsolationLevel.RepeatableReadRO>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.RepeatableReadRO, callback as Callback<T, IsolationLevel.RepeatableReadRO>);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommittedRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function readCommittedRO<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForReadCommittedRO | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForReadCommittedRO, IsolationSatisfying<IsolationLevel.ReadCommittedRO>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.ReadCommittedRO, callback as Callback<T, IsolationLevel.ReadCommittedRO>);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRODeferrable`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRODeferrable<T, C = unknown, N extends PassedLike = PassedLike>(txnClientOrQueryable: WithPassedArgument<N, Queryable | TxnClientForSerializableRODeferrable | PoolLike<C>>, callback: (client: WithPassed<NoInfer<N>, TxnClientOf<NoInfer<C>, TxnClientForSerializableRODeferrable, IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>>) => Promise<T>) {
  return transaction(txnClientOrQueryable as Queryable, IsolationLevel.SerializableRODeferrable, callback as Callback<T, IsolationLevel.SerializableRODeferrable>);
}

/**
 * Run the callback inside a savepoint of the transaction `txnClient` is in,
 * and return a promise of what it resolves to. The callback gets that same
 * client. The SQL, `<d>` its depth, 1 directly in the transaction, 2 inside
 * that, and so on:
 *
 * `SAVEPOINT pgcast_savepoint_<d>`, the callback's queries, then
 * `RELEASE SAVEPOINT pgcast_savepoint_<d>`. If the callback or that `RELEASE`
 * rejects, `ROLLBACK TO SAVEPOINT pgcast_savepoint_<d>` and
 * `RELEASE SAVEPOINT pgcast_savepoint_<d>`, then it rejects with that error;
 * if one of these two rejects, it rejects with its error instead.
 *
 * - On 40001 or 40P01, it rejects at once, with no `ROLLBACK TO`. A server-side
 *   conflict leaves the transaction aborted. If the error reaches the outer
 *   `transaction()` with an attempt left, it retries the whole callback.
 *   A savepoint never retries on its own.
 * - A callback that catches a query's error and returns gets 25P02 from
 *   `RELEASE`: its work is undone, nested savepoints included, and this
 *   rejects with that 25P02. So a 40001 or 40P01 caught in the callback is not
 *   retried there. After a 40P01, or a 40001 of `REPEATABLE READ`, the
 *   transaction goes on, and its `COMMIT` saves what it wrote outside this
 *   savepoint; after a 40001 of `SERIALIZABLE`, Postgres can refuse a later
 *   query or the `COMMIT` with 40001 again, which `transaction()` retries.
 *   Let them out.
 * - Each `ROLLBACK TO` and `RELEASE` also ends the savepoints established
 *   after its own, so each level undoes its own work whatever an inner one
 *   left. Don't name a savepoint of yours `pgcast_savepoint_<d>`.
 * - The depth is counted per client object, by each copy of this library
 *   apart: a wrapper or a `Proxy` of the client counts from 1 again, as does a
 *   savepoint of one copy inside another's. The inner savepoint then takes the
 *   outer one's name, and an inner 40001 caught one level up leaves the outer
 *   work in.
 * - `await` each: two at once on one client nest in the order they are
 *   called. The first, if it ends first, ends the second's savepoint, whose
 *   own `RELEASE` then fails (3B001) and aborts the transaction; a
 *   `ROLLBACK TO` of the second also undoes what the first wrote after the
 *   second's `SAVEPOINT`.
 * - Only the `code` is read, as `transaction()` reads it: a 40001 thrown from
 *   JavaScript, then caught, leaves the work of its savepoint in, unless an
 *   outer level rolls back.
 * - Outside a transaction block, Postgres refuses the `SAVEPOINT` (25P01): it
 *   rejects with that, and the callback is never called.
 * @param txnClient The client of a transaction: a `transaction()` callback's,
 * of any driver, or a `pg.PoolClient` you sent `BEGIN` on
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function savepoint<T, C extends TxnClient<IsolationLevel> | TxnClientLike<PoolClientLike, IsolationLevel>>(
  txnClient: C,
  callback: (client: NoInfer<C>) => Promise<T>
): Promise<T> {

  // the name of its depth on this client: ROLLBACK TO and RELEASE then also destroy any savepoint an inner level left
  // established (the 40001 / 40P01 exit below cannot RELEASE its own), see https://www.postgresql.org/docs/current/sql-rollback-to.html;
  // one text per depth, as pg_stat_statements before Postgres 17 keeps an entry per text of a SAVEPOINT
  const
    depth = (savepointDepths.get(txnClient) ?? 0) + 1,
    name = raw(`pgcast_savepoint_${depth}`);

  savepointDepths.set(txnClient, depth);
  try {  // from here, every exit leaves the depth one less
    await sql`SAVEPOINT ${name}`.run(txnClient);
    try {
      const result = await callback(txnClient as NoInfer<C>);
      await sql`RELEASE SAVEPOINT ${name}`.run(txnClient);
      return result;

    } catch (err: any) {
      // rethrown as it is, so that the outer transaction() rolls back and retries: a thrown null or undefined is not one
      if (err != null && isDatabaseError(err, "TransactionRollback_SerializationFailure", "TransactionRollback_DeadlockDetected")) throw err;

      // RELEASE after ROLLBACK TO, which leaves the savepoint established; either one rejecting rejects with its own error
      await sql`ROLLBACK TO SAVEPOINT ${name}`.run(txnClient);
      await sql`RELEASE SAVEPOINT ${name}`.run(txnClient);
      throw err;
    }

  } finally {
    // one less than now, not depth - 1: two at once on one client, unsupported, still leave it back at 0
    const left = (savepointDepths.get(txnClient) ?? 1) - 1;
    if (left > 0) savepointDepths.set(txnClient, left);
    else savepointDepths.delete(txnClient);
  }
}

/* === advisoryXactLock === */

/**
 * Take a transaction-level advisory lock on `key`, waiting while another
 * transaction holds it, and resolve once it is held. Postgres releases it as
 * the transaction ends, at `COMMIT` or `ROLLBACK`, at a `ROLLBACK TO` a
 * savepoint taken before it, and as soon as a query fails, unless that query
 * runs in a savepoint taken after the lock: so an attempt that `transaction()`
 * retries never holds the lock of the one before. The SQL:
 *
 * - a `bigint`, `BigInt(42)`: `SELECT pg_advisory_xact_lock($1)`, with
 *   `['42']`, its decimal string, as `pg` would send it;
 * - two numbers, `[1, 42]`: `SELECT pg_advisory_xact_lock($1, $2)`, with
 *   `[1, 42]`, a key space of its own: `BigInt(42)` and `[0, 42]` are two locks.
 *
 * Postgres checks the range: 22003 outside `bigint` or `integer`, 22P02 for a
 * fraction or `NaN`. It runs, rather than returning a fragment, so that its type
 * can ask for the client of a transaction, which a fragment's `run()` can't; in
 * a query of yours, write `pg_advisory_xact_lock(${db.param(…)})` in `sql`.
 *
 * It rejects before any query when given a key that is neither a `bigint` nor
 * an array of two numbers (Postgres takes no lock on a `NULL`), a `pg.Pool`, or
 * a client that `pg` reports outside a transaction block, where Postgres would
 * release the lock as soon as it is taken. That status is the last one `pg`
 * received: a query not yet answered, such as a `BEGIN` you did not await, is
 * not counted, and a client whose `COMMIT` of your own `BEGIN` just failed can
 * still read as inside a block. One that reports no status (another driver,
 * `pg` before 8.21) runs.
 * @param txnClient The client of a transaction: a `transaction()` callback's,
 * of any driver, or a `pg.PoolClient` you sent `BEGIN` on
 * @param key A `bigint`, or a pair of 32-bit integers
 */
export async function advisoryXactLock(
  txnClient: TxnClient<IsolationLevel> | TxnClientLike<PoolClientLike, IsolationLevel>,
  key: bigint | readonly [number, number]
): Promise<void> {

  // the caller's key read once: its length, then each item
  const
    pair = typeof key !== 'bigint' && Array.isArray(key) && key.length === 2 ? [key[0], key[1]] : undefined,
    query =
      typeof key === 'bigint' ? sql`SELECT pg_advisory_xact_lock(${param(String(key))})` :
        pair && typeof pair[0] === 'number' && typeof pair[1] === 'number' ? sql`SELECT pg_advisory_xact_lock(${param(pair[0])}, ${param(pair[1])})` :
          undefined;

  if (!query) throw new Error('advisoryXactLock() was given a key that is neither a bigint nor an array of two numbers, so Postgres would take no lock: give a bigint, BigInt(42), or a pair of integers, [1, 42]');
  if (txnClient instanceof pg.Pool) throw new Error('advisoryXactLock() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours');
  if (transactionStatus(txnClient as pg.ClientBase) === 'I') throw new Error('advisoryXactLock() was given a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or after a BEGIN of yours');

  await query.run(txnClient);
}

/* === setLocal === */

/**
 * Set each of `settings` for the rest of the transaction `txnClient` is in, as
 * `SET LOCAL` does, and resolve to `undefined`. A row-level security policy
 * then reads them with `current_setting()`. One query, each name and value a
 * parameter, in the object's order:
 *
 * - `{ 'app.customer': 'Ada Quill' }`: `SELECT set_config($1, $2, true)`, with
 *   `['app.customer', 'Ada Quill']`;
 * - two settings: `SELECT set_config($1, $2, true), set_config($3, $4, true)`;
 * - `{}`: no query.
 *
 * Postgres keeps a setting until `COMMIT` or `ROLLBACK`, so an attempt that
 * `transaction()` retries never sees the last one's. It keeps it through a
 * `RELEASE` too; a `ROLLBACK TO` a savepoint taken before the setting gives back
 * the value from before that savepoint. After the transaction, `current_setting(name, true)` reads
 * `''` on that connection for a name of your own with no session value, not
 * `NULL`: a policy that casts it writes
 * `NULLIF(current_setting('app.tenant', true), '')::int`. Postgres checks each
 * name: a custom one needs a dot (42704 without one, 42602 if it is not an
 * identifier), and built-ins such as `role` are taken. In a query of yours,
 * write `set_config(${db.param(name)}, ${db.param(value)}, true)` in `sql`.
 *
 * It rejects before any query when given settings that are not a plain object,
 * a value that is not a string (a `null` would reset the setting, as `RESET`
 * does, even over a value set before), two names that differ only in case from `A`
 * to `Z`, which Postgres folds into one setting, a `pg.Pool`, or a client that
 * `pg` reports outside a transaction block, where Postgres would undo the
 * settings as soon as they are set. One that reports no status (another
 * driver, `pg` before 8.21) runs.
 * @param txnClient The client of a transaction: a `transaction()` callback's,
 * of any driver, or a `pg.PoolClient` you sent `BEGIN` on
 * @param settings Each setting's name and its value, a string
 */
export async function setLocal(
  txnClient: TxnClient<IsolationLevel> | TxnClientLike<PoolClientLike, IsolationLevel>,
  settings: { readonly [name: string]: string }
): Promise<void> {

  // a Map, a Date or a class instance has no own entries that are its settings, so it would set nothing, or not those
  const proto = typeof settings === 'object' && settings !== null ? Object.getPrototypeOf(settings) : undefined;
  if (proto !== Object.prototype && proto !== null) throw new Error("setLocal() was given settings that are not a plain object, whose own properties Postgres would not read as names and values: give an object of strings, { 'app.customer': 'Ada Quill' }");

  // the caller's settings read once, their own enumerable string keys only, never one inherited from a polluted
  // Object.prototype; Postgres folds A to Z only in a setting's name (guc_name_compare), and which of
  // two such names one select list leaves set rests on an evaluation order it does not document
  const entries = Object.entries(settings), folded = new Map<string, string>();
  for (const [name, value] of entries) {
    if (typeof value !== 'string') throw new Error(`setLocal() was given a value for ${name} that is not a string, which Postgres would take as a RESET for a null, or as a driver's text of its own: give a string`);
    const key = name.replace(/[A-Z]+/g, upper => upper.toLowerCase()), first = folded.get(key);
    if (first !== undefined) throw new Error(`setLocal() was given ${first} and ${name}, which Postgres takes for one setting, as it folds A to Z to lower case: give one of them`);
    folded.set(key, name);
  }
  if (txnClient instanceof pg.Pool) throw new Error('setLocal() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours');
  if (transactionStatus(txnClient as pg.ClientBase) === 'I') throw new Error('setLocal() was given a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or after a BEGIN of yours');

  if (entries.length === 0) return;
  await sql`SELECT ${mapWithSeparator(entries, sql`, `, ([name, value]) => sql`set_config(${param(name)}, ${param(value)}, true)`)}`.run(txnClient);
}

/* === cursor === */

const cursorNumbers = new WeakMap<object, Set<number>>();  // the numbers of the cursor() calls running on each client

const iteratedAfter = 'cursor() was iterated after its transaction ended, so its next query would run on a client that may be in another transaction, or in none: iterate it inside the transaction() callback that called cursor()';

/**
 * Read the rows of `query` through a server-side cursor, `batchSize` at a
 * time, and yield each transformed batch. Nothing
 * is sent before the first `next()`; then, `<n>` the lowest number no other
 * `cursor()` still running on this client holds:
 *
 * `DECLARE pgcast_cursor_<n> NO SCROLL CURSOR FOR <query>`, with the
 * fragment's text and values as a `sql` template nests it, then
 * `FETCH FORWARD <batchSize> FROM pgcast_cursor_<n>` until a `FETCH` returns
 * no row, then `CLOSE pgcast_cursor_<n>`.
 *
 * - `query.runResultTransform` receives each non-empty `FETCH` result, including
 *   its command tag. A `select()` reads its one `jsonb_agg` row in one batch.
 * - A plain select reads the snapshot visible at `DECLARE`. Under `READ COMMITTED`,
 *   [a locking select](https://pgcast.dev/cursors#work-inside-the-loop) with
 *   `FOR UPDATE` can fetch a newer version of a row. A transaction retry
 *   restarts the scan on a fresh snapshot.
 * - A `break`, a `return` or a throw in the loop sends `CLOSE`. If the query's
 *   `runResultTransform` throws, or a result listener throws after a successful
 *   `DECLARE` or `FETCH`, the generator sends `CLOSE` and rethrows the original
 *   error unless `CLOSE` fails with an error other than 25P02.
 *   A query listener that throws before a `FETCH` or `CLOSE` reaches the driver
 *   can leave the cursor open until the transaction ends. Reusing the leaked cursor's
 *   name in the same transaction fails with 42P03.
 *   If the driver rejects `DECLARE` or `FETCH`, or `pg` reports an aborted
 *   transaction (the status it last received), the generator skips `CLOSE`.
 *   The error goes out unchanged. If a 40001 or 40P01 reaches the outer
 *   `transaction()` with an attempt left, it retries.
 *   A `CLOSE` sent after a query of the loop failed, before `pg` received the
 *   status, or on a driver that reports none, gets 25P02, which is dropped:
 *   no 25P02 of `CLOSE`'s replaces the loop's error. A client that `pg`
 *   reports outside a transaction block, after a `COMMIT` of yours, sends no
 *   `CLOSE` either: its cursor went with the transaction. A `COMMIT` of yours
 *   that fails can still read as inside a block: `CLOSE` then gets 34000,
 *   dropped when `pg` reports the client outside a block. Elsewhere, and on a
 *   driver that reports no status, a 34000 of `CLOSE`'s rejects.
 *   A generator left unfinished leaves its cursor to `COMMIT` or `ROLLBACK`,
 *   and its number taken on this client.
 * - The `DECLARE` runs unnamed even with nested prepared fragments. Its text changes with
 *   `<n>`, and `pg` refuses a second text under one name.
 * - A cursor whose own `FETCH` fails inside a `savepoint()` it was declared
 *   before stays open after the `ROLLBACK TO`: the next `cursor()` on this
 *   client then gets 42P03. Don't name a cursor of yours `pgcast_cursor_<n>`.
 * - Postgres refuses a `DECLARE` outside a transaction block (25P01), and a
 *   query that is not a `SELECT`, `VALUES`, `TABLE` or `WITH … SELECT`, such
 *   as an `insert()` (42601).
 *
 * `next()` rejects before any query when given a query that is not a
 * `SQLFragment`, a `batchSize` that is not an integer from 1 to 2147483647, or
 * when the `transaction()` it was called in has ended. It is the same
 * transaction through every attempt: a generator that read a batch in one
 * attempt and goes on in the next gets 34000, as its cursor went with the
 * `ROLLBACK`; one first read in the next attempt sends its `DECLARE` then.
 * @param txnClient The client of a transaction: a `transaction()` callback's,
 * of any driver, or a `pg.PoolClient` you sent `BEGIN` on
 * @param query A query fragment whose result type extends `readonly unknown[]`,
 * including a `selectExactlyOne()` that passes through an array-valued lateral
 * @param options `batchSize`: the rows each `FETCH` reads
 */
export function cursor<RunResult extends readonly unknown[]>(
  txnClient: TxnClient<IsolationLevel> | TxnClientLike<PoolClientLike, IsolationLevel>,
  query: SQLFragment<RunResult, any>,
  options: { readonly batchSize: number }
): AsyncGenerator<RunResult, void, undefined> {
  // the transaction it is called in, which transaction() marks; read with ?., so that nothing throws before next()
  const mark: unknown = (txnClient as { _zapatos?: unknown } | undefined)?._zapatos;
  return cursorBatches(txnClient, query, options, mark);
}

async function* cursorBatches<RunResult>(
  txnClient: TxnClient<IsolationLevel> | TxnClientLike<PoolClientLike, IsolationLevel>,
  query: SQLFragment<RunResult, any>,
  options: { readonly batchSize: number },
  mark: unknown
): AsyncGenerator<RunResult, void, undefined> {

  // read once; Postgres takes no parameter for a FETCH count (42601), so it is written in, after this check
  const batchSize: unknown = (options as typeof options | undefined)?.batchSize;
  if (!(query instanceof SQLFragment)) throw new Error('cursor() was given a query that is not a SQLFragment, such as a string or a { text, values } object: give a db.sql fragment or a select()');
  if (typeof batchSize !== 'number' || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2147483647) throw new Error('cursor() was given a batchSize that is not an integer from 1 to 2147483647, the rows each FETCH reads: give a number of rows, { batchSize: 100 }');

  // a client given back to the pool has lost the mark, or carries another transaction's; one with none at the call is not checked
  const ended = () => mark !== undefined && (txnClient as { _zapatos?: unknown })._zapatos !== mark;
  if (ended()) throw new Error(iteratedAfter);

  const inner = query.copy();  // before a number is taken, which a copy() that throws would leave taken

  // the lowest free number, not a depth: two loops at once, then a third, each get a name no running one holds
  const held = cursorNumbers.get(txnClient) ?? new Set<number>();
  let n = 1;
  while (held.has(n)) n++;
  held.add(n);
  cursorNumbers.set(txnClient, held);

  let response: pg.QueryResult | undefined;
  const
    name = raw(`pgcast_cursor_${n}`),
    declaration = sql`DECLARE ${name} NO SCROLL CURSOR FOR ${inner}`,
    fetch = sql`FETCH FORWARD ${raw(String(batchSize))} FROM ${name}`;

  // Remember the driver's response before the result listener runs. The listener still receives the command's rows.
  declaration.runResultTransform = fetch.runResultTransform = qr => { response = qr; return qr.rows; };

  try {
    const compileDeclaration = declaration.compile;
    declaration.compile = () => {
      const compiled = compileDeclaration();
      delete compiled.name;  // a nested prepared fragment can name the whole DECLARE
      return compiled;
    };
    await declaration.run(txnClient);
    for (;;) {
      if (ended()) throw new Error(iteratedAfter);
      response = undefined;  // skip CLOSE unless the driver returns a FETCH result
      await fetch.run(txnClient);
      const fetched = response!;
      if (fetched.rows.length === 0) return;
      yield query.runResultTransform(fetched) as RunResult;
    }

  } finally {
    try {
      const status = transactionStatus(txnClient as pg.ClientBase);  // I after a COMMIT of yours, whose cursors went with it (34000)
      // pg reads the status E at the ReadyForQuery after an ErrorResponse, often a chunk later, so a CLOSE can still go
      // out after a query of the loop failed: Postgres's 25P02 for it is dropped, or it would replace that query's error
      if (response && !ended() && status !== 'E' && status !== 'I') {
        await sql`CLOSE ${name}`.run(txnClient).catch((err: unknown) => {
          if (isDatabaseError(err, 'InvalidTransactionState_InFailedSqlTransaction')) return;
          // a COMMIT of yours that failed is rejected while the status still reads T; pg sends CLOSE after its
          // ReadyForQuery, so I here means the cursor went with that transaction. Inside a block, the 34000 aborts it
          if (isDatabaseError(err, 'InvalidCursorName_InvalidCursorName') && transactionStatus(txnClient as pg.ClientBase) === 'I') return;
          throw err;
        });
      }
    } finally {
      held.delete(n);
      if (held.size === 0) cursorNumbers.delete(txnClient);
    }
  }
}

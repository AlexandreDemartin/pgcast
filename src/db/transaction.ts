/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';
import { isDatabaseError } from './pgErrors';
import { wait, warnOnce } from './utils';
import { sql, raw } from './core';
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
  [IsolationLevel.SerializableRO]: IsolationSatisfying<IsolationLevel.Serializable> | IsolationLevel.SerializableRO;
  [IsolationLevel.RepeatableReadRO]: IsolationSatisfying<IsolationLevel.SerializableRO> | IsolationSatisfying<IsolationLevel.RepeatableRead> | IsolationLevel.RepeatableReadRO;
  [IsolationLevel.ReadCommittedRO]: IsolationSatisfying<IsolationLevel.RepeatableReadRO> | IsolationSatisfying<IsolationLevel.ReadCommitted> | IsolationLevel.ReadCommittedRO;
  [IsolationLevel.SerializableRODeferrable]: IsolationSatisfying<IsolationLevel.SerializableRO> | IsolationLevel.SerializableRODeferrable;
}[T];

// For each level, the levels of a transaction whose client a call at that level may join, as Postgres runs them: each
// gives every guarantee the level asks for. IsolationSatisfying, plus SerializableRODeferrable in the rows of the three
// other read-only levels, which the type leaves it out of, as in Zapatos 6.6.1 (see https://github.com/AlexandreDemartin/pgcast/issues/489).
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

// the client a callback gets: C stays unknown for a pg queryable, which gives the TxnClient… of Zapatos 6.6.1, Pg, as
// do Parameters and infer, which read C as unknown, and so does a pg.PoolClient, from a pg.Pool subclass whose connect()
// is its own; a PoolLike's client otherwise, inferred from its connect()
type TxnClientOf<C, Pg, T extends IsolationLevel> = unknown extends C ? Pg : [C] extends [pg.PoolClient] ? Pg : TxnClientLike<C, T>;

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
 * When the callback catches a query's error and returns, Postgres answers
 * `COMMIT` with `ROLLBACK` and nothing is saved: with the
 * `transactionRequiresCommit` config option, this rejects; without it, it
 * resolves and emits a `DeprecationWarning` (`PGCAST_DEP003`), once.
 *
 * Given a client already inside a transaction block (a `BEGIN` of yours), its
 * `COMMIT` or `ROLLBACK` would end yours: with the
 * `transactionRequiresIdleClient` config option, this rejects before its
 * `START TRANSACTION`; without it, it runs and emits `PGCAST_DEP005`, once.
 *
 * Given the client of a transaction at a level that doesn't satisfy this one
 * (`IsolationSatisfying`, plus `SerializableRODeferrable` for the three other
 * read-only levels, which the type leaves out, as in Zapatos 6.6.1, #489), the callback would run at that level: with the
 * `transactionRequiresSatisfyingLevel` config option, this rejects before
 * calling it; without it, it runs and emits `PGCAST_DEP007`, once.
 *
 * Given a `PoolLike` of another driver, the callback gets its client, a
 * `TxnClientLike`, released once the transaction ends. Passed to a nested
 * call, that client is passed through at run time, but the type takes only
 * `pg`'s: cast it (`as unknown as db.TxnClientForSerializable`), then run
 * only fragments on it, as the `pg` members the cast gives it are not its own,
 * and never give the nested call the pool, whose second client is another
 * transaction.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client (`pg.Client`, `pg.native.Client` or a `pg.PoolClient`, used
 * as is and not released), an existing transaction client to be passed
 * through, or the `PoolLike` of another driver, whose client the callback gets
 * @param isolationLevel The desired isolation level (e.g.
 * `IsolationLevel.Serializable`)
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function transaction<T, M extends IsolationLevel, C = unknown>(
  txnClientOrQueryable: Queryable | TxnClient<IsolationSatisfying<M>> | PoolLike<C>,
  isolationLevel: M,
  callback: (client: TxnClientOf<NoInfer<C>, TxnClient<IsolationSatisfying<M>>, IsolationSatisfying<M>>) => Promise<T>
): Promise<T> {

  if (Object.prototype.hasOwnProperty.call(txnClientOrQueryable, '_zapatos')) {
    // if txnClientOrQueryable is a TxnClient, just pass it through: its callback runs at the outer transaction's level, as
    // Postgres can't change the isolation level once the transaction's first query has run (see https://github.com/AlexandreDemartin/pgcast/issues/177)
    const outer = (txnClientOrQueryable as TxnClient<IsolationLevel>)._zapatos?.isolationLevel;
    if (outer !== undefined && satisfying.has(outer) && satisfying.get(isolationLevel)?.includes(outer) === false) {
      if (getConfig().transactionRequiresSatisfyingLevel ?? false) throw new Error(`transaction() at ${isolationLevel} was given the client of a transaction at ${outer}, so its callback would run at ${outer}: open the outer transaction at a level that satisfies ${isolationLevel} (IsolationSatisfying)`);
      warnOnce('PGCAST_DEP007', `transaction() at ${isolationLevel} was given the client of a transaction at ${outer}, so its callback runs at ${outer}. Set transactionRequiresSatisfyingLevel: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.`);
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
      if (getConfig().transactionRequiresIdleClient ?? false) {
        // pg reads the status at each ReadyForQuery, so it can lag behind a query that just rejected (a failed
        // COMMIT): an empty query, which Postgres does not count as a query of the block, reads it again
        await sql``.run(txnClient);  // meanwhile, a call at the same moment sees the mark, and is passed through
        if (inBlock(txnClient)) throw new Error('transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()');
      } else {
        warnOnce('PGCAST_DEP005', 'transaction() was given a client inside a transaction block, and its COMMIT or ROLLBACK will end that transaction. Set transactionRequiresIdleClient: true (db.setConfig) to reject instead, before its START TRANSACTION; it will be the default in pgcast 7.0.');
      }
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
        if (config.transactionRequiresCommit ?? false) throw new Error('the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on');
        warnOnce('PGCAST_DEP003', 'transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.');
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
export async function serializable<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForSerializable | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForSerializable, IsolationSatisfying<IsolationLevel.Serializable>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.Serializable, callback);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableRead`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableRead<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForRepeatableRead | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForRepeatableRead, IsolationSatisfying<IsolationLevel.RepeatableRead>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.RepeatableRead, callback);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommitted`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided 
 * to it
 */
export async function readCommitted<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForReadCommitted | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForReadCommitted, IsolationSatisfying<IsolationLevel.ReadCommitted>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.ReadCommitted, callback);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRO<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForSerializableRO | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForSerializableRO, IsolationSatisfying<IsolationLevel.SerializableRO>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.SerializableRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableReadRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableReadRO<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForRepeatableReadRO | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForRepeatableReadRO, IsolationSatisfying<IsolationLevel.RepeatableReadRO>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.RepeatableReadRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommittedRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function readCommittedRO<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForReadCommittedRO | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForReadCommittedRO, IsolationSatisfying<IsolationLevel.ReadCommittedRO>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.ReadCommittedRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRODeferrable`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, an existing transaction client to be passed through, or the
 * `PoolLike` of another driver
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRODeferrable<T, C = unknown>(txnClientOrQueryable: Queryable | TxnClientForSerializableRODeferrable | PoolLike<C>, callback: (client: TxnClientOf<NoInfer<C>, TxnClientForSerializableRODeferrable, IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.SerializableRODeferrable, callback);
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
 * - On 40001 or 40P01, it rejects at once, with no `ROLLBACK TO`: the
 *   transaction stays aborted, and `transaction()` retries the whole of its
 *   callback, this savepoint included. A savepoint never retries on its own.
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

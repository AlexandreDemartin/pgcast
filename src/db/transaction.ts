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


function typeofQueryable(queryable: Queryable) {
  if (queryable instanceof pg.Pool) return 'pool';
  if (queryable instanceof pg.Client) return 'client';

  // only pg 7 makes `native` enumerable, so this runs with pg 7 and pg-native;
  // from pg 8.0, a native client skips it and is told apart by `_connected`, below
  if (
    Object.prototype.hasOwnProperty.call(pg, 'native') &&
    Object.prototype.propertyIsEnumerable.call(pg, 'native') &&
    pg.native
  ) {
    if (queryable instanceof pg.native.Pool) return 'pool';
    if (queryable instanceof pg.native.Client) return 'client';
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
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client (`pg.Client`, `pg.native.Client` or a `pg.PoolClient`, used
 * as is and not released), or an existing transaction client to be passed
 * through
 * @param isolationLevel The desired isolation level (e.g.
 * `IsolationLevel.Serializable`)
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function transaction<T, M extends IsolationLevel>(
  txnClientOrQueryable: Queryable | TxnClient<IsolationSatisfying<M>>,
  isolationLevel: M,
  callback: (client: TxnClient<IsolationSatisfying<M>>) => Promise<T>
): Promise<T> {

  if (Object.prototype.hasOwnProperty.call(txnClientOrQueryable, '_zapatos')) {
    // if txnClientOrQueryable is a TxnClient, just pass it through
    return callback(txnClientOrQueryable as TxnClient<IsolationSatisfying<M>>);
  }

  if (!Object.values(IsolationLevel).includes(isolationLevel)) throw new Error(`Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '${isolationLevel}'`);

  if (txnSeq >= Number.MAX_SAFE_INTEGER - 1) txnSeq = 0;  // wrap around

  const
    txnId = txnSeq++,
    clientIsOurs = typeofQueryable(txnClientOrQueryable) === 'pool',
    txnClient = (clientIsOurs ? await txnClientOrQueryable.connect() : txnClientOrQueryable) as TxnClient<M>;

  try {  // from here, every path releases a client checked out from the pool
    txnClient._zapatos = { isolationLevel, txnId };

    // a client of the caller's, inside a block of its own (BEGIN): our COMMIT or ROLLBACK would end that
    // transaction (see https://github.com/AlexandreDemartin/pgcast/issues/233)
    if (!clientIsOurs && inBlock(txnClient)) {
      if (getConfig().transactionRequiresIdleClient ?? false) {
        // pg reads the status at each ReadyForQuery, so it can lag behind a query that just rejected (a failed
        // COMMIT): an empty query, which Postgres does not count as a query of the block, reads it again
        await sql``.run(txnClient);  // meanwhile, a call at the same moment sees the mark, and is passed through
        if (inBlock(txnClient)) throw new Error('transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, pass the pool, or run the queries on that client without transaction()');
      } else {
        warnOnce('PGCAST_DEP005', 'transaction() was given a client inside a transaction block, and its COMMIT or ROLLBACK will end that transaction. Set transactionRequiresIdleClient: true (db.setConfig) to reject instead, before its START TRANSACTION; it will be the default in pgcast 7.0.');
      }
    }

    const
      config = getConfig(),
      { transactionListener } = config,
      // the attempts the loop below makes, so that its messages count them: one for 0, a negative or NaN, three
      // for 2.5 (see https://github.com/AlexandreDemartin/pgcast/issues/179); Number() keeps '3' and 3n working
      maxAttempts = attemptsMade(config.transactionAttemptsMax),
      { minMs, maxMs } = config.transactionRetryDelay;

    for (let attempt = 1; ; attempt++) {
      let result: T, commandTag: string | undefined;
      try {
        if (attempt > 1 && transactionListener) transactionListener(`Retrying transaction, attempt ${attempt} of ${maxAttempts}`, txnId);

        await sql`START TRANSACTION ISOLATION LEVEL ${raw(isolationLevel)}`.run(txnClient);
        result = await callback(txnClient as TxnClient<IsolationSatisfying<M>>);

        const commit = sql`COMMIT`;
        commit.runResultTransform = qr => { commandTag = qr.command; return qr.rows; };  // listeners get the rows, as before
        await commit.run(txnClient);

      } catch (err: any) {
        await sql`ROLLBACK`.run(txnClient);

        // on trapping the following two rollback error codes, see:
        // https://www.postgresql.org/message-id/1368066680.60649.YahooMailNeo@web162902.mail.bf1.yahoo.com
        // this is also a good read:
        // https://www.enterprisedb.com/blog/serializable-postgresql-11-and-beyond

        // a thrown null or undefined is rethrown as it is: isDatabaseError() would throw on it (#179)
        if (err != null && isDatabaseError(err, "TransactionRollback_SerializationFailure", "TransactionRollback_DeadlockDetected")) {
          if (attempt < maxAttempts) {
            const delayBeforeRetry = Math.round(minMs + (maxMs - minMs) * Math.random());
            if (transactionListener) transactionListener(`Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms`, txnId);
            await wait(delayBeforeRetry);
            continue;

          } else {
            if (transactionListener) transactionListener(`Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up`, txnId);
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
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializable<T>(txnClientOrQueryable: Queryable | TxnClientForSerializable, callback: (client: TxnClientForSerializable) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.Serializable, callback);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableRead`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableRead<T>(txnClientOrQueryable: Queryable | TxnClientForRepeatableRead, callback: (client: TxnClientForRepeatableRead) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.RepeatableRead, callback);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommitted`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided 
 * to it
 */
export async function readCommitted<T>(txnClientOrQueryable: Queryable | TxnClientForReadCommitted, callback: (client: TxnClientForReadCommitted) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.ReadCommitted, callback);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRO<T>(txnClientOrQueryable: Queryable | TxnClientForSerializableRO, callback: (client: TxnClientForSerializableRO) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.SerializableRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `RepeatableReadRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function repeatableReadRO<T>(txnClientOrQueryable: Queryable | TxnClientForRepeatableReadRO, callback: (client: TxnClientForRepeatableReadRO) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.RepeatableReadRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `ReadCommittedRO`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function readCommittedRO<T>(txnClientOrQueryable: Queryable | TxnClientForReadCommittedRO, callback: (client: TxnClientForReadCommittedRO) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.ReadCommittedRO, callback);
}
/**
 * Shortcut for `transaction` with isolation level `SerializableRODeferrable`.
 * @param txnClientOrQueryable The `pg.Pool` from which to check out a client,
 * a plain client, or an existing transaction client to be passed through
 * @param callback A callback function that runs queries on the client provided
 * to it
 */
export async function serializableRODeferrable<T>(txnClientOrQueryable: Queryable | TxnClientForSerializableRODeferrable, callback: (client: TxnClientForSerializableRODeferrable) => Promise<T>) {
  return transaction(txnClientOrQueryable, IsolationLevel.SerializableRODeferrable, callback);
}

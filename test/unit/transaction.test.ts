// Copyright (C) 2026 Alexandre Demartin
//
// How transaction() (src/db/transaction.ts) classes a pg.native client or pool
// (R26). pg-native is not installed: pg.native is stubbed by vi.mock, for this
// file only. Under Vitest, src imports pg's ESM entry, which has no `native`;
// the stub adds it, own and enumerable, as pg 7 has it. Then a pool of another
// driver (#696), which run time takes for a pool. No database.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { IsolationLevel } from '../../src/db';

const native = vi.hoisted(() => {
  /** A connected pg.native.Client: it records the SQL it is sent, and has no release(). */
  class Client {
    _connected = true;
    sent: string[] = [];
    async query(q: string | { text: string }) {
      const text = typeof q === 'string' ? q : q.text;
      this.sent.push(text);
      return { rows: [], command: text.split(' ')[0], rowCount: 0 };
    }
    async connect() {
      this.sent.push('connect()');
      throw new Error('Client has already been connected. You cannot reuse a client.');
    }
  }
  /** A pg.native.Pool: connect() checks out a client, which can be released. */
  class Pool {
    sent: string[] = [];
    async connect() {
      this.sent.push('connect()');
      const client = Object.assign(new Client(), { release: () => { this.sent.push('release()'); } });
      client.sent = this.sent;  // one log for the pool and its client
      return client;
    }
  }
  return { Client, Pool };
});

vi.mock('pg', async importOriginal => ({ ...await importOriginal<typeof import('pg')>(), native }));

const queryable = (q: object) => q as unknown as db.Queryable;

describe('transaction() on a pg.native client', () => {
  it('runs on the client itself, without connect() nor release()', async () => {
    const client = new native.Client();
    let given: unknown;
    const result = await db.transaction(queryable(client), IsolationLevel.Serializable, async c => { given = c; return 'done'; });
    expect(result).toBe('done');
    expect(given).toBe(client);
    expect(client.sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
  });

  it('rolls back on the client itself, and rejects with the error of the callback', async () => {
    const client = new native.Client();
    await expect(db.transaction(queryable(client), IsolationLevel.ReadCommitted, async () => { throw new Error('boom'); }))
      .rejects.toThrow('boom');
    expect(client.sent).toEqual(['START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'ROLLBACK']);
  });
});

describe('transaction() on a pg.native pool', () => {
  it('checks out a client, runs on it, then releases it', async () => {
    const pool = new native.Pool();
    expect(await db.transaction(queryable(pool), IsolationLevel.Serializable, async () => 'done')).toBe('done');
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT', 'release()']);
  });
});

// #233: the status comes from getTransactionStatus(), from pg 8.21; on pg-native < 3.8 the native client's throws
describe('transaction() on a client that cannot tell its transaction status', () => {
  afterEach(() => { db.setConfig({ transactionRequiresIdleClient: false }); });

  const inBlock = (status: string) => Object.assign(new native.Client(), { getTransactionStatus: () => status });

  it.each([
    ['without getTransactionStatus() (pg < 8.21)', () => new native.Client()],
    ['whose getTransactionStatus() throws (pg-native < 3.8)', () => Object.assign(new native.Client(), {
      getTransactionStatus: () => { throw new TypeError('this.native.getTransactionStatus is not a function'); },
    })],
  ])('%s, runs as in Zapatos 6.6.1, even with transactionRequiresIdleClient', async (_, make) => {
    db.setConfig({ transactionRequiresIdleClient: true });
    const client = make();
    expect(await db.transaction(queryable(client), IsolationLevel.Serializable, async () => 'done')).toBe('done');
    expect(client.sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
  });

  it.each(['T', 'E'])('in a block (%s), with transactionRequiresIdleClient, sends only the empty query, then rejects', async status => {
    db.setConfig({ transactionRequiresIdleClient: true });
    const client = inBlock(status);
    await expect(db.transaction(queryable(client), IsolationLevel.Serializable, async () => 'done'))
      .rejects.toThrow(/^transaction\(\) was given a client inside a transaction block/);
    expect(client.sent).toEqual(['']);
  });

  it.each(['I', null])('outside a block (%s), sends no empty query', async status => {
    db.setConfig({ transactionRequiresIdleClient: true });
    const client = Object.assign(new native.Client(), { getTransactionStatus: () => status });
    expect(await db.transaction(queryable(client), IsolationLevel.Serializable, async () => 'done')).toBe('done');
    expect(client.sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
  });
});

// #696: a pool of another driver, no pg class and no `_connected`, typed with no cast (db.PoolLike)
describe('transaction() on a pool that is not pg’s', () => {
  afterEach(() => {
    db.setConfig({ transactionRetryDelay: { minMs: 25, maxMs: 250 }, transactionAttemptsMax: 5, transactionRequiresCommit: false });
    vi.restoreAllMocks();
  });

  /** A pool whose client logs what it is sent, and rejects a query when `fail` returns an error. */
  const otherPool = (fail: (text: string) => unknown = () => undefined, commitTag = 'COMMIT') => {
    const sent: string[] = [];
    const client = {
      query: async (q: { text: string; values?: unknown[] }) => {
        sent.push(q.text);
        const error = fail(q.text);
        if (error) throw error;
        return { rows: [], command: q.text === 'COMMIT' ? commitTag : q.text.split(' ')[0] };
      },
      release: () => { sent.push('release()'); },
    };
    return { sent, client, connect: async () => { sent.push('connect()'); return client; } };
  };
  const serializationFailure = () => Object.assign(new Error('could not serialize access'), { code: '40001' });

  it('checks out a client, marks it while the callback runs, commits, then releases it', async () => {
    const pool = otherPool();
    let given: unknown, mark: unknown;
    const result = await db.serializable(pool, async c => { given = c; mark = { ...c._zapatos }; await db.sql`SELECT 1`.run(c); return 'done'; });
    expect(result).toBe('done');
    expect(given).toBe(pool.client);
    expect(mark).toEqual({ isolationLevel: IsolationLevel.Serializable, txnId: expect.any(Number) });
    expect(Object.prototype.hasOwnProperty.call(pool.client, '_zapatos')).toBe(false);
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'COMMIT', 'release()']);
  });

  it('rolls back, releases the client, and rejects with the error of the callback', async () => {
    const pool = otherPool();
    await expect(db.transaction(pool, IsolationLevel.ReadCommitted, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', 'release()']);
  });

  it('retries on 40001 on the same client, then releases it once', async () => {
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    let failures = 1;
    const pool = otherPool(text => text === 'SELECT 1' && failures-- > 0 ? serializationFailure() : undefined);
    expect(await db.serializable(pool, async c => { await db.sql`SELECT 1`.run(c); return 'done'; })).toBe('done');
    expect(pool.sent).toEqual([
      'connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'ROLLBACK',
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'COMMIT', 'release()',
    ]);
  });

  it('gives up on 40001 after the last attempt, rejects with it, and releases the client once', async () => {
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 }, transactionAttemptsMax: 2 });
    const pool = otherPool(text => text === 'SELECT 1' ? serializationFailure() : undefined);
    await expect(db.serializable(pool, c => db.sql`SELECT 1`.run(c))).rejects.toMatchObject({ code: '40001' });
    expect(pool.sent).toEqual([
      'connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'ROLLBACK',
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'ROLLBACK', 'release()',
    ]);
  });

  it('reads the command of its COMMIT: answered ROLLBACK, it warns PGCAST_DEP003, then releases the client', async () => {
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const pool = otherPool(undefined, 'ROLLBACK');
    expect(await db.serializable(pool, async () => 'done')).toBe('done');
    expect(emitWarning).toHaveBeenCalledWith(expect.stringMatching(/answered its COMMIT with ROLLBACK/), { type: 'DeprecationWarning', code: 'PGCAST_DEP003' });
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT', 'release()']);
  });

  it('reads the command of its COMMIT: answered ROLLBACK, with transactionRequiresCommit, it rejects, then releases the client', async () => {
    db.setConfig({ transactionRequiresCommit: true });
    const pool = otherPool(undefined, 'ROLLBACK');
    await expect(db.serializable(pool, async () => 'done')).rejects.toThrow(/^the transaction was rolled back, not committed/);
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'COMMIT', 'release()']);
  });

  // the types refuse another driver's client here (test/types/transaction.test-d.ts): run time passes it through
  it('passes its client through to a nested call, which neither checks out another client nor commits', async () => {
    const pool = otherPool();
    const nested = await db.serializable(pool, c =>
      db.readCommitted(c as unknown as db.TxnClientForReadCommitted, async inner => { await db.sql`SELECT 1`.run(inner); return inner; }));
    expect(nested).toBe(pool.client);
    expect(pool.sent).toEqual(['connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'COMMIT', 'release()']);
  });
});

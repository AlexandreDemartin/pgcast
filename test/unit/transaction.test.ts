// Copyright (C) 2026 Alexandre Demartin
//
// How transaction() (src/db/transaction.ts) classes a pg.native client or pool
// (R26). pg-native is not installed: pg.native is stubbed by vi.mock, for this
// file only. Under Vitest, src imports pg's ESM entry, which has no `native`;
// the stub adds it, own and enumerable, as pg 7 has it. Then a pool of another
// driver (#696), which run time takes for a pool, and the SQL advisoryXactLock()
// sends (#724). No database.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { IsolationLevel } from '../../src/db';
import { resetConfig } from '../helpers/config';

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

// #724: advisoryXactLock() on a client that logs what it is sent: the SQL of each key, and its two refusals, each
// before any query
describe('advisoryXactLock()', () => {
  afterEach(resetConfig);

  type Key = bigint | readonly [number, number];

  /** A transaction's client that logs each query; its getTransactionStatus() gives `status`, and with none it has no such method. */
  const lockClient = (...status: [] | [string | null]) => {
    const sent: db.SQLQuery[] = [];
    const client = {
      query: async (q: db.SQLQuery) => { sent.push({ text: q.text, values: q.values }); return { rows: [{ pg_advisory_xact_lock: '' }], command: 'SELECT' }; },
      release: () => undefined,
      ...(status.length ? { getTransactionStatus: () => status[0] } : {}),
    };
    return { sent, client };
  };

  /** The queries queryListener gets. */
  const listened = () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    return queries;
  };

  const pair = [7, 42] as const, tuple: readonly [number, number] = [8, 42];
  it.each<{ name: string; key: Key; text: string; values: unknown[] }>([
    { name: 'BigInt(42)', key: BigInt(42), text: 'SELECT pg_advisory_xact_lock($1)', values: ['42'] },
    { name: 'the smallest bigint', key: -(BigInt(2) ** BigInt(63)), text: 'SELECT pg_advisory_xact_lock($1)', values: ['-9223372036854775808'] },
    { name: '[1, 42]', key: [1, 42], text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [1, 42] },
    { name: '[0, 42]', key: [0, 42], text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [0, 42] },
    { name: 'a pair as const', key: pair, text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [7, 42] },
    { name: 'a readonly tuple', key: tuple, text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [8, 42] },
  ])('sends one query for $name, and resolves to undefined', async ({ key, text, values }) => {
    const { sent, client } = lockClient('T');
    expect(await db.advisoryXactLock(client, key)).toBeUndefined();
    expect(sent).toEqual([{ text, values }]);
  });

  it('reads each item of the caller’s pair once: a getter that changes is sent as first read', async () => {
    let reads = 0;
    const key = [0, 42];
    Object.defineProperty(key, 0, { get: () => (reads++ === 0 ? 5 : null), enumerable: true });
    const { sent, client } = lockClient('T');
    await db.advisoryXactLock(client, key as unknown as Key);
    expect(reads).toBe(1);
    expect(sent).toEqual([{ text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [5, 42] }]);
  });

  it('gives queryListener values it can JSON.stringify: a bigint is sent as its decimal string', async () => {
    const strings: string[] = [];
    db.setConfig({ queryListener: q => { strings.push(JSON.stringify(q)); } });
    await db.advisoryXactLock(lockClient('T').client, BigInt('9223372036854775807'));
    expect(strings).toEqual(['{"text":"SELECT pg_advisory_xact_lock($1)","values":["9223372036854775807"]}']);
  });

  it.each<[string, unknown]>([
    ['null', null], ['undefined', undefined], ['a number', 42], ['a string', '42'], ['one number', [1]],
    ['three numbers', [1, 2, 3]], ['a null first item', [null, 2]], ['a null second item', [1, null]],
    ['a bigint item', [BigInt(1), 2]], ['a string item', [1, '2']], ['an array-like', { 0: 1, 1: 2, length: 2 }],
  ])('refuses %s as a key, before any query', async (_, key) => {
    const { sent, client } = lockClient('T'), queries = listened();
    await expect(db.advisoryXactLock(client, key as Key)).rejects.toThrow(
      'advisoryXactLock() was given a key that is neither a bigint nor an array of two numbers, so Postgres would take no lock: give a bigint, BigInt(42), or a pair of integers, [1, 42]');
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('refuses a client that reports it is outside a transaction block, before any query', async () => {
    const { sent, client } = lockClient('I'), queries = listened();
    await expect(db.advisoryXactLock(client, BigInt(42))).rejects.toThrow(
      'advisoryXactLock() was given a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or after a BEGIN of yours');
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('checks the key first: a wrong key on an idle client gets the key’s message', async () => {
    await expect(db.advisoryXactLock(lockClient('I').client, null as unknown as Key)).rejects.toThrow(/^advisoryXactLock\(\) was given a key/);
  });

  // pg reports T inside a block, E inside an aborted one (Postgres then refuses the query, 25P02); null, or no method,
  // when it can't say: another driver, pg before 8.21, pg-native before 3.8
  it.each<[string, [] | [string | null]]>([['T', ['T']], ['E', ['E']], ['null', [null]], ['no status', []]])('runs on a client whose status is %s', async (_, status) => {
    const { sent, client } = lockClient(...status);
    await db.advisoryXactLock(client, [1, 42]);
    expect(sent).toEqual([{ text: 'SELECT pg_advisory_xact_lock($1, $2)', values: [1, 42] }]);
  });

  it('runs on the client of another driver’s pool, in its transaction', async () => {
    const sent: string[] = [];
    const client = {
      query: async (q: db.SQLQuery) => { sent.push(q.text); return { rows: [], command: q.text.split(' ')[0] }; },
      release: () => { sent.push('release()'); },
    };
    await db.serializable({ connect: async () => client }, c => db.advisoryXactLock(c, BigInt(42)));
    expect(sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT pg_advisory_xact_lock($1)', 'COMMIT', 'release()']);
  });
});

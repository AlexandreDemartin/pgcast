// Copyright (C) 2026 Alexandre Demartin
//
// How transaction() (src/db/transaction.ts) classes a pg.native client or pool
// (R26). pg-native is not installed: pg.native is stubbed by vi.mock, for this
// file only. Under Vitest, src imports pg's ESM entry, which has no `native`;
// the stub adds it, own and enumerable, as pg 7 has it. Then a pool of another
// driver (#696), which run time takes for a pool, the SQL savepoint() sends
// (#723), the SQL advisoryXactLock() sends (#724), the SQL setLocal() sends (#738),
// and the SQL cursor() sends (#743). No database.

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { IsolationLevel, sql, param } from '../../src/db';
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
    db.setConfig({ transactionEventListener: undefined } as unknown as db.NewConfig);  // exactOptionalPropertyTypes refuses it
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

  it('retries on 40001 with the same events as on a pg pool (#725)', async () => {
    const events: [db.TransactionEvent, number | undefined][] = [];
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 }, transactionEventListener: (event, txnId) => { events.push([event, txnId]); } });
    let failures = 1;
    const pool = otherPool(text => text === 'SELECT 1' && failures-- > 0 ? serializationFailure() : undefined);
    expect(await db.serializable(pool, async c => { await db.sql`SELECT 1`.run(c); return 'done'; })).toBe('done');
    const txnId = events[0]?.[1];
    expect(typeof txnId).toBe('number');
    expect(events).toStrictEqual([
      [{ type: 'rollback', code: '40001', attempt: 1, maxAttempts: 5, delayMs: 0 }, txnId],
      [{ type: 'retry', attempt: 2, maxAttempts: 5 }, txnId],
    ]);
  });

  // isDatabaseError() matches a String object code (#501): the event gives its text, as the message prints it
  it.each([
    ['a String object', () => new String('40001')],
    ['a string', () => '40001'],
  ])('gives a code that is %s as the message prints it, read once for both listeners', async (_, code) => {
    let reads = 0;
    const failure = () => Object.defineProperty(new Error('could not serialize access'), 'code', { get: () => { reads++; return code(); } });
    const logged: unknown[] = [];
    db.setConfig({
      transactionRetryDelay: { minMs: 0, maxMs: 0 }, transactionAttemptsMax: 2,
      transactionListener: message => { logged.push(message); },
      transactionEventListener: event => { logged.push(event); },
    });
    try {
      const pool = otherPool(text => text === 'SELECT 1' ? failure() : undefined);
      await expect(db.serializable(pool, c => db.sql`SELECT 1`.run(c))).rejects.toThrow('could not serialize access');
      expect(logged).toStrictEqual([
        'Transaction rollback (code 40001) on attempt 1 of 2, retrying in 0ms',
        { type: 'rollback', code: '40001', attempt: 1, maxAttempts: 2, delayMs: 0 },
        'Retrying transaction, attempt 2 of 2',
        { type: 'retry', attempt: 2, maxAttempts: 2 },
        'Transaction rollback (code 40001) on attempt 2 of 2, giving up',
        { type: 'giveUp', code: '40001', attempt: 2, maxAttempts: 2 },
      ]);
      expect(logged.filter(e => typeof e === 'object').map(e => typeof (e as { code?: unknown }).code)).toEqual(['string', 'undefined', 'string']);
      expect(reads).toBe(4);  // at each failure, once by isDatabaseError(), once for the listeners: as on master with transactionListener alone
    } finally {
      db.setConfig({ transactionListener: undefined } as unknown as db.NewConfig);
    }
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

  it('runs a savepoint on its client, with no cast: the same SQL, and release() once', async () => {
    const pool = otherPool();
    const result = await db.serializable(pool, c => db.savepoint(c, async sp => { expect(sp).toBe(c); await db.sql`SELECT 1`.run(sp); return 'done'; }));
    expect(result).toBe('done');
    expect(pool.sent).toEqual([
      'connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SAVEPOINT pgcast_savepoint_1', 'SELECT 1', 'RELEASE SAVEPOINT pgcast_savepoint_1',
      'COMMIT', 'release()',
    ]);
  });

  it('retries the whole callback on a 40001 raised in a savepoint, with no ROLLBACK TO, and releases the client once', async () => {
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    let failures = 1;
    const pool = otherPool(text => text === 'SELECT 1' && failures-- > 0 ? serializationFailure() : undefined);
    expect(await db.serializable(pool, c => db.savepoint(c, async sp => { await db.sql`SELECT 1`.run(sp); return 'done'; }))).toBe('done');
    expect(pool.sent).toEqual([
      'connect()', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SAVEPOINT pgcast_savepoint_1', 'SELECT 1', 'ROLLBACK',
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SAVEPOINT pgcast_savepoint_1', 'SELECT 1', 'RELEASE SAVEPOINT pgcast_savepoint_1', 'COMMIT', 'release()',
    ]);
  });
});

describe('savepoint() on a transaction client', () => {
  const dbError = (code: string) => Object.assign(new Error(`simulated ${code}`), { code });

  /** A transaction's client, marked, that logs each query as sent, and rejects one when `fail` returns an error. */
  const txnClient = (fail: (text: string) => unknown = () => undefined) => {
    const sent: { text: string; values: unknown[] }[] = [];
    const mark = { isolationLevel: IsolationLevel.Serializable, txnId: 7 };
    const client = {
      _zapatos: mark,
      query: async (q: { text: string; values: unknown[] }) => {
        sent.push({ text: q.text, values: q.values });
        const error = fail(q.text);
        if (error) throw error;
        return { rows: [], command: q.text.split(' ')[0] };
      },
      release: () => { sent.push({ text: 'release()', values: [] }); },
    };
    return { sent, client, mark };
  };
  /** What was sent, once each query is checked to have no value. */
  const sentAs = (sent: { text: string; values: unknown[] }[]) => {
    expect(sent.map(q => q.values)).toEqual(sent.map(() => []));
    return sent.map(q => q.text);
  };
  /** The SQL of a savepoint at `depth`: 1 directly in the transaction, 2 inside that… */
  const at = (depth: number) => ({
    SP: `SAVEPOINT pgcast_savepoint_${depth}`, RELEASE: `RELEASE SAVEPOINT pgcast_savepoint_${depth}`, ROLLBACK_TO: `ROLLBACK TO SAVEPOINT pgcast_savepoint_${depth}`,
  });
  const { SP, RELEASE, ROLLBACK_TO } = at(1), { SP: SP2, RELEASE: RELEASE2, ROLLBACK_TO: ROLLBACK_TO2 } = at(2);

  it('sends SAVEPOINT, the callback\'s queries, then RELEASE, and resolves to what the callback resolves to', async () => {
    const { sent, client, mark } = txnClient();
    const result = await db.savepoint(client, async sp => {
      expect(sp).toBe(client);
      expect(sp._zapatos).toBe(mark);
      await db.sql`SELECT 1`.run(sp);
      return 'done';
    });
    expect(result).toBe('done');
    expect(client._zapatos).toBe(mark);
    expect(sentAs(sent)).toEqual([SP, 'SELECT 1', RELEASE]);
  });

  it('names each savepoint by its depth, unquoted: pgcast_savepoint_1 in the transaction, _2 inside it, the same text on every call', async () => {
    const { sent, client } = txnClient();
    await db.savepoint(client, async () => undefined);
    await db.savepoint(client, sp => db.savepoint(sp, inner => db.savepoint(inner, async () => undefined)));
    await db.savepoint(client, async () => undefined);
    expect(sentAs(sent)).toEqual([
      SP, RELEASE,
      SP, SP2, at(3).SP, at(3).RELEASE, RELEASE2, RELEASE,
      SP, RELEASE,
    ]);
  });

  /** Ways out of a savepoint, each given the failure a stub client sends, and what it sends on the way. */
  const exits = [
    ['resolves', () => undefined, async () => undefined, ['RELEASE']],
    ['the callback rejects', () => undefined, async () => { throw new Error('boom'); }, ['ROLLBACK_TO', 'RELEASE']],
    ['the callback rejects with 40001, rethrown', () => undefined, async () => { throw dbError('40001'); }, []],
    ['the callback rejects with 40P01, rethrown', () => undefined, async () => { throw dbError('40P01'); }, []],
    ['each RELEASE rejects', (text: string) => text.startsWith('RELEASE ') ? dbError('25P02') : undefined, async () => undefined, ['RELEASE', 'ROLLBACK_TO', 'RELEASE']],
    ['ROLLBACK TO rejects', (text: string) => text.startsWith('ROLLBACK TO ') ? dbError('25P01') : undefined, async () => { throw new Error('boom'); }, ['ROLLBACK_TO']],
    ['the RELEASE after ROLLBACK TO rejects', (text: string) => text.startsWith('RELEASE ') ? dbError('3B001') : undefined, async () => { throw new Error('boom'); }, ['ROLLBACK_TO', 'RELEASE']],
    ['SAVEPOINT rejects', (text: string) => text.startsWith('SAVEPOINT ') ? dbError('25P01') : undefined, async () => undefined, []],
  ] as const;

  it.each(exits)('after a savepoint that exits as %s, the next is at the same depth again', async (_, fail, callback, after) => {
    let failing = true;
    const { sent, client } = txnClient(text => failing ? fail(text) : undefined);
    await db.savepoint(client, callback).catch(() => undefined);
    failing = false;
    await db.savepoint(client, async () => undefined);
    expect(sentAs(sent)).toEqual([SP, ...after.map(q => at(1)[q]), SP, RELEASE]);
  });

  it.each(exits)('inside a savepoint, after one that exits as %s, the next is at depth 2 again, and the outer one is released', async (_, fail, callback, after) => {
    let failing = false;
    const { sent, client } = txnClient(text => failing ? fail(text) : undefined);
    await db.savepoint(client, async outer => {
      failing = true;
      await db.savepoint(outer, callback).catch(() => undefined);
      failing = false;
      await db.savepoint(outer, async () => undefined);
    });
    expect(sentAs(sent)).toEqual([SP, SP2, ...after.map(q => at(2)[q]), SP2, RELEASE2, RELEASE]);
  });

  it('counts the depth per client: a savepoint on another client inside one on the first is at depth 1 on its own', async () => {
    const first = txnClient(), second = txnClient();
    await db.savepoint(first.client, async () => {
      await db.savepoint(second.client, async () => undefined);
      await db.savepoint(first.client, async () => undefined);
    });
    expect(sentAs(first.sent)).toEqual([SP, SP2, RELEASE2, RELEASE]);
    expect(sentAs(second.sent)).toEqual([SP, RELEASE]);
  });

  it('on a plain Error, sends ROLLBACK TO and RELEASE, then rejects with that error', async () => {
    const { sent, client } = txnClient();
    const error = new Error('boom');
    await expect(db.savepoint(client, async () => { throw error; })).rejects.toBe(error);
    expect(sentAs(sent)).toEqual([SP, ROLLBACK_TO, RELEASE]);
  });

  it('on a thrown null, sends ROLLBACK TO and RELEASE, then rejects with it', async () => {
    const { sent, client } = txnClient();
    await expect(db.savepoint(client, async () => { throw null; })).rejects.toBeNull();
    expect(sentAs(sent)).toEqual([SP, ROLLBACK_TO, RELEASE]);
  });

  it.each(['40001', '40P01'])('on %s, rejects with it at once: no ROLLBACK TO, no RELEASE', async code => {
    const error = dbError(code);
    const { sent, client } = txnClient(text => text === 'SELECT 1' ? error : undefined);
    await expect(db.savepoint(client, sp => db.sql`SELECT 1`.run(sp))).rejects.toBe(error);
    expect(sentAs(sent)).toEqual([SP, 'SELECT 1']);
  });

  it.each(['40002', '40003'])('on %s, another code of class 40, sends ROLLBACK TO and RELEASE, then rejects with it', async code => {
    const error = dbError(code);
    const { sent, client } = txnClient(text => text === 'SELECT 1' ? error : undefined);
    await expect(db.savepoint(client, sp => db.sql`SELECT 1`.run(sp))).rejects.toBe(error);
    expect(sentAs(sent)).toEqual([SP, 'SELECT 1', ROLLBACK_TO, RELEASE]);
  });

  it('when ROLLBACK TO rejects, rejects with its error in place of the callback\'s, and sends no RELEASE', async () => {
    const failed = dbError('25P01');
    const { sent, client } = txnClient(text => text.startsWith('ROLLBACK TO ') ? failed : undefined);
    await expect(db.savepoint(client, async () => { throw new Error('boom'); })).rejects.toBe(failed);
    expect(sentAs(sent)).toEqual([SP, ROLLBACK_TO]);
  });

  it('when the RELEASE after ROLLBACK TO rejects, rejects with its error in place of the callback\'s', async () => {
    const failed = dbError('3B001');
    const { sent, client } = txnClient(text => text.startsWith('RELEASE ') ? failed : undefined);
    await expect(db.savepoint(client, async () => { throw new Error('boom'); })).rejects.toBe(failed);
    expect(sentAs(sent)).toEqual([SP, ROLLBACK_TO, RELEASE]);
  });

  it('when RELEASE rejects with 25P02 (a query error the callback caught), sends ROLLBACK TO and RELEASE, then rejects with that 25P02', async () => {
    const aborted = dbError('25P02');
    let releases = 0;
    const { sent, client } = txnClient(text => {
      if (text === 'SELECT 1/0') return dbError('22012');
      if (text.startsWith('RELEASE ') && releases++ === 0) return aborted;
    });
    await expect(db.savepoint(client, async sp => { await db.sql`SELECT 1/0`.run(sp).catch(() => undefined); return 'swallowed'; })).rejects.toBe(aborted);
    expect(sentAs(sent)).toEqual([SP, 'SELECT 1/0', RELEASE, ROLLBACK_TO, RELEASE]);
  });

  it('nested two levels: the name of its depth at each, the inner failure undone by its own ROLLBACK TO', async () => {
    const { sent, client } = txnClient();
    const result = await db.savepoint(client, async outer => {
      await db.savepoint(outer, async () => { throw new Error('inner'); }).catch(() => undefined);
      return db.savepoint(outer, async inner => { expect(inner).toBe(client); return 'done'; });
    });
    expect(result).toBe('done');
    expect(sentAs(sent)).toEqual([SP, SP2, ROLLBACK_TO2, RELEASE2, SP2, RELEASE2, RELEASE]);
  });

  it('nested two levels: a 40001 goes up through both, with no ROLLBACK TO', async () => {
    const error = dbError('40001');
    const { sent, client } = txnClient(text => text === 'SELECT 1' ? error : undefined);
    await expect(db.savepoint(client, outer => db.savepoint(outer, inner => db.sql`SELECT 1`.run(inner)))).rejects.toBe(error);
    expect(sentAs(sent)).toEqual([SP, SP2, 'SELECT 1']);
  });

  it('when SAVEPOINT rejects, rejects with its error, never calls the callback, and sends nothing more', async () => {
    const noBlock = dbError('25P01');
    const { sent, client } = txnClient(text => text.startsWith('SAVEPOINT ') ? noBlock : undefined);
    const callback = vi.fn(async () => 'never');
    await expect(db.savepoint(client, callback)).rejects.toBe(noBlock);
    expect(callback).not.toHaveBeenCalled();
    expect(sentAs(sent)).toEqual([SP]);
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

// #738: setLocal() on a client that logs what it is sent: the SQL of each set of settings, and its five refusals, each
// before any query
describe('setLocal()', () => {
  afterEach(resetConfig);

  type Settings = { readonly [name: string]: string };

  /** A transaction's client that logs each query; its getTransactionStatus() gives `status`, and with none it has no such method. */
  const settingClient = (...status: [] | [string | null]) => {
    const sent: db.SQLQuery[] = [];
    const client = {
      query: async (q: db.SQLQuery) => { sent.push({ text: q.text, values: q.values }); return { rows: [{ set_config: '' }], command: 'SELECT' }; },
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

  const
    notPlain = 'setLocal() was given settings that are not a plain object, whose own properties Postgres would not read as names and values: give an object of strings, { \'app.customer\': \'Ada Quill\' }',
    notString = (name: string) => `setLocal() was given a value for ${name} that is not a string, which Postgres would take as a RESET for a null, or as a driver's text of its own: give a string`,
    casePair = (first: string, second: string) => `setLocal() was given ${first} and ${second}, which Postgres takes for one setting, as it folds A to Z to lower case: give one of them`,
    idle = 'setLocal() was given a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or after a BEGIN of yours';

  const name = 'app.customer', aliased: Settings = { 'app.customer': 'Ada Quill' }, asConst = { 'app.screening': '1002' } as const;
  it.each<{ name: string; settings: Settings; text: string; values: unknown[] }>([
    { name: 'one setting', settings: { 'app.customer': 'Ada Quill' }, text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] },
    {
      name: 'two settings, in the object’s order', settings: { role: 'cinema_customer', 'app.customer': 'Ada Quill' },
      text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)', values: ['role', 'cinema_customer', 'app.customer', 'Ada Quill'],
    },
    {
      name: 'the same two the other way round', settings: { 'app.customer': 'Ada Quill', role: 'cinema_customer' },
      text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)', values: ['app.customer', 'Ada Quill', 'role', 'cinema_customer'],
    },
    { name: 'a computed name', settings: { [name]: 'Ada Quill' }, text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] },
    { name: 'a typed object', settings: aliased, text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] },
    { name: 'an object as const', settings: asConst, text: 'SELECT set_config($1, $2, true)', values: ['app.screening', '1002'] },
    { name: 'an empty value', settings: { 'app.customer': '' }, text: 'SELECT set_config($1, $2, true)', values: ['app.customer', ''] },
    {
      name: 'an object with no prototype', settings: Object.assign(Object.create(null) as Record<string, string>, { 'app.customer': 'Ada Quill' }),
      text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'],
    },
  ])('sends one query for $name, and resolves to undefined', async ({ settings, text, values }) => {
    const { sent, client } = settingClient('T');
    expect(await db.setLocal(client, settings)).toBeUndefined();
    expect(sent).toEqual([{ text, values }]);
  });

  it('sends nothing for {}, and resolves to undefined', async () => {
    const { sent, client } = settingClient('T'), queries = listened();
    expect(await db.setLocal(client, {})).toBeUndefined();
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it.each([
    ['castArrayParamsToJson', { castArrayParamsToJson: true }],
    ['castObjectParamsToJson', { castObjectParamsToJson: true }],
    ['both', { castArrayParamsToJson: true, castObjectParamsToJson: true }],
  ])('sends the same SQL under %s', async (_, config) => {
    db.setConfig(config);
    const { sent, client } = settingClient('T');
    await db.setLocal(client, { role: 'cinema_customer', 'app.customer': 'Ada Quill' });
    expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)', values: ['role', 'cinema_customer', 'app.customer', 'Ada Quill'] }]);
  });

  it('reads each value once: a getter that changes is sent as first read', async () => {
    let reads = 0;
    const settings = Object.defineProperty({}, 'app.customer', { get: () => (reads++ === 0 ? 'Ada Quill' : 42), enumerable: true }) as Settings;
    const { sent, client } = settingClient('T');
    await db.setLocal(client, settings);
    expect(reads).toBe(1);
    expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] }]);
  });

  it('sends only the object’s own keys: one made enumerable on Object.prototype is not sent', async () => {
    const proto = Object.prototype as Record<string, unknown>, { sent, client } = settingClient('T');
    proto.role = 'postgres';
    try {
      await db.setLocal(client, { 'app.customer': 'Ada Quill' });
    } finally {
      delete proto.role;
    }
    expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] }]);
  });

  it('drops a Symbol key and a non-enumerable one: nothing is sent for them, and nothing thrown', async () => {
    const settings = Object.defineProperty({ [Symbol('app.screening')]: '1002', 'app.customer': 'Ada Quill' }, 'role', { value: 'postgres', enumerable: false });
    const { sent, client } = settingClient('T');
    await db.setLocal(client, settings);
    expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] }]);
  });

  class Context { 'app.customer' = 'Ada Quill'; }
  it.each<[string, unknown]>([
    ['null', null], ['undefined', undefined], ['a number', 42], ['a string', 'app.customer'], ['an array', ['app.customer']],
    ['a Map', new Map([['app.customer', 'Ada Quill']])], ['a Date', new Date(0)], ['an instance of a class', new Context()],
    ['a function', () => 'Ada Quill'],
  ])('refuses %s as settings, before any query', async (_, settings) => {
    const { sent, client } = settingClient('T'), queries = listened();
    await expect(db.setLocal(client, settings as Settings)).rejects.toThrow(notPlain);
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['null', null], ['undefined', undefined], ['a number', 42], ['true', true], ['a bigint', BigInt(42)], ['a Date', new Date(0)],
    ['an object', { token: 'secret-claim' }], ['an array', ['secret-claim']], ['a String object', new String('secret-claim')],
  ])('refuses %s as a value, naming the setting and not the value, before any query', async (_, value) => {
    const { sent, client } = settingClient('T'), queries = listened();
    const error = await db.setLocal(client, { role: 'cinema_customer', 'app.customer': value } as unknown as Settings).catch((e: unknown) => e);
    expect(error).toEqual(new Error(notString('app.customer')));
    expect((error as Error).message).not.toContain('secret');
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it.each([
    ['app.customer', 'app.Customer'], ['app.Customer', 'app.customer'], ['APP.CUSTOMER', 'app.customer'], ['Role', 'role'],
    ['app.Z', 'app.z'], ['app.a', 'app.A'],
  ])('refuses %s and %s, which differ only in case, before any query', async (first, second) => {
    const { sent, client } = settingClient('T'), queries = listened();
    await expect(db.setLocal(client, { [first]: 'Ada Quill', 'app.screening': '1002', [second]: 'Bea Holm' })).rejects.toThrow(casePair(first, second));
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  // Postgres folds A to Z only (guc_name_compare), so that each of these pairs is two settings, as probed on 17.3
  it.each([['app.é', 'app.É'], ['app.É', 'app.é'], ['app.k', 'app.K'], ['app.K', 'app.k'], ['app.i', 'app.İ'], ['app.İ', 'app.i']])(
    'sends %s and %s, which Postgres takes for two settings', async (first, second) => {
      const { sent, client } = settingClient('T');
      await db.setLocal(client, { [first]: 'one', [second]: 'two' });
      expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true), set_config($3, $4, true)', values: [first, 'one', second, 'two'] }]);
    });

  it('refuses a client that reports it is outside a transaction block, before any query, even for {}', async () => {
    const { sent, client } = settingClient('I'), queries = listened();
    await expect(db.setLocal(client, aliased)).rejects.toThrow(idle);
    await expect(db.setLocal(client, {})).rejects.toThrow(idle);
    expect(sent).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('checks the settings first: on an idle client, settings that are not plain get their message', async () => {
    await expect(db.setLocal(settingClient('I').client, null as unknown as Settings)).rejects.toThrow(notPlain);
  });

  it('checks each value before the client: on an idle client, a value that is not a string gets its message', async () => {
    await expect(db.setLocal(settingClient('I').client, { 'app.customer': null } as unknown as Settings)).rejects.toThrow(notString('app.customer'));
  });

  it('checks case pairs before the client: on an idle client, a pair gets its message', async () => {
    await expect(db.setLocal(settingClient('I').client, { 'app.x': 'a', 'APP.X': 'b' })).rejects.toThrow(casePair('app.x', 'APP.X'));
  });

  it('checks an entry’s value before its name: a pair whose second value is not a string gets the value’s message', async () => {
    await expect(db.setLocal(settingClient('T').client, { 'app.x': 'a', 'APP.X': 42 } as unknown as Settings)).rejects.toThrow(notString('APP.X'));
  });

  // pg reports T inside a block, E inside an aborted one (Postgres then refuses the query, 25P02); null, or no method,
  // when it can't say: another driver, pg before 8.21, pg-native before 3.8
  it.each<[string, [] | [string | null]]>([['T', ['T']], ['E', ['E']], ['null', [null]], ['no status', []]])('runs on a client whose status is %s', async (_, status) => {
    const { sent, client } = settingClient(...status);
    await db.setLocal(client, aliased);
    expect(sent).toEqual([{ text: 'SELECT set_config($1, $2, true)', values: ['app.customer', 'Ada Quill'] }]);
  });

  it('runs on the client of another driver’s pool, in its transaction: queryListener gets it with the txnId, the transaction listeners nothing', async () => {
    const sent: string[] = [], queries: [string, number | undefined][] = [], messages: unknown[] = [];
    db.setConfig({
      queryListener: (q, txnId) => { queries.push([q.text, txnId]); },
      transactionListener: message => { messages.push(message); },
      transactionEventListener: event => { messages.push(event); },
    });
    const client = {
      query: async (q: db.SQLQuery) => { sent.push(q.text); return { rows: [], command: q.text.split(' ')[0] }; },
      release: () => { sent.push('release()'); },
    };
    await db.serializable({ connect: async () => client }, c => db.setLocal(c, aliased));
    expect(sent).toEqual(['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT set_config($1, $2, true)', 'COMMIT', 'release()']);
    const txnId = queries[0]?.[1];
    expect(typeof txnId).toBe('number');
    expect(queries).toEqual([['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', txnId], ['SELECT set_config($1, $2, true)', txnId], ['COMMIT', txnId]]);
    expect(messages).toEqual([]);
  });
});

// #743: cursor() on a client that logs what it is sent and answers each FETCH from its rows: the SQL of each query,
// the cursor's name, how it ends, and its refusals, each before its query
describe('cursor()', () => {
  afterEach(resetConfig);

  type Row = { id: number };

  /**
   * A transaction's client that logs each query, as it is sent, and answers each FETCH from `rows`, which each DECLARE
   * reads anew; `fail` gives the error a query rejects with. Its getTransactionStatus() gives `status`, and with no
   * `status` key it has no such method.
   */
  const cursorClient = (options: { rows?: readonly unknown[]; status?: string | null; fail?: (text: string) => Error | undefined } = {}) => {
    const sent: db.SQLQuery[] = [], open = new Map<string, unknown[]>();
    const client = {
      query: async (q: db.SQLQuery) => {
        sent.push({ ...q });
        const error = options.fail?.(q.text);
        if (error) throw error;
        let m: RegExpExecArray | null;
        if ((m = /^DECLARE (\S+) /.exec(q.text))) open.set(m[1]!, [...options.rows ?? []]);
        else if ((m = /^FETCH FORWARD (\d+) FROM (\S+)$/.exec(q.text))) return { rows: open.get(m[2]!)!.splice(0, Number(m[1])), command: 'FETCH' };
        else if ((m = /^CLOSE (\S+)$/.exec(q.text))) open.delete(m[1]!);
        return { rows: [], command: q.text.split(' ')[0] };
      },
      release: () => undefined,
      ...('status' in options ? { getTransactionStatus: () => options.status } : {}),
    };
    return { sent, client };
  };

  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const read = async <R>(batches: AsyncIterable<R>) => { const all: R[] = []; for await (const batch of batches) all.push(batch); return all; };
  const users = sql<db.SQL, Row[]>`SELECT ${'id'} FROM ${'users'} ORDER BY ${'id'}`;
  const fetch = (size: number, n = 1) => ({ text: `FETCH FORWARD ${size} FROM pgcast_cursor_${n}`, values: [] });
  const close = (n = 1) => ({ text: `CLOSE pgcast_cursor_${n}`, values: [] });
  const sqlError = (code: string) => Object.assign(new Error(`simulated ${code}`), { code });

  it('sends DECLARE with the fragment and its values, a FETCH until one returns no row, then CLOSE', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T' });
    const query = sql<db.SQL, Row[]>`SELECT * FROM ${'users'} WHERE ${{ manager_id: 1000 }} ORDER BY ${'id'}`;
    expect(await read(db.cursor(client, query, { batchSize: 2 }))).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }], [{ id: 5 }]]);
    expect(sent).toEqual([
      { text: 'DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT * FROM "users" WHERE ("manager_id" = $1) ORDER BY "id"', values: [1000] },
      fetch(2), fetch(2), fetch(2), fetch(2),
      close(),
    ]);
  });

  it('sends nothing before the first next(), and nothing for a return() before it', async () => {
    const { sent, client } = cursorClient({ rows: rows(3) });
    const batches = db.cursor(client, users, { batchSize: 2 });
    await Promise.resolve();
    expect(sent).toEqual([]);
    expect(await batches.return()).toEqual({ value: undefined, done: true });
    expect(await batches.next()).toEqual({ value: undefined, done: true });
    expect(sent).toEqual([]);
  });

  it('yields nothing for no row: DECLARE, one FETCH, CLOSE', async () => {
    const { sent, client } = cursorClient();
    expect(await read(db.cursor(client, users, { batchSize: 100 }))).toEqual([]);
    expect(sent.map(q => q.text)).toEqual(['DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT "id" FROM "users" ORDER BY "id"', fetch(100).text, close().text]);
  });

  it('writes a select() after CURSOR FOR as it compiles on its own, columns, order, limit and lock included, and yields its one row’s array', async () => {
    const { sent, client } = cursorClient({ rows: [{ result: [{ id: 7 }] }] });
    const query = db.select('users', { manager_id: 1000 }, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, limit: 10, lock: { for: 'UPDATE' } });
    expect(await read(db.cursor(client, query, { batchSize: 100 }))).toEqual([[{ id: 7 }]]);
    const own = query.compile();
    expect(sent[0]).toEqual({ text: `DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR ${own.text}`, values: own.values });
    expect(own.text).toMatch(/ ORDER BY "id" ASC LIMIT \$3 FOR UPDATE\) /);
    expect(sent.slice(1)).toEqual([fetch(100), fetch(100), close()]);
  });

  it.each([1, 2147483647])('writes a batchSize of %d into each FETCH', async size => {
    const { sent, client } = cursorClient({ rows: rows(2) });
    await read(db.cursor(client, users, { batchSize: size }));
    expect(sent.slice(1, 2)).toEqual([fetch(size)]);
  });

  it('names nested loops pgcast_cursor_1, then pgcast_cursor_2, and one loop after another pgcast_cursor_1 twice', async () => {
    const { sent, client } = cursorClient({ rows: rows(2) });
    for await (const outer of db.cursor(client, users, { batchSize: 2 })) {
      expect(await read(db.cursor(client, users, { batchSize: 2 }))).toEqual([outer]);
    }
    await read(db.cursor(client, users, { batchSize: 2 }));
    expect(sent.map(q => q.text.replace(/ NO SCROLL.*/, ''))).toEqual([
      'DECLARE pgcast_cursor_1', fetch(2, 1).text,
      'DECLARE pgcast_cursor_2', fetch(2, 2).text, fetch(2, 2).text, close(2).text,
      fetch(2, 1).text, close(1).text,
      'DECLARE pgcast_cursor_1', fetch(2, 1).text, fetch(2, 1).text, close(1).text,
    ]);
  });

  it('gives two loops at once two names, each reading all its rows, and a third the lowest number free', async () => {
    const { sent, client } = cursorClient({ rows: rows(3) });
    const [a, b] = await Promise.all([read(db.cursor(client, users, { batchSize: 2 })), read(db.cursor(client, users, { batchSize: 2 }))]);
    expect([a, b]).toEqual([[rows(2), [{ id: 3 }]], [rows(2), [{ id: 3 }]]]);
    expect(sent.filter(q => q.text.startsWith('DECLARE')).map(q => q.text.split(' ')[1])).toEqual(['pgcast_cursor_1', 'pgcast_cursor_2']);

    sent.length = 0;
    const first = db.cursor(client, users, { batchSize: 1 }), second = db.cursor(client, users, { batchSize: 1 });
    await first.next();
    await second.next();
    await first.return();
    await db.cursor(client, users, { batchSize: 1 }).next();  // 1 is free again, 2 is not
    expect(sent.filter(q => q.text.startsWith('DECLARE')).map(q => q.text.split(' ')[1])).toEqual(['pgcast_cursor_1', 'pgcast_cursor_2', 'pgcast_cursor_1']);
  });

  it('runs a prepared fragment unprepared, with no name sent, and leaves the fragment prepared', async () => {
    const { sent, client } = cursorClient({ rows: rows(1) });
    const query = sql<db.SQL, Row[]>`SELECT ${'id'} FROM ${'users'} WHERE ${'id'} = ${param(1)}`.prepared('cursor_users');
    await read(db.cursor(client, query, { batchSize: 1 }));
    await read(db.cursor(client, query, { batchSize: 1 }));
    expect(sent.length).toBe(8);
    expect(sent.filter(q => 'name' in q)).toEqual([]);
    expect(query.preparedName).toBe('cursor_users');
    expect(query.compile().name).toBe('cursor_users');
  });

  it.each([
    ['castArrayParamsToJson', { castArrayParamsToJson: true }],
    ['castObjectParamsToJson', { castObjectParamsToJson: true }],
    ['both', { castArrayParamsToJson: true, castObjectParamsToJson: true }],
  ])('sends the fragment’s own text and values under %s', async (_, config) => {
    db.setConfig(config);
    const { sent, client } = cursorClient();
    const query = sql<db.SQL, Row[]>`SELECT ${'id'} FROM ${'users'} WHERE ${'tags'} = ${param(['a', 'b'])} AND ${'settings'} = ${param({ a: 1 })}`;
    await read(db.cursor(client, query, { batchSize: 1 }));
    const own = query.compile();
    expect(sent[0]).toEqual({ text: `DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR ${own.text}`, values: own.values });
  });

  it('passes each non-empty batch through the fragment’s runResultTransform, and never the empty one', async () => {
    const { client } = cursorClient({ rows: [{ result: { id: 1 } }, { result: { id: 2 } }, { result: { id: 3 } }] });
    const query = sql<db.SQL, Row[]>`SELECT to_jsonb(u) AS result FROM ${'users'} u`, seen: number[] = [];
    query.runResultTransform = qr => { seen.push(qr.rows.length); if (qr.rows.length === 0) throw new Error('empty batch'); return qr.rows.map(r => r.result); };
    expect(await read(db.cursor(client, query, { batchSize: 2 }))).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
    expect(seen).toEqual([2, 1]);
  });

  it('gives queryListener each query with the txnId, resultListener the rows of each, the transaction listeners nothing', async () => {
    const queries: [string, number | undefined][] = [], results: unknown[] = [], messages: unknown[] = [];
    db.setConfig({
      queryListener: (q, txnId) => { queries.push([q.text, txnId]); },
      resultListener: (result, txnId) => { if (txnId !== queries[0]?.[1]) throw new Error('txnId'); results.push(result); },
      transactionListener: message => { messages.push(message); },
      transactionEventListener: event => { messages.push(event); },
    });
    const { client } = cursorClient({ rows: rows(3) });
    await db.readCommitted({ connect: async () => client }, c => read(db.cursor(c, users, { batchSize: 2 })));
    const txnId = queries[0]?.[1];
    expect(typeof txnId).toBe('number');
    expect(queries.map(([text]) => text.replace(/ NO SCROLL.*/, ''))).toEqual([
      'START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'DECLARE pgcast_cursor_1', fetch(2).text, fetch(2).text, fetch(2).text, close().text, 'COMMIT']);
    expect(queries.every(([, id]) => id === txnId)).toBe(true);
    expect(results).toEqual([[], [], rows(2), [{ id: 3 }], [], [], []]);
    expect(messages).toEqual([]);
  });

  it('sends CLOSE on a break', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T' });
    for await (const batch of db.cursor(client, users, { batchSize: 2 })) { expect(batch).toEqual(rows(2)); break; }
    expect(sent.slice(1)).toEqual([fetch(2), close()]);
  });

  it.each<[string, [] | [string | null]]>([['T', ['T']], ['null', [null]], ['no status', []]])(
    'sends CLOSE when the loop throws on a client whose status is %s, and rejects with that error, whatever CLOSE gives', async (_, status) => {
      const { sent, client } = cursorClient({ rows: rows(5), ...(status.length ? { status: status[0] } : {}), fail: text => text.startsWith('CLOSE') ? sqlError('25P02') : undefined });
      const thrown = new Error('the loop’s own');
      await expect((async () => { for await (const _ of db.cursor(client, users, { batchSize: 2 })) throw thrown; })()).rejects.toBe(thrown);
      expect(sent.slice(1)).toEqual([fetch(2), close()]);
    });

  it('sends no CLOSE when pg reports the transaction aborted, and rejects with the loop’s error', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'E' });
    const thrown = sqlError('23505');
    await expect((async () => { for await (const _ of db.cursor(client, users, { batchSize: 2 })) throw thrown; })()).rejects.toBe(thrown);
    expect(sent.slice(1)).toEqual([fetch(2)]);
  });

  // pg rejects a query at its ErrorResponse and reads the status E at the ReadyForQuery after it, often a chunk later:
  // the status is still T, CLOSE goes out and Postgres refuses it, 25P02
  it('drops a 25P02 of CLOSE after a break, so the loop ends', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T', fail: text => text.startsWith('CLOSE') ? sqlError('25P02') : undefined });
    const batches: Row[][] = [];
    for await (const batch of db.cursor(client, users, { batchSize: 2 })) { batches.push(batch); break; }
    expect(batches).toEqual([rows(2)]);
    expect(sent.slice(1)).toEqual([fetch(2), close()]);
  });

  it('drops a 25P02 of CLOSE at a return() in a finally, so the error of the loop’s query goes out', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T', fail: text => text.startsWith('CLOSE') ? sqlError('25P02') : undefined });
    const failure = sqlError('40001'), batches = db.cursor(client, users, { batchSize: 2 });
    await expect((async () => {
      try { for (let r = await batches.next(); !r.done; r = await batches.next()) throw failure; }
      finally { await batches.return(); }
    })()).rejects.toBe(failure);
    expect(sent.slice(1)).toEqual([fetch(2), close()]);
  });

  it('sends no CLOSE after a FETCH that rejects, rejects with its error unchanged, and frees the number', async () => {
    let fetches = 0;
    const failure = sqlError('22012');
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T', fail: text => text.startsWith('FETCH') && ++fetches === 2 ? failure : undefined });
    const batches: Row[][] = [];
    await expect((async () => { for await (const batch of db.cursor(client, users, { batchSize: 2 })) batches.push(batch); })()).rejects.toBe(failure);
    expect(batches).toEqual([rows(2)]);
    expect(sent.slice(1)).toEqual([fetch(2), fetch(2)]);
    await db.cursor(client, users, { batchSize: 2 }).next();
    expect(sent[3]?.text).toMatch(/^DECLARE pgcast_cursor_1 /);
  });

  it('sends no CLOSE after a DECLARE that rejects, and frees the number', async () => {
    const failure = sqlError('25P01');
    const { sent, client } = cursorClient({ fail: text => text.startsWith('DECLARE') ? failure : undefined });
    await expect(db.cursor(client, users, { batchSize: 2 }).next()).rejects.toBe(failure);
    await expect(db.cursor(client, users, { batchSize: 2 }).next()).rejects.toBe(failure);
    expect(sent.map(q => q.text.split(' ').slice(0, 2).join(' '))).toEqual(['DECLARE pgcast_cursor_1', 'DECLARE pgcast_cursor_1']);
  });

  it('sends CLOSE when the fragment’s runResultTransform throws, rejects with its error, and frees the number', async () => {
    const { sent, client } = cursorClient({ rows: rows(5), status: 'T' });
    const query = sql<db.SQL, Row[]>`SELECT ${'id'} FROM ${'users'}`, failure = new Error('transform');
    let calls = 0;
    query.runResultTransform = qr => { if (++calls === 2) throw failure; return qr.rows; };
    await expect(read(db.cursor(client, query, { batchSize: 2 }))).rejects.toBe(failure);
    expect(sent.slice(1)).toEqual([fetch(2), fetch(2), close()]);
    expect(await read(db.cursor(client, users, { batchSize: 5 }))).toEqual([rows(5)]);
    expect(sent[4]?.text).toMatch(/^DECLARE pgcast_cursor_1 /);
  });

  const notFragment = 'cursor() was given a query that is not a SQLFragment, such as a string or a { text, values } object: give a db.sql fragment or a select()';
  const badSize = 'cursor() was given a batchSize that is not an integer from 1 to 2147483647, the rows each FETCH reads: give a number of rows, { batchSize: 100 }';
  const iteratedAfter = 'cursor() was iterated after its transaction ended, so its next query would run on a client that may be in another transaction, or in none: iterate it inside the transaction() callback that called cursor()';

  it.each<[string, unknown]>([
    ['a string', 'SELECT 1'], ['a query object', { text: 'SELECT 1', values: [] }], ['undefined', undefined], ['null', null],
  ])('rejects %s as the query at the first next(), before any query', async (_, query) => {
    const { sent, client } = cursorClient();
    const batches = db.cursor(client, query as typeof users, { batchSize: 0 });  // the query is checked first
    await expect(batches.next()).rejects.toThrow(notFragment);
    expect(sent).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['0', { batchSize: 0 }], ['-1', { batchSize: -1 }], ['1.5', { batchSize: 1.5 }], ['NaN', { batchSize: NaN }],
    ['Infinity', { batchSize: Infinity }], ['2147483648', { batchSize: 2147483648 }], ["'100'", { batchSize: '100' }],
    ['BigInt(100)', { batchSize: BigInt(100) }], ['new Number(100)', { batchSize: new Number(100) }], ['{}', {}],
    ['no options', undefined], ['null options', null],
  ])('rejects a batchSize of %s at the first next(), before any query', async (_, options) => {
    const { sent, client } = cursorClient();
    (client as { _zapatos?: unknown })._zapatos = {};  // a mark that changes below: the size is checked first
    const batches = db.cursor(client, users, options as { batchSize: number });
    (client as { _zapatos?: unknown })._zapatos = {};
    await expect(batches.next()).rejects.toThrow(badSize);
    expect(sent).toEqual([]);
  });

  it('rejects a generator returned from a transaction() callback at its first next(), with nothing sent after COMMIT', async () => {
    const { sent, client } = cursorClient({ rows: rows(3) });
    const batches = await db.readCommitted({ connect: async () => client }, async c => db.cursor(c, users, { batchSize: 2 }));
    await expect(batches.next()).rejects.toThrow(iteratedAfter);
    expect(sent.map(q => q.text)).toEqual(['START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'COMMIT']);
  });

  it('rejects a generator iterated after its transaction ended, after one batch: no FETCH, no CLOSE after COMMIT', async () => {
    const { sent, client } = cursorClient({ rows: rows(3), status: 'T' });
    const batches = await db.readCommitted({ connect: async () => client }, async c => {
      const inside = db.cursor(c, users, { batchSize: 2 });
      expect((await inside.next()).value).toEqual(rows(2));
      return inside;
    });
    await expect(batches.next()).rejects.toThrow(iteratedAfter);
    expect(await batches.next()).toEqual({ value: undefined, done: true });
    expect(sent.map(q => q.text.replace(/ NO SCROLL.*/, ''))).toEqual(['START TRANSACTION ISOLATION LEVEL READ COMMITTED', 'DECLARE pgcast_cursor_1', fetch(2).text, 'COMMIT']);
  });

  it('rejects a generator whose client carries another transaction’s mark, and sends no CLOSE on a return() then', async () => {
    const { sent, client } = cursorClient({ rows: rows(3), status: 'T' });
    (client as { _zapatos?: unknown })._zapatos = { isolationLevel: IsolationLevel.ReadCommitted, txnId: 1 };
    const later = db.cursor(client, users, { batchSize: 2 }), stopped = db.cursor(client, users, { batchSize: 2 });
    await stopped.next();
    (client as { _zapatos?: unknown })._zapatos = { isolationLevel: IsolationLevel.ReadCommitted, txnId: 2 };
    await expect(later.next()).rejects.toThrow(iteratedAfter);
    expect(await stopped.return()).toEqual({ value: undefined, done: true });
    expect(sent.map(q => q.text.replace(/ NO SCROLL.*/, ''))).toEqual(['DECLARE pgcast_cursor_1', fetch(2).text]);
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// How transaction() (src/db/transaction.ts) classes a pg.native client or pool
// (R26). pg-native is not installed: pg.native is stubbed by vi.mock, for this
// file only. Under Vitest, src imports pg's ESM entry, which has no `native`;
// the stub adds it, own and enumerable, as pg 7 has it. No database.

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

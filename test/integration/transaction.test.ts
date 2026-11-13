// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/transaction.ts. transaction() runs START TRANSACTION
// then COMMIT, which would commit the harness's per-test transaction: these tests
// run on the file's pool (t.pool), write only to txn_probe, and empty it after
// each test. The per-test client (t.client) is not used here.
// Retries are provoked deterministically: the callback raises the SQLSTATE
// itself on its first attempts (a DO block with RAISE ... USING ERRCODE).

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, IsolationLevel } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';

const t = useTestDatabase();

beforeAll(async () => {
  await t.pool.query('CREATE TABLE txn_probe (note text NOT NULL)');
});

afterEach(async () => {
  resetConfig();
  await t.pool.query('DELETE FROM txn_probe');
});

const notes = async () => (await t.pool.query('SELECT note FROM txn_probe ORDER BY note')).rows.map(r => r.note);
const write = (c: db.Queryable, note: string) => sql`INSERT INTO ${'txn_probe'} (${'note'}) VALUES (${db.param(note)})`.run(c);
const raise = (c: db.Queryable, sqlstate: '40001' | '40P01' | '23505') =>
  sql`DO $$BEGIN RAISE EXCEPTION 'simulated' USING ERRCODE = '${db.raw(sqlstate)}'; END$$`.run(c);

/** Records the transaction listener's messages, and checks they all carry the same txnId. */
const listen = () => {
  const messages: string[] = [];
  const txnIds = new Set<number | undefined>();
  db.setConfig({
    transactionRetryDelay: { minMs: 0, maxMs: 0 },
    transactionListener: (message, txnId) => { messages.push(message); txnIds.add(txnId); },
  });
  return { messages, txnIds };
};

describe('transaction', () => {
  it('commits and returns the callback result', async () => {
    const result = await db.transaction(t.pool, IsolationLevel.Serializable, async c => {
      await write(c, 'committed');
      return 'done';
    });
    expect(result).toBe('done');
    expect(await notes()).toEqual(['committed']);
  });

  it('rolls back and rethrows on an error, without retrying', async () => {
    const { messages } = listen();
    let attempts = 0;
    const err = await db.transaction(t.pool, IsolationLevel.ReadCommitted, async c => {
      attempts++;
      await write(c, 'rolled back');
      throw new Error('boom');
    }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('boom');
    expect(attempts).toBe(1);
    expect(messages).toEqual([]);
    expect(await notes()).toEqual([]);
  });

  it('does not retry a database error other than 40001 / 40P01', async () => {
    let attempts = 0;
    const err = await db.transaction(t.pool, IsolationLevel.Serializable, async c => {
      attempts++;
      await raise(c, '23505');
    }).catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe('23505');
    expect(attempts).toBe(1);
  });

  it('applies the isolation level and read-only mode', async () => {
    const settings = async (level: db.IsolationLevel) => db.transaction(t.pool, level, async c =>
      (await sql`SELECT current_setting('transaction_isolation') AS iso, current_setting('transaction_read_only') AS ro,
        current_setting('transaction_deferrable') AS deferrable`.run(c))[0]);
    const byLevel: Record<string, unknown> = {};
    for (const level of Object.values(IsolationLevel)) byLevel[level] = await settings(level);
    expect(byLevel).toMatchInlineSnapshot(`
      {
        "READ COMMITTED": {
          "deferrable": "off",
          "iso": "read committed",
          "ro": "off",
        },
        "READ COMMITTED, READ ONLY": {
          "deferrable": "off",
          "iso": "read committed",
          "ro": "on",
        },
        "REPEATABLE READ": {
          "deferrable": "off",
          "iso": "repeatable read",
          "ro": "off",
        },
        "REPEATABLE READ, READ ONLY": {
          "deferrable": "off",
          "iso": "repeatable read",
          "ro": "on",
        },
        "SERIALIZABLE": {
          "deferrable": "off",
          "iso": "serializable",
          "ro": "off",
        },
        "SERIALIZABLE, READ ONLY": {
          "deferrable": "off",
          "iso": "serializable",
          "ro": "on",
        },
        "SERIALIZABLE, READ ONLY, DEFERRABLE": {
          "deferrable": "on",
          "iso": "serializable",
          "ro": "on",
        },
      }
    `);
  });

  it('the shortcuts pick their level', async () => {
    const level = (c: db.Queryable) => sql`SELECT current_setting('transaction_isolation') AS v`.run(c).then(r => r[0].v);
    expect(await db.serializable(t.pool, level)).toBe('serializable');
    expect(await db.repeatableRead(t.pool, level)).toBe('repeatable read');
    expect(await db.readCommitted(t.pool, level)).toBe('read committed');
    expect(await db.serializableRO(t.pool, level)).toBe('serializable');
    expect(await db.repeatableReadRO(t.pool, level)).toBe('repeatable read');
    expect(await db.readCommittedRO(t.pool, level)).toBe('read committed');
    expect(await db.serializableRODeferrable(t.pool, level)).toBe('serializable');
  });

  it('passes a transaction client through: no nested transaction, whatever the level asked', async () => {
    const queries: string[] = [];
    db.setConfig({ queryListener: q => queries.push(q.text) });
    let outer: db.TxnClientForSerializable | undefined;
    await db.serializable(t.pool, async c => {
      outer = c;
      // characterization: the passed-through client keeps its level; ReadCommitted is not applied
      await db.readCommitted(c, async inner => {
        expect(inner).toBe(c);
        await write(inner, 'inner');
      });
    });
    expect(queries).toEqual([
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE',
      'INSERT INTO "txn_probe" ("note") VALUES ($1)',
      'COMMIT',
    ]);
    expect(await notes()).toEqual(['inner']);
    expect(outer!._zapatos).toBeUndefined();  // removed once the transaction is over
  });

  it('the queries of a transaction carry its txnId', async () => {
    const seen: [string, number | undefined][] = [];
    db.setConfig({ queryListener: (q, txnId) => seen.push([q.text, txnId]) });
    await db.serializable(t.pool, c => write(c, 'x'));
    await sql`SELECT 1`.run(t.pool);
    const txnId = seen[0][1];
    expect(typeof txnId).toBe('number');
    expect(seen.map(([text, id]) => [text, id === txnId ? 'txnId' : id])).toMatchInlineSnapshot(`
      [
        [
          "START TRANSACTION ISOLATION LEVEL SERIALIZABLE",
          "txnId",
        ],
        [
          "INSERT INTO "txn_probe" ("note") VALUES ($1)",
          "txnId",
        ],
        [
          "COMMIT",
          "txnId",
        ],
        [
          "SELECT 1",
          undefined,
        ],
      ]
    `);
  });

  it('retries on 40001 until it succeeds, only the last attempt committed', async () => {
    const { messages, txnIds } = listen();
    let attempts = 0;
    const result = await db.serializable(t.pool, async c => {
      attempts++;
      await write(c, `attempt ${attempts}`);
      if (attempts < 3) await raise(c, '40001');
      return attempts;
    });
    expect(result).toBe(3);
    expect(await notes()).toEqual(['attempt 3']);
    expect(messages).toMatchInlineSnapshot(`
      [
        "Transaction rollback (code 40001) on attempt 1 of 5, retrying in 0ms",
        "Retrying transaction, attempt 2 of 5",
        "Transaction rollback (code 40001) on attempt 2 of 5, retrying in 0ms",
        "Retrying transaction, attempt 3 of 5",
      ]
    `);
    expect(txnIds.size).toBe(1);
  });

  it('retries on 40P01 (deadlock)', async () => {
    const { messages } = listen();
    let attempts = 0;
    await db.serializable(t.pool, async c => {
      if (++attempts === 1) await raise(c, '40P01');
    });
    expect(attempts).toBe(2);
    expect(messages).toMatchInlineSnapshot(`
      [
        "Transaction rollback (code 40P01) on attempt 1 of 5, retrying in 0ms",
        "Retrying transaction, attempt 2 of 5",
      ]
    `);
  });

  it('gives up after transactionAttemptsMax and rethrows', async () => {
    const { messages } = listen();
    db.setConfig({ transactionAttemptsMax: 2 });
    let attempts = 0;
    const err = await db.serializable(t.pool, async c => {
      attempts++;
      await raise(c, '40001');
    }).catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe('40001');
    expect(attempts).toBe(2);
    expect(messages).toMatchInlineSnapshot(`
      [
        "Transaction rollback (code 40001) on attempt 1 of 2, retrying in 0ms",
        "Retrying transaction, attempt 2 of 2",
        "Transaction rollback (code 40001) on attempt 2 of 2, giving up",
      ]
    `);
  });

  it('a plain client is used as is and not released', async () => {
    const client = await t.pool.connect();
    const counts = () => ({ total: t.pool.totalCount, idle: t.pool.idleCount });
    const before = counts();
    try {
      await db.readCommitted(client, c => {
        expect(c).toBe(client);
        return write(c, 'plain client');
      });
      expect(counts()).toEqual(before);  // released, the client would be counted idle
    } finally {
      client.release();
    }
    expect(counts()).toEqual({ ...before, idle: before.idle + 1 });  // control: release() makes it idle
    expect(await notes()).toEqual(['plain client']);
  });

  it('characterization: on a client already in a raw BEGIN, at the same level, it commits the outer transaction', async () => {
    // characterization: only a client from transaction() is passed through; START TRANSACTION inside BEGIN
    // at the level already in force only warns, and its COMMIT ends the outer transaction,
    // so the later ROLLBACK undoes nothing
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      await write(client, 'outer');
      await db.readCommitted(client, c => write(c, 'inner'));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['inner', 'outer']);
  });

  it('characterization: on a client already in a raw BEGIN, at another level, it rolls back the outer transaction', async () => {
    // characterization: once the outer transaction has run a query, its level can no longer change:
    // START TRANSACTION fails with 25001, then transaction()'s ROLLBACK undoes the outer write
    let called = false;
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      await write(client, 'outer');
      const err = await db.serializable(client, async c => {
        called = true;
        await write(c, 'inner');
      }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: '25001', message: 'SET TRANSACTION ISOLATION LEVEL must be called before any query' });
    } finally {
      client.release();
    }
    expect(called).toBe(false);
    expect(await notes()).toEqual([]);
  });
});

// #190: after a database error the callback catches, Postgres has aborted the transaction,
// and answers the COMMIT that follows with the command tag ROLLBACK, without an error
describe('a COMMIT that Postgres answers with ROLLBACK', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const rolledBack = 'the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on';

  /** A fresh module, so that warnOnce has not warned yet, and a spy on process.emitWarning. */
  const fresh = async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const fdb = await import('../../src/db');
    fdb.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    return { fdb, emitWarning };
  };

  /** Writes a note, then swallows a database error and returns: the pattern of #190. */
  const swallow = (sqlstate: '40001' | '23505') => async (c: db.Queryable) => {
    await write(c, 'lost');
    try { await raise(c, sqlstate); } catch { return 'swallowed'; }
  };

  it('with transactionRequiresCommit, rejects, saves nothing and sends no ROLLBACK of its own', async () => {
    const { messages } = listen();
    const queries: string[] = [];
    db.setConfig({ transactionRequiresCommit: true, queryListener: q => { queries.push(q.text); } });
    let attempts = 0;
    const err = await db.serializable(t.pool, async c => { attempts++; return swallow('23505')(c); }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(rolledBack);
    expect((err as { code?: string }).code).toBeUndefined();  // so isDatabaseError() gives false, and no retry
    expect(attempts).toBe(1);
    expect(messages).toEqual([]);
    expect(queries[0]).toBe('START TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    expect(queries.at(-1)).toBe('COMMIT');
    expect(queries).not.toContain('ROLLBACK');
    expect(await notes()).toEqual([]);
  });

  it('with transactionRequiresCommit, a swallowed 40001 is not retried', async () => {
    const { messages } = listen();
    db.setConfig({ transactionRequiresCommit: true });
    let attempts = 0;
    const err = await db.serializable(t.pool, async c => { attempts++; return swallow('40001')(c); }).catch((e: unknown) => e);
    expect((err as Error).message).toBe(rolledBack);
    expect(attempts).toBe(1);
    expect(messages).toEqual([]);
  });

  it('with transactionRequiresCommit, an error caught after ROLLBACK TO SAVEPOINT commits', async () => {
    db.setConfig({ transactionRequiresCommit: true });
    const result = await db.serializable(t.pool, async c => {
      await write(c, 'kept');
      await sql`SAVEPOINT ${db.raw('before_duplicate')}`.run(c);
      try { await raise(c, '23505'); } catch { await sql`ROLLBACK TO SAVEPOINT ${db.raw('before_duplicate')}`.run(c); }
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(await notes()).toEqual(['kept']);
  });

  it('with transactionRequiresCommit, releases a pool client, and leaves a plain client checked out', async () => {
    db.setConfig({ transactionRequiresCommit: true });
    const counts = () => ({ total: t.pool.totalCount, idle: t.pool.idleCount });
    const checkedOut = () => t.pool.totalCount - t.pool.idleCount;
    const outBefore = checkedOut();
    await expect(db.serializable(t.pool, swallow('23505'))).rejects.toThrow(rolledBack);
    expect(checkedOut()).toBe(outBefore);  // released: no more clients checked out than before
    const client = await t.pool.connect();
    const before = counts();
    try {
      let txnClient: db.TxnClientForSerializable | undefined;
      await expect(db.serializable(client, async c => { txnClient = c; return swallow('23505')(c); })).rejects.toThrow(rolledBack);
      expect(counts()).toEqual(before);
      expect(Object.prototype.hasOwnProperty.call(txnClient, '_zapatos')).toBe(false);
      expect(await db.serializable(client, c => write(c, 'still usable'))).toBeDefined();
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['still usable']);
  });

  it('without transactionRequiresCommit (deprecated, PGCAST_DEP003), resolves as in 6.6.1 and warns once, naming the option', async () => {
    const { fdb, emitWarning } = await fresh();
    expect(await fdb.serializable(t.pool, swallow('23505'))).toBe('swallowed');
    expect(await fdb.serializable(t.pool, swallow('23505'))).toBe('swallowed');
    expect(await notes()).toEqual([]);
    expect(emitWarning).toHaveBeenCalledTimes(1);
    const [message, options] = emitWarning.mock.calls[0];
    expect(options).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP003' });
    expect(message).toMatch(/transactionRequiresCommit: true/);
    expect(message).toMatch(/default in pgcast 7\.0/);
  });

  it('does not warn on a committed transaction, a callback that throws, nor with the option', async () => {
    const { fdb, emitWarning } = await fresh();
    expect(await fdb.serializable(t.pool, c => write(c, 'committed'))).toBeDefined();
    await expect(fdb.serializable(t.pool, async c => { await raise(c, '23505'); })).rejects.toMatchObject({ code: '23505' });
    fdb.setConfig({ transactionRequiresCommit: true });
    await expect(fdb.serializable(t.pool, swallow('23505'))).rejects.toThrow(rolledBack);
    expect(emitWarning).not.toHaveBeenCalled();
    expect(await notes()).toEqual(['committed']);
  });
});

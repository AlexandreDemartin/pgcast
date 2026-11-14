// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/transaction.ts. transaction() runs START TRANSACTION
// then COMMIT, which would commit the harness's per-test transaction: these tests
// run on the file's pool (t.pool), write only to txn_probe, and empty it after
// each test. The per-test client (t.client) is not used here.
// Retries are provoked deterministically: the callback raises the SQLSTATE
// itself on its first attempts (a DO block with RAISE ... USING ERRCODE).

import pg from 'pg';
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

/** `{ [key]: undefined }`, which setConfig() accepts without exactOptionalPropertyTypes (TypeScript's default, not this suite's). */
const undefinedKey = (key: keyof db.Config) => ({ [key]: undefined }) as db.NewConfig;

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

  // #179: Zapatos 6.6.1 rejected with "TypeError: Cannot destructure property 'code' of 'err' as it is null."
  describe.each([null, undefined])('a callback that throws %s', thrown => {
    it.each(['pool', 'client'] as const)('rolls back and rejects with it, on a %s', async where => {
      const client = where === 'client' ? await t.pool.connect() : undefined;
      try {
        let attempts = 0;
        const outcome = await db.readCommitted(client ?? t.pool, async c => {
          attempts++;
          await write(c, 'rolled back');
          throw thrown;
        }).then(() => 'resolved', (error: unknown) => ({ error }));
        expect(outcome).toEqual({ error: thrown });
        expect(attempts).toBe(1);
      } finally {
        client?.release();
      }
      expect(await notes()).toEqual([]);
    });

    it('rejects with it from a transaction nested in another', async () => {
      const outcome = await db.readCommitted(t.pool, c => db.readCommitted(c, async () => { throw thrown; }))
        .then(() => 'resolved', (error: unknown) => ({ error }));
      expect(outcome).toEqual({ error: thrown });
    });
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

// #246: setConfig() accepts undefined for any key (Partial<Config>); a key with a default then reads as
// that default, and transaction() releases the client it checked out from the pool on every path
describe('the config transaction() reads', () => {
  /**
   * Runs fn, and counts the pool's clients it left checked out. A leaked client still has _zapatos:
   * it is released here, so that the file's pool can end (pool.end() waits for checked-out clients).
   */
  const leakCheck = async <T>(fn: () => Promise<T>) => {
    const acquired: db.TxnClient<IsolationLevel>[] = [];
    const onAcquire = (c: db.TxnClient<IsolationLevel>) => { acquired.push(c); };
    const checkedOut = () => t.pool.totalCount - t.pool.idleCount;
    const before = checkedOut();
    t.pool.on('acquire', onAcquire);
    const outcome = await fn().then(value => ({ value, error: undefined }), (error: unknown) => ({ value: undefined, error }));
    t.pool.off('acquire', onAcquire);
    const leaked = checkedOut() - before;
    for (const c of acquired) if (c._zapatos) { delete c._zapatos; c.release(); }
    return { ...outcome, leaked };
  };

  it('reads an undefined transactionRetryDelay as its default, and releases its client', async () => {
    const { messages } = listen();
    db.setConfig(undefinedKey('transactionRetryDelay'));
    let attempts = 0;
    const { value, error, leaked } = await leakCheck(() => db.serializable(t.pool, async c => {
      if (attempts++ === 0) await raise(c, '40001');
      await write(c, 'retried');
      return 'done';
    }));
    expect(leaked).toBe(0);
    expect(error).toBeUndefined();
    expect(value).toBe('done');
    expect(attempts).toBe(2);
    expect(await notes()).toEqual(['retried']);
    const delay = Number(/retrying in (\d+)ms$/.exec(messages[0])?.[1]);
    expect(delay).toBeGreaterThanOrEqual(25);  // the default: { minMs: 25, maxMs: 250 }
    expect(delay).toBeLessThanOrEqual(250);
  });

  it('with an undefined transactionRetryDelay, rejects with the error of a callback that throws, and releases its client', async () => {
    db.setConfig(undefinedKey('transactionRetryDelay'));
    const { error, leaked } = await leakCheck(() => db.readCommitted(t.pool, async c => {
      await write(c, 'rolled back');
      throw new Error('boom');
    }));
    expect(leaked).toBe(0);
    expect((error as Error).message).toBe('boom');
    expect(await notes()).toEqual([]);
  });

  it('releases its client when reading the config throws', async () => {
    // a getter that throws, read by getConfig() when transaction() reads its config
    class Delay { get minMs(): number { throw new Error('no delay'); } get maxMs() { return 0; } }
    expect(() => db.setConfig({ transactionRetryDelay: new Delay() })).toThrow('no delay');  // stored, then its copy throws
    const { error, leaked } = await leakCheck(() => db.readCommitted(t.pool, async () => 'never'));
    expect(leaked).toBe(0);
    expect((error as Error).message).toBe('no delay');
  });

  it('reads an undefined transactionAttemptsMax as its default', async () => {
    const { messages } = listen();
    db.setConfig(undefinedKey('transactionAttemptsMax'));
    let attempts = 0;
    const { error, leaked } = await leakCheck(() => db.serializable(t.pool, async c => {
      attempts++;
      await raise(c, '40001');
    }));
    expect((error as { code: string }).code).toBe('40001');
    expect(leaked).toBe(0);
    expect(attempts).toBe(5);
    expect(messages.at(-1)).toBe('Transaction rollback (code 40001) on attempt 5 of 5, giving up');
  });

  // #179: the attempts are those Zapatos 6.6.1 makes, replayed for each value; its messages counted
  // "attempt 1 of 0" (of -1, of NaN) and "attempt 3 of 2.5": they now count the attempts made
  it.each([
    { max: 0, attempts: 1 },
    { max: 1, attempts: 1 },
    { max: -1, attempts: 1 },
    { max: NaN, attempts: 1 },
    { max: 2.5, attempts: 3 },
    { max: '3', attempts: 3 },  // from JavaScript
    { max: BigInt(3), attempts: 3 },  // from JavaScript
  ])('keeps the attempts of a transactionAttemptsMax of $max, and counts them in its messages', async ({ max, attempts }) => {
    const { messages } = listen();
    db.setConfig({ transactionAttemptsMax: max as number });
    let made = 0;
    const err = await db.serializable(t.pool, async c => {
      made++;
      await raise(c, '40001');
    }).catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe('40001');
    expect(made).toBe(attempts);
    expect(messages).toEqual([
      ...Array.from({ length: attempts - 1 }, (_, i) => [
        `Transaction rollback (code 40001) on attempt ${i + 1} of ${attempts}, retrying in 0ms`,
        `Retrying transaction, attempt ${i + 2} of ${attempts}`,
      ]).flat(),
      `Transaction rollback (code 40001) on attempt ${attempts} of ${attempts}, giving up`,
    ]);
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

  it('reads an undefined transactionRequiresCommit as its default (false): resolves and warns', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig(undefinedKey('transactionRequiresCommit'));
    expect(await fdb.serializable(t.pool, swallow('23505'))).toBe('swallowed');
    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(emitWarning.mock.calls[0][1]).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP003' });
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

// #233: given a client already inside a transaction block (BEGIN sent by the caller), transaction()'s COMMIT
// or ROLLBACK ends the caller's transaction. pg reports the block in getTransactionStatus(), from pg 8.21
describe('a client already inside a transaction block', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const inBlock = 'transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, pass the pool, or run the queries on that client without transaction()';

  /** A fresh module, so that warnOnce has not warned yet, and a spy on process.emitWarning. */
  const fresh = async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const fdb = await import('../../src/db');
    fdb.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    return { fdb, emitWarning };
  };

  /** The text of each query the client is sent from now on, by anyone: a spy on its query(). */
  const spyQueries = (client: pg.PoolClient) => {
    const sent: string[] = [];
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    vi.spyOn(client, 'query').mockImplementation(((q: string | { text: string }, ...rest: unknown[]) => {
      sent.push(typeof q === 'string' ? q : q.text);
      return query(q, ...rest);
    }) as never);
    return sent;
  };

  /** The codes of the notices Postgres sends the client from now on (25001, 25P01). */
  const noticesOf = (client: pg.PoolClient) => {
    const codes: string[] = [];
    client.on('notice', n => { codes.push(n.code ?? ''); });
    return codes;
  };

  type Level = 'serializable' | 'readCommitted' | 'repeatableRead';
  const start = {
    serializable: 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    readCommitted: 'START TRANSACTION ISOLATION LEVEL READ COMMITTED',
    repeatableRead: 'START TRANSACTION ISOLATION LEVEL REPEATABLE READ',
  };
  const insertInner = 'INSERT INTO "txn_probe" ("note") VALUES ($1)';

  // the replay of #233 on Zapatos 6.6.1 (and its comment's case, no query yet): what the caller ran, the level
  // asked, then what 6.6.1 does and what its caller's ROLLBACK leaves
  const cases: {
    name: string; begin: string; prior?: (c: pg.PoolClient) => Promise<unknown>; level: Level;
    old: { rejects?: string; left: string[] };
  }[] = [
    { name: 'serializable, no query yet (the comment\'s case)', begin: 'BEGIN', level: 'serializable', old: { left: ['inner'] } },
    { name: 'readCommitted, no query yet', begin: 'BEGIN', level: 'readCommitted', old: { left: ['inner'] } },
    { name: 'repeatableRead, no query yet', begin: 'BEGIN', level: 'repeatableRead', old: { left: ['inner'] } },
    { name: 'serializable, after a write', begin: 'BEGIN', prior: c => write(c, 'outer'), level: 'serializable', old: { rejects: '25001', left: [] } },
    { name: 'readCommitted, after a write', begin: 'BEGIN', prior: c => write(c, 'outer'), level: 'readCommitted', old: { left: ['inner', 'outer'] } },
    { name: 'repeatableRead, after a select', begin: 'BEGIN', prior: c => c.query('SELECT 1'), level: 'repeatableRead', old: { rejects: '25001', left: [] } },
    { name: 'serializable, in BEGIN ISOLATION LEVEL SERIALIZABLE, after a write', begin: 'BEGIN ISOLATION LEVEL SERIALIZABLE', prior: c => write(c, 'outer'), level: 'serializable', old: { left: ['inner', 'outer'] } },
    { name: 'serializable, in an aborted block', begin: 'BEGIN', prior: c => c.query('SELECT 1/0').catch(() => { }), level: 'serializable', old: { rejects: '25P02', left: [] } },
  ];

  describe.each(cases)('$name', ({ begin, prior, level, old }) => {
    it('with transactionRequiresIdleClient, rejects before sending its SQL, and leaves the caller\'s transaction to its ROLLBACK', async () => {
      const { fdb, emitWarning } = await fresh();
      fdb.setConfig({ transactionRequiresIdleClient: true });
      const client = await t.pool.connect();
      let called = false;
      try {
        await client.query(begin);
        await prior?.(client);
        const status = old.rejects === '25P02' ? 'E' : 'T';  // what the caller's block is in
        const sent = spyQueries(client), notices = noticesOf(client);
        const err = await fdb[level](client, async c => { called = true; await write(c, 'inner'); }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe(inBlock);
        expect((err as { code?: string }).code).toBeUndefined();
        expect(sent).toEqual(['']);  // the empty query that reads the status again, and nothing else
        expect(client.getTransactionStatus()).toBe(status);  // the caller's block is still open, as it was
        if (status === 'T') await write(client, 'after');  // and still takes writes
        await client.query('ROLLBACK');
        expect(notices).toEqual([]);  // no 25P01: the ROLLBACK found its transaction
      } finally {
        client.release();
      }
      expect(called).toBe(false);
      expect(await notes()).toEqual([]);  // the caller's ROLLBACK undid its writes
      expect(emitWarning).not.toHaveBeenCalled();
    });

    it('without transactionRequiresIdleClient (deprecated, PGCAST_DEP005), does what Zapatos 6.6.1 does, and warns', async () => {
      const { fdb, emitWarning } = await fresh();
      const client = await t.pool.connect();
      try {
        await client.query(begin);
        await prior?.(client);
        const sent = spyQueries(client);
        const result = await fdb[level](client, c => write(c, 'inner')).then(() => 'resolved', (e: { code?: string }) => e.code);
        expect(result).toBe(old.rejects ?? 'resolved');
        expect(sent).toEqual(old.rejects ? [start[level], 'ROLLBACK'] : [start[level], insertInner, 'COMMIT']);  // no empty query
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      expect(await notes()).toEqual(old.left);
      expect(emitWarning).toHaveBeenCalledTimes(1);
      const [message, options] = emitWarning.mock.calls[0];
      expect(options).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP005' });
      expect(message).toMatch(/transactionRequiresIdleClient: true/);
      expect(message).toMatch(/default in pgcast 7\.0/);
    });
  });

  it('warns once per process, however many such calls', async () => {
    const { fdb, emitWarning } = await fresh();
    const client = await t.pool.connect();
    try {
      for (let i = 0; i < 3; i++) {
        await client.query('BEGIN');
        await fdb.readCommitted(client, c => write(c, `inner ${i}`));
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }
    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(await notes()).toEqual(['inner 0', 'inner 1', 'inner 2']);
  });

  it('reads an undefined transactionRequiresIdleClient as its default (false): runs and warns', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig(undefinedKey('transactionRequiresIdleClient'));
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      await fdb.readCommitted(client, c => write(c, 'inner'));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['inner']);
    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(emitWarning.mock.calls[0][1]).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP005' });
  });

  it.each([false, true])('outside a block, sends what Zapatos 6.6.1 sends, and nothing more, nor a warning (option %s)', async option => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: option });
    const client = await t.pool.connect();
    try {
      const sent = spyQueries(client);
      await fdb.serializable(client, c => write(c, 'inner'));
      await expect(fdb.readCommitted(client, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      expect(sent).toEqual([start.serializable, insertInner, 'COMMIT', start.readCommitted, 'ROLLBACK']);
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['inner']);
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('a pool given is unaffected: its client is checked out outside a block', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const queries: string[] = [];
    fdb.setConfig({ queryListener: q => { queries.push(q.text); } });
    await fdb.serializable(t.pool, c => fdb.sql`INSERT INTO ${'txn_probe'} (${'note'}) VALUES (${fdb.param('inner')})`.run(c));
    expect(queries).toEqual([start.serializable, insertInner, 'COMMIT']);
    expect(await notes()).toEqual(['inner']);
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('limitation: a pool client released inside a block is not checked, as in 6.6.1', async () => {
    const { fdb } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const pool = new pg.Pool({ connectionString: (t.pool as unknown as { options: { connectionString: string } }).options.connectionString, max: 1 });
    try {
      const leaked = await pool.connect();
      await leaked.query('BEGIN');
      await write(leaked, 'leaked');
      leaked.release();  // back to the pool, inside its block
      await fdb.readCommitted(pool, c => write(c, 'inner'));  // its COMMIT commits the leaked write too
    } finally {
      await pool.end();
    }
    expect(await notes()).toEqual(['inner', 'leaked']);
  });

  it('with transactionRequiresIdleClient, a call at the same moment as a refused one is passed through, into the caller\'s block, as in 6.6.1', async () => {
    const { fdb } = await fresh();
    const queries: [string, number | undefined][] = [], results: [string, number | undefined][] = [];
    fdb.setConfig({
      transactionRequiresIdleClient: true,
      queryListener: (q, txnId) => { queries.push([q.text, txnId]); },
      resultListener: (_r, txnId, _ms, q) => { results.push([q!.text, txnId]); },
    });
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      const sent = spyQueries(client);
      const insert = (c: db.Queryable, note: string) => fdb.sql`INSERT INTO ${'txn_probe'} (${'note'}) VALUES (${fdb.param(note)})`.run(c);
      const outcomes = await Promise.allSettled([fdb.readCommitted(client, c => insert(c, 'f')), fdb.readCommitted(client, c => insert(c, 'g'))]);
      expect(outcomes.map(r => r.status === 'rejected' ? (r.reason as Error).message : r.status)).toEqual([inBlock, 'fulfilled']);
      expect(sent).toEqual(['', insertInner]);  // the first call's empty query, the second's INSERT: no START, COMMIT nor ROLLBACK
      expect(queries).toEqual([['', 0], [insertInner, 0]]);  // both listeners get the empty query with the first call's txnId
      expect(results).toEqual([['', 0], [insertInner, 0]]);
      expect(client.getTransactionStatus()).toBe('T');  // the caller's block is still open
      expect(await fdb.sql`SELECT note FROM ${'txn_probe'}`.run(client)).toEqual([{ note: 'g' }]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await notes()).toEqual([]);  // the caller's ROLLBACK undid g's write
  });

  it('with transactionRequiresIdleClient, queues no query behind its empty query: pg deprecates a query sent while another runs', async () => {
    const { fdb } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const client = await t.pool.connect();
    try {
      vi.spyOn(client, 'getTransactionStatus').mockReturnValueOnce('T');  // as pg reads it after a failed COMMIT
      const inFlight: number[] = [];  // for each query sent, how many of the client's were still unanswered
      let pending = 0;
      const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
      vi.spyOn(client, 'query').mockImplementation(((...args: unknown[]) => {
        inFlight.push(pending++);
        return query(...args).finally(() => { pending--; });
      }) as never);
      const busy = client.query('SELECT pg_sleep(0.05)');  // still running when transaction() is called, as a COMMIT whose error pg has passed on
      await fdb.readCommitted(client, c => fdb.sql`SELECT 1`.run(c));
      await busy;
      expect(inFlight).toEqual([0, 1, 0, 0, 0]);  // pg_sleep, then the empty query behind it, then START, SELECT and COMMIT one at a time
    } finally {
      client.release();
    }
  });

  // pg reads the status at ReadyForQuery, after the query's rejection: a BEGIN sent in one query string with a
  // statement that fails can leave it at the I read before that string (the empty query only reads again a T or E)
  it('limitation: a BEGIN sent in one query string with a statement that fails can be read as outside a block', async () => {
    const { fdb } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const client = await t.pool.connect();
    try {
      await client.query("BEGIN; INSERT INTO txn_probe VALUES ('outer'); SELECT 1/0").catch(() => { });
      vi.spyOn(client, 'getTransactionStatus').mockReturnValueOnce('I');  // as pg reads it in some runs (#233)
      const sent = spyQueries(client), notices = noticesOf(client);
      await expect(fdb.serializable(client, c => write(c, 'inner'))).rejects.toMatchObject({ code: '25P02' });
      expect(sent).toEqual([start.serializable, 'ROLLBACK']);  // no empty query, no refusal
      expect(client.getTransactionStatus()).toBe('I');  // its ROLLBACK ended the caller's block
      await client.query('ROLLBACK');
      expect(notices).toEqual(['25P01']);  // the caller's ROLLBACK found no transaction
    } finally {
      client.release();
    }
    expect(await notes()).toEqual([]);
  });

  // serializable too: the caller's block has run no query yet, so a query of the second call sent before the
  // first's START TRANSACTION would make Postgres refuse that START (25001)
  it.each(['readCommitted', 'serializable'] as const)('without transactionRequiresIdleClient, two %s() at the same moment on one client in a block: the second is passed through, as in 6.6.1', async level => {
    const { fdb } = await fresh();
    const queries: [string, number | undefined][] = [], results: [string, number | undefined][] = [];
    fdb.setConfig({
      queryListener: (q, txnId) => { queries.push([q.text, txnId]); },
      resultListener: (_r, txnId, _ms, q) => { results.push([q!.text, txnId]); },
    });
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      const insert = (c: db.Queryable, note: string) => fdb.sql`INSERT INTO ${'txn_probe'} (${'note'}) VALUES (${fdb.param(note)})`.run(c);
      await Promise.all([fdb[level](client, c => insert(c, 'f')), fdb[level](client, c => insert(c, 'g'))]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    // exactly what 6.6.1 sends: one transaction, the first call's, with no empty query
    const expected = [[start[level], 0], [insertInner, 0], [insertInner, 0], ['COMMIT', 0]];
    expect(queries).toEqual(expected);
    expect(results).toEqual(expected);
    expect(await notes()).toEqual(['f', 'g']);  // its COMMIT ended the caller's block
  });

  it('with transactionRequiresIdleClient, a transaction passed through is not refused', async () => {
    const { fdb } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    await fdb.serializable(t.pool, c => fdb.serializable(c, inner => write(inner, 'inner')));
    expect(await notes()).toEqual(['inner']);
  });

  it('reads the status again after a stale one: a T sends one empty query, then runs as in 6.6.1', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const client = await t.pool.connect();
    try {
      vi.spyOn(client, 'getTransactionStatus').mockReturnValueOnce('T');  // as pg reads it after a failed COMMIT
      const sent = spyQueries(client);
      await fdb.serializable(client, c => write(c, 'inner'));
      expect(sent).toEqual(['', start.serializable, insertInner, 'COMMIT']);
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['inner']);
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('limitation: without transactionRequiresIdleClient, a stale T (after a failed COMMIT) warns once outside a block, and runs as in 6.6.1', async () => {
    const { fdb, emitWarning } = await fresh();
    const client = await t.pool.connect();
    try {
      vi.spyOn(client, 'getTransactionStatus').mockReturnValueOnce('T');  // as pg reads it after a failed COMMIT
      const sent = spyQueries(client);
      await fdb.serializable(client, c => write(c, 'inner'));
      expect(sent).toEqual([start.serializable, insertInner, 'COMMIT']);  // no empty query to read it again
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['inner']);
    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(emitWarning.mock.calls[0][1]).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP005' });
  });

  // the first call goes on after its empty query, but the mark was set before it: the second call, passed
  // through, has its first query queued behind that empty query, so before the first call's START TRANSACTION
  it('limitation: with transactionRequiresIdleClient, after a stale T, a call at the same moment sends its first query outside any transaction, committed on its own', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    const client = await t.pool.connect();
    try {
      vi.spyOn(client, 'getTransactionStatus').mockReturnValueOnce('T');  // as pg reads it after a failed COMMIT
      const sent = spyQueries(client);
      const outcomes = await Promise.allSettled([
        fdb.readCommitted(client, async c => { await write(c, 'f'); throw new Error('f fails'); }),
        fdb.readCommitted(client, async c => { await write(c, 'g1'); await write(c, 'g2'); }),
      ]);
      expect(outcomes.map(r => r.status === 'rejected' ? (r.reason as Error).message : r.status)).toEqual(['f fails', 'fulfilled']);
      expect(sent.slice(0, 3)).toEqual(['', insertInner, start.readCommitted]);  // g1 before START TRANSACTION
      expect(sent.at(-1)).toBe('ROLLBACK');
      expect(client.getTransactionStatus()).toBe('I');
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['g1']);  // the ROLLBACK undid f and g2, not g1
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('with transactionRequiresIdleClient, after a failed COMMIT, neither refuses nor warns: the block is over', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresIdleClient: true });
    await t.pool.query('CREATE TABLE txn_parent (id int PRIMARY KEY); CREATE TABLE txn_child (parent_id int REFERENCES txn_parent DEFERRABLE INITIALLY DEFERRED)');
    const client = await t.pool.connect();
    try {
      for (let i = 0; i < 20; i++) {  // pg reads T at once after about one failed COMMIT in three (#233)
        await client.query('BEGIN');
        await client.query('INSERT INTO txn_child VALUES (1)');
        await expect(client.query('COMMIT')).rejects.toMatchObject({ code: '23503' });
        await fdb.serializable(client, c => write(c, `inner ${i}`));
      }
    } finally {
      client.release();
      await t.pool.query('DROP TABLE txn_child, txn_parent');
    }
    expect(await notes()).toHaveLength(20);
    expect(emitWarning).not.toHaveBeenCalled();
  });
});

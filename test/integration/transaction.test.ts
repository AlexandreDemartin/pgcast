// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/transaction.ts. transaction() runs START TRANSACTION
// then COMMIT, which would commit the harness's per-test transaction: these tests
// run on the file's pool (t.pool), write only to txn_probe, and empty it after
// each test. The per-test client (t.client) is used only inside its own BEGIN,
// by advisoryXactLock() (#724) and setLocal() (#738).
// Retries are provoked deterministically: the callback raises the SQLSTATE
// itself on its first attempts (a DO block with RAISE ... USING ERRCODE).

import pg from 'pg';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as db from '../../src/db';
import { sql, IsolationLevel } from '../../src/db';
import { resetConfig } from '../helpers/config';
import { useTestDatabase } from '../helpers/db';
import { satisfies } from '../helpers/isolation';

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

  // #501: Zapatos 6.6.1 rejected with "TypeError: code.startsWith is not a function"
  it.each([
    ['an array of five characters', ['4', '0', '0', '0', '1']],
    ['an object with a length of 5', { length: 5 }],
  ])('rolls back and rejects with the error of a callback whose code is %s', async (_, code) => {
    const thrown = { code };
    let attempts = 0;
    const outcome = await db.readCommitted(t.pool, async c => {
      attempts++;
      await write(c, 'rolled back');
      throw thrown;
    }).then(() => 'resolved', (error: unknown) => ({ error }));
    expect(outcome).toEqual({ error: thrown });
    expect(attempts).toBe(1);
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

// #725: transactionEventListener gets an event at each point where transactionListener gets a message, right after it,
// with the same numbers. Math.random is stubbed so that each retry delay differs from the one before: a second
// draw for the event would not match the message's
describe('transactionEventListener', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  type Logged = ['message', string, number | undefined] | ['event', db.TransactionEvent, number | undefined];

  /** Records the calls of both listeners, or of the event listener alone, in order; delays of 10ms, then 20ms… */
  const listenBoth = (which: 'both' | 'events' = 'both') => {
    const log: Logged[] = [];
    let draws = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => ++draws / 10);
    db.setConfig({
      transactionRetryDelay: { minMs: 0, maxMs: 100 },
      transactionEventListener: (event, txnId) => { log.push(['event', event, txnId]); },
    });
    if (which === 'both') db.setConfig({ transactionListener: (message, txnId) => { log.push(['message', message, txnId]); } });
    return log;
  };

  /** A serializable transaction whose attempt n raises fails[n - 1], if any; its outcome and attempts. */
  const attempt = async (fails: ('40001' | '40P01')[]) => {
    let attempts = 0;
    const outcome = await db.serializable(t.pool, async c => {
      const code = fails[attempts++];
      if (code) await raise(c, code);
      await write(c, `attempt ${attempts}`);
      return attempts;
    }).then(value => ({ value }), (error: unknown) => ({ code: (error as { code?: string }).code }));
    return { outcome, attempts };
  };

  /** The log with its one txnId, checked to be a number, written as 'txnId'. */
  const oneTxnId = (log: Logged[]) => {
    const txnId = log[0]?.[2];
    expect(typeof txnId).toBe('number');
    return log.map(([kind, value, id]) => [kind, value, id === txnId ? 'txnId' : id]);
  };

  const scenarios = [
    {
      name: 'on 40001 twice, then a commit', fails: ['40001', '40001'] as const, max: 5, outcome: { value: 3 },
      log: [
        ['message', 'Transaction rollback (code 40001) on attempt 1 of 5, retrying in 10ms', 'txnId'],
        ['event', { type: 'rollback', code: '40001', attempt: 1, maxAttempts: 5, delayMs: 10 }, 'txnId'],
        ['message', 'Retrying transaction, attempt 2 of 5', 'txnId'],
        ['event', { type: 'retry', attempt: 2, maxAttempts: 5 }, 'txnId'],
        ['message', 'Transaction rollback (code 40001) on attempt 2 of 5, retrying in 20ms', 'txnId'],
        ['event', { type: 'rollback', code: '40001', attempt: 2, maxAttempts: 5, delayMs: 20 }, 'txnId'],
        ['message', 'Retrying transaction, attempt 3 of 5', 'txnId'],
        ['event', { type: 'retry', attempt: 3, maxAttempts: 5 }, 'txnId'],
      ],
    },
    {
      name: 'on 40P01', fails: ['40P01'] as const, max: 5, outcome: { value: 2 },
      log: [
        ['message', 'Transaction rollback (code 40P01) on attempt 1 of 5, retrying in 10ms', 'txnId'],
        ['event', { type: 'rollback', code: '40P01', attempt: 1, maxAttempts: 5, delayMs: 10 }, 'txnId'],
        ['message', 'Retrying transaction, attempt 2 of 5', 'txnId'],
        ['event', { type: 'retry', attempt: 2, maxAttempts: 5 }, 'txnId'],
      ],
    },
    {
      name: 'on giving up after transactionAttemptsMax', fails: ['40001', '40001'] as const, max: 2, outcome: { code: '40001' },
      log: [
        ['message', 'Transaction rollback (code 40001) on attempt 1 of 2, retrying in 10ms', 'txnId'],
        ['event', { type: 'rollback', code: '40001', attempt: 1, maxAttempts: 2, delayMs: 10 }, 'txnId'],
        ['message', 'Retrying transaction, attempt 2 of 2', 'txnId'],
        ['event', { type: 'retry', attempt: 2, maxAttempts: 2 }, 'txnId'],
        ['message', 'Transaction rollback (code 40001) on attempt 2 of 2, giving up', 'txnId'],
        ['event', { type: 'giveUp', code: '40001', attempt: 2, maxAttempts: 2 }, 'txnId'],
      ],
    },
  ];

  it.each(scenarios)('$name, gets each event right after its message, with the same numbers and txnId', async ({ fails, max, outcome, log: expected }) => {
    const log = listenBoth();
    db.setConfig({ transactionAttemptsMax: max });
    expect(await attempt([...fails])).toEqual({ outcome, attempts: fails.length + ('value' in outcome ? 1 : 0) });
    expect(oneTxnId(log)).toStrictEqual(expected);
  });

  it.each(scenarios)('$name, set alone, gets the same events', async ({ fails, max, outcome, log: expected }) => {
    const log = listenBoth('events');
    db.setConfig({ transactionAttemptsMax: max });
    expect((await attempt([...fails])).outcome).toEqual(outcome);
    expect(oneTxnId(log)).toStrictEqual(expected.filter(([kind]) => kind === 'event'));
  });

  it('is not called on a first-attempt commit, nor on any other error', async () => {
    const log = listenBoth();
    expect(await attempt([])).toEqual({ outcome: { value: 1 }, attempts: 1 });
    const err = await db.serializable(t.pool, c => raise(c, '23505')).catch((e: unknown) => e);
    expect((err as { code: string }).code).toBe('23505');
    expect(log).toEqual([]);
  });

  it('is not called from a transaction passed through: an inner 40001 gives the outer transaction\'s events alone', async () => {
    const log = listenBoth();
    let attempts = 0;
    await db.serializable(t.pool, async c => {
      attempts++;
      await db.readCommitted(c, async inner => { if (attempts === 1) await raise(inner, '40001'); });
    });
    expect(attempts).toBe(2);
    expect(oneTxnId(log)).toStrictEqual(scenarios[0].log.slice(0, 4));
  });

  // a listener that throws: transaction() rejects with its error, as a throwing transactionListener makes it reject
  // at that point; at rollback and giveUp, inside the catch, after its ROLLBACK; at retry, inside the try, so it sends
  // ROLLBACK (outside any transaction, which Postgres answers with a warning) and rejects then
  const sent = {
    rollback: ['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'DO', 'ROLLBACK'],
    retry: ['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'DO', 'ROLLBACK', 'ROLLBACK'],
    giveUp: ['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'DO', 'ROLLBACK', 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'DO', 'ROLLBACK'],
  };
  const messageType = (message: string) => message.startsWith('Retrying') ? 'retry' : message.endsWith('giving up') ? 'giveUp' : 'rollback';

  it.each([
    ...(['rollback', 'retry', 'giveUp'] as const).map(point => ({ point, listener: 'transactionListener' as const })),
    ...(['rollback', 'retry', 'giveUp'] as const).map(point => ({ point, listener: 'transactionEventListener' as const })),
  ])('a $listener that throws at $point: rejects with its error, after the same queries, and releases its client', async ({ point, listener }) => {
    const thrown = new Error(`thrown at ${point}`);
    const queries: string[] = [];
    db.setConfig({
      transactionAttemptsMax: 2,
      transactionRetryDelay: { minMs: 0, maxMs: 0 },
      queryListener: q => { queries.push(q.text.startsWith('DO ') ? 'DO' : q.text); },
    });
    if (listener === 'transactionListener') db.setConfig({ transactionListener: message => { if (messageType(message) === point) throw thrown; } });
    else db.setConfig({ transactionEventListener: event => { if (event.type === point) throw thrown; } });
    const checkedOut = () => t.pool.totalCount - t.pool.idleCount;
    const before = checkedOut();
    let attempts = 0;
    const err = await db.serializable(t.pool, async c => { attempts++; await raise(c, '40001'); }).catch((e: unknown) => e);
    expect(err).toBe(thrown);
    expect(queries).toEqual(sent[point]);
    expect(attempts).toBe(point === 'giveUp' ? 2 : 1);
    expect(checkedOut()).toBe(before);
  });

  it.each(['transactionListener', 'transactionEventListener'] as const)('a %s that throws a 40001 at retry: the attempt is counted failed, and retried', async listener => {
    const log = listenBoth();
    const thrown = Object.assign(new Error('thrown at retry'), { code: '40001' });
    let throws = 1;
    if (listener === 'transactionListener') db.setConfig({ transactionListener: (message, txnId) => {
      log.push(['message', message, txnId]);
      if (messageType(message) === 'retry' && throws-- > 0) throw thrown;
    } });
    else db.setConfig({ transactionEventListener: (event, txnId) => {
      log.push(['event', event, txnId]);
      if (event.type === 'retry' && throws-- > 0) throw thrown;
    } });
    expect(await attempt(['40001'])).toEqual({ outcome: { value: 2 }, attempts: 2 });
    expect(oneTxnId(log)).toStrictEqual([
      ...scenarios[0].log.slice(0, listener === 'transactionListener' ? 3 : 4),
      ['message', 'Transaction rollback (code 40001) on attempt 2 of 5, retrying in 20ms', 'txnId'],
      ['event', { type: 'rollback', code: '40001', attempt: 2, maxAttempts: 5, delayMs: 20 }, 'txnId'],
      ['message', 'Retrying transaction, attempt 3 of 5', 'txnId'],
      ['event', { type: 'retry', attempt: 3, maxAttempts: 5 }, 'txnId'],
    ]);
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
    // a getter that throws: getConfig() gives the delay as it is (#257), and transaction() throws when it reads minMs
    class Delay { get minMs(): number { throw new Error('no delay'); } get maxMs() { return 0; } }
    db.setConfig({ transactionRetryDelay: new Delay() });
    const { error, leaked } = await leakCheck(() => db.readCommitted(t.pool, async () => 'never'));
    expect(leaked).toBe(0);
    expect((error as Error).message).toBe('no delay');
  });

  it('clears _zapatos from a plain client when reading the config throws', async () => {
    // a client of the caller's, not the pool's: nothing to release, but a _zapatos left on it would make the
    // next transaction() pass it through, its callback run outside any transaction
    class Delay { get minMs(): number { throw new Error('no delay'); } get maxMs() { return 0; } }
    db.setConfig({ transactionRetryDelay: new Delay() });
    const client = new pg.Client({ connectionString: (t.pool as unknown as { options: { connectionString: string } }).options.connectionString });
    await client.connect();
    try {
      const error = await db.readCommitted(client, async () => 'never').catch((e: unknown) => e);
      expect((error as Error).message).toBe('no delay');
      expect(Object.prototype.hasOwnProperty.call(client, '_zapatos')).toBe(false);
      resetConfig();
      expect(await db.readCommitted(client, async c => c.getTransactionStatus())).toBe('T');  // its own transaction
    } finally {
      await client.end();
    }
  });

  // #257: as in Zapatos 6.6.1, a delay whose getter throws makes transaction() throw, not a query run on its own
  it.each([
    ['throws', () => { throw new Error('no delay'); }],
    ['starts throwing after setConfig()', (calls: number) => { if (calls > 1) throw new Error('no delay'); return 1; }],
  ])('runs a query outside transaction() when a getter of transactionRetryDelay %s', async (_, minMs: (calls: number) => number) => {
    let calls = 0;
    class Delay { get minMs() { return minMs(++calls); } get maxMs() { return 2; } }
    db.setConfig({ transactionRetryDelay: new Delay() });
    expect(await sql`SELECT 1 AS one`.run(t.pool)).toEqual([{ one: 1 }]);
    await write(t.pool, 'written');
    expect(await notes()).toEqual(['written']);
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
  ])('keeps the attempts of a transactionAttemptsMax of $max, and counts them in its messages and events', async ({ max, attempts }) => {
    const { messages } = listen();
    const events: db.TransactionEvent[] = [];
    db.setConfig({ transactionAttemptsMax: max as number, transactionEventListener: event => { events.push(event); } });
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
    expect(events).toStrictEqual([
      ...Array.from({ length: attempts - 1 }, (_, i) => [
        { type: 'rollback', code: '40001', attempt: i + 1, maxAttempts: attempts, delayMs: 0 },
        { type: 'retry', attempt: i + 2, maxAttempts: attempts },
      ]).flat(),
      { type: 'giveUp', code: '40001', attempt: attempts, maxAttempts: attempts },
    ]);
  });

  // #179: Zapatos 6.6.1 converted transactionAttemptsMax only to compare it after a 40001 / 40P01, so a value
  // whose conversion throws let a callback that succeeds resolve; after a 40001, the comparison threw (replayed)
  describe.each([
    { name: 'a Symbol', max: Symbol('attempts'), message: 'Cannot convert a Symbol value to a number' },
    { name: 'an object with no prototype', max: Object.create(null) as object, message: 'Cannot convert object to primitive value' },
    { name: 'an object whose valueOf throws', max: { valueOf() { throw new Error('no number here'); } }, message: 'no number here' },
  ])('with a transactionAttemptsMax of $name, from JavaScript', ({ max, message }) => {
    it('commits a callback that succeeds, after one attempt, as Zapatos 6.6.1 does', async () => {
      const { messages } = listen();
      db.setConfig({ transactionAttemptsMax: max as unknown as number });
      let made = 0;
      const { value, error, leaked } = await leakCheck(() => db.serializable(t.pool, async c => {
        made++;
        await write(c, 'committed');
        return 'done';
      }));
      expect(error).toBeUndefined();
      expect(value).toBe('done');
      expect(made).toBe(1);
      expect(leaked).toBe(0);
      expect(messages).toEqual([]);
      expect(await notes()).toEqual(['committed']);
    });

    it('rejects with the conversion\'s error after a 40001, as Zapatos 6.6.1 does, and releases its client', async () => {
      const { messages } = listen();
      db.setConfig({ transactionAttemptsMax: max as unknown as number });
      let made = 0;
      const { error, leaked } = await leakCheck(() => db.serializable(t.pool, async c => {
        made++;
        await raise(c, '40001');
      }));
      expect((error as Error).message).toBe(message);
      expect(made).toBe(1);
      expect(leaked).toBe(0);
      expect(messages).toEqual([]);
    });
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

  const inBlock = 'transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()';

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

// #177: given the client of a transaction already open, transaction() passes it through, whatever the level asked:
// its callback runs at the outer transaction's level, as Postgres can't change the isolation level once the transaction's first query has run
describe('the client of a transaction at another level', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** A fresh module, so that warnOnce has not warned yet, and a spy on process.emitWarning. */
  const fresh = async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const fdb = await import('../../src/db');
    return { fdb, emitWarning };
  };

  const
    { Serializable: S, RepeatableRead: RR, ReadCommitted: RC, SerializableRO: SRO, RepeatableReadRO: RRRO,
      ReadCommittedRO: RCRO, SerializableRODeferrable: SROD } = IsolationLevel,
    // what Postgres reports inside a transaction at each level
    settingsAt: Record<IsolationLevel, string> = {
      [S]: 'serializable off off', [RR]: 'repeatable read off off', [RC]: 'read committed off off',
      [SRO]: 'serializable on off', [RRRO]: 'repeatable read on off', [RCRO]: 'read committed on off',
      [SROD]: 'serializable on on',
    },
    levels = Object.values(IsolationLevel),
    pairs = levels.flatMap(outer => levels.map(inner => [outer, inner] as const)),
    settingsSQL = `SELECT concat_ws(' ', current_setting('transaction_isolation'), current_setting('transaction_read_only'), current_setting('transaction_deferrable')) AS s`,
    refused = (outer: IsolationLevel, inner: IsolationLevel) => `transaction() at ${inner} was given the client of a transaction at ${outer}, so its callback would run at ${outer}: open the outer transaction at a level that satisfies ${inner} (IsolationSatisfying)`;

  it('the levels whose client satisfies another: 25 of the 49 pairs do not', () => {
    expect(pairs).toHaveLength(49);
    expect(pairs.filter(([outer, inner]) => !satisfies(outer, inner))).toHaveLength(25);
    // SERIALIZABLE, READ ONLY, DEFERRABLE gives every guarantee of the three read-only levels, which IsolationSatisfying leaves it out of
    expect([SRO, RRRO, RCRO].every(inner => satisfies(SROD, inner))).toBe(true);
  });

  /** transaction(pool, outer, c => transaction(c, inner, …)): what the inner callback sees, and the queries sent. */
  const nest = async (fdb: typeof db, outer: IsolationLevel, inner: IsolationLevel) => {
    const queries: string[] = [];
    let called = false;
    fdb.setConfig({ queryListener: q => queries.push(q.text) });
    const result = await fdb.transaction(t.pool, outer, c => fdb.transaction(c, inner, async c2 => {
      called = true;
      expect(c2).toBe(c);
      return (await fdb.sql<db.SQL, [{ s: string }]>`${fdb.raw(settingsSQL)}`.run(c2))[0].s;  // this module's sql, so its queryListener sees it
    })).catch((e: Error) => e);
    return { result, queries, called };
  };

  it.each(pairs)('without transactionRequiresSatisfyingLevel (deprecated, PGCAST_DEP007), %s then %s: runs at the outer level, as in Zapatos 6.6.1, and warns only when that level does not satisfy the inner one', async (outer, inner) => {
    const { fdb, emitWarning } = await fresh();
    const { result, queries, called } = await nest(fdb, outer, inner);
    expect(called).toBe(true);
    expect(result).toBe(settingsAt[outer]);
    expect(queries).toEqual([`START TRANSACTION ISOLATION LEVEL ${outer}`, settingsSQL, 'COMMIT']);
    if (satisfies(outer, inner)) expect(emitWarning).not.toHaveBeenCalled();
    else {
      expect(emitWarning).toHaveBeenCalledTimes(1);
      expect(emitWarning.mock.calls[0][1]).toEqual({ type: 'DeprecationWarning', code: 'PGCAST_DEP007' });
    }
  });

  it.each(pairs)('with transactionRequiresSatisfyingLevel, %s then %s: rejects before the callback when the outer level does not satisfy the inner one, and the outer transaction rolls back', async (outer, inner) => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresSatisfyingLevel: true });
    const { result, queries, called } = await nest(fdb, outer, inner);
    if (satisfies(outer, inner)) {
      expect(called).toBe(true);
      expect(result).toBe(settingsAt[outer]);
      expect(queries).toEqual([`START TRANSACTION ISOLATION LEVEL ${outer}`, settingsSQL, 'COMMIT']);
    } else {
      expect(called).toBe(false);
      expect(result).toEqual(new Error(refused(outer, inner)));
      expect(queries).toEqual([`START TRANSACTION ISOLATION LEVEL ${outer}`, 'ROLLBACK']);
    }
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('without the option, warns once per process, naming the option', async () => {
    const { fdb, emitWarning } = await fresh();
    await fdb.readCommitted(t.pool, rc => fdb.serializable(rc, c => write(c, 'first')));
    await fdb.readCommittedRO(t.pool, ro => fdb.repeatableReadRO(ro, async () => 'second'));
    expect(await notes()).toEqual(['first']);
    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(emitWarning.mock.calls[0]).toEqual([
      'transaction() at SERIALIZABLE was given the client of a transaction at READ COMMITTED, so its callback runs at READ COMMITTED. Set transactionRequiresSatisfyingLevel: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.',
      { type: 'DeprecationWarning', code: 'PGCAST_DEP007' },
    ]);
  });

  it('reads an undefined transactionRequiresSatisfyingLevel as its default (false): runs and warns', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig(undefinedKey('transactionRequiresSatisfyingLevel'));
    expect(await fdb.readCommitted(t.pool, rc => fdb.serializable(rc, async () => 'ran'))).toBe('ran');
    expect(emitWarning).toHaveBeenCalledTimes(1);
  });

  it('with the option, the issue\'s readCommitted(pool, rc => serializable(rc, …)) rejects, and nothing is saved', async () => {
    const { fdb } = await fresh();
    fdb.setConfig({ transactionRequiresSatisfyingLevel: true });
    await expect(fdb.readCommitted(t.pool, async rc => {
      await write(rc, 'outer');
      await fdb.serializable(rc, c => write(c, 'inner'));
    })).rejects.toThrow(refused(RC, S));
    expect(await notes()).toEqual([]);
  });

  it.each([false, true])('a level the table doesn\'t know, a string from JavaScript, is passed through, as in Zapatos 6.6.1 (option %s)', async on => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresSatisfyingLevel: on });
    for (const level of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'serializable', 'READ UNCOMMITTED']) {
      expect(await fdb.serializable(t.pool, c => fdb.transaction(c, level as IsolationLevel, async () => 'ran'))).toBe('ran');
      expect(await fdb.readCommitted(t.pool, c => fdb.transaction(c, level as IsolationLevel, async () => 'ran'))).toBe('ran');
    }
    expect(emitWarning).not.toHaveBeenCalled();
  });

  it('with the option, a pool, a plain client and a client kept after its transaction ended are not passed through, nor refused', async () => {
    const { fdb, emitWarning } = await fresh();
    fdb.setConfig({ transactionRequiresSatisfyingLevel: true });
    const level = (c: db.Queryable) => sql<db.SQL, [{ s: string }]>`${db.raw(settingsSQL)}`.run(c).then(r => r[0].s);
    expect(await fdb.serializable(t.pool, level)).toBe(settingsAt[S]);
    const client = await t.pool.connect();
    try {
      let kept: db.TxnClientForReadCommitted | undefined;
      expect(await fdb.readCommitted(client, async c => { kept = c; return level(c); })).toBe(settingsAt[RC]);
      expect(Object.prototype.hasOwnProperty.call(kept, '_zapatos')).toBe(false);
      expect(await fdb.serializable(kept!, level)).toBe(settingsAt[S]);  // its own transaction
    } finally {
      client.release();
    }
    expect(emitWarning).not.toHaveBeenCalled();
  });
});

describe('savepoint() (#723)', () => {
  const failed = new Error('the unit of work failed');
  /** Writes a note in a savepoint, then rejects with `failed`; resolves once the savepoint has rejected. */
  const writeThenFail = (c: db.TxnClientForSerializable, note: string) =>
    db.savepoint(c, async sp => { await write(sp, note); throw failed; }).catch((err: unknown) => { expect(err).toBe(failed); });

  it('keeps the rows of a callback that resolves, undoes those of one that rejects, and the outer transaction commits', async () => {
    const result = await db.serializable(t.pool, async c => {
      await write(c, 'a outer');
      const kept = await db.savepoint(c, async sp => { await write(sp, 'b kept'); return 'kept'; });
      await writeThenFail(c, 'c undone');
      await write(c, 'd outer');
      return kept;
    });
    expect(result).toBe('kept');
    expect(await notes()).toEqual(['a outer', 'b kept', 'd outer']);
  });

  it('three levels nested: each failure undoes only its own level', async () => {
    await db.serializable(t.pool, async c => {
      await write(c, '1');
      await db.savepoint(c, async level1 => {
        await write(level1, '2');
        await db.savepoint(level1, async level2 => {
          await write(level2, '3');
          await writeThenFail(level2, '4 undone');
          await write(level2, '5');
        });
        await db.savepoint(level1, async level2 => {
          await write(level2, '6 undone');
          await db.savepoint(level2, level3 => write(level3, '7 undone'));
          throw failed;
        }).catch(() => undefined);
        await write(level1, '8');
      });
      await db.savepoint(c, async level1 => {
        await write(level1, '9 undone');
        await db.savepoint(level1, level2 => write(level2, '9 undone too'));
        await writeThenFail(level1, '10 undone');  // level1's ROLLBACK TO undoes 9 as well
        throw failed;
      }).catch(() => undefined);
    });
    expect(await notes()).toEqual(['1', '2', '3', '5', '8']);
  });

  it.each(['40001', '40P01'] as const)('inside serializable(), a %s raised in the savepoint retries the whole callback, only the last attempt committed', async code => {
    const { messages, txnIds } = listen();
    let attempts = 0, savepointRuns = 0;
    const result = await db.serializable(t.pool, async c => {
      attempts++;
      await write(c, `outer ${attempts}`);
      return db.savepoint(c, async sp => {
        savepointRuns++;
        await write(sp, `savepoint ${attempts}`);
        if (attempts < 3) await raise(sp, code);
        return attempts;
      });
    });
    expect(result).toBe(3);
    expect(savepointRuns).toBe(3);  // once per attempt
    expect(await notes()).toEqual(['outer 3', 'savepoint 3']);
    expect(messages).toEqual([
      `Transaction rollback (code ${code}) on attempt 1 of 5, retrying in 0ms`,
      'Retrying transaction, attempt 2 of 5',
      `Transaction rollback (code ${code}) on attempt 2 of 5, retrying in 0ms`,
      'Retrying transaction, attempt 3 of 5',
    ]);
    expect(txnIds.size).toBe(1);
  });

  it('names each savepoint by its depth: a 40001 two deep, retried, starts again at 1 on the next attempt', async () => {
    const { messages } = listen();
    const names: string[] = [];
    db.setConfig({ queryListener: q => { if (q.text.startsWith('SAVEPOINT ')) names.push(q.text); } });
    let attempts = 0;
    await db.serializable(t.pool, async c => {
      attempts++;
      await db.savepoint(c, outer => db.savepoint(outer, async inner => { if (attempts < 2) await raise(inner, '40001'); }));
      await db.savepoint(c, async () => undefined);
    });
    expect(messages).toHaveLength(2);
    expect(names).toEqual([
      'SAVEPOINT pgcast_savepoint_1', 'SAVEPOINT pgcast_savepoint_2',
      'SAVEPOINT pgcast_savepoint_1', 'SAVEPOINT pgcast_savepoint_2', 'SAVEPOINT pgcast_savepoint_1',
    ]);
  });

  it('a callback that swallows a query error: rejects with 25P02 after ROLLBACK TO, and the outer transaction commits its own rows', async () => {
    const queries: string[] = [];
    db.setConfig({ transactionRequiresCommit: true, queryListener: q => queries.push(q.text) });
    const result = await db.serializable(t.pool, async c => {
      await write(c, 'outer');
      const err = await db.savepoint(c, async sp => {
        await write(sp, 'undone');
        await raise(sp, '23505').catch(() => undefined);
        return 'swallowed';
      }).catch((e: unknown) => e);
      expect(db.isDatabaseError(err, 'InvalidTransactionState_InFailedSqlTransaction')).toBe(true);
      await write(c, 'after');
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(await notes()).toEqual(['after', 'outer']);
    expect(queries.slice(2, 8)).toEqual([
      'SAVEPOINT pgcast_savepoint_1', 'INSERT INTO "txn_probe" ("note") VALUES ($1)', expect.stringMatching(/^DO /),
      'RELEASE SAVEPOINT pgcast_savepoint_1', 'ROLLBACK TO SAVEPOINT pgcast_savepoint_1', 'RELEASE SAVEPOINT pgcast_savepoint_1',
    ]);
  });

  it('a callback that swallows a 40001 loses the retry: the savepoint rejects with 25P02, which is not retried', async () => {
    const { messages } = listen();
    let attempts = 0;
    const err = await db.serializable(t.pool, async c => {
      attempts++;
      await write(c, 'lost');
      return db.savepoint(c, async sp => { await raise(sp, '40001').catch(() => undefined); });
    }).catch((e: unknown) => e);
    expect(db.isDatabaseError(err, 'InvalidTransactionState_InFailedSqlTransaction')).toBe(true);
    expect(attempts).toBe(1);
    expect(messages).toEqual([]);
    expect(await notes()).toEqual([]);
  });

  it('outside a transaction block: rejects with 25P01, and never calls the callback', async () => {
    const client = await t.pool.connect();
    try {
      const callback = vi.fn(async () => 'never');
      const err = await db.savepoint(client, callback).catch((e: unknown) => e);
      expect(db.isDatabaseError(err, 'InvalidTransactionState_NoActiveSqlTransaction')).toBe(true);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      client.release();
    }
  });

  it.each(['40001', '40P01'] as const)('never retries on its own: in a raw BEGIN, a %s runs the callback once and leaves the transaction aborted', async code => {
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      let runs = 0;
      const err = await db.savepoint(client, async sp => { runs++; await raise(sp, code); }).catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe(code);
      expect(runs).toBe(1);
      expect((await client.query('COMMIT')).command).toBe('ROLLBACK');  // a caught 40001 or 40P01 cannot commit
    } finally {
      client.release();
    }
  });

  it('gives the callback the same client, its _zapatos and txnId unchanged, and its queries carry that txnId', async () => {
    const seen: [string, number | undefined][] = [];
    const messages: string[] = [];
    db.setConfig({ queryListener: (q, txnId) => seen.push([q.text, txnId]), transactionListener: m => messages.push(m) });
    await db.serializable(t.pool, async c => {
      const mark = c._zapatos;
      await db.savepoint(c, async sp => {
        expect(sp).toBe(c);
        expect(sp._zapatos).toBe(mark);
        await write(sp, 'x');
      });
      expect(c._zapatos).toBe(mark);
      expect(c._zapatos).toEqual({ isolationLevel: IsolationLevel.Serializable, txnId: seen[0][1] });
    });
    const txnId = seen[0][1];
    expect(seen.map(([, id]) => id)).toEqual(seen.map(() => txnId));
    expect(seen.map(([text]) => text)).toEqual([
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SAVEPOINT pgcast_savepoint_1', 'INSERT INTO "txn_probe" ("note") VALUES ($1)',
      'RELEASE SAVEPOINT pgcast_savepoint_1', 'COMMIT',
    ]);
    expect(messages).toEqual([]);  // transactionListener gets nothing from a savepoint
  });

  it('a transaction() nested in the savepoint passes through', async () => {
    const queries: string[] = [];
    db.setConfig({ queryListener: q => queries.push(q.text) });
    await db.serializable(t.pool, c => db.savepoint(c, sp => db.serializable(sp, async inner => {
      expect(inner).toBe(c);
      await write(inner, 'inner');
    })));
    expect(queries).toEqual([
      'START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SAVEPOINT pgcast_savepoint_1', 'INSERT INTO "txn_probe" ("note") VALUES ($1)',
      'RELEASE SAVEPOINT pgcast_savepoint_1', 'COMMIT',
    ]);
    expect(await notes()).toEqual(['inner']);
  });

  it('with transactionRequiresCommit, an error caught around savepoint() commits the rest', async () => {
    db.setConfig({ transactionRequiresCommit: true });
    const result = await db.serializable(t.pool, async c => {
      await write(c, 'kept');
      await db.savepoint(c, async sp => { await write(sp, 'duplicate'); await raise(sp, '23505'); }).catch((err: unknown) => {
        if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;
      });
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(await notes()).toEqual(['kept']);
  });

  /**
   * How many of the savepoints `names` are still established: each `RELEASE` tried in a savepoint of its own, rolled
   * back to on 3B001, the innermost name first, as releasing an outer one releases those inside it.
   */
  const established = async (c: db.TxnClientForSerializable, names: string[]) => {
    let count = 0;
    for (const name of [...new Set(names)].reverse()) for (;;) {
      await c.query('SAVEPOINT count_probe');
      const released = await c.query(`RELEASE SAVEPOINT ${name}`).then(() => true, (err: { code?: string }) => {
        expect(err.code).toBe('3B001');
        return false;
      });
      if (!released) {
        await c.query('ROLLBACK TO SAVEPOINT count_probe');
        await c.query('RELEASE SAVEPOINT count_probe');
        break;
      }
      count++;  // that RELEASE released count_probe too
    }
    return count;
  };

  it.each(['returns', 'rethrows'] as const)('a Postgres 40001 caught by the outer savepoint\'s callback, which %s: the outer work is undone, and no savepoint is left established', async how => {
    const names: string[] = [];
    db.setConfig({ transactionRequiresCommit: true, queryListener: q => { const [, name] = /^SAVEPOINT (\S+)$/.exec(q.text) ?? []; if (name) names.push(name); } });
    const wrapped = new Error('wrapped');
    let attempts = 0, left: number | undefined;
    await db.serializable(t.pool, async c => {
      attempts++;
      await write(c, 'base');
      const err = await db.savepoint(c, async outer => {
        await write(outer, 'outer work');
        await db.savepoint(outer, inner => raise(inner, '40001')).catch(() => { if (how === 'rethrows') throw wrapped; });
      }).catch((e: unknown) => e);
      if (how === 'rethrows') expect(err).toBe(wrapped);
      else expect(db.isDatabaseError(err, 'InvalidTransactionState_InFailedSqlTransaction')).toBe(true);
      await write(c, 'after');
      left = await established(c, names);
    });
    expect(await notes()).toEqual(['after', 'base']);
    expect(names).toEqual(['pgcast_savepoint_1', 'pgcast_savepoint_2']);
    expect(left).toBe(0);
    expect(attempts).toBe(1);  // the 40001 was caught: no retry
  });

  describe('a real conflict, caught in the callback, which returns (not raise())', () => {
    /** Runs `fn` with two clients of the pool, then `ROLLBACK` on each, a no-op once committed: c2 first, whose locks c1 may wait for. */
    const twoClients = async <T>(fn: (c1: pg.PoolClient, c2: pg.PoolClient) => Promise<T>) => {
      const c1 = await t.pool.connect(), c2 = await t.pool.connect();
      try { return await fn(c1, c2); }
      finally {
        for (const c of [c2, c1]) { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
      }
    };
    /** A savepoint whose callback writes `note`, catches that write's error, notes its code, and returns. */
    const swallowing = (c: pg.PoolClient | db.TxnClientForSerializable, steps: string[], query: string, values: string[]) =>
      db.savepoint(c, async sp => { await sp.query(query, values).catch((e: { code?: string }) => { steps.push(`in the callback ${e.code}`); }); })
        .then(() => 'savepoint resolves', (e: { code?: string }) => `savepoint rejects ${e.code}`);
    /** The write skew of two SERIALIZABLE transactions: each reads a note, then the first inserts and commits. */
    const skew = async (c1: pg.PoolClient, c2: db.Queryable) => {
      await c1.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await c1.query(`SELECT note FROM txn_probe WHERE note = 'read by 1'`);
      await c2.query(`SELECT note FROM txn_probe WHERE note = 'read by 2'`);
      await c2.query(`INSERT INTO txn_probe (note) VALUES ('outside')`);
      await c1.query(`INSERT INTO txn_probe (note) VALUES ('other')`);
      await c1.query('COMMIT');
    };

    it('SERIALIZABLE, a write skew: 40001 in the savepoint, then Postgres refuses the COMMIT with 40001, and the write outside it is not saved', async () => {
      const steps: string[] = [];
      await twoClients(async (c1, c2) => {
        await c2.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await skew(c1, c2);
        steps.push(await swallowing(c2, steps, 'INSERT INTO txn_probe (note) VALUES ($1)', ['inside']));
        steps.push(await c2.query('COMMIT').then(r => `COMMIT ${r.command}`, (e: { code?: string }) => `COMMIT rejects ${e.code}`));
      });
      expect(steps).toEqual(['in the callback 40001', 'savepoint rejects 25P02', 'COMMIT rejects 40001']);
      expect(await notes()).toEqual(['other']);
    });

    it('inside serializable(), the same write skew: transaction() retries on the COMMIT\'s 40001, and the next attempt commits', async () => {
      const { messages } = listen();
      const steps: string[] = [];
      let attempts = 0;
      const result = await twoClients(c1 => db.serializable(t.pool, async c2 => {
        attempts++;
        if (attempts === 1) await skew(c1, c2);
        else await write(c2, 'outside');
        steps.push(await swallowing(c2, steps, 'INSERT INTO txn_probe (note) VALUES ($1)', ['inside']));
        return attempts;
      }));
      expect(result).toBe(2);
      expect(steps).toEqual(['in the callback 40001', 'savepoint rejects 25P02', 'savepoint resolves']);
      expect(messages).toEqual(['Transaction rollback (code 40001) on attempt 1 of 5, retrying in 0ms', 'Retrying transaction, attempt 2 of 5']);
      expect(await notes()).toEqual(['inside', 'other', 'outside']);
    });

    it('REPEATABLE READ, a concurrent update: 40001 in the savepoint, and the COMMIT saves the write outside it', async () => {
      await write(t.pool, 'seed');
      const steps: string[] = [];
      await twoClients(async (c1, c2) => {
        await c2.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        await c2.query('SELECT note FROM txn_probe');
        await c2.query(`INSERT INTO txn_probe (note) VALUES ('outside')`);
        await c1.query(`UPDATE txn_probe SET note = 'updated by 1' WHERE note = 'seed'`);
        steps.push(await swallowing(c2, steps, `UPDATE txn_probe SET note = $1 WHERE note = 'seed'`, ['updated by 2']));
        steps.push(await c2.query('COMMIT').then(r => `COMMIT ${r.command}`, (e: { code?: string }) => `COMMIT rejects ${e.code}`));
      });
      expect(steps).toEqual(['in the callback 40001', 'savepoint rejects 25P02', 'COMMIT COMMIT']);
      expect(await notes()).toEqual(['outside', 'updated by 1']);
    });

    it('a deadlock: 40P01 in the savepoint, and the COMMIT saves the write outside it', async () => {
      await write(t.pool, 'a');
      await write(t.pool, 'b');
      const steps: string[] = [];
      await twoClients(async (c1, c2) => {
        await c1.query('BEGIN');
        await c2.query('BEGIN');
        await c1.query(`SET LOCAL deadlock_timeout = '10s'`);
        await c2.query(`SET LOCAL deadlock_timeout = '10ms'`);  // c2 finds the deadlock, and is the one that fails
        await c2.query(`UPDATE txn_probe SET note = 'a by 2' WHERE note = 'a'`);
        await c1.query(`UPDATE txn_probe SET note = 'b by 1' WHERE note = 'b'`);
        const waiting = c1.query(`UPDATE txn_probe SET note = 'a by 1' WHERE note = 'a'`).then(() => undefined, (e: unknown) => e);  // waits for c2's lock
        steps.push(await swallowing(c2, steps, `UPDATE txn_probe SET note = $1 WHERE note = 'b'`, ['b by 2']));
        steps.push(await c2.query('COMMIT').then(r => `COMMIT ${r.command}`, (e: { code?: string }) => `COMMIT rejects ${e.code}`));
        expect(await waiting).toBeUndefined();
        await c1.query('COMMIT');
      });
      expect(steps).toEqual(['in the callback 40P01', 'savepoint rejects 25P02', 'COMMIT COMMIT']);
      expect(await notes()).toEqual(['a by 2', 'b by 1']);
    });
  });

  describe('limitation: two at once on one client, nested in the order they are called', () => {
    /** Starts two savepoints at once on a raw BEGIN, each writing its note then waiting; `order` ends them; then COMMIT. */
    const twoAtOnce = async (order: (ends: { first(): Promise<unknown>; second(fail?: boolean): Promise<unknown> }) => Promise<void>) => {
      const queries: string[] = [];
      db.setConfig({ queryListener: q => { if (/SAVEPOINT/.test(q.text)) queries.push(q.text); } });
      const client = await t.pool.connect();
      try {
        await client.query('BEGIN');
        const gate = () => { let open!: () => void; return { wait: new Promise<void>(r => { open = r; }), open: () => open() }; };
        const [g1, g2] = [gate(), gate()];
        let failSecond = false;
        const first = db.savepoint(client, async sp => { await write(sp, 'first'); await g1.wait; }).then(() => 'resolves', (e: { code?: string }) => e.code);
        const second = db.savepoint(client, async sp => { await write(sp, 'second'); await g2.wait; if (failSecond) throw failed; })
          .then(() => 'resolves', (e: { code?: string }) => e.code ?? (e === failed ? 'failed' : e));
        const results: unknown[] = [];
        await order({
          first: async () => { g1.open(); results.push(await first); },
          second: async (fail = false) => { failSecond = fail; g2.open(); results.push(await second); },
        });
        results.push((await client.query('COMMIT')).command);
        await client.query('BEGIN');
        await db.savepoint(client, async () => undefined);  // back at depth 1 on that client, whichever order they ended in
        await client.query('ROLLBACK');
        return { results, queries, committed: await notes() };
      } finally {
        client.release();
      }
    };

    it('the first, if it ends first, ends the second\'s savepoint: its RELEASE fails (3B001), and the transaction is aborted', async () => {
      expect(await twoAtOnce(async ends => { await ends.first(); await ends.second(); })).toEqual({
        results: ['resolves', '3B001', 'ROLLBACK'],
        queries: [
          'SAVEPOINT pgcast_savepoint_1', 'SAVEPOINT pgcast_savepoint_2', 'RELEASE SAVEPOINT pgcast_savepoint_1',
          'RELEASE SAVEPOINT pgcast_savepoint_2', 'ROLLBACK TO SAVEPOINT pgcast_savepoint_2',
          'SAVEPOINT pgcast_savepoint_1', 'RELEASE SAVEPOINT pgcast_savepoint_1',
        ],
        committed: [],
      });
    });

    it('the second, if it ends first, resolves on its own, and COMMIT saves both', async () => {
      expect(await twoAtOnce(async ends => { await ends.second(); await ends.first(); })).toEqual({
        results: ['resolves', 'resolves', 'COMMIT'],
        queries: [
          'SAVEPOINT pgcast_savepoint_1', 'SAVEPOINT pgcast_savepoint_2', 'RELEASE SAVEPOINT pgcast_savepoint_2', 'RELEASE SAVEPOINT pgcast_savepoint_1',
          'SAVEPOINT pgcast_savepoint_1', 'RELEASE SAVEPOINT pgcast_savepoint_1',
        ],
        committed: ['first', 'second'],
      });
    });

    it('a ROLLBACK TO of the second also undoes what the first wrote after the second\'s SAVEPOINT, though the first resolves', async () => {
      expect(await twoAtOnce(async ends => { await ends.second(true); await ends.first(); })).toEqual({
        results: ['failed', 'resolves', 'COMMIT'],
        queries: [
          'SAVEPOINT pgcast_savepoint_1', 'SAVEPOINT pgcast_savepoint_2', 'ROLLBACK TO SAVEPOINT pgcast_savepoint_2',
          'RELEASE SAVEPOINT pgcast_savepoint_2', 'RELEASE SAVEPOINT pgcast_savepoint_1',
          'SAVEPOINT pgcast_savepoint_1', 'RELEASE SAVEPOINT pgcast_savepoint_1',
        ],
        committed: [],
      });
    });
  });

  it('limitation: a 40001 thrown from JavaScript, caught, leaves the work of its savepoint in, unless an outer level rolls back', async () => {
    const notFromPostgres = Object.assign(new Error('not from Postgres'), { code: '40001' });
    const throwsIt = (c: db.TxnClientForSerializable, note: string) =>
      db.savepoint(c, async sp => { await write(sp, note); throw notFromPostgres; }).catch(() => undefined);
    await db.serializable(t.pool, async c => {
      await throwsIt(c, 'kept');
      await db.savepoint(c, async outer => {
        await throwsIt(outer, 'kept too');
      });
      await db.savepoint(c, async outer => {
        await throwsIt(outer, 'undone');
        throw failed;
      }).catch(() => undefined);
    });
    expect(await notes()).toEqual(['kept', 'kept too']);
  });

  it('limitation: a Proxy of the client counts from 1 again: a 40001 of the inner savepoint, caught one level up, leaves the outer work in', async () => {
    const names: string[] = [];
    db.setConfig({ queryListener: q => { const [, name] = /^SAVEPOINT (\S+)$/.exec(q.text) ?? []; if (name) names.push(name); } });
    let attempts = 0;
    await db.serializable(t.pool, async c => {
      attempts++;
      await write(c, 'base');
      const err = await db.savepoint(c, async outer => {
        await write(outer, 'outer work');
        await db.savepoint(new Proxy(outer, {}), inner => raise(inner, '40001')).catch(() => undefined);
      }).catch((e: unknown) => e);
      expect(db.isDatabaseError(err, 'InvalidTransactionState_InFailedSqlTransaction')).toBe(true);
      await write(c, 'after');
    });
    expect(names).toEqual(['pgcast_savepoint_1', 'pgcast_savepoint_1']);  // the outer one's ROLLBACK TO goes back to the inner one
    expect(await notes()).toEqual(['after', 'base', 'outer work']);
    expect(attempts).toBe(1);
  });
});

// #724: the lock advisoryXactLock() takes, as a second connection reads it in pg_locks, and when Postgres releases it
describe('advisoryXactLock()', () => {
  type Key = bigint | readonly [number, number];

  /** The advisory locks held in this file's database, read on another connection. */
  const advisoryLocks = async () => (await t.pool.query(
    "SELECT classid, objid, objsubid FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) ORDER BY classid, objid, objsubid",
  )).rows;

  /** Whether another connection gets the lock, which it then releases at once (it runs outside a block). */
  const othersGet = async (key: Key) => (await (typeof key === 'bigint' ?
    t.pool.query('SELECT pg_try_advisory_xact_lock($1) AS got', [String(key)]) :
    t.pool.query('SELECT pg_try_advisory_xact_lock($1, $2) AS got', [key[0], key[1]]))).rows[0].got;

  it('takes a bigint key and a pair as two locks, objsubid 1 and 2, held until COMMIT', async () => {
    await db.serializable(t.pool, async c => {
      await db.advisoryXactLock(c, BigInt(42));
      await db.advisoryXactLock(c, [0, 42]);
      await db.advisoryXactLock(c, BigInt(2) ** BigInt(32) + BigInt(42));  // the high 32 bits go to classid
      expect(await advisoryLocks()).toEqual([
        { classid: 0, objid: 42, objsubid: 1 }, { classid: 0, objid: 42, objsubid: 2 }, { classid: 1, objid: 42, objsubid: 1 },
      ]);
      expect(await othersGet(BigInt(42))).toBe(false);
      expect(await othersGet([0, 42])).toBe(false);
    });
    expect(await advisoryLocks()).toEqual([]);
    expect(await othersGet(BigInt(42))).toBe(true);
    expect(await othersGet([0, 42])).toBe(true);
  });

  it('is released at ROLLBACK', async () => {
    const err = await db.serializable(t.pool, async c => {
      await db.advisoryXactLock(c, [1, 42]);
      expect(await advisoryLocks()).toEqual([{ classid: 1, objid: 42, objsubid: 2 }]);
      throw new Error('boom');
    }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('boom');
    expect(await advisoryLocks()).toEqual([]);
  });

  it('runs inside a BEGIN of yours, and is released at the ROLLBACK TO of a savepoint() taken before it, not one taken after', async () => {
    await db.advisoryXactLock(t.client, [1, 41]);  // the harness's client, inside its BEGIN
    const failed = new Error('the unit of work failed');
    const err = await db.savepoint(t.client, async sp => {
      await db.advisoryXactLock(sp, [1, 42]);
      expect(await advisoryLocks()).toEqual([{ classid: 1, objid: 41, objsubid: 2 }, { classid: 1, objid: 42, objsubid: 2 }]);
      throw failed;
    }).catch((e: unknown) => e);
    expect(err).toBe(failed);
    expect(await advisoryLocks()).toEqual([{ classid: 1, objid: 41, objsubid: 2 }]);
    expect(await othersGet([1, 42])).toBe(true);
  });

  it('is kept past the RELEASE of a savepoint() that resolves, until the transaction ends', async () => {
    await db.serializable(t.pool, async c => {
      await db.savepoint(c, sp => db.advisoryXactLock(sp, [1, 43]));
      expect(await advisoryLocks()).toEqual([{ classid: 1, objid: 43, objsubid: 2 }]);
      expect(await othersGet([1, 43])).toBe(false);
    });
    expect(await advisoryLocks()).toEqual([]);
  });

  it('is released between two attempts of a transaction retried on 40001', async () => {
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    const seen: unknown[] = [];
    let attempts = 0;
    await db.serializable(t.pool, async c => {
      seen.push(await advisoryLocks());
      await db.advisoryXactLock(c, BigInt(724));
      seen.push(await advisoryLocks());
      if (++attempts === 1) await raise(c, '40001');
    });
    const held = [{ classid: 0, objid: 724, objsubid: 1 }];
    expect(seen).toEqual([[], held, [], held]);  // the second attempt starts with the first one's lock released
    expect(await advisoryLocks()).toEqual([]);
  });

  it('takes the two ends of bigint, and passes on Postgres\'s errors for a key out of range or not an integer', async () => {
    await db.readCommitted(t.pool, async c => {
      await db.advisoryXactLock(c, -(BigInt(2) ** BigInt(63)));
      await db.advisoryXactLock(c, BigInt(2) ** BigInt(63) - BigInt(1));
      expect(await advisoryLocks()).toHaveLength(2);
    });
    const errorOf = (key: Key) => db.readCommitted(t.pool, c => db.advisoryXactLock(c, key)).catch((e: unknown) => e);
    expect(await errorOf(BigInt(2) ** BigInt(63))).toMatchObject({ code: '22003', message: 'value "9223372036854775808" is out of range for type bigint' });
    expect(await errorOf([1, 3000000000])).toMatchObject({ code: '22003', message: 'value "3000000000" is out of range for type integer' });
    expect(await errorOf([1.5, 2])).toMatchObject({ code: '22P02', message: 'invalid input syntax for type integer: "1.5"' });
    expect(await errorOf([NaN, 2])).toMatchObject({ code: '22P02', message: 'invalid input syntax for type integer: "NaN"' });
  });

  it('refuses a pg.PoolClient outside a transaction block, before any query: no lock is left', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    const client = await t.pool.connect();
    try {
      expect(client.getTransactionStatus()).toBe('I');
      await expect(db.advisoryXactLock(client, BigInt(42))).rejects.toThrow(/^advisoryXactLock\(\) was given a client outside a transaction block/);
      expect(queries).toEqual([]);
      expect(await advisoryLocks()).toEqual([]);
    } finally {
      client.release();
    }
  });

  // pg's status is that of the last query answered: a BEGIN not awaited still reads I, though pg would send the lock
  // after it
  it('refuses a pg.PoolClient whose BEGIN is not yet answered, before any query', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    const client = await t.pool.connect();
    try {
      const begin = client.query('BEGIN');
      await expect(db.advisoryXactLock(client, BigInt(42))).rejects.toThrow(/^advisoryXactLock\(\) was given a client outside a transaction block/);
      await begin;
      expect(client.getTransactionStatus()).toBe('T');
      expect(queries).toEqual([]);
      expect(await advisoryLocks()).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('refuses a pg.Pool, given past a cast, before any query: no lock is left', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    await expect(db.advisoryXactLock(t.pool as never, [5, 4])).rejects.toThrow(
      'advisoryXactLock() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours');
    expect(queries).toEqual([]);
    expect(await advisoryLocks()).toEqual([]);
  });
});

// #738: what setLocal() sets, as current_setting() reads it back, how long Postgres keeps it, and what Postgres
// answers for a name it refuses
describe('setLocal()', () => {
  /** What current_setting(name, true) reads on `queryable`: '' for a name defined on that session but not set, null for one never defined. */
  const setting = async (queryable: pg.ClientBase | pg.Pool, name: string) =>
    (await queryable.query<{ s: string | null }>('SELECT current_setting($1, true) AS s', [name])).rows[0]!.s;

  /** A client of the pool for one test, released with destroy so that no session setting outlives it. */
  const ownClient = async (test: (client: pg.PoolClient) => Promise<void>) => {
    const client = await t.pool.connect();
    try { await test(client); } finally { client.release(true); }
  };

  it('sets each setting for the transaction, read back by current_setting()', async () => {
    await db.readCommitted(t.pool, async c => {
      await db.setLocal(c, { 'app.customer': 'Ada Quill', 'app.screening': '1002' });
      expect(await setting(c, 'app.customer')).toBe('Ada Quill');
      expect(await setting(c, 'app.screening')).toBe('1002');
      expect(await setting(c, 'APP.Customer')).toBe('Ada Quill');  // Postgres folds A to Z in a name
    });
  });

  // a name of each row's own, never set on any connection of the pool before
  it.each([['COMMIT', 'app.after_commit', async () => undefined], ['ROLLBACK', 'app.after_rollback', async () => { throw new Error('rolled back'); }]] as const)(
    'leaves \'\' on that connection after %s, not NULL as before', async (_, name, end) => {
      await ownClient(async client => {
        expect(await setting(client, name)).toBeNull();
        await db.readCommitted(client, async c => { await db.setLocal(c, { [name]: 'Ada Quill' }); await end(); }).catch(() => undefined);
        expect(await setting(client, name)).toBe('');
      });
    });

  it('gives back the session’s value of the same name at COMMIT', async () => {
    await ownClient(async client => {
      await client.query("SET app.customer = 'session'");
      await db.readCommitted(client, async c => {
        await db.setLocal(c, { 'app.customer': 'Ada Quill' });
        expect(await setting(c, 'app.customer')).toBe('Ada Quill');
      });
      expect(await setting(client, 'app.customer')).toBe('session');
    });
  });

  it('keeps a setting through the RELEASE of a savepoint()', async () => {
    await db.readCommitted(t.pool, async c => {
      await db.savepoint(c, sp => db.setLocal(sp, { 'app.customer': 'inner' }));
      expect(await setting(c, 'app.customer')).toBe('inner');
    });
  });

  it('gives back the value from before each savepoint at its ROLLBACK TO, at two nested levels', async () => {
    await db.readCommitted(t.pool, async c => {
      await db.setLocal(c, { 'app.customer': 'outer' });
      await db.savepoint(c, async l1 => {
        await db.setLocal(l1, { 'app.customer': 'L1', 'app.screening': 'L1' });
        await db.savepoint(l1, async l2 => {
          await db.setLocal(l2, { 'app.customer': 'L2' });
          throw new Error('L2 fails');
        }).catch(() => undefined);
        expect(await setting(l1, 'app.customer')).toBe('L1');
        throw new Error('L1 fails');
      }).catch(() => undefined);
      expect(await setting(c, 'app.customer')).toBe('outer');
      expect(await setting(c, 'app.screening')).toBe('');  // set only inside
    });
  });

  it('is not seen by an attempt that transaction() retries after a 40001', async () => {
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    const seen: (string | null)[] = [];
    await db.serializable(t.pool, async c => {
      seen.push(await setting(c, 'app.customer'));
      await db.setLocal(c, { 'app.customer': `attempt ${seen.length}` });
      if (seen.length === 1) await raise(c, '40001');
    });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe('');  // the same connection: the name stays defined, its value gone
  });

  // a role of this test, created, granted and dropped inside the harness's BEGIN, so that its ROLLBACK leaves nothing;
  // the suite's role is a superuser, which row-level security does not bind
  it('gives a row-level security policy its customer and role: only that customer’s rows', async () => {
    const role = `pgcast_test_${process.pid}_set_local`;
    await t.client.query(`CREATE ROLE "${role}" NOLOGIN`);
    await t.client.query(`GRANT SELECT ON users TO "${role}"`);
    await t.client.query('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
    await t.client.query("CREATE POLICY own_row ON users USING (display_name = current_setting('app.customer', true))");
    await db.setLocal(t.client, { role, 'app.customer': 'Bob' });
    const { rows } = await t.client.query('SELECT current_user AS u, array_agg(display_name) AS names FROM users');
    expect(rows).toEqual([{ u: role, names: ['Bob'] }]);
  });

  it('refuses two names that differ only in case, before any query', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    await expect(db.setLocal(t.client, { 'app.customer': 'Ada Quill', 'app.Customer': 'Bob' })).rejects.toThrow(/^setLocal\(\) was given app\.customer and app\.Customer/);
    expect(queries).toEqual([]);
  });

  // probed on 17.3; the same codes on each Postgres of the CI matrix
  it.each([
    ['author_id', '42704', 'unrecognized configuration parameter "author_id"'],
    ['', '42704', 'unrecognized configuration parameter ""'],
    ['app.author id', '42602', 'invalid configuration parameter name "app.author id"'],
    ['app.author-id', '42602', 'invalid configuration parameter name "app.author-id"'],
    ['app.', '42602', 'invalid configuration parameter name "app."'],
    ['.x', '42602', 'invalid configuration parameter name ".x"'],
    ['app.1x', '42602', 'invalid configuration parameter name "app.1x"'],
    ['app."x"', '42602', 'invalid configuration parameter name "app."x""'],
    ['is_superuser', '55P02', 'parameter "is_superuser" cannot be changed'],
  ])('rejects with Postgres’s error for %j', async (name, code, message) => {
    const error = await db.readCommitted(t.pool, c => db.setLocal(c, { [name]: 'v' })).catch((e: unknown) => e);
    expect(error).toMatchObject({ code, message });
  });

  it('takes the names Postgres takes: several dots, capitals, a letter beyond ASCII, a built-in', async () => {
    await db.readCommitted(t.pool, async c => {
      await db.setLocal(c, { 'a.b.c': '1', 'App.X': '2', 'app.é': '3', search_path: 'public', statement_timeout: '1min' });
      expect([await setting(c, 'a.b.c'), await setting(c, 'app.x'), await setting(c, 'app.é'), await setting(c, 'search_path'), await setting(c, 'statement_timeout')])
        .toEqual(['1', '2', '3', 'public', '1min']);
    });
  });

  it('refuses a pg.Pool, given past a cast, before any query', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    await expect(db.setLocal(t.pool as never, { 'app.customer': 'Ada Quill' })).rejects.toThrow(
      'setLocal() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours');
    await expect(db.setLocal(t.pool as never, {})).rejects.toThrow(/^setLocal\(\) was given a pg\.Pool/);
    expect(queries).toEqual([]);
  });

  it('refuses a pg.PoolClient outside a transaction block, before any query, and runs inside a BEGIN of yours', async () => {
    const queries: db.SQLQuery[] = [];
    db.setConfig({ queryListener: q => { queries.push(q); } });
    await ownClient(async client => {
      expect(client.getTransactionStatus()).toBe('I');
      await expect(db.setLocal(client, { 'app.customer': 'Ada Quill' })).rejects.toThrow(/^setLocal\(\) was given a client outside a transaction block/);
      expect(queries).toEqual([]);
      await client.query('BEGIN');
      await db.setLocal(client, { 'app.customer': 'Ada Quill' });
      expect(await setting(client, 'app.customer')).toBe('Ada Quill');
      await client.query('ROLLBACK');
      expect(queries.map(q => q.text)).toEqual(['SELECT set_config($1, $2, true)']);
    });
  });
});

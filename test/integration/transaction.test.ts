// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of src/db/transaction.ts. transaction() runs START TRANSACTION
// then COMMIT, which would commit the harness's per-test transaction: these tests
// run on the file's pool (t.pool), write only to txn_probe, and empty it after
// each test. The per-test client (t.client) is not used here.
// Retries are provoked deterministically: the callback raises the SQLSTATE
// itself on its first attempts (a DO block with RAISE ... USING ERRCODE).

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
    try {
      await db.readCommitted(client, c => {
        expect(c).toBe(client);
        return write(c, 'plain client');
      });
      expect(await sql`SELECT 1 AS one`.run(client)).toEqual([{ one: 1 }]);  // still connected and ours
    } finally {
      client.release();
    }
    expect(await notes()).toEqual(['plain client']);
  });

  it('characterization: on a client already in a raw BEGIN, it commits the outer transaction', async () => {
    // characterization: only a client from transaction() is passed through; START TRANSACTION inside BEGIN
    // only warns, and its COMMIT ends the outer transaction, so the later ROLLBACK undoes nothing
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
});

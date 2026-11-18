// Copyright (C) 2026 Alexandre Demartin
//
// The adapter's pool of one, as transaction() uses it: PGlite has a single connection, so connect() waits for the
// previous release(), in turn, and a query on the pool waits behind an open transaction. A 40001 is retried on the
// client, which is released once, on every path; the COMMIT that Postgres answers with ROLLBACK is read.

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../../src/db';
import { asPool, type PGliteClient, type PGlitePool } from '../src';
import { usePGlite } from './helpers';

const u = usePGlite(), config = db.getConfig();

afterEach(() => {
  vi.restoreAllMocks();
  db.setConfig(config);
});

/** The pool, counting its connect() and the release() of each client. */
const counted = (pool: PGlitePool) => {
  let connects = 0, releases = 0;
  const wrapped: PGlitePool = {
    query: pool.query,
    connect: async () => {
      connects++;
      const c = await pool.connect(), release = c.release;
      return { ...c, release: () => { releases++; release(); } };
    },
  };
  return { pool: wrapped, counts: () => [connects, releases] };
};

const later = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('transactions', () => {
  it('run one after the other, each on the PGlite alone between its connect() and release()', async () => {
    const n = counted(u.pool()), order: string[] = [];
    const book = (name: string) => db.serializable(n.pool, async c => {
      order.push(name + ' in');
      await db.count('orgs', db.all).run(c);
      await later(20);
      order.push(name + ' out');
      return name;
    });
    expect(await Promise.all([book('a'), book('b'), book('c')])).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['a in', 'a out', 'b in', 'b out', 'c in', 'c out']);
    expect(n.counts()).toEqual([3, 3]);
  });

  it('run at the level asked for', async () => {
    expect(await db.serializable(u.pool(), c => db.sql`SELECT current_setting('transaction_isolation') AS level`.run(c))).toEqual([{ level: 'serializable' }]);
    expect(await db.readCommitted(u.pool(), c => db.sql`SELECT current_setting('transaction_isolation') AS level`.run(c))).toEqual([{ level: 'read committed' }]);
  });

  it('retry a 40001 on their client, and release it once after a commit, a rollback, a retry and a 40P01 given up', async () => {
    const n = counted(u.pool()), messages: string[] = [];
    db.setConfig({ transactionListener: m => messages.push(m), transactionRetryDelay: { minMs: 0, maxMs: 0 }, transactionAttemptsMax: 2 });
    let attempts = 0;
    expect(await db.serializable(n.pool, async c => {
      // a real 40001 needs a second connection, which PGlite has not: Postgres raises it here
      if (++attempts === 1) await db.sql`DO $$ BEGIN RAISE EXCEPTION 'x' USING ERRCODE = '40001'; END $$`.run(c);
      return attempts;
    })).toBe(2);
    expect(messages.filter(m => m.startsWith('Retrying'))).toEqual(['Retrying transaction, attempt 2 of 2']);
    expect(await db.readCommitted(n.pool, () => Promise.resolve('committed'))).toBe('committed');
    await expect(db.readCommitted(n.pool, () => Promise.reject(new Error('rolled back')))).rejects.toThrow('rolled back');
    await expect(db.serializable(n.pool, c => db.sql`DO $$ BEGIN RAISE EXCEPTION 'x' USING ERRCODE = '40P01'; END $$`.run(c)))
      .rejects.toMatchObject({ code: '40P01' });
    expect(n.counts()).toEqual([4, 4]);
  });

  it('read the ROLLBACK that answers the COMMIT of an aborted transaction: warn PGCAST_DEP003, or reject', async () => {
    vi.resetModules();
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const fdb = await import('../../../src/db');
    const swallow = async (c: db.QueryableLike) => { await db.sql`SELECT 1/0`.run(c).catch(() => { }); return 'swallowed'; };
    expect(await fdb.readCommitted(u.pool(), swallow)).toBe('swallowed');
    expect(emitWarning.mock.calls.map(call => call[1])).toEqual([{ type: 'DeprecationWarning', code: 'PGCAST_DEP003' }]);
    fdb.setConfig({ transactionRequiresCommit: true });
    await expect(fdb.readCommitted(u.pool(), swallow)).rejects.toThrow('the transaction was rolled back, not committed');
  });

  it('pass the client of a transaction through to a nested one, given with a cast (#702)', async () => {
    const n = counted(u.pool());
    expect(await db.serializable(n.pool, outer =>
      db.serializable(outer as unknown as db.TxnClientForSerializable, async inner => inner === (outer as unknown)))).toBe(true);
    expect(n.counts()).toEqual([1, 1]);
  });

  it('commit what they write, and roll back what a failed one wrote', async () => {
    await db.serializable(u.pool(), c => db.insert('orgs', { country: 'TX', code: 'kept', name: 'n' }).run(c));
    await expect(db.serializable(u.pool(), async c => {
      await db.insert('orgs', { country: 'TX', code: 'dropped', name: 'n' }).run(c);
      throw new Error('no');
    })).rejects.toThrow('no');
    expect(await db.select('orgs', { country: 'TX' }, { columns: ['code'] }).run(u.pool())).toEqual([{ code: 'kept' }]);
    await db.deletes('orgs', { country: 'TX' }).run(u.pool());
  });

  it('read a cursor() in two batches, then send CLOSE on a break (#743)', async () => {
    const texts: string[] = [];
    db.setConfig({ queryListener: q => { texts.push(q.text.split(' ').slice(0, 2).join(' ')); } });
    const { batches, open } = await db.readCommitted(u.pool(), async c => {
      const read: unknown[] = [];
      for await (const batch of db.cursor(c, db.sql<db.SQL, { g: number }[]>`SELECT g FROM generate_series(1, 5) AS g`, { batchSize: 2 })) {
        read.push(batch);
        if (read.length === 2) break;
      }
      return { batches: read, open: await db.sql`SELECT name FROM pg_cursors`.run(c) };
    });
    expect(batches).toEqual([[{ g: 1 }, { g: 2 }], [{ g: 3 }, { g: 4 }]]);
    expect(open).toEqual([]);
    expect(texts).toEqual(['START TRANSACTION', 'DECLARE pgcast_cursor_1', 'FETCH FORWARD', 'FETCH FORWARD', 'CLOSE pgcast_cursor_1', 'SELECT name', 'COMMIT']);
  });
});

describe('the pool of one', () => {
  it('gives connect() its client in turn, and runs a query on the pool after the clients asked before it', async () => {
    const seen: string[] = [], first = await u.pool().connect();
    const second = u.pool().connect().then(c => { seen.push('second'); return c; });
    const third = u.pool().connect().then(c => { seen.push('third'); return c; });
    const query = u.pool().query({ text: 'SELECT 1 AS a', values: [] }).then(() => seen.push('query'));
    await later(20);
    seen.push('release first'); first.release();
    const c2 = await second; await later(20);
    seen.push('release second'); c2.release();
    const c3 = await third;
    seen.push('release third'); c3.release();
    await query;
    expect(seen).toEqual(['release first', 'second', 'release second', 'third', 'release third', 'query']);
  });

  it('is one for every asPool() of a PGlite', async () => {
    const [a, b] = [asPool(u.pglite()), asPool(u.pglite())], seen: string[] = [];
    const held = await a.connect();
    const other = b.connect().then(c => { seen.push('b'); c.release(); });
    await later(20);
    seen.push('release a'); held.release();
    await other;
    expect(seen).toEqual(['release a', 'b']);
  });

  it('refuses a second release(), as pg-pool does, and a query on a released client', async () => {
    const c = await u.pool().connect();
    c.release();
    expect(() => c.release()).toThrow('Release called on client which has already been released to the pool.');
    await expect(c.query({ text: 'SELECT 1', values: [] })).rejects.toThrow('query() on a client after its release()');
    expect((await u.pool().query({ text: 'SELECT 1 AS a', values: [] })).rows).toEqual([{ a: 1 }]);
  });

  it('keeps a query on the pool waiting inside a transaction, as a pg.Pool with max: 1 does', async () => {
    const pglite = await PGlite.create();
    const pool = asPool(pglite);
    let ran = false;
    void db.serializable(pool, () => db.sql`SELECT 1`.run(pool).then(() => { ran = true; }));
    await later(100);
    expect(ran).toBe(false);  // never released: this PGlite is left to the garbage collector, not closed
  });
});

describe('the difference README § How it differs lists', () => {
  it('runs a query of PGlite\'s own inside an open transaction of the adapter, on the one connection', async () => {
    const c: PGliteClient = await u.pool().connect();
    try {
      await c.query({ text: 'START TRANSACTION', values: [] });
      await c.query({ text: "INSERT INTO orgs VALUES ('OW', 'o', 'n')", values: [] });
      expect((await u.pglite().query<{ n: number }>("SELECT count(*)::int AS n FROM orgs WHERE country = 'OW'")).rows[0].n).toBe(1);
      await c.query({ text: 'ROLLBACK', values: [] });
    } finally { c.release(); }
    expect((await u.pglite().query<{ n: number }>("SELECT count(*)::int AS n FROM orgs WHERE country = 'OW'")).rows[0].n).toBe(0);
  });

  it('ends an open transaction of the adapter with PGlite\'s own transaction(), which commits its writes', async () => {
    const left = async () => (await u.pglite().query<{ code: string }>("SELECT code FROM orgs WHERE country = 'PC' ORDER BY code")).rows.map(r => r.code);
    try {
      await expect(db.serializable(u.pool(), async c => {
        await db.sql`INSERT INTO orgs VALUES ('PC', 'adapter', 'n')`.run(c);
        await u.pglite().transaction(tx => tx.query("INSERT INTO orgs VALUES ('PC', 'own', 'n')"));
        throw new Error('roll back');
      })).rejects.toThrow('roll back');
      expect(await left()).toEqual(['adapter', 'own']);
    } finally { await u.pglite().query("DELETE FROM orgs WHERE country = 'PC'"); }
  });

  it('runs run(pool) inside an open transaction() of PGlite\'s own, where it sees its rows', async () => {
    const seen = await u.pglite().transaction(async tx => {
      await tx.query("INSERT INTO orgs VALUES ('PT', 'own', 'n')");
      const n = await db.sql`SELECT count(*)::int AS n FROM orgs WHERE country = 'PT'`.run(u.pool());
      await tx.rollback();
      return n;
    });
    expect(seen).toEqual([{ n: 1 }]);
    expect((await u.pglite().query<{ n: number }>("SELECT count(*)::int AS n FROM orgs WHERE country = 'PT'")).rows[0].n).toBe(0);
  });

  it('commits an open transaction() of PGlite\'s own with the COMMIT of a readCommitted() inside it', async () => {
    try {
      await u.pglite().transaction(async tx => {
        await tx.query("INSERT INTO orgs VALUES ('PR', 'own', 'n')");
        await db.readCommitted(u.pool(), c => db.sql`INSERT INTO orgs VALUES ('PR', 'adapter', 'n')`.run(c));
        await tx.rollback();
      });
      expect((await u.pglite().query<{ code: string }>("SELECT code FROM orgs WHERE country = 'PR' ORDER BY code")).rows.map(r => r.code)).toEqual(['adapter', 'own']);
    } finally { await u.pglite().query("DELETE FROM orgs WHERE country = 'PR'"); }
  });

  it('refuses serializable() inside an open transaction() of PGlite\'s own that ran a query, with 25001, and its ROLLBACK ends PGlite\'s', async () => {
    const outcome = await u.pglite().transaction(async tx => {
      await tx.query("INSERT INTO orgs VALUES ('PS', 'own', 'n')");
      return db.serializable(u.pool(), c => db.sql`INSERT INTO orgs VALUES ('PS', 'adapter', 'n')`.run(c)).then(() => 'ran', (e: any) => e.code);
    }).catch((e: any) => 'PGlite\'s transaction() rejected: ' + e.code);
    expect(outcome).toBe('25001');
    expect((await u.pglite().query<{ n: number }>("SELECT count(*)::int AS n FROM orgs WHERE country = 'PS'")).rows[0].n).toBe(0);
  });
});

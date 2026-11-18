// Copyright (C) 2026 Alexandre Demartin
//
// pgcast's shortcuts and transactions on the adapter's pool: the same results as on a pg pool, a 40001 retried,
// one connection reserved and released per transaction, and the command tags transaction() reads.

import postgres from 'postgres';
import { afterEach, describe, expect, inject, it, vi } from 'vitest';
import * as db from '../../../src/db';
import { urlForDatabase } from '../../../test/helpers/databases';
import { asPool } from '../src';
import { shape, usePostgresJs } from './helpers';

const u = usePostgresJs(), config = db.getConfig();

afterEach(() => {
  vi.restoreAllMocks();
  db.setConfig(config);
});

/** Spies on reserve() and on the release() of each connection it reserves. */
const counted = () => {
  const reserve = u.sql.reserve.bind(u.sql), releases: unknown[] = [];
  const spy = vi.spyOn(u.sql, 'reserve').mockImplementation(async () => {
    const reserved = await reserve();
    const release = reserved.release.bind(reserved);
    reserved.release = () => { releases.push(reserved); return release(); };
    return reserved;
  });
  return { reserves: () => spy.mock.calls.length, releases: () => releases.length };
};

describe('shortcuts', () => {
  const scenario = async (queryable: db.QueryableLike, country: string) => ({
    inserted: await db.insert('orgs', [{ country, code: 'a', name: 'A' }, { country, code: 'b', name: 'B' }], { returning: ['code', 'name'] }).run(queryable),
    upserted: await db.upsert('orgs', { country, code: 'a', name: 'A2' }, ['country', 'code'], { returning: ['name'] }).run(queryable),
    counted: await db.count('orgs', { country }).run(queryable),
    selected: await db.select('orgs', { country }, {
      columns: ['code'], order: { by: 'code', direction: 'ASC' },
      lateral: { members: db.count('memberships', { org_country: db.parent('country'), org_code: db.parent('code') }) },
    }).run(queryable),
  });

  it('insert(), upsert(), count() and select() with a lateral give what they give on a pg pool', async () => {
    const viaAdapter = await scenario(u.pool, 'PJ');
    expect(shape(viaAdapter)).toEqual(shape(await scenario(u.t.pool, 'PG')));
    expect(viaAdapter).toEqual({
      inserted: [{ code: 'a', name: 'A' }, { code: 'b', name: 'B' }],
      upserted: { name: 'A2', $action: 'UPDATE' },
      counted: 2,
      selected: [{ code: 'a', members: 0 }, { code: 'b', members: 0 }],
    });
  });

  it('runs a prepared query twice, and several statements as pg does, to undefined', async () => {
    expect(await db.sql`SELECT ${db.param(1)}::int AS one`.prepared('one').run(u.pool)).toEqual([{ one: 1 }]);
    expect(await db.sql`SELECT ${db.param(2)}::int AS one`.prepared('one').run(u.pool)).toEqual([{ one: 2 }]);
    expect(await db.sql`SELECT 1 AS two`.prepared('two').run(u.pool)).toEqual([{ two: 1 }]);
    expect(await db.sql`SELECT 1; SELECT 2`.run(u.pool)).toBeUndefined();
    const query = { text: 'SELECT 1 AS a; SELECT 2 AS b', values: [] };
    expect(await u.pool.query(query)).toEqual(await u.t.pool.query(query).then(rs => (rs as unknown as any[]).map(r => ({ rows: r.rows, command: r.command }))));
  });

  it('runs a prepared query unprepared, where pg prepares it, and refuses it several statements, as pg does', async () => {
    const prepared = async (pool: { connect: () => Promise<any> }, name: string) => {
      const c = await pool.connect(), count = { text: 'SELECT count(*)::int AS n FROM pg_prepared_statements WHERE NOT from_sql', values: [] };
      try {
        const before = (await c.query(count)).rows[0].n;
        await c.query({ text: 'SELECT 1 AS ' + name, values: [], name });  // a text of its own, prepared on no connection yet
        const after = (await c.query(count)).rows[0].n;
        const refused = await c.query({ text: 'SELECT 1; SELECT 2', values: [], name: name + '_two' }).catch((e: any) => e.code);
        return { added: after - before, refused };
      } finally { c.release(); }
    };
    expect(await prepared(u.pool, 'via_adapter')).toEqual({ added: 0, refused: '42601' });
    expect(await prepared(u.t.pool, 'via_pg')).toEqual({ added: 1, refused: '42601' });
  });

  it('passes the errors of postgres.js through, with their SQLSTATE', async () => {
    const err = await db.insert('orgs', [{ country: 'DU', code: 'p', name: 'n' }, { country: 'DU', code: 'p', name: 'n' }]).run(u.pool).catch(e => e);
    expect(err).toBeInstanceOf(postgres.PostgresError);
    expect(db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')).toBe(true);
  });

  it('leaves a BEGIN on the pool to postgres.js, which refuses it', async () => {
    await expect(db.sql`BEGIN`.run(u.pool)).rejects.toMatchObject({ code: 'UNSAFE_TRANSACTION' });
  });
});

describe('command tags', () => {
  it('gives the first word of each tag, as pg does', async () => {
    const tags = async (pool: { connect: () => Promise<any> }) => {
      const c = await pool.connect(), seen: (string | null)[] = [];
      for (const text of ['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', 'INSERT INTO orgs VALUES (\'TG\', \'t\', \'n\')',
        'UPDATE orgs SET name = name WHERE false', 'DELETE FROM orgs WHERE false', 'COMMIT', 'START TRANSACTION', 'SELECT 1/0']) {
        try { seen.push((await c.query({ text, values: [] })).command); } catch { seen.push('error'); }
      }
      for (const text of ['COMMIT', 'ROLLBACK', '']) seen.push((await c.query({ text, values: [] })).command);
      await c.query({ text: 'DELETE FROM orgs WHERE country = \'TG\'', values: [] });
      c.release();
      return seen;
    };
    expect(await tags(u.pool)).toEqual(await tags(u.t.pool));
    expect(await tags(u.pool)).toEqual(['START', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'COMMIT', 'START', 'error', 'ROLLBACK', 'ROLLBACK', null]);
  });
});

describe('transactions', () => {
  it('retries a serializable() on a real 40001 and commits both transactions, each on a connection of its own', async () => {
    const n = counted(), messages: string[] = [];
    db.setConfig({ transactionListener: m => messages.push(m), transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    let arrive!: () => void;
    const bothCounted = new Promise<void>(resolve => { let k = 0; arrive = () => { if (++k === 2) resolve(); }; });
    const book = (code: string) => db.serializable(u.pool, async c => {
      const before = await db.count('orgs', { country: 'SS' }).run(c);
      if (before === 0) { arrive(); await bothCounted; }  // each read the other's write: one of them fails with 40001
      await db.insert('orgs', { country: 'SS', code: code + before, name: 'n' }).run(c);
      return before;
    });
    expect((await Promise.all([book('a'), book('b')])).sort()).toEqual([0, 1]);
    expect(messages.filter(m => m.startsWith('Retrying'))).toEqual(['Retrying transaction, attempt 2 of 5']);
    expect(await db.count('orgs', { country: 'SS' }).run(u.pool)).toBe(2);
    expect([n.reserves(), n.releases()]).toEqual([2, 2]);
  });

  it('releases its one connection after a commit, a rollback and a 40001 retried', async () => {
    const n = counted();
    db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
    expect(await db.readCommitted(u.pool, () => Promise.resolve('committed'))).toBe('committed');
    await expect(db.readCommitted(u.pool, () => Promise.reject(new Error('rolled back')))).rejects.toThrow('rolled back');
    let attempts = 0;
    expect(await db.serializable(u.pool, async c => {
      if (++attempts === 1) await db.sql`DO $$ BEGIN RAISE EXCEPTION 'x' USING ERRCODE = '40001'; END $$`.run(c);
      return attempts;
    })).toBe(2);
    expect([n.reserves(), n.releases()]).toEqual([3, 3]);
  });

  it('passes the client of a transaction through to a nested one, given with a cast (#696)', async () => {
    const n = counted();
    expect(await db.serializable(u.pool, outer =>
      db.serializable(outer as unknown as db.TxnClientForSerializable, async inner => inner === (outer as unknown)))).toBe(true);
    expect([n.reserves(), n.releases()]).toEqual([1, 1]);
  });

  it('reads the ROLLBACK that answers the COMMIT of an aborted transaction: warns PGCAST_DEP003, or rejects', async () => {
    vi.resetModules();
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => { });
    const fdb = await import('../../../src/db');
    const swallow = async (c: db.QueryableLike) => { await db.sql`SELECT 1/0`.run(c).catch(() => { }); return 'swallowed'; };
    expect(await fdb.readCommitted(u.pool, swallow)).toBe('swallowed');
    expect(emitWarning.mock.calls.map(call => call[1])).toEqual([{ type: 'DeprecationWarning', code: 'PGCAST_DEP003' }]);
    fdb.setConfig({ transactionRequiresCommit: true });
    await expect(fdb.readCommitted(u.pool, swallow)).rejects.toThrow('the transaction was rolled back, not committed');
  });
});

describe('asPool()', () => {
  it('refuses a sql whose transform renames columns or rows, which Selectable would not name', () => {
    const url = urlForDatabase(inject('pgcastDb')!.url, u.t.name);
    for (const transform of [postgres.camel, { row: { from: (row: unknown) => row } }]) {
      const sql = postgres(url, { transform });
      expect(() => asPool(sql)).toThrow('asPool() needs a postgres.js sql with no column or row transform');
      void sql.end();
    }
  });
});

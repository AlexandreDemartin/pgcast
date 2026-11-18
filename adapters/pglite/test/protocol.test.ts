// Copyright (C) 2026 Alexandre Demartin
//
// What the adapter sends PGlite and reads back besides values: pgcast's shortcuts give what they give on pg, the
// command tags transaction() reads, several statements, prepared queries, errors with their SQLSTATE, a PGlite not
// yet ready or closed, and what asPool() refuses.

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import * as db from '../../../src/db';
import { asPool } from '../src';
import { shape, usePGlite } from './helpers';

const u = usePGlite();

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

  it('insert() sends 65,535 values, the most Postgres takes in one query, as pg does', async () => {
    const rows = Array.from({ length: 65_535 / 3 }, (_, i) => ({ country: 'MX', code: String(i), name: 'n' }));
    const inserted = async (q: db.QueryableLike) => {
      try { return (await db.insert('orgs', rows).run(q)).length; }
      finally { await db.deletes('orgs', { country: 'MX' }).run(q); }
    };
    expect(await inserted(u.pool())).toBe(await inserted(u.t.client));
    expect(await inserted(u.pool())).toBe(21_845);
  }, 30_000);

  it('insert(), upsert(), count() and select() with a lateral give what they give on pg', async () => {
    const viaAdapter = await scenario(u.pool(), 'PL');
    expect(shape(viaAdapter)).toEqual(shape(await scenario(u.t.client, 'PL')));
    expect(viaAdapter).toEqual({
      inserted: [{ code: 'a', name: 'A' }, { code: 'b', name: 'B' }],
      upserted: { name: 'A2', $action: 'UPDATE' },
      counted: 2,
      selected: [{ code: 'a', members: 0 }, { code: 'b', members: 0 }],
    });
  });
});

describe('command tags', () => {
  it('gives the first word of each tag, as pg does, null for an empty query', async () => {
    const tags = async (q: { query: (q: { text: string; values: any[] }) => Promise<any> }) => {
      const seen: (string | null)[] = [];
      for (const text of ['START TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'SELECT 1', "INSERT INTO orgs VALUES ('TG', 't', 'n')",
        'UPDATE orgs SET name = name WHERE false', 'DELETE FROM orgs WHERE false', 'COMMIT', 'START TRANSACTION', 'SELECT 1/0',
        'COMMIT', 'ROLLBACK', '', 'SET extra_float_digits = 1', 'CREATE TEMP TABLE tags_seen (a int)', 'DROP TABLE tags_seen']) {
        try { seen.push((await q.query({ text, values: [] })).command); } catch (e: any) { seen.push('error ' + e.code); }
      }
      await q.query({ text: "DELETE FROM orgs WHERE country = 'TG'", values: [] });
      return seen;
    };
    const pg = await u.t.pool.connect();
    try {
      expect(await tags(u.pool())).toEqual(await tags(pg));
    } finally { pg.release(); }
    expect(await tags(u.pool())).toEqual(['START', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'COMMIT', 'START', 'error 22012',
      'ROLLBACK', 'ROLLBACK', null, 'SET', 'CREATE', 'DROP']);
  });

  it('gives the tag of a query with a value too', async () => {
    expect((await u.pool().query({ text: 'SELECT $1::int AS a', values: [1] })).command).toBe('SELECT');
  });
});

describe('several statements', () => {
  it('give an array of results with no value, as pg does, and run() gives undefined', async () => {
    const query = { text: 'SELECT 1 AS a; SELECT 2 AS b', values: [] };
    const viaPg = (await u.t.client.query(query) as unknown as any[]).map(r => ({ rows: r.rows, command: r.command }));
    expect(await u.pool().query(query)).toEqual(viaPg);
    expect(await db.sql`SELECT 1; SELECT 2`.run(u.pool())).toBeUndefined();
  });

  it('are refused with a value, and stop at the first error, as pg does', async () => {
    const code = (q: { query: (q: { text: string; values: any[] }) => Promise<unknown> }, text: string, values: any[]) => q.query({ text, values }).then(() => 'ran', (e: any) => e.code);
    expect(await code(u.pool(), 'SELECT $1::int; SELECT 2', [1])).toBe('42601');
    expect(await code(u.t.pool, 'SELECT $1::int; SELECT 2', [1])).toBe('42601');
    expect(await code(u.pool(), 'SELECT 1; SELECT 1/0; SELECT 3', [])).toBe('22012');
  });
});

describe('prepared queries', () => {
  const statements = async () => (await u.pool().query({ text: 'SELECT count(*)::int AS n FROM pg_prepared_statements WHERE NOT from_sql', values: [] })).rows[0].n;

  it('prepares a query with a name once, and runs it again, as pg does', async () => {
    const before = await statements();
    expect(await db.sql`SELECT ${db.param(1)}::int AS one`.prepared('one').run(u.pool())).toEqual([{ one: 1 }]);
    expect(await db.sql`SELECT ${db.param(2)}::int AS one`.prepared('one').run(u.pool())).toEqual([{ one: 2 }]);
    expect(await db.sql`SELECT 3 AS one`.prepared('three').run(u.pool())).toEqual([{ one: 3 }]);
    expect(await statements()).toBe(before + 2);
  });

  it('runs a prepared query again after it failed, the statement being prepared', async () => {
    const divide = (n: number) => u.pool().query({ text: 'SELECT 1 / $1::int AS q', values: [n], name: 'divide' });
    await expect(divide(0)).rejects.toMatchObject({ code: '22012' });
    expect((await divide(1)).rows).toEqual([{ q: 1 }]);
  });

  it('refuses a name given to another text, and several statements, with pg\'s messages', async () => {
    const refused = async (q: { query: (q: any) => Promise<unknown> }) => [
      await q.query({ text: 'SELECT 1 AS a', values: [], name: 'taken' }).then(() => 'ran'),
      await q.query({ text: 'SELECT 2 AS a', values: [], name: 'taken' }).catch((e: Error) => e.message),
      await q.query({ text: 'SELECT 1; SELECT 2', values: [], name: 'two' }).catch((e: any) => e.code),
    ];
    expect(await refused(u.pool())).toEqual(await refused(u.t.client));
    expect(await refused(u.pool())).toEqual(['ran', 'Prepared statements must be unique - \'taken\' was used for a different statement', '42601']);
  });

  it('runs a query under an empty name unnamed, as pg does, never as the unnamed statement another query left', async () => {
    const scenario = async (q: db.QueryableLike) => {
      await db.sql`INSERT INTO orgs (country, code, name) VALUES ('EN', '5', 'five'), ('EN', '7', 'seven')`.run(q);
      const pick = (code: string) => db.sql`SELECT code, name FROM orgs WHERE country = 'EN' AND code = ${db.param(code)}`.prepared('');
      try {
        return {
          picked: await pick('5').run(q),
          deleted: await db.sql`DELETE FROM orgs WHERE country = 'EN' AND code = ${db.param('5')} RETURNING code`.run(q),
          again: await pick('7').run(q),
          left: await db.sql`SELECT code FROM orgs WHERE country = 'EN'`.run(q),
        };
      } finally { await db.sql`DELETE FROM orgs WHERE country = 'EN'`.run(q); }
    };
    const viaAdapter = await scenario(u.pool());
    expect(viaAdapter).toEqual(await scenario(u.t.client));
    expect(viaAdapter).toEqual({ picked: [{ code: '5', name: 'five' }], deleted: [{ code: '5' }], again: [{ code: '7', name: 'seven' }], left: [{ code: '7' }] });
  });

  it('runs another text under an empty name, as pg does', async () => {
    const both = async (q: { query: (q: any) => Promise<{ rows: any[] }> }) => [
      (await q.query({ text: 'SELECT 1 AS a', values: [], name: '' })).rows,
      (await q.query({ text: 'SELECT 2 AS a', values: [], name: '' })).rows,
    ];
    expect(await both(u.pool())).toEqual(await both(u.t.client));
    expect(await both(u.pool())).toEqual([[{ a: 1 }], [{ a: 2 }]]);
  });

  it('prepares a name once for queries sent at the same moment', async () => {
    const same = () => u.pool().query({ text: 'SELECT $1::int AS n', values: [6], name: 'at_once' });
    expect((await Promise.all([same(), same(), same()])).map(r => r.rows)).toEqual([[{ n: 6 }], [{ n: 6 }], [{ n: 6 }]]);
  });

  it('knows the names prepared on a PGlite through any of its pools', async () => {
    const [a, b] = [asPool(u.pglite()), asPool(u.pglite())];
    expect((await a.query({ text: 'SELECT 4 AS n', values: [], name: 'shared' })).rows).toEqual([{ n: 4 }]);
    expect((await b.query({ text: 'SELECT 4 AS n', values: [], name: 'shared' })).rows).toEqual([{ n: 4 }]);
    await expect(b.query({ text: 'SELECT 5 AS n', values: [], name: 'shared' })).rejects.toThrow('Prepared statements must be unique');
  });

  it('gives 26000 for a prepared query after DEALLOCATE ALL, as pg does', async () => {
    const after = async (q: { query: (q: any) => Promise<unknown> }) => {
      await q.query({ text: 'SELECT 3 AS t', values: [], name: 'dropped' });
      await q.query({ text: 'DEALLOCATE ALL', values: [] });
      return q.query({ text: 'SELECT 3 AS t', values: [], name: 'dropped' }).catch((e: any) => e.code);
    };
    const viaAdapter = await after(u.pool());
    expect(viaAdapter).toBe(await after(u.t.client));
    expect(viaAdapter).toBe('26000');
  });
});

describe('COPY FROM STDIN', () => {
  // a PGlite of its own, which the COPY would stop if left unanswered
  const copied = async (query: { text: string; values: any[]; name?: string }) => {
    const pglite = await PGlite.create(), pool = asPool(pglite);
    try {
      await pool.query({ text: 'CREATE TABLE copied (a int)', values: [] });
      return [await pool.query(query).then(() => 'ran', (e: any) => e.code), (await pool.query({ text: 'SELECT count(*)::int AS n FROM copied', values: [] })).rows];
    } finally { await pglite.close(); }
  };

  it('is refused with 57014, as pg refuses it with no stream to send, and the next query runs', async () => {
    const query = { text: 'COPY copied FROM STDIN', values: [] }, pg = await u.t.pool.connect();
    try {
      await pg.query('CREATE TEMP TABLE copied (a int)');
      expect(await copied(query)).toEqual([await pg.query(query).then(() => 'ran', (e: any) => e.code), (await pg.query('SELECT count(*)::int AS n FROM copied')).rows]);
    } finally { pg.release(); }
    expect(await copied(query)).toEqual(['57014', [{ n: 0 }]]);
  });

  // pg's own next query waits forever there: Postgres ignores its Sync during the COPY, and so waits for another
  it('is refused with 57014 under a name, by the extended protocol, and the next query runs', async () => {
    expect(await copied({ text: 'COPY copied FROM STDIN', values: [], name: 'copy_in' })).toEqual(['57014', [{ n: 0 }]]);
  });
});

describe('errors', () => {
  it('are the DatabaseError PGlite reads, with the fields pg gives, and the next query runs', async () => {
    const duplicate = (q: db.QueryableLike) => db.insert('orgs', [{ country: 'DU', code: 'p', name: 'n' }, { country: 'DU', code: 'p', name: 'n' }]).run(q).catch(e => e);
    const fields = (e: any) => ({ name: e.name, message: e.message, code: e.code, severity: e.severity, detail: e.detail, schema: e.schema, table: e.table, constraint: e.constraint, routine: e.routine });
    const viaAdapter = await duplicate(u.pool());
    expect(viaAdapter).toBeInstanceOf(Error);
    expect(fields(viaAdapter)).toEqual(fields(await duplicate(u.t.client)));
    expect(db.isDatabaseError(viaAdapter, 'IntegrityConstraintViolation_UniqueViolation')).toBe(true);
    await expect(u.pool().query({ text: 'SELEC 1', values: [] })).rejects.toMatchObject({ code: '42601', position: '1' });
    expect((await u.pool().query({ text: 'SELECT $1::int AS a', values: [2] })).rows).toEqual([{ a: 2 }]);
  });
});

describe('the PGlite', () => {
  it('is waited for when not yet ready', async () => {
    const pglite = new PGlite();
    try {
      expect((await asPool(pglite).query({ text: 'SELECT 1 AS a', values: [] })).rows).toEqual([{ a: 1 }]);
    } finally { await pglite.close(); }
  });

  it('rejects once closed, as PGlite does', async () => {
    const pglite = await PGlite.create(), pool = asPool(pglite);
    await pglite.close();
    await expect(pool.query({ text: 'SELECT 1', values: [] })).rejects.toThrow('PGlite is closed');
  });

  // PGlite 0.5.13 runs the query first; 0.5.0 and 0.5.5 close first, and give the query no result
  it('rejects a query it closes before running, or runs it', async () => {
    const pglite = await PGlite.create();
    const query = asPool(pglite).query({ text: 'SELECT 1 AS a', values: [] }).then(r => r.rows, (e: Error) => e.message);
    await pglite.close();
    expect([[{ a: 1 }], 'PGlite gave no result: was it closed while the query waited?']).toContainEqual(await query);
  });

  it('is shared with its own queries, run at the same moment, which never land between the adapter\'s messages', async () => {
    const own = Array.from({ length: 20 }, (_, i) => u.pglite().query<{ n: number }>('SELECT $1::int AS n', [i]).then(r => r.rows[0].n));
    const adapter = Array.from({ length: 20 }, (_, i) => i % 2 ?
      u.pool().query({ text: 'SELECT $1::int AS n', values: [i] }).then(r => r.rows[0].n) :
      u.pool().query({ text: `SELECT ${i} AS n`, values: [] }).then(r => r.rows[0].n));
    const indices = Array.from({ length: 20 }, (_, i) => i);
    expect(await Promise.all([...own, ...adapter])).toEqual([...indices, ...indices]);
  });

  it('is never closed nor configured by the adapter', async () => {
    const pglite = await PGlite.create();
    try {
      await asPool(pglite).query({ text: 'SELECT 1', values: [] });
      expect(pglite.closed).toBe(false);
      expect((await pglite.query<{ n: unknown }>('SELECT 9007199254740993::int8 AS n')).rows[0].n).toBe(BigInt('9007199254740993'));
    } finally { await pglite.close(); }
  });
});

describe('asPool()', () => {
  it('refuses a PGlite transaction, and an object with no execProtocol() or no runExclusive()', async () => {
    const message = new Error("asPool() needs a PGlite with execProtocol() and runExclusive(), to send each query as pg sends it on its one connection: give it the PGlite that PGlite.create() or new PGlite() returns, not a transaction's");
    await u.pglite().transaction(async tx => { expect(() => asPool(tx as never)).toThrow(message); });
    expect(() => asPool({} as never)).toThrow(message);
    expect(() => asPool({ execProtocol: async () => ({ messages: [] }) } as never)).toThrow(message);
    expect(() => asPool({ runExclusive: async () => undefined } as never)).toThrow(message);
  });
});

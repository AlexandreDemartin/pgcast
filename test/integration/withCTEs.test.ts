// Copyright (C) 2026 Alexandre Demartin
//
// withCTEs() run on the fixture (decision 010 § 2): each shortcut keeps its result after the CTEs, which run
// in the order given, data-modifying ones included. The compiled SQL: test/unit/withCTEs.test.ts.

import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, param, parent, self, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';
import { resetConfig } from '../helpers/config';

const t = useTestDatabase();

afterEach(resetConfig);

const
  // Bob and Cyd, managed by Ada; Bob owns one account
  reports = sql`SELECT ${'id'} FROM ${'users'} WHERE ${'manager_id'} = ${param(1)}`,
  inReports = { owner_id: sql`${self} IN (SELECT id FROM reports)` };

describe('withCTEs', () => {
  it('keeps the result of each shortcut', async () => {
    expect(await db.withCTEs({ reports }, db.count('accounts', inReports)).run(t.client)).toBe(1);
    expect(await db.withCTEs({ reports }, db.select('users', { id: sql`${self} IN (SELECT id FROM reports)` }, { columns: ['display_name'], order: { by: 'id', direction: 'ASC' } })).run(t.client))
      .toEqual([{ display_name: 'Bob' }, { display_name: 'Cyd' }]);
    expect(await db.withCTEs({ reports }, db.selectOne('accounts', inReports, { columns: ['owner_id'] })).run(t.client)).toEqual({ owner_id: 2 });
    expect(await db.withCTEs({ reports }, db.selectExactlyOne('accounts', inReports, { columns: ['owner_id'] })).run(t.client)).toEqual({ owner_id: 2 });
    expect(await db.withCTEs({ reports }, sql`SELECT count(*)::int AS n FROM reports`).run(t.client)).toEqual([{ n: 2 }]);
  });

  it('two CTEs, the second reading the first; one that reads a later one is 42P01', async () => {
    const rich = sql`SELECT ${'owner_id'} AS id FROM ${'accounts'} WHERE ${'owner_id'} IN (SELECT id FROM reports)`;
    expect(await db.withCTEs({ reports, rich }, db.count('users', { id: sql`${self} IN (SELECT id FROM rich)` })).run(t.client)).toBe(1);
    expect(await pgError(t.client, () => db.withCTEs({ rich, reports }, db.count('users', all)).run(t.client)))
      .toEqual({ code: '42P01', message: 'relation "reports" does not exist' });
  });

  it('an empty insert() or upsert() as the main query runs its data-modifying CTE, whatever its table', async () => {
    // insert()'s own no-op text, INSERT INTO … SELECT null WHERE false, is refused on users (id GENERATED ALWAYS, 428C9) and on a view
    const queries = {
      users: db.insert('users', []), active_users: db.insert('active_users' as any, []), accounts: db.insert('accounts', []),
      upsert: db.upsert('users', [], 'email'),
    };
    for (const [name, query] of Object.entries(queries)) {
      const renamed = sql`UPDATE ${'users'} SET ${'display_name'} = ${param(`Bob ${name}`)} WHERE ${'id'} = ${param(2)} RETURNING 1`;
      expect(await db.withCTEs({ renamed }, query).run(t.client)).toEqual([]);
      expect(await db.selectExactlyOne('users', { id: 2 }, { columns: ['display_name'] }).run(t.client)).toEqual({ display_name: `Bob ${name}` });
    }
  });

  it('an empty insert() as a CTE gives no row, on a table that refuses insert()\'s own no-op text', async () => {
    expect(await db.withCTEs({ added: db.insert('users', []) }, sql`SELECT count(*)::int AS n FROM added`).run(t.client)).toEqual([{ n: 0 }]);
  });

  it('selectExactlyOne() with selectExactlyOneChecksForSecondRow: a second row rejects at the top level, as alone', async () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true });
    for (const ctes of [{ reports }, {}]) {
      const err = await db.withCTEs(ctes, db.selectExactlyOne('users', all)).run(t.client).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(db.NotExactlyOneError);
      expect((err as Error).message).toMatch(/^One result expected but more returned/);
    }
    // nested, one row per parent row, as the shortcut nested
    expect(await db.selectOne('users', { id: 1 }, { columns: ['id'], lateral: { account: db.withCTEs({ reports }, db.selectExactlyOne('accounts', { owner_id: parent('id') }, { columns: ['owner_id'] })) } }).run(t.client))
      .toEqual({ id: 1, account: { owner_id: 1 } });
  });

  it('select() with topLevelSelectAsRows: the main query gives the same array from its rows, a CTE its aggregate', async () => {
    const
      inReportsAsRows = () => db.select('users', { id: sql`${self} IN (SELECT id FROM reports)` }, { columns: ['display_name'], order: { by: 'id', direction: 'ASC' } }),
      queries = () => [
        db.withCTEs({ reports }, inReportsAsRows()),
        db.withCTEs({}, db.select('users', { manager_id: 1 }, { columns: ['display_name'], order: { by: 'id', direction: 'ASC' } })),
        db.withCTEs({ bob: db.select('users', { id: 2 }, { columns: ['display_name'] }) }, sql`SELECT result FROM bob`),
        db.withCTEs({ reports }, inReportsAsRows()).copy(),
        db.withCTEs({ reports }, db.select('users', { id: -1 })),
      ],
      off: unknown[] = [];
    for (const query of queries()) off.push(await query.run(t.client));
    db.setConfig({ topLevelSelectAsRows: true });
    const on: unknown[] = [];
    for (const query of queries()) on.push(await query.run(t.client));
    expect(on).toEqual(off);
    expect(on).toEqual([
      [{ display_name: 'Bob' }, { display_name: 'Cyd' }], [{ display_name: 'Bob' }, { display_name: 'Cyd' }],
      [{ result: [{ display_name: 'Bob' }] }], [{ display_name: 'Bob' }, { display_name: 'Cyd' }], [],
    ]);
    const prepared = db.withCTEs({ reports }, db.select('users', { manager_id: 1 }, { columns: ['id'], order: { by: 'id', direction: 'ASC' } })).prepared('reports_as_rows');
    expect([await prepared.run(t.client), await prepared.run(t.client)]).toEqual([[{ id: 2 }, { id: 3 }], [{ id: 2 }, { id: 3 }]]);
  });

  it('select() with topLevelSelectAsRows, prepared and run on its own, then a CTE: the CTE is its aggregate, unprepared', async () => {
    db.setConfig({ topLevelSelectAsRows: true });
    const tag = randomBytes(4).toString('hex');
    for (const [i, options] of [{}, { lateral: db.count('accounts', { owner_id: parent('id') }) }].entries()) {
      const query = db.select('users', all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, ...options } as any).prepared(`pgcast_ctes_rows_${tag}_${i}`);
      expect(await query.run(t.client)).toHaveLength(3);
      const length = db.withCTEs({ f: query }, sql`SELECT json_array_length(result) AS n FROM f`);
      expect(length.compile().name).toBeUndefined();
      expect(await length.run(t.client)).toEqual([{ n: 3 }]);
    }
  });

  it('an insert() as a CTE runs, and the main query sees the table as it was before the statement', async () => {
    const eve = db.insert('users', { email: 'eve@example.com', display_name: 'Eve', manager_id: 1 }, { returning: ['id'] });
    expect(await db.withCTEs({ eve }, db.count('users', { manager_id: 1 })).run(t.client)).toBe(2);
    expect(await db.count('users', { manager_id: 1 }).run(t.client)).toBe(3);
    const fay = db.insert('users', { email: 'fay@example.com', display_name: 'Fay' }, { returning: ['display_name'] });
    expect(await db.withCTEs({ fay }, sql`SELECT result FROM fay`).run(t.client)).toEqual([{ result: { display_name: 'Fay' } }]);
  });

  it('selectExactlyOne() with no row: NotExactlyOneError, its query the shortcut, without the WITH', async () => {
    const shortcut = db.selectExactlyOne('users', { id: sql`${self} IN (SELECT id FROM reports) AND false` });
    const err = await db.withCTEs({ reports }, shortcut).run(t.client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(db.NotExactlyOneError);
    expect((err as db.NotExactlyOneError).query).toBe(shortcut);
  });

  it('nested: in extras and in a lateral; a data-modifying CTE there is 0A000', async () => {
    const n = db.withCTEs({ reports }, db.count('accounts', inReports));
    expect(await db.selectOne('users', { id: 1 }, { columns: ['id'], extras: { n } }).run(t.client)).toEqual({ id: 1, n: 1 });
    const mine = sql`SELECT ${'id'} FROM ${'accounts'} WHERE ${'owner_id'} = ${parent('id')}`;
    expect(await db.select('users', all, { columns: ['id'], order: { by: 'id', direction: 'ASC' }, lateral: { n: db.withCTEs({ mine }, db.count('accounts', { id: sql`${self} IN (SELECT id FROM mine)` })) } }).run(t.client))
      .toEqual([{ id: 1, n: 2 }, { id: 2, n: 1 }, { id: 3, n: 0 }]);
    const gone = sql`DELETE FROM ${'accounts'} WHERE false RETURNING 1`;
    expect(await pgError(t.client, () => db.select('users', all, { lateral: { n: db.withCTEs({ gone }, db.count('accounts', all)) } }).run(t.client)))
      .toEqual({ code: '0A000', message: 'WITH clause containing a data-modifying statement must be at the top level' });
  });

  it('a prepared main query and the result, each prepared under its own name, run on one connection', async () => {
    // a CTE named as the table makes the two texts give two counts: 3 accounts, 1 row of the CTE
    const
      tag = randomBytes(4).toString('hex'),
      query = db.count('accounts', all).prepared(`pgcast_ctes_alone_${tag}`),
      result = db.withCTEs({ accounts: sql`SELECT 1` }, query);
    expect(result.compile().name).toBeUndefined();
    expect(await query.run(t.client)).toBe(3);
    expect(await result.run(t.client)).toBe(1);
    expect(await result.prepared(`pgcast_ctes_with_${tag}`).run(t.client)).toBe(1);
    expect(await query.run(t.client)).toBe(3);
    expect(await result.run(t.client)).toBe(1);
  });

  it('a query prepared after the call keeps its name to its own text, and the result runs unprepared', async () => {
    const
      tag = randomBytes(4).toString('hex'),
      query = db.count('accounts', all),
      result = db.withCTEs({ accounts: sql`SELECT 1` }, query);
    query.prepared(`pgcast_ctes_late_${tag}`);
    expect(await query.run(t.client)).toBe(3);
    expect(await result.run(t.client)).toBe(1);
    expect(await query.run(t.client)).toBe(3);
  });
});

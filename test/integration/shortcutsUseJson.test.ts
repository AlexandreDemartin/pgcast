// Copyright (C) 2026 Alexandre Demartin
//
// shortcutsUseJson (decision 018 § 2) in select() and its kin, run on the fixture: each shape gives the same
// result both ways, key order aside (toEqual ignores it). Compiled SQL: test/unit/shortcutsUseJson.test.ts.

import { afterEach, describe, expect, it } from 'vitest';
import * as db from '../../src/db';
import { sql, parent, all } from '../../src/db';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';
import { resetConfig } from '../helpers/config';

const t = useTestDatabase();

afterEach(resetConfig);

const
  order = { by: 'id', direction: 'ASC' } as const,
  count = () => db.count('accounts', { owner_id: parent('id') }),
  ofUser = { owner_id: sql`${db.self} = "users"."id"` },
  /** The query built and run with the option off, then on. */
  bothWays = async (build: () => db.SQLFragment<any, any>) => {
    db.setConfig({ shortcutsUseJson: false });
    const jsonb = await build().run(t.client);
    db.setConfig({ shortcutsUseJson: true });
    const json = await build().run(t.client);
    return { jsonb, json };
  };

describe('shortcutsUseJson: the same results both ways', () => {
  const shapes: Record<string, () => db.SQLFragment<any, any>> = {
    // every type of the fixture's users and accounts: jsonb, a composite, a domain over an array, timestamptz,
    // numeric, int8 beyond 2^53, float8, arrays of each dimension, date
    users: () => db.select('users', all, { order }),
    accounts: () => db.select('accounts', all, { order }),
    columns: () => db.select('users', all, { columns: ['id', 'email', 'home'], order }),
    alias: () => db.select('users', { manager_id: 1 }, { alias: 'u', order }),
    distinctTrue: () => db.select('users', all, { columns: ['manager_id'], distinct: true }),
    distinctTrueExtras: () => db.select('users', all, { columns: ['manager_id'], distinct: true, extras: { m: sql`coalesce(${'manager_id'}, 0)` } }),
    distinctColumn: () => db.select('accounts', all, { distinct: 'owner_id', order: [{ by: 'owner_id', direction: 'ASC' }, { by: 'id', direction: 'DESC' }] }),
    distinctExtras: () => db.select('accounts', all, {
      distinct: ['owner_id'], extras: { twice: sql`${'balance'} * 2` },
      order: [{ by: 'owner_id', direction: 'ASC' }, { by: 'id', direction: 'DESC' }],
    }),
    groupBy: () => db.select('accounts', all, { columns: ['owner_id'], extras: { n: sql<db.SQL, number>`count(*)` }, groupBy: 'owner_id', having: sql`count(*) > 0`, order: { by: 'owner_id', direction: 'ASC' } }),
    // every column, grouped by the key, with an aggregate in extras: the row level keeps it at its level
    groupByEveryColumn: () => db.select('users', all, { extras: { n: sql<db.SQL, number>`count(*)` }, groupBy: 'id', order }),
    window: () => db.select('users', all, { extras: { rank: sql<db.SQL, number>`row_number() OVER (ORDER BY ${'display_name'} DESC)` }, order }),
    lateral: () => db.select('users', all, { order, lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { order }) } }),
    lateralColumns: () => db.select('users', all, {
      columns: ['id', 'email'], order,
      lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['id', 'balance'], order }), n: count() },
    }),
    nested: () => db.select('users', all, {
      order, extras: { upper: sql`upper(${'display_name'})` },
      lateral: {
        reports: db.select('users', { manager_id: parent('id') }, { alias: 'r', order, lateral: { n: db.count('accounts', { owner_id: parent('id') }) } }),
        first: db.selectOne('accounts', { owner_id: parent('id') }, { order, extras: { twice: sql`${'balance'} * 2` } }),
      },
    }),
    lock: () => db.select('users', { id: 1 }, { lock: { for: 'UPDATE', of: 'users' }, lateral: { n: count() } }),
    noColumnsLateral: () => db.selectOne('users', { id: 1 }, { columns: [], lateral: { n: count() } }),
    passthrough: () => db.select('users', all, { order, lateral: db.selectOne('accounts', { owner_id: parent('id') }, { order }) }),
    selectOneExtras: () => db.selectOne('users', { id: 1 }, { extras: { latest: db.selectOne('accounts', ofUser, { order: { by: 'id', direction: 'DESC' } }) } }),
    selectOneNone: () => db.selectOne('users', { id: 0 }, { extras: { e: 'email' } }),
    selectExactlyOne: () => db.selectExactlyOne('users', { id: 2 }, { extras: { e: 'email' } }),
    selectRows: () => db.selectRows('users', all, { order, extras: { e: 'email' } }),
    none: () => db.select('users', sql`false`, { lateral: { n: count() } }),
    limitOffset: () => db.select('users', all, { order, limit: 1, offset: 1, extras: { e: 'email' } }),
    aggregateLateral: () => db.select('users', all, { columns: ['id'], order, lateral: { most: db.max('accounts', { owner_id: parent('id') }, { columns: ['balance'] }) } }),
    count: () => db.count('accounts', all),
    withCTEs: () => db.withCTEs({ none: db.insert('users', []), rich: db.select('accounts', sql`balance > 10`) }, db.select('users', all, { order, extras: { e: 'email' } })),
  };

  it.each(Object.keys(shapes))('%s', async name => {
    const { jsonb, json } = await bothWays(shapes[name]);
    expect(json).toEqual(jsonb);
  });

  it('selectExactlyOne() checking for a second row still finds it', async () => {
    db.setConfig({ selectExactlyOneChecksForSecondRow: true, shortcutsUseJson: true });
    await expect(db.selectExactlyOne('users', { manager_id: 1 }, { extras: { e: 'email' } }).run(t.client)).rejects.toThrow('One result expected but more returned');
  });

  it('a nested result is json', async () => {
    db.setConfig({ shortcutsUseJson: true });
    const q = db.selectOne('users', { id: 1 }, { columns: ['id'], lateral: { accounts: db.select('accounts', { owner_id: parent('id') }) } });
    expect(await sql`SELECT json_typeof((${q})) AS v`.run(t.client)).toEqual([{ v: 'object' }]);
    // characterization: a jsonb function over the nested json fails (42883), as note 018 § 4 says
    expect(await pgError(t.client, () => sql`SELECT jsonb_typeof((${q})) AS v`.run(t.client))).toMatchObject({ code: '42883' });
  });
});

describe('shortcutsUseJson: a key equal to a column', () => {
  it('is written twice, and the key last written wins, as || makes it win', async () => {
    const { jsonb, json } = await bothWays(() => db.select('users', all, { extras: { email: sql`upper(${'email'})` }, order: { by: 'email', direction: 'ASC' } }));
    expect(json.map((u: any) => u.email)).toEqual(['ADA@EXAMPLE.COM', 'BOB@EXAMPLE.COM', 'CYD@EXAMPLE.COM']);
    expect(json).toEqual(jsonb);
  });

  it('a string order.by is written after the alias, where a bare name would be ambiguous (42702)', async () => {
    db.setConfig({ shortcutsUseJson: true });
    const bare = db.select('users', all, { extras: { email: sql`upper(${'email'})` }, order: { by: sql`${'email'}`, direction: 'ASC' } });
    expect(await pgError(t.client, () => bare.run(t.client))).toEqual({ code: '42702', message: 'ORDER BY "email" is ambiguous' });
  });
});

describe('shortcutsUseJson: json_build_object() and 100 arguments', () => {
  it('Postgres takes 100 arguments and refuses 102 (54023)', async () => {
    const pairs = (n: number) => Array.from({ length: n }, (_, i) => `'k${i}', ${i}`).join(', ');
    expect(Object.keys((await t.client.query(`SELECT json_build_object(${pairs(50)}) AS r`)).rows[0].r)).toHaveLength(50);
    expect(await pgError(t.client, () => t.client.query(`SELECT json_build_object(${pairs(51)}) AS r`)))
      .toEqual({ code: '54023', message: 'cannot pass more than 100 arguments to a function' });
  });

  it('50 keys run; 51 are refused before any query, and with the option off they run', async () => {
    const
      extras = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'id'])),
      q = () => db.selectOne('users', { id: 1 }, { columns: ['id', 'email'], extras: extras(49) }),
      sent: unknown[] = [];
    db.setConfig({ shortcutsUseJson: true });
    expect(Object.keys(await db.selectOne('users', { id: 1 }, { columns: ['id', 'email'], extras: extras(48) }).run(t.client) ?? {})).toHaveLength(50);
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(q().run(t.client)).rejects.toThrow('its 51 keys (columns, extras and lateral keys together) take 102');
    expect(sent).toHaveLength(0);
    db.setConfig({ shortcutsUseJson: false });
    expect(Object.keys(await q().run(t.client) ?? {})).toHaveLength(51);
  });

  it('a key a row level cannot alias is refused before any query', async () => {
    const sent: unknown[] = [];
    db.setConfig({ shortcutsUseJson: true, queryListener: query => sent.push(query) });
    for (const key of ['', 'a\0b', 'x'.repeat(64)]) {
      await expect(db.select('users', all, { extras: { [key]: 'email' } }).run(t.client)).rejects.toThrow('cannot be a column alias');
    }
    expect(sent).toHaveLength(0);
  });
});

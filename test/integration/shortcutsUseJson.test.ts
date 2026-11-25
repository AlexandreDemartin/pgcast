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
    expect(await sql`SELECT jsonb_typeof((${q})::jsonb) AS v, (${q}) ->> 'id' AS id`.run(t.client)).toEqual([{ v: 'object', id: '1' }]);
  });
});

describe('shortcutsUseJson: distinct: true over a passed-through lateral', () => {
  const
    owner = () => db.selectOne('users', { id: parent('owner_id') }),
    byId = (rows: any[]) => [...rows].sort((a, b) => a.id - b.id);

  it('select(): the same distinct rows, a json child compared as jsonb', async () => {
    const { jsonb, json } = await bothWays(() => db.select('accounts', all, { distinct: true, lateral: owner() }));
    expect(jsonb.map((u: any) => u.display_name).sort()).toEqual(['Ada', 'Bob']);
    expect(byId(json)).toEqual(byId(jsonb));
  });

  it('selectOne(): the same row', async () => {
    const { jsonb, json } = await bothWays(() => db.selectOne('accounts', { owner_id: 1 }, { distinct: true, lateral: owner() }));
    expect(jsonb).toMatchObject({ display_name: 'Ada' });
    expect(json).toEqual(jsonb);
  });

  it('a copy() or withCTEs() child, with a CTE or none: the same rows, as it stands for the shortcut', async () => {
    const children: Record<string, () => db.SQLFragment<any>> = {
      copy: () => owner().copy(),
      withCTE: () => db.withCTEs({ s: sql`SELECT 1` }, owner()),
      withNoCTE: () => db.withCTEs({}, owner()),
    };
    for (const child of Object.values(children)) {
      const { jsonb, json } = await bothWays(() => db.select('accounts', all, { distinct: true, lateral: child() }));
      expect(jsonb.map((u: any) => u.display_name).sort()).toEqual(['Ada', 'Bob']);
      expect(byId(json)).toEqual(byId(jsonb));
    }
  });

  it('a count() child keeps its bigint, a string', async () => {
    const { jsonb, json } = await bothWays(() => db.selectOne('users', { id: 1 }, { distinct: true, lateral: db.count('accounts', { owner_id: parent('id') }) }));
    expect(jsonb).toBe('2');
    expect(json).toBe('2');
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

describe('shortcutsUseJson with topLevelSelectAsRows (note 018 § 3): the same results each way', () => {
  const
    combinations = {
      off: { shortcutsUseJson: false, topLevelSelectAsRows: false },
      json: { shortcutsUseJson: true, topLevelSelectAsRows: false },
      rows: { shortcutsUseJson: false, topLevelSelectAsRows: true },
      both: { shortcutsUseJson: true, topLevelSelectAsRows: true },
    },
    /** The query built and run under each combination of the two options. */
    eachWay = async (build: () => db.SQLFragment<any, any>) => {
      const results: Record<string, any> = {};
      for (const [name, config] of Object.entries(combinations)) {
        db.setConfig(config);
        results[name] = await build().run(t.client);
      }
      return results;
    },
    owner = () => db.selectOne('users', { id: parent('owner_id') }),
    byId = (rows: any[]) => [...rows].sort((a, b) => a.id - b.id),
    shapes: Record<string, () => db.SQLFragment<any, any>> = {
      users: () => db.select('users', all, { order }),
      columns: () => db.select('users', all, { columns: ['id', 'email', 'home'], order }),
      alias: () => db.select('users', { manager_id: 1 }, { alias: 'u', order }),
      extras: () => db.select('users', all, { order, limit: 2, offset: 1, extras: { upper: sql`upper(${'display_name'})` } }),
      groupBy: () => db.select('accounts', all, { columns: ['owner_id'], extras: { n: sql<db.SQL, number>`count(*)` }, groupBy: 'owner_id', order: { by: 'owner_id', direction: 'ASC' } }),
      lateral: () => db.select('users', all, { order, lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { order }), n: count() } }),
      lateralColumns: () => db.select('users', all, { columns: ['id'], order, lateral: { accounts: db.select('accounts', { owner_id: parent('id') }, { columns: ['id', 'balance'], order }) } }),
      passthrough: () => db.select('users', all, { order, lateral: db.selectOne('accounts', { owner_id: parent('id') }, { order }) }),
      passthroughCount: () => db.select('users', all, { order, lateral: count() }),
      none: () => db.select('users', sql`false`, { lateral: { n: count() } }),
      withCTEs: () => db.withCTEs({ rich: db.select('accounts', sql`balance > 10`) }, db.select('users', all, { order, extras: { e: 'email' } })),
    };

  it.each(Object.keys(shapes))('%s', async name => {
    const results = await eachWay(shapes[name]);
    for (const combination of ['json', 'rows', 'both']) expect(results[combination], combination).toEqual(results.off);
  });

  it('distinct: true, its jsonb rows compared as today, over a passed-through json child too: the same distinct rows', async () => {
    const
      byManager = (rows: any[]) => [...rows].sort((a, b) => (a.manager_id ?? 0) - (b.manager_id ?? 0)),
      managers = await eachWay(() => db.select('users', all, { columns: ['manager_id'], distinct: true })),
      owners = await eachWay(() => db.select('accounts', all, { distinct: true, lateral: owner() }));
    expect(byManager(managers.off)).toEqual([{ manager_id: null }, { manager_id: 1 }]);
    expect(owners.off.map((u: any) => u.display_name).sort()).toEqual(['Ada', 'Bob']);
    for (const combination of ['json', 'rows', 'both']) {
      expect(byManager(managers[combination]), combination).toEqual(byManager(managers.off));
      expect(byId(owners[combination]), combination).toEqual(byId(owners.off));
    }
  });

  it('both keep the json key order of a row, a passed-through child\'s included', async () => {
    for (const build of [shapes.users, shapes.lateral, shapes.passthrough]) {
      const results = await eachWay(build);
      expect(Object.keys(results.both[0])).toEqual(Object.keys(results.json[0]));
    }
  });
});

describe('shortcutsUseJson in the writes\' RETURNING: the same results both ways', () => {
  const
    /** The write built and run with the option off, then on, each in a savepoint rolled back, so both see the same rows. */
    bothWrites = async <R>(build: () => db.SQLFragment<R, any>) => {
      const results: Record<string, any> = {};
      for (const [name, value] of [['jsonb', false], ['json', true]] as const) {
        db.setConfig({ shortcutsUseJson: value });
        await t.client.query('SAVEPOINT both_ways');
        results[name] = await build().run(t.client);
        await t.client.query('ROLLBACK TO SAVEPOINT both_ways');
      }
      return results as { jsonb: R; json: R };
    },
    // every type of accounts, its id given, so that both runs insert the same row
    account = { id: 1000, owner_id: 1, balance: 12.5, overdraft_limit: 5, lifetime_ops: '9007199254740993', ratio: 0.25, scores: [1, 2], flags: [true, false], grid: [[1, 2], [3, 4]], opened_on: '2026-01-02' },
    ofOwner = { id: sql`${db.self} = "accounts"."owner_id"` },
    ofUser = { owner_id: sql`${db.self} = "users"."id"` },
    newOrg = { country: 'DE', code: 'acme-berlin', name: 'Acme Berlin' },
    oldOrg = { country: 'FR', code: 'acme', name: 'Acme' },
    orgKey = ['country', 'code'] as const,
    upperName = { upper: sql`upper(${'name'})` },
    writes: Record<string, () => db.SQLFragment<any, any>> = {
      insert: () => db.insert('accounts', account),
      insertMany: () => db.insert('accounts', [account, { ...account, id: 1001 }], { returning: ['id', 'balance', 'grid'], extras: { twice: sql`${'balance'} * 2` } }),
      insertExtras: () => db.insert('accounts', account, { extras: { twice: sql`${'balance'} * 2`, owner: db.selectOne('users', ofOwner, { lateral: { n: db.count('accounts', { owner_id: parent('id') }) } }) } }),
      insertSelectExtras: () => db.insert('accounts', account, { extras: { team: db.select('users', { manager_id: sql`${db.self} = "accounts"."owner_id"` }, { order, extras: { e: 'email' } }) } }),
      insertKeyIsColumn: () => db.insert('accounts', account, { extras: { balance: sql`${'balance'} * 2` } }),
      insertReturningNone: () => db.insert('accounts', account, { returning: [], extras: { b: 'balance' } }),
      upsertInsert: () => db.upsert('orgs', newOrg, [...orgKey]),
      upsertUpdate: () => db.upsert('orgs', oldOrg, [...orgKey], { extras: upperName }),
      upsertMany: () => db.upsert('orgs', [newOrg, oldOrg], [...orgKey], { returning: ['code'], extras: upperName }),
      upsertReturningNone: () => db.upsert('orgs', [newOrg, oldOrg], [...orgKey], { returning: [] }),
      upsertActionKey: () => db.upsert('orgs', oldOrg, [...orgKey], { extras: { $action: sql`'x'` } }),
      upsertSuppress: () => db.upsert('orgs', oldOrg, [...orgKey], { reportAction: 'suppress', extras: upperName }),
      upsertDoNothing: () => db.upsert('orgs', oldOrg, [...orgKey], { updateColumns: db.doNothing }),
      update: () => db.update('users', { display_name: 'Ada L.' }, { id: 1 }, { extras: { upper: sql`upper(${'display_name'})`, accounts: db.select('accounts', ofUser, { order }) } }),
      updateReturning: () => db.update('users', { mood: 'ok' }, { manager_id: 1 }, { returning: ['id', 'home', 'settings', 'tags', 'created_at'], extras: { n: db.count('accounts', ofUser) } }),
      updateNone: () => db.update('users', { display_name: 'x' }, sql`false`, { extras: { upper: sql`upper(${'display_name'})` } }),
      deletes: () => db.deletes('products', { id: 2 }),
      deletesExtras: () => db.deletes('memberships', { user_id: 2 }, { extras: { org: db.selectOne('orgs', { country: sql`${db.self} = "memberships"."org_country"`, code: sql`${db.self} = "memberships"."org_code"` }) } }),
      insertNoop: () => db.insert('accounts', []),
      upsertNoop: () => db.upsert('orgs', [], [...orgKey]),
      cte: () => db.withCTEs({ w: db.insert('accounts', account, { extras: { twice: sql`${'balance'} * 2` } }) }, sql`SELECT result FROM "w"`),
      cteMain: () => db.withCTEs({ s: db.select('users', { id: 1 }) }, db.upsert('orgs', [newOrg, oldOrg], [...orgKey])),
      cteNoop: () => db.withCTEs({ none: db.insert('accounts', []), nothing: db.upsert('orgs', [], [...orgKey]) }, db.update('users', { display_name: 'x' }, { id: 2 }, { extras: { upper: sql`upper(${'display_name'})` } })),
      cteNoopMain: () => db.withCTEs({ s: db.select('users', { id: 1 }) }, db.insert('accounts', [])),
      cteUpdateNone: () => db.withCTEs({ u: db.update('users', { display_name: 'x' }, sql`false`) }, sql`SELECT count(*) AS n FROM "u"`),
      inSql: () => sql`WITH "w" AS (${db.deletes('memberships', { user_id: 2 }, { extras: { r: sql`upper(${'role'})` } })}) SELECT result FROM "w"`,
    };

  it.each(Object.keys(writes))('%s', async name => {
    const { jsonb, json } = await bothWrites(writes[name]);
    expect(json).toEqual(jsonb);
  });

  it('upsert(): each row\'s $action, INSERT or UPDATE, last written where extras has one too', async () => {
    const many = await bothWrites(writes.upsertMany), key = await bothWrites(writes.upsertActionKey);
    expect(many.json).toEqual([{ code: 'acme-berlin', upper: 'ACME BERLIN', $action: 'INSERT' }, { code: 'acme', upper: 'ACME', $action: 'UPDATE' }]);
    expect(key.json).toMatchObject({ code: 'acme', $action: 'UPDATE' });
    expect(await bothWrites(writes.upsertDoNothing)).toEqual({ jsonb: undefined, json: undefined });
  });

  it('a json column keeps its keys as stored, and a row its columns\' order, then extras, then $action', async () => {
    const
      zoo = (options = {}) => db.insert('extra.type_zoo', { c_int8: '9007199254740993', c_float8: 1.5, c_json: { zeta: 1, a: { yy: 2, b: 3 } }, c_jsonb: { zeta: 1, a: 2 }, c_timestamptz: '2026-01-02T03:04:05Z' }, options),
      withoutId = ({ id, ...row }: any) => row,
      plain = await bothWrites(() => zoo()),
      extras = await bothWrites(() => zoo({ extras: { j: 'c_json', f: sql`${'c_float8'} * 2` } })),
      returning = await bothWrites(() => zoo({ returning: ['c_json', 'c_int8'], extras: { j: 'c_json' } }));
    expect(withoutId(plain.json)).toEqual(withoutId(plain.jsonb));
    expect(withoutId(extras.json)).toEqual(withoutId(extras.jsonb));
    expect(returning.json).toEqual(returning.jsonb);
    expect(Object.keys(plain.json).slice(0, 3)).toEqual(['id', 'c_int2', 'c_int4']);
    expect(Object.keys(extras.json)).toEqual([...Object.keys(plain.json), 'j', 'f']);
    expect(Object.keys(returning.json)).toEqual(['c_json', 'c_int8', 'j']);
    expect(Object.keys(extras.json.c_json)).toEqual(['zeta', 'a']);
    expect(Object.keys(extras.jsonb.c_json)).toEqual(['a', 'zeta']);
    const orgs = await bothWrites(writes.upsertMany), org = await bothWrites(writes.upsertUpdate);
    expect(Object.keys(orgs.json[0])).toEqual(['code', 'upper', '$action']);
    expect(Object.keys(org.json)).toEqual(['country', 'code', 'name', 'parent_country', 'parent_code', 'upper', '$action']);
  });

  it('a write\'s result read from a CTE is json: DISTINCT over it fails (42883), as note 018 § 4 says, and ::jsonb works', async () => {
    db.setConfig({ shortcutsUseJson: true });
    const w = () => db.upsert('orgs', [newOrg, oldOrg], [...orgKey], { returning: ['code'] });
    expect(await pgError(t.client, () => db.withCTEs({ w: w() }, sql`SELECT DISTINCT result FROM "w"`).run(t.client))).toMatchObject({ code: '42883' });
    expect(await db.withCTEs({ w: w() }, sql`SELECT DISTINCT result::jsonb ->> 'code' AS code FROM "w" ORDER BY code`).run(t.client)).toEqual([{ code: 'acme' }, { code: 'acme-berlin' }]);
  });

  it('a partition whose columns sit where the table\'s do still refuses $action (0A000), both ways', async () => {
    for (const value of [false, true]) {
      db.setConfig({ shortcutsUseJson: value });
      expect(await pgError(t.client, () => db.upsert('events', { id: 1000, occurred_on: '2025-06-02', kind: 'k' }, ['id', 'occurred_on']).run(t.client)))
        .toMatchObject({ code: '0A000', message: 'cannot retrieve a system column in this context' });
    }
  });

  it('50 keys run, $action included; 51 are refused before any query, and off they run', async () => {
    const
      extras = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'code'])),
      q = (n: number) => db.upsert('orgs', oldOrg, [...orgKey], { returning: ['code'], extras: extras(n) }),
      sent: unknown[] = [];
    db.setConfig({ shortcutsUseJson: true });
    expect(Object.keys(await q(48).run(t.client) ?? {})).toHaveLength(50);
    db.setConfig({ queryListener: query => sent.push(query) });
    await expect(q(49).run(t.client)).rejects.toThrow('its 51 keys (`returning`, `extras` and `$action` together) take 102');
    for (const key of ['', 'a\0b', 'x'.repeat(64)]) {
      await expect(db.insert('accounts', account, { extras: { [key]: 'id' } }).run(t.client)).rejects.toThrow('cannot be a column alias');
    }
    expect(sent).toHaveLength(0);
    db.setConfig({ shortcutsUseJson: false });
    expect(Object.keys(await q(49).run(t.client) ?? {})).toHaveLength(51);
  });
  it('characterisation: beside every column, what RETURNING refuses may run in the subquery, where Postgres no longer sees it in RETURNING', async () => {
    const
      outcome = async (value: boolean, extra: db.SQLFragment<any>, options = {}) => {
        db.setConfig({ shortcutsUseJson: value });
        await t.client.query('SAVEPOINT refused');
        try { return (await db.upsert('orgs', oldOrg, [...orgKey], { ...options, extras: { x: extra } }).run(t.client))?.x ?? null; }
        catch (err) { return (err as { code?: string }).code; }
        finally { await t.client.query('ROLLBACK TO SAVEPOINT refused'); }
      },
      both = async (extra: db.SQLFragment<any>, options = {}) => [await outcome(false, extra, options), await outcome(true, extra, options)];
    // an aggregate of no column, a window function and a set-returning one take the subquery's one row
    expect(await both(sql`count(*)`)).toEqual(['42803', 1]);
    expect(await both(sql`row_number() OVER ()`)).toEqual(['42P20', 1]);
    expect(await both(sql`generate_series(1, 2)`)).toEqual(['0A000', '21000']);
    // an aggregate of a column stays at its level, and beside returning the extras stay in RETURNING
    expect(await both(sql`count(${'code'})`)).toEqual(['42803', '42803']);
    expect(await both(sql`count(*)`, { returning: ['code'] })).toEqual(['42803', '42803']);
  });
});

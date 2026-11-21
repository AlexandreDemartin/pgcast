// Copyright (C) 2026 Alexandre Demartin

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { afterAll, beforeAll, expect, inject, it, vi } from 'vitest';
import { createTemplateDatabase, dropDatabase, urlForDatabase, withAdminClient } from '../../../test/helpers/databases';
import { describeQuery } from '../src/describe';

const name = `pgcast_test_${process.pid}_codex_origins`, cli = resolve(__dirname, '../dist/cli.js'),
  n = 'number', nn = 'number | null', s = 'string', sn = 'string | null', json = 'JSONValue | null',
  boundary = 'SELECT b.id FROM users u JOIN accounts a ON u.id=a.id AND a.id=1LEFT JOIN accounts b ON false';
type Replay = [name: string, sql: string, types: string[], rows: unknown[][], min?: number, max?: number];

const replays: Replay[] = [
  ['table', 'SELECT id, manager FROM users', [n, nn], [[1, null], [2, 1]]],
  ['inner', 'SELECT u.id, manager, balance FROM users u JOIN accounts a ON u.id=a.id', [n, nn, s], [[1,null,'10']]],
  ['left', 'SELECT u.id, a.id AS account_id, balance FROM users u LEFT JOIN accounts a ON u.id=a.id',
    [nn, nn, sn], [[1,1,'10'],[2,null,null]]],
  ['right', 'SELECT u.id, balance FROM users u RIGHT JOIN accounts a ON u.id=a.id', [nn,sn], [[1,'10'],[null,'30']]],
  ['full', 'select id, balance from users full join accounts using (id)', [nn,sn], [[1,'10'],[2,null],[3,'30']]],
  ['using', 'SELECT id FROM users JOIN accounts USING (id)', [n], [[1]]],
  ['natural', 'SELECT id FROM users NATURAL JOIN accounts', [n], [[1]]],
  ['cross lateral', 'SELECT l.balance FROM users u CROSS JOIN LATERAL (SELECT balance FROM accounts WHERE id=u.id) l', [s], [['10']]],
  ['inner lateral', 'SELECT l.balance FROM users u JOIN LATERAL (SELECT balance FROM accounts WHERE id=u.id) l ON true', [s], [['10']]],
  ['left lateral', 'SELECT u.id, l.j FROM users u LEFT JOIN LATERAL (SELECT to_jsonb(balance) AS j FROM accounts WHERE id=u.id) l ON true',
    [nn,json], [[1,10],[2,null]]],
  ['subquery', 'SELECT id FROM (SELECT id FROM users) q', [n], [[1],[2]]],
  ['scalar subquery', 'SELECT (SELECT balance FROM accounts WHERE id=u.id) AS b FROM users u', [sn], [['10'],[null]]],
  ['cte', 'WITH q AS (SELECT balance FROM accounts) SELECT balance FROM q', [s], [['10'],['30']]],
  ['case', 'SELECT CASE WHEN id=1 THEN id END AS x FROM users', [nn], [[1],[null]]],
  ['coalesce', 'SELECT coalesce(manager,0) AS x, coalesce(manager,NULL) AS y FROM users', [nn,nn], [[0,null],[1,1]]],
  ['count', 'SELECT count(*) FROM accounts WHERE false', [sn], [['0']]],
  ['empty aggregates', 'SELECT max(balance), sum(balance) FROM accounts WHERE false', [sn,sn], [[null,null]]],
  ['json aggregate', 'SELECT u.id, (SELECT json_agg(a.balance) FROM accounts a WHERE a.id=u.id) AS j FROM users u',
    [n,json], [[1,[10]],[2,null]]],
  ['union', 'SELECT id FROM users UNION SELECT id FROM accounts', [nn], [[1],[2],[3]]],
  ['view', 'SELECT id FROM user_ids', [nn], [[1],[2]]],
  ...['ROLLUP(id)', 'CUBE(id)', 'grouping sets ((id), ())'].map((group): Replay =>
    [group, 'SELECT id, sum(balance) FROM accounts GROUP BY ' + group, [nn,sn], [[1,'10'],[3,'30'],[null,'40']]]),
  ['plain partitions', 'SELECT id FROM events', [n], [[1],[2]]],
  ...['imported', 'parts', 'nested'].map((rel): Replay => [rel, 'SELECT id, label FROM ' + rel, [nn,sn], [[1,null]]]),
  ...['parent', 'child'].map((rel): Replay => [rel, 'SELECT x FROM ' + rel, [nn], [[null]], 14, 17]),
  ['parent-only constraint', 'SELECT x FROM parent_only', [nn], [[null]]],
  ['non-inheritable constraint', 'SELECT x FROM local_parent', [nn], [[null]], 18],
  ['insert', 'INSERT INTO users (id,scores) VALUES (4,ARRAY[2]) RETURNING id,manager', [n,nn], [[4,null]]],
  ['update from', 'UPDATE users u SET manager=2 FROM accounts a WHERE u.id=a.id RETURNING u.id,a.balance', [n,s], [[1,'10']]],
  ['merge delete', 'MERGE INTO users u USING accounts a ON u.id=a.id WHEN MATCHED THEN UPDATE SET manager=2 WHEN NOT MATCHED BY SOURCE THEN DELETE RETURNING u.id, a.id AS source_id, a.balance',
    [nn,nn,sn], [[1,1,'10'],[2,null,null]], 17],
  ['merge insert', 'MERGE INTO accounts a USING users u ON a.id=u.id WHEN NOT MATCHED THEN INSERT VALUES (u.id,0) RETURNING a.id, u.id AS source_id, a.balance',
    [nn,nn,sn], [[2,2,'0']], 17],
  ['returning old', 'INSERT INTO versions VALUES (2) RETURNING old.*', [nn], [[null]], 18],
  ['returning new', 'DELETE FROM versions RETURNING new.*', [nn], [[null]], 18],
  ['escaped old', String.raw`INSERT INTO versions VALUES (2) RETURNING U&"\006fld".id`, [nn], [[null]], 18],
  ['escaped new', String.raw`DELETE FROM versions RETURNING u&"n\0065w".id`, [nn], [[null]], 18],
  ['custom escape', `INSERT INTO versions VALUES (2) RETURNING U&"!006fld" UESCAPE '!'.id`, [nn], [[null]], 18],
  ['unicode guard in literal', "SELECT id FROM versions WHERE 'menu&more' <> ''", [nn], [[1]]],
  ['unicode guard in comment', 'SELECT id FROM versions /* U& */', [nn], [[1]]],
  ['rewrite rule', 'INSERT INTO rule_target VALUES (1) RETURNING id', [nn], [[null]]],
  ['rule on descendant', 'SELECT id FROM rule_parent', [nn], [[1]]],
  ['returning alias', 'INSERT INTO versions VALUES (2) RETURNING WITH (OLD AS o) o.*', [nn], [[null]], 18],
  ['unvalidated child', 'SELECT x FROM checked_parent', [nn], [[null]], 18],
  ['not valid', 'SELECT x FROM unchecked', [nn], [[null]], 18],
  ['literal', "SELECT id FROM users WHERE 'left' <> ''", [nn], [[1],[2]]],
  ['quoted identifier', 'SELECT id AS "right" FROM users', [nn], [[1],[2]]],
  ['comment', 'SELECT id /* fUlL */ FROM users', [nn], [[1],[2]]],
  ['inside identifier', 'SELECT id AS leftover, id AS bright FROM users', [n,n], [[1,1],[2,2]]],
  ['escaped quote', String.raw`SELECT balance, E'\'' AS q FROM users LEFT JOIN accounts USING (id)`, [sn,sn], [['10',"'"],[null,"'"]]],
  ['dollar identifier', "SELECT balance AS b$x$ FROM users LEFT JOIN accounts USING (id) WHERE 'b$x$' <> ''", [sn], [['10'],[null]]],
  ['digit boundary', boundary, [nn], [[null]], 14, 14],
  ['enum alias', 'SELECT mood AS feeling FROM users', ['"a\\"b" | "ok" | null'], [['ok'],['a"b']]],
  ['excluded', 'SELECT mood FROM excluded', [s], [['ok']]],
  ['catalogue', "SELECT relname FROM pg_catalog.pg_class WHERE oid='users'::regclass", [s], [['users']], 14, 17],
  ['catalogue without a validated constraint', "SELECT relname FROM pg_catalog.pg_class WHERE oid='users'::regclass", [sn], [['users']], 18],
  ['enum domain', 'SELECT value FROM feelings', ['"a\\"b" | "ok"'], [['ok']]],
  ['originless enum', "SELECT 'ok'::extra.mood AS feeling", [sn], [['ok']]],
  ['domain', 'SELECT scores FROM users', ['PgArray<number>'], [[[1.25,null]],[[2]]]],
];

let url: string, dir: string, client: Client, version: number, written: string;
const supported = ([,,,, min = 14, max = Infinity]: Replay) => version >= min && version <= max;

async function generate(cases: Replay[], preload?: string) {
  const source = cases.map(([key, sql], i) => 'export const q' + i + '=db.sql<never, Row<' +
    JSON.stringify(key) + '>[]>`' + sql.replace(/\\/g, '\\\\') + '`;');
  writeFileSync(join(dir, 'app.ts'), ["import * as db from 'zapatos/db';", "import type { Row } from './zapatos/queries';", ...source].join('\n'));
  const args = preload ? ['--require', './preload.cjs', cli] : [cli];
  if (preload) writeFileSync(join(dir, 'preload.cjs'), preload);
  await promisify(execFile)(process.execPath, args, { cwd: dir, env: { ...process.env, ORIGINS_DB: url } });
  return readFileSync(join(dir, 'zapatos/queries.ts'), 'utf8');
}

async function check([key, text, types, expected]: Replay, module: string) {
  await client.query('BEGIN');
  try {
    const { fields, rows } = await client.query({ text, rowMode: 'array' });
    expect(rows.sort()).toEqual([...expected].sort());
    const start = module.split('  ' + JSON.stringify(key) + ': {\n')[1]?.split('    row: {\n')[1];
    expect(start?.split('    };')[0]).toBe(fields.map((field, i) => `      ${JSON.stringify(field.name)}: ${types[i]};\n`).join(''));
  } finally {
    await client.query('ROLLBACK');
  }
}

beforeAll(async () => {
  const admin = inject('pgcastDb')!.url;
  await withAdminClient(admin, c => createTemplateDatabase(c, name));
  url = urlForDatabase(admin, name);
  client = new Client({ connectionString: url });
  client.on('error', () => {}); // A failed connection surfaces on its next query.
  await client.connect();
  version = Math.floor(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) / 10000);
  await client.query(readFileSync(join(__dirname, 'fixtures/origins.sql'), 'utf8'));
  await client.query(version < 18 ? `
    CREATE TABLE parent (x int NOT NULL); CREATE TABLE child () INHERITS (parent);
    ALTER TABLE child ALTER x DROP NOT NULL; INSERT INTO child VALUES (NULL);
  ` : `
    CREATE TABLE local_parent (x int NOT NULL NO INHERIT); CREATE TABLE child () INHERITS (local_parent);
    INSERT INTO child VALUES (NULL);
    CREATE TABLE checked_parent (x int NOT NULL NO INHERIT); CREATE TABLE unchecked_child () INHERITS (checked_parent);
    INSERT INTO unchecked_child VALUES (NULL); ALTER TABLE unchecked_child ADD CONSTRAINT child_x NOT NULL x NOT VALID;
    CREATE TABLE unchecked (x int); INSERT INTO unchecked VALUES (NULL);
    ALTER TABLE unchecked ADD CONSTRAINT required_x NOT NULL x NOT VALID;
  `);
  dir = mkdtempSync(join(tmpdir(), 'pgcast-origins-'));
  mkdirSync(join(dir, 'node_modules/@pgcast'), { recursive: true });
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'node_modules/typescript'), 'dir');
  for (const name of ['zapatos', '@pgcast/pgcast']) symlinkSync(dirname(require.resolve('@pgcast/pgcast/db')), join(dir, 'node_modules', name), 'dir');
  writeFileSync(join(dir, 'tsconfig.json'), '{"files":["app.ts"]}');
  writeFileSync(join(dir, 'pgcastconfig.json'), JSON.stringify({
    db: { connectionString: '{{ORIGINS_DB}}' }, schemas: { public: { include: '*', exclude: ['excluded'] } },
  }));
  written = await generate(replays.filter(supported));
});
afterAll(async () => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  await client?.end();
  if (url) await withAdminClient(inject('pgcastDb')!.url, c => dropDatabase(c, name));
});

for (const replay of replays) {
  const [key,,,, min, max] = replay;
  it(key + (min ? ` (Postgres ${max ? min + '-' + max : min + '+'})` : ''), async ctx => {
    ctx.skip(!supported(replay), 'server_version_num outside the replay range');
    await check(replay, written);
  });
}

it('refuses 1LEFT after a digit (Postgres 15+)', async ctx => {
  ctx.skip(version < 15, 'server_version_num below 150000');
  await expect(describeQuery(client, boundary)).rejects.toMatchObject({ code: '42601' });
  await expect(client.query(boundary)).rejects.toMatchObject({ code: '42601' });
});

it('proves the repaired rows after VALIDATE CONSTRAINT (Postgres 18+)', async ctx => {
  ctx.skip(version < 18, 'server_version_num below 180000');
  await client.query('UPDATE unchecked SET x=2; ALTER TABLE unchecked VALIDATE CONSTRAINT required_x');
  const replay: Replay = ['validated', 'SELECT x FROM unchecked', [n], [[2]]];
  await check(replay, await generate([replay]));
});

it('binds each statement\'s origin pairs in one proof query', async () => {
  const cases: Replay[] = [
    ['ids', 'SELECT id, manager FROM users', [n,nn], [[1,null], [2,1]]],
    ['balances', 'SELECT balance FROM accounts', [s], [['10'], ['30']]],
  ];
  const module = await generate(cases, `
    const client = require(${JSON.stringify(require.resolve('pg'))}).Client.prototype, query = client.query;
    client.query = function (sql, ...args) {
      if (/\\bpg_inherits\\b/.test(sql?.text ?? sql)) {
        require('node:fs').appendFileSync('lookups', JSON.stringify(sql.values ?? args[0]) + '\\n');
      }
      return query.call(this, sql, ...args);
    };
  `);
  for (const replay of cases) await check(replay, module);
  const lookups = readFileSync(join(dir, 'lookups'), 'utf8').trim().split('\n');
  expect(lookups).toHaveLength(cases.length);
  for (const [i, [, text]] of cases.entries()) {
    const { fields } = await client.query(text);
    expect(JSON.parse(lookups[i])).toEqual([fields.map(f => f.tableID), fields.map(f => f.columnID)]);
  }
});

it('holds the Parse lock until the origin has been checked', async () => {
  const replay: Replay = ['migration', 'SELECT id FROM cyclecol', [nn], [[null]]];
  await client.query('CREATE TABLE cyclecol (id int); INSERT INTO cyclecol VALUES (NULL)');
  expect((await client.query(replay[1])).rows).toEqual([{ id: null }]);
  const module = await generate([replay], `
    const { Client } = require(${JSON.stringify(require.resolve('pg'))}), query = Client.prototype.query;
    Client.prototype.query = async function (sql, ...args) {
      if (sql !== 'ROLLBACK') return query.call(this, sql, ...args);
      Client.prototype.query = query;
      const migration = new Client({ connectionString: process.env.ORIGINS_DB });
      await migration.connect();
      try {
        const ddl = migration.query(\`
          ALTER TABLE cyclecol RENAME id TO previous;
          UPDATE cyclecol SET previous=1;
          ALTER TABLE cyclecol ALTER previous SET NOT NULL;
          ALTER TABLE cyclecol ADD id int;
        \`);
        let blocked = false;
        for (let i = 0; i < 100 && !blocked; i++) {
          const { rows } = await this.query('SELECT pg_backend_pid() = ANY(pg_blocking_pids($1)) AS blocked', [migration.processID]);
          blocked = rows[0].blocked;
          if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
        }
        await this.query('ROLLBACK');
        await ddl;
        require('node:assert/strict').ok(blocked, 'migration waited for Describe');
      } finally {
        await migration.end();
      }
    };
  `);
  await check(replay, module);
});

it('reads the committed constraint after Parse waits for a migration', async () => {
  const replay: Replay = ['migration first', 'SELECT id FROM waiting_column', [nn], [[null]]];
  await client.query('CREATE TABLE waiting_column (id int NOT NULL); INSERT INTO waiting_column VALUES (1)');
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE waiting_column ALTER id DROP NOT NULL; UPDATE waiting_column SET id = NULL');
    const [module] = await Promise.all([
      generate([replay]),
      vi.waitFor(async () => {
        const { rows } = await client.query(`
          SELECT FROM pg_locks WHERE relation = 'waiting_column'::regclass AND NOT granted
            AND pg_backend_pid() = ANY(pg_blocking_pids(pid))`);
        expect(rows).toHaveLength(1);
      }, { timeout: 10000, interval: 10 }).then(() => client.query('COMMIT')),
    ]);
    await check(replay, module);
  } finally {
    await client.query('ROLLBACK');
  }
});

it('keeps the wire type when a schema label differs from the catalogue', async () => {
  const replay: Replay = ['stale enum', 'SELECT mood FROM users', [sn], [['ok'], ['a"b']]],
    peer = JSON.stringify(require.resolve('@pgcast/pgcast/generate'));
  await check(replay, await generate([replay], `
    const generator = require(${peer});
    require.cache[${peer}].exports = { ...generator, enumDataForSchema: async () => ({ mood: ['a"b', 'stale'] }) };
  `));
});

it('reads every current enum label on regeneration', async () => {
  await client.query(`ALTER TYPE extra.mood ADD VALUE 'later'`);
  await client.query("UPDATE users SET mood='later' WHERE id=1");
  const replay: Replay = ['changed enum', 'SELECT mood FROM users', ['"a\\"b" | "later" | "ok" | null'], [['later'],['a"b']]];
  await check(replay, await generate([replay]));
});

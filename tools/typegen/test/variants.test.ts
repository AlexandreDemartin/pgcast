// Copyright (C) 2026 Alexandre Demartin

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';

const fixture = useTestDatabase(), db: typeof import('@pgcast/pgcast/db') = require('@pgcast/pgcast/db');
const cli = resolve(__dirname, '../dist/cli.js'), slot = '${param(x)}', forced = '${param(y, true)}';
let dir: string, url: string, pg: Client, id: number;
beforeAll(async () => {
  url = urlForDatabase(inject('pgcastDb')!.url, fixture.name);
  pg = new Client({ connectionString: url });
  await pg.connect();
  id = (await pg.query("INSERT INTO users (email, display_name) VALUES ('variant@example.com','Variant') RETURNING id")).rows[0].id;
  dir = mkdtempSync(join(tmpdir(), 'pgcast-variants-'));
  mkdirSync(join(dir, 'node_modules/@pgcast'), { recursive: true });
  for (const name of ['zapatos', '@pgcast/pgcast']) symlinkSync(dirname(require.resolve('@pgcast/pgcast/db')), join(dir, 'node_modules', name));
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'node_modules/typescript'));
  writeFileSync(join(dir, 'tsconfig.json'), '{"files":["app.ts"],"compilerOptions":{"types":[],"noLib":true}}');
  writeFileSync(join(dir, 'pgcastconfig.json'), '{"db":{"connectionString":"{{VARIANT_DB}}"}}');
});
afterAll(async () => {
  await pg?.end();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function generate(sql: string, preload = '') {
  writeFileSync(join(dir, 'app.ts'), "import { sql, param } from 'zapatos/db';\nimport type { Row } from './zapatos/queries';\n" +
    "sql<unknown, Row<'variant'>[]>`" + sql + "`;");
  writeFileSync(join(dir, 'preload.cjs'), preload);
  return spawnSync(process.execPath, ['--require', './preload.cjs', cli], { cwd: dir, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, VARIANT_DB: url } });
}
const written = () => readFileSync(join(dir, 'zapatos/queries.ts'), 'utf8');

it('drops the JSON form of an integer comparison beside literal and explicitly cast slots', async () => {
  const body = "SELECT u.${'id'} FROM users u WHERE u.id = " + slot + " AND ${param(a, 'int4')} = ${param(b, false)}";
  expect(generate(body).stderr).toBe('');
  const query = (v: unknown) => db.sql<unknown>`SELECT u.${'id'} FROM users u WHERE u.id = ${db.param(v)} AND ${db.param(1, 'int4')} = ${db.param(1, false)}`.compile();
  expect(written()).toContain(JSON.stringify(query(id).text));
  expect(written()).toContain('"id": number;');
  expect((await pg.query(query(id))).rows).toEqual([{ id }]);
  const settings = db.getConfig();
  try {
    db.setConfig({ castArrayParamsToJson: true });
    await expect(pg.query(query([id]))).rejects.toMatchObject({ code: '42883' });
  } finally { db.setConfig(settings); }
});

it('drops the JSON form of jsonb concatenation', async () => {
  expect(generate('SELECT settings || ' + slot + " AS s FROM users WHERE display_name = 'Variant'").stderr).toBe('');
  const query = (v: unknown) => db.sql`SELECT settings || ${db.param(v)} AS s FROM users WHERE display_name = 'Variant'`.compile();
  const value = { enabled: true };
  expect(written()).toContain(JSON.stringify(query(value).text));
  expect(written()).toContain('"s": JSONValue | null;');
  expect((await pg.query(query(value))).rows).toEqual([{ s: value }]);
  const settings = db.getConfig();
  try {
    db.setConfig({ castObjectParamsToJson: true });
    await expect(pg.query(query(value))).rejects.toMatchObject({ code: '42883' });
  } finally { db.setConfig(settings); }
});

it('describes all sixteen combinations and writes their common row', async () => {
  const body = 'SELECT ' + Array.from({ length: 4 }, (_, i) => '${param(v' + i + ', true)}::text AS f' + i).join(', ');
  const result = generate(body, `
    const { Client } = require(${JSON.stringify(require.resolve('pg'))}), connect = Client.prototype.connect;
    Client.prototype.connect = async function () {
      await connect.call(this);
      const parse = this.connection.parse.bind(this.connection);
      this.connection.parse = message => {
        require('fs').appendFileSync('texts', JSON.stringify(message.text) + '\\n');
        return parse(message);
      };
    };
  `);
  expect(result.stderr).toBe('');
  const texts = [];
  for (let mask = 0; mask < 16; mask++) {
    const values = Array.from({ length: 4 }, (_, i) => mask & (1 << i) ? [i] : String(i));
    const [a, b, c, d] = values.map(v => db.param(v, true));
    const query = db.sql`SELECT ${a}::text AS f0, ${b}::text AS f1, ${c}::text AS f2, ${d}::text AS f3`.compile();
    texts.push(query.text);
    const row = (await pg.query(query)).rows[0];
    for (const [i, v] of values.entries()) {
      expect(written()).toContain('"f' + i + '": string | null;');
      expect(row['f' + i]).toBe(Array.isArray(v) ? JSON.stringify(v) : v);
    }
  }
  expect(written()).toContain(JSON.stringify(texts[0]));
  expect(readFileSync(join(dir, 'texts'), 'utf8').trim().split('\n').map(line => JSON.parse(line))).toEqual(texts);
});

it('writes the first kept text when the all-plain form cannot infer a type', async () => {
  expect(generate('SELECT ' + forced + ' IS NULL AS missing').stderr).toBe('');
  const query = (v: unknown) => db.sql`SELECT ${db.param(v, true)} IS NULL AS missing`.compile();
  await expect(pg.query(query('x'))).rejects.toMatchObject({ code: '42P18' });
  expect(written()).toContain(JSON.stringify(query({}).text));
  expect(written()).toContain('"missing": boolean | null;');
  expect((await pg.query(query({}))).rows).toEqual([{ missing: false }]);
});

it('writes the first kept text when the all-plain operator is ambiguous', async () => {
  expect(generate('SELECT ' + forced + ' -> 0 AS item').stderr).toBe('');
  const query = (v: unknown) => db.sql`SELECT ${db.param(v, true)} -> 0 AS item`.compile();
  await expect(pg.query(query('x'))).rejects.toMatchObject({ code: '42725' });
  expect(written()).toContain(JSON.stringify(query([1]).text));
  expect(written()).toContain('"item": JSONValue | null;');
  expect((await pg.query(query([1]))).rows).toEqual([{ item: 1 }]);
});

it('keeps the previous file when only the JSON form needs a schema privilege', async () => {
  await pg.query(`
    CREATE SCHEMA variant_private;
    CREATE TABLE variant_private.films (id int);
    CREATE FUNCTION variant_name(text, text) RETURNS int LANGUAGE sql AS 'SELECT 1';
    CREATE FUNCTION variant_name(regclass, json) RETURNS int LANGUAGE sql AS 'SELECT 2';
  `);
  expect(generate('SELECT 1 AS previous').status).toBe(0);
  const path = join(dir, 'zapatos/queries.ts'), previous = readFileSync(path);
  const result = generate("SELECT variant_name('variant_private.films', " + forced + ') AS n',
    "process.env.PGOPTIONS = '-c role=pg_read_all_stats';");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Query "variant"');
  expect(result.stderr).toContain('CAST($1 AS "json")');
  expect(result.stderr).toMatch(/42501.*permission denied for schema variant_private/);
  expect(readFileSync(path)).toEqual(previous);
});

it('refuses text and JSON results for the same field', async () => {
  const result = generate('SELECT ' + forced + ' AS n');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(forced);
  expect(result.stderr).toContain('"n"');
  const query = (v: unknown) => db.sql`SELECT ${db.param(v, true)} AS n`.compile();
  expect((await pg.query(query('x'))).rows).toEqual([{ n: 'x' }]);
  expect((await pg.query(query([1, 2]))).rows).toEqual([{ n: [1, 2] }]);
});

it('reports the first Parse error when neither form parses', async () => {
  const query = (v: unknown) => db.sql`SELECT missing_variant(${db.param(v, true)})`.compile();
  await expect(pg.query(query('1'))).rejects.toMatchObject({ code: '42883', message: expect.stringContaining('missing_variant(unknown)') });
  await expect(pg.query(query([]))).rejects.toMatchObject({ code: '42883', message: expect.stringContaining('missing_variant(json)') });
  const result = generate('SELECT missing_variant(' + forced + ')');
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/42883.*missing_variant\(unknown\)/);
});

it('names all five ambiguous slots and the explicit cast alternatives', () => {
  const slots = Array.from({ length: 5 }, (_, i) => '${param(v' + i + ')}');
  const result = generate('SELECT ' + slots.join(', '));
  expect(result.status).toBe(1);
  for (const s of slots) expect(result.stderr).toContain(s);
  expect(result.stderr).toMatch(/cast.*false.*leave at most four ambiguous parameters/i);
});

it.each(['nullability', 'lock timeout'])('keeps the previous file after a %s change between descriptions', async reason => {
  const table = reason === 'nullability' ? 'nullable_variant' : 'locked_variant';
  await pg.query('CREATE TABLE ' + table + ' (n int NOT NULL); INSERT INTO ' + table + ' VALUES (1)');
  const query = (v: unknown) => db.sql<unknown>`SELECT n FROM ${table} WHERE ${db.param(v, true)}::text IS NOT NULL`.compile();
  expect((await pg.query(query('x'))).rows).toEqual([{ n: 1 }]);
  expect(generate('SELECT 1 AS previous').stderr).toBe('');
  const previous = written();
  const result = generate('SELECT n FROM ${' + JSON.stringify(table) + '} WHERE ' + forced + '::text IS NOT NULL', `
    const { Client } = require(${JSON.stringify(require.resolve('pg'))}), query = Client.prototype.query;
    Client.prototype.query = async function (sql, ...args) {
      const res = await query.call(this, sql, ...args);
      if (sql === 'ROLLBACK') {
        Client.prototype.query = query;
        ${reason === 'nullability' ? 'await this.query("ALTER TABLE nullable_variant ALTER n DROP NOT NULL; UPDATE nullable_variant SET n=NULL");' : `
          const locker = new Client({ connectionString: process.env.VARIANT_DB });
          await locker.connect();
          await locker.query('BEGIN; LOCK TABLE locked_variant IN ACCESS EXCLUSIVE MODE');
          const end = this.end.bind(this);
          this.end = async () => { await locker.end(); await end(); };
        `}
      }
      return res;
    };
  `);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(reason === 'nullability' ? /"n"/ : /55P03/);
  if (reason === 'nullability') {
    expect(result.stderr).toContain(forced);
    expect((await pg.query(query([]))).rows).toEqual([{ n: null }]);
  }
  expect(written()).toBe(previous);
});

it.each(['Describe', 'catalogue'])('keeps a server error from %s after Parse succeeds', stage => {
  expect(generate('SELECT 1 AS previous').stderr).toBe('');
  const previous = written();
  const result = generate('SELECT id FROM users WHERE ' + slot + '::text IS NOT NULL', stage === 'Describe' ? `
    const { Client } = require(${JSON.stringify(require.resolve('pg'))}), connect = Client.prototype.connect;
    Client.prototype.connect = async function () {
      await connect.call(this);
      const describe = this.connection.describe.bind(this.connection);
      let descriptions = 0;
      this.connection.describe = message => describe(++descriptions === 2 ? { type: 'S', name: 'absent_statement' } : message);
    };
  ` : `
    const { Client } = require(${JSON.stringify(require.resolve('pg'))}), query = Client.prototype.query;
    let proofs = 0;
    Client.prototype.query = function (sql, ...args) {
      if (sql === 'SHOW server_version_num' && ++proofs === 2) return query.call(this, 'SELECT missing_proof_column');
      return query.call(this, sql, ...args);
    };
  `);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(stage === 'Describe' ? /26000.*absent_statement/ : /42703.*missing_proof_column/);
  expect(written()).toBe(previous);
});

it('refuses two overloads returning the same fields in different order', async () => {
  await pg.query(`
    CREATE FUNCTION variant_fields(text) RETURNS TABLE (a int, b int, c int) LANGUAGE sql AS 'SELECT 1, 2, 3';
    CREATE FUNCTION variant_fields(json) RETURNS TABLE (a int, c int, b int) LANGUAGE sql AS 'SELECT 1, 3, 2';
  `);
  const result = generate('SELECT * FROM variant_fields(' + forced + ')');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('"b"');
  expect(result.stderr).toContain(forced);
  const query = (v: unknown) => db.sql`SELECT * FROM variant_fields(${db.param(v, true)})`.compile();
  expect((await pg.query({ ...query('x'), rowMode: 'array' })).rows).toEqual([[1, 2, 3]]);
  expect((await pg.query({ ...query([]), rowMode: 'array' })).rows).toEqual([[1, 3, 2]]);
});

// Copyright (C) 2026 Alexandre Demartin

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from 'pg';
import { afterEach, beforeEach, expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';

const db = useTestDatabase(), cli = resolve(__dirname, '../dist/cli.js');
const project = 'app/project.json', output = 'generated/zapatos/queries.ts';
let dir: string;
function put(file: string, contents: string | object) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 10_000, env: {
    ...process.env, TYPEGEN_DB: urlForDatabase(inject('pgcastDb')!.url, db.name), TYPEGEN_OUT: 'generated',
  } });
}
const source = (sql: string, name = 'people') => [
  "import * as db from 'zapatos/db';", "import type { Row } from '../generated/zapatos/queries';",
  "export const query = db.sql<never, Row<'" + name + "'>[]>`" + sql + "`;",
].join('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pgcast-cli-'));
  put(project, { files: ['app.ts'], compilerOptions: { types: [] } });
  put('app/app.ts', source('SELECT id FROM public.users'));
  const core = dirname(require.resolve('@pgcast/pgcast/db'));
  mkdirSync(join(dir, 'app/node_modules/@pgcast'), { recursive: true });
  for (const name of ['zapatos', '@pgcast/pgcast']) symlinkSync(core, join(dir, 'app/node_modules', name), 'dir');
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'app/node_modules/typescript'), 'dir');
  put('zapatosconfig.json', { db: { connectionString: '{{ TYPEGEN_DB }}' }, outDir: '{{TYPEGEN_OUT}}' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it.each(['static', 'app compiler', 'two compilers'])('generates from a referenced project with %s', layout => {
  mkdirSync(join(dir, 'node_modules'));
  renameSync(join(dir, 'app/node_modules/typescript'), join(dir, 'node_modules/typescript'));
  put('tsconfig.json', { files: [], references: [{ path: './' + project }] });
  const shared = layout === 'two compilers', file = shared ? 'shared/query.ts' : 'app/app.ts';
  put(project, { files: [shared ? '../' + file : 'app.ts'], compilerOptions: { composite: true, rootDir: '..', types: [] } });
  const peer = 'node_modules/@pgcast/pgcast', appPeer = 'app/' + peer, core = dirname(require.resolve('@pgcast/pgcast/db'));
  if (shared) {
    mkdirSync(join(dir, 'node_modules/@pgcast'));
    symlinkSync(core, join(dir, peer), 'dir');
    symlinkSync('@pgcast/pgcast', join(dir, 'node_modules/zapatos'), 'dir');
  }
  rmSync(join(dir, appPeer));
  put(appPeer + '/package.json', readFileSync(join(core, 'package.json'), 'utf8'));
  const marker = join(dir, 'compiled');
  if (layout !== 'static') put(appPeer + '/db.js', `
    const db = require('zapatos/db');
    exports.param = db.param;
    exports.sql = (...args) => {
      require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'app');
      return db.sql(...args);
    };
  `);
  put(file, source(layout === 'static' ? 'SELECT\\n7 AS id' : "SELECT ${db.param(7, 'int4')} AS id"));
  const result = run('--project', 'tsconfig.json');
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const rows = readFileSync(join(dir, output), 'utf8');
  if (layout === 'static') expect(rows).toContain(JSON.stringify('SELECT\n7 AS id'));
  else {
    expect(rows).toContain('SELECT CAST($1 AS \\"int4\\") AS id');
    expect(existsSync(marker) && readFileSync(marker, 'utf8')).toBe('app');
  }
});

it('prints help without reading the project or database config', () => {
  put('pgcastconfig.json', 'invalid');
  const result = run('--help');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('pgcast-typegen [--project <tsconfig>]');
});
it.each([['--check'], ['stray'], ['--project'], ['--project', '--help'], ['--help', 'stray']])(
  'rejects invalid arguments %s with usage', (...args) => {
    const result = run(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: pgcast-typegen');
  });

it('uses pgcastconfig first and reports both files', () => {
  put('pgcastconfig.json', { db: { connectionString: '{{TYPEGEN_DB}}' }, outDir: '{{TYPEGEN_OUT}}', moduleNames: 'pgcast' });
  put('zapatosconfig.json', 'invalid');
  const result = run('--project', project);
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).toContain('only pgcastconfig.json is read');
  expect(readFileSync(join(dir, 'generated/pgcast/queries.ts'), 'utf8')).toContain('export interface Queries {\n}');
});
it.each(['environment', 'db'])('connects with discrete settings from %s', mode => {
  const client = new Client({ connectionString: urlForDatabase(inject('pgcastDb')!.url, db.name) });
  const env = { ...process.env, PGHOST: client.host, PGPORT: String(client.port), PGDATABASE: client.database,
    PGUSER: client.user, PGPASSWORD: client.password ?? '' };
  rmSync(join(dir, 'zapatosconfig.json'));
  if (mode === 'db') {
    put('pgcastconfig.json', { db: { host: '{{PGHOST}}', port: client.port, database: '{{PGDATABASE}}',
      user: '{{PGUSER}}', password: '{{PGPASSWORD}}' } });
    env.PGPORT = '1';
  }
  put('app/app.ts', source('SELECT id FROM public.users').replace('../generated/zapatos', '../zapatos'));
  const result = spawnSync(process.execPath, [cli, '--project', project], { cwd: dir, env, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(readFileSync(join(dir, 'zapatos/queries.ts'), 'utf8')).toContain('"id": number;');
});
it('names the file and missing variable even in an array of nested options', () => {
  put('zapatosconfig.json', { schemas: { public: { include: ['{{TYPEGEN_MISSING_804}}'] } } });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('zapatosconfig.json');
  expect(result.stderr).toContain('TYPEGEN_MISSING_804');
});
it('refuses an explicit query_timeout before connecting', () => {
  put('pgcastconfig.json', { db: { host: '127.0.0.1', port: 1, query_timeout: 0 } });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('query_timeout');
  expect(result.stderr).not.toContain('ECONNREFUSED');
});
it('reports a refused connection at the named query without credentials', () => {
  const secret = 'private-804', url = 'postgres://reader:' + secret + '@127.0.0.1:1/db';
  put('zapatosconfig.json', { db: { connectionString: url }, outDir: 'generated' });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/app\.ts:3:22 .*people.*ECONNREFUSED/);
  for (const stream of [result.stdout, result.stderr]) {
    expect(stream.includes(secret) || stream.includes(url) || stream.includes('connectionString')).toBe(false);
  }
  expect(existsSync(join(dir, output))).toBe(false);
});
it('keeps the good file across scanner and Postgres failures and replaces it on recovery', () => {
  const generate = () => run('--project', project), read = () => readFileSync(join(dir, output));
  expect(generate().status).toBe(0);
  const first = read();
  expect(first.toString()).toContain('"id": number;');
  for (const [sql, message] of [['SELECT ${1}', 'placeholder'], ['SELECT absent FROM public.users', '42703']]) {
    put('app/app.ts', source(sql));
    const result = generate();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/app\.ts:3:22 .*people/);
    expect(result.stderr).toContain(message);
    expect(read()).toEqual(first);
  }
  put('app/app.ts', source('SELECT display_name FROM public.users'));
  const result = generate();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toMatch(/generated\/zapatos\/queries\.ts.*1 query$/);
  expect(read().toString()).toContain('"display_name": string;');
}, 30_000);
it('writes an empty module using the default project', () => {
  put('tsconfig.json', { files: ['app/app.ts'] });
  put('app/app.ts', 'export {};');
  mkdirSync(join(dir, 'node_modules'));
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'node_modules/typescript'), 'dir');
  const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toMatch(/generated\/zapatos\/queries\.ts.*0 queries$/);
  expect(readFileSync(join(dir, output), 'utf8')).toContain('export interface Queries {\n}');
});
it('uses the project compiler and reports when the application has none', () => {
  rmSync(join(dir, 'app/node_modules/typescript'));
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('typescript');
  expect(existsSync(join(dir, output))).toBe(false);
});
it('refuses an unknown moduleNames without using it as an output path', () => {
  put('pgcastconfig.json', { db: { connectionString: '{{TYPEGEN_DB}}' }, moduleNames: 'other' });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('moduleNames');
  expect(existsSync(join(dir, 'other/queries.ts'))).toBe(false);
});
it('redacts the URL password even when it occurs in a source diagnostic', () => {
  const secret = 'private-804';
  put('zapatosconfig.json', { db: { connectionString: 'postgres://reader:' + secret + '@127.0.0.1:1/db' }, outDir: 'generated' });
  put('app/app.ts', source('SELECT ${1}', secret));
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('placeholder');
  expect((result.stdout + result.stderr).includes(secret)).toBe(false);
});
it('omits JSON excerpts when the config is malformed', () => {
  const secret = 'private-804';
  put('pgcastconfig.json', '{"db":{"password":' + secret + '}}');
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('pgcastconfig.json');
  expect((result.stdout + result.stderr).includes(secret)).toBe(false);
});

it.each(['URL', 'discrete', 'expanded'])('redacts an asynchronous connection failure with %s settings', mode => {
  const secret = 'test/804', encoded = 'test%2F804', url = 'postgres://reader:' + encoded + '@localhost/db';
  const value = mode === 'expanded' ? '{{TYPEGEN_TEST_URI}}' : url;
  put('zapatosconfig.json', { db: mode === 'discrete'
    ? { password: secret, ssl: secret } : { connectionString: value, ssl: value } });
  // Deliver both kinds of callback failure without depending on a TLS server or pg's TLS negotiation version.
  put('callback.cjs', `
    require(${JSON.stringify(require.resolve('pg'))}).Client.prototype.connect = function () {
      ${mode === 'discrete' ? "this.password = 'resolved-at-connect';" : ''}
      const error = Object.assign(new Error('TLS setting ' + this.ssl + ' for ' + this.password), { code: 'ETEST' });
      setImmediate(() => { ${mode === 'expanded' ? 'Promise.reject({ message: error.message, code: error.code })' : 'throw error'} });
      return new Promise(() => {});
    };
  `);
  const result = spawnSync(process.execPath, ['--unhandled-rejections=warn', '--require', './callback.cjs', cli, '--project', project], {
    cwd: dir, encoding: 'utf8', timeout: 5000, env: { ...process.env, TYPEGEN_TEST_URI: url },
  });
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toMatch(/^(?:[^\n]* )?ETEST: TLS setting \[redacted\] for \[redacted\]$/);
  expect([url, secret, encoded].some(s => (result.stdout + result.stderr).includes(s))).toBe(false);
});

it('redacts credentials in the both-files note', () => {
  put('pgcastconfig.json', { db: { password: 'option', query_timeout: 0 } });
  const result = run('--project', project);
  expect(result.stderr).toContain('only pgcastconfig.json is read');
  expect(result.stderr).not.toContain('option');
});

it.each(['postgres://reader:sample@localhost/db', 'two words', ''])('reports a malformed placeholder by file alone (%#)', name => {
  put('zapatosconfig.json', { outDir: '{{' + name + '}}' });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe('zapatosconfig.json: a placeholder is not a variable name');
});

it('refuses query_timeout in a Unix-socket URI and keeps the previous file', () => {
  put(output, '// previous rows\n');
  put('zapatosconfig.json', { db: { connectionString: 'postgres://reader@/db?host=/unused&query_timeout=1' }, outDir: 'generated' });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Remove query_timeout');
  expect(readFileSync(join(dir, output), 'utf8')).toBe('// previous rows\n');
});

it.each([65536, 'invalid'])('keeps the connection failure for invalid port %s', port => {
  put(output, '// previous rows\n');
  put('zapatosconfig.json', { db: { host: '127.0.0.1', port }, outDir: 'generated' });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/app\.ts:3:22 .*people.*ERR_SOCKET_BAD_PORT/);
  expect(readFileSync(join(dir, output), 'utf8')).toBe('// previous rows\n');
});

it('redacts a parsed password that also occurs in a config diagnostic', () => {
  put('zapatosconfig.json', { outDir: '{{TYPEGEN_MISSING_804}}',
    db: { connectionString: 'postgres://reader:TYPEGEN_%4DISSING_804@localhost/db' } });
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe("Environment variable '[redacted]' is not set in zapatosconfig.json");
});

it('redacts the password as written in a socket URI and as pg decodes it', () => {
  const raw = 'sample%2f804', parsed = 'sample/804';
  put('zapatosconfig.json', { db: { password: 'sample', connectionString: 'postgres://reader:' + raw + '@/db?host=/unused' }, outDir: 'generated' });
  put('app/app.ts', source('SELECT ${1}', raw + ' ' + parsed));
  const result = run('--project', project);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[redacted] [redacted]');
});

it('writes the row returned by pg and guards an interpolated identifier', async () => {
  const app: typeof import('@pgcast/pgcast/db') = require('@pgcast/pgcast/db');
  const { id } = (await db.client.query("INSERT INTO public.users (email, display_name) VALUES ('user@example.com', 'User') RETURNING id")).rows[0];
  const body = "SELECT ${'id'} AS ${'left'}, ${db.param(fail(), `text`)} AS label FROM ${`public.users`} WHERE id IN (${db.param(id, 'int4')}, ${db.param(id, false)})";
  put('app/app.ts', source(body));
  expect(run('--project', project).status).toBe(0);
  const actual = app.sql<unknown>`SELECT ${'id'} AS ${'left'}, ${app.param('User', `text`)} AS label FROM ${`public.users`} WHERE id IN (${app.param(id, 'int4')}, ${app.param(id, false)})`.compile();
  const written = readFileSync(join(dir, output), 'utf8');
  expect(written).toContain('text: ' + JSON.stringify(actual.text));
  expect(written).toContain('"left": number | null;');
  expect(written).toContain('"label": string | null;');
  expect((await db.client.query(actual)).rows).toEqual([{ left: id, label: 'User' }]);
});

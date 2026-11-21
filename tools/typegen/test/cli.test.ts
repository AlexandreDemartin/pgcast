// Copyright (C) 2026 Alexandre Demartin

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', env: {
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
  put('app/node_modules/zapatos/db.d.ts', 'export declare const sql: any;');
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'app/node_modules/typescript'), 'dir');
  put('zapatosconfig.json', { db: { connectionString: '{{ TYPEGEN_DB }}' }, outDir: '{{TYPEGEN_OUT}}' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

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
  expect(readFileSync(join(dir, 'zapatos/queries.ts'), 'utf8')).toContain('"id": number | null');
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
  expect(first.toString()).toContain('"id": number | null');
  for (const [sql, message] of [['SELECT ${1}', 'static'], ['SELECT absent FROM public.users', '42703']]) {
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
  expect(read().toString()).toContain('"display_name": string | null');
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
  expect(result.stderr).toContain('only static templates');
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

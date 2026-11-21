// Copyright (C) 2026 Alexandre Demartin

import type { ChildProcess } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from 'pg';
import type ts from 'typescript';
import { afterEach, beforeEach, expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { watch } from '../src/watch';

const compiler: typeof ts = require(process.env.PGCAST_TEST_TYPESCRIPT || 'typescript');
const db = useTestDatabase(), cli = resolve(__dirname, '../dist/cli.js');
const secret = 'sentinel"829';
let dir: string, children: ChildProcess[] = [];
const out = () => join(dir, 'generated/zapatos/queries.ts');
const source = (sql: string, name = 'people') => [
  "import { sql } from 'zapatos/db';", "import type { Row } from '../generated/zapatos/queries';",
  "export const query = sql<never, Row<'" + name + "'>[]>`" + sql + "`;",
].join('\n');
function put(file: string, contents: string | object) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
}
const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise(done => setTimeout(done, 25));
  if (!check()) throw new Error('Timed out waiting for ' + what);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pgcast-watch-'));
  put('app/project.json', { files: ['app.ts'], compilerOptions: { types: [] } });
  put('app/app.ts', source('SELECT id FROM public.users'));
  const core = dirname(require.resolve('@pgcast/pgcast/db'));
  mkdirSync(join(dir, 'app/node_modules/@pgcast'), { recursive: true });
  for (const name of ['zapatos', '@pgcast/pgcast']) symlinkSync(core, join(dir, 'app/node_modules', name), 'dir');
  symlinkSync(dirname(require.resolve('typescript/package.json')), join(dir, 'app/node_modules/typescript'), 'dir');
  put('zapatosconfig.json', { db: { connectionString: '{{WATCH_DB}}' }, outDir: 'generated' });
});
afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  children = [];
  rmSync(dir, { recursive: true, force: true });
});

// A change right after the watchers start can go unseen (file system events replay), so edits follow a pause.
const settle = () => new Promise(done => setTimeout(done, 1000));
const field = { name: 'id', dataTypeID: 23, notNull: true };
it('describes again only the queries whose text changed', { timeout: 20_000 }, async () => {
  put('app/other.ts', source('SELECT 2 AS id', 'films'));
  put('app/project.json', { files: ['app.ts', 'other.ts'], compilerOptions: { types: [] } });
  const described: string[] = [], lines: string[] = [];
  let writes = 0;
  const watcher = watch(compiler, join(dir, 'app/project.json'), out(), {
    describe: async query => { described.push(query.name + ':' + query.text); return { text: query.text, fields: [field] }; },
    write: async () => ++writes > 0,
    log: line => lines.push(line),
    error: line => lines.push('error ' + line),
  });
  try {
    await until(() => writes === 1, 'the first round');
    await settle();
    expect(described.sort()).toEqual(['films:SELECT 2 AS id', 'people:SELECT id FROM public.users']);
    put('app/app.ts', source('SELECT id FROM public.users WHERE id > 0'));
    await until(() => writes === 2, 'the second round');
    expect(described.slice(2)).toEqual(['people:SELECT id FROM public.users WHERE id > 0']);
    put('app/other.ts', source('SELECT 2 AS id', 'films') + '\n// a comment');
    await until(() => writes === 3, 'the third round');
    expect(described).toHaveLength(3);
    expect(lines).toEqual([out() + ': 2 queries', out() + ': 2 queries', out() + ': 2 queries']);
  } finally { await watcher.close(); }
});

it('follows an edit in a referenced project', { timeout: 20_000 }, async () => {
  put('tsconfig.json', { files: [], references: [{ path: './app/project.json' }] });
  put('app/project.json', { files: ['app.ts'], compilerOptions: { composite: true, types: [] } });
  const described: string[] = [];
  const watcher = watch(compiler, join(dir, 'tsconfig.json'), out(), {
    describe: async query => { described.push(query.text); return { text: query.text, fields: [field] }; },
    write: async () => true, log: () => undefined, error: line => described.push('error ' + line),
  });
  try {
    await until(() => described.length === 1, 'the first round');
    await settle();
    put('app/app.ts', source('SELECT 5 AS id'));
    await until(() => described.length === 2, 'the second round');
    expect(described).toEqual(['SELECT id FROM public.users', 'SELECT 5 AS id']);
  } finally { await watcher.close(); }
});

const env = () => ({ ...process.env, WATCH_DB: urlForDatabase(inject('pgcastDb')!.url, db.name), PGPASSWORD: secret });
function start(project = 'app/project.json') {
  const child = spawn(process.execPath, [cli, '--watch', '--project', project], { cwd: dir, env: env() });
  children.push(child);
  const seen = { stdout: '', stderr: '', code: undefined as number | null | undefined };
  child.stdout.on('data', chunk => seen.stdout += chunk);
  child.stderr.on('data', chunk => seen.stderr += chunk);
  child.on('exit', code => seen.code = code);
  return { child, seen };
}
const rows = () => { try { return readFileSync(out(), 'utf8'); } catch { return ''; } };

it('rewrites the file on an edit and writes nothing when its bytes stay the same', { timeout: 20_000 }, async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  await settle();
  const first = seen.stdout.split('\n').length;
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  // The file changes before the tool prints its line: count lines only once that one has arrived.
  await until(() => rows().includes('"email"') && seen.stdout.split('\n').length > first, 'the rewrite and its line');
  const before = statSync(out()).mtimeMs, lines = seen.stdout.split('\n').length;
  put('app/app.ts', source('SELECT id, email FROM public.users') + '\n// a comment');
  await new Promise(done => setTimeout(done, 1500));
  expect(statSync(out()).mtimeMs).toBe(before);
  expect(seen.stdout.split('\n')).toHaveLength(lines);
  expect(seen.stderr).toBe('');
  expect(child.exitCode).toBe(null);
});

it('regenerates a queries.ts with conflict markers', { timeout: 20_000 }, async () => {
  put('generated/zapatos/queries.ts', '<<<<<<< HEAD\nexport {};\n=======\nexport {};\n>>>>>>> feature\n');
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the rewrite');
  expect(rows()).not.toContain('<<<<<<<');
  expect(seen.stderr).toBe('');
  expect(child.exitCode).toBe(null);
});

it('prints a rejected query, keeps watching, and recovers once it is fixed', async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  await settle();
  put('app/app.ts', source('SELECT id FROM public.nowhere'));
  await until(() => seen.stderr.includes('nowhere'), 'the error');
  expect(seen.stderr).toMatch(/app\.ts:3:\d+ Query "people": 42P01/);
  expect(child.exitCode).toBe(null);
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  await until(() => rows().includes('"email"'), 'the recovery');
  expect(seen.code).toBeUndefined();
});

it('keeps the rows of a plain run made after a migration', { timeout: 20_000 }, async () => {
  const admin = new Client({ connectionString: env().WATCH_DB });
  await admin.connect();
  try {
    await admin.query('CREATE TABLE public.migrated (id int NOT NULL)');
    put('app/app.ts', source('SELECT id FROM public.migrated'));
    put('app/other.ts', source("SELECT 'a' AS label", 'films'));
    put('app/project.json', { files: ['app.ts', 'other.ts'], compilerOptions: { types: [] } });
    start();
    await until(() => rows().includes('"id": number;') && rows().includes('"label"'), 'the first write');
    await settle();
    await admin.query('ALTER TABLE public.migrated ALTER COLUMN id TYPE bigint');
    expect(spawnSync(process.execPath, [cli, '--project', 'app/project.json'], { cwd: dir, env: env() }).status).toBe(0);
    expect(rows()).toContain('"id": string;');
    put('app/other.ts', source("SELECT 'a' AS label, 2 AS rank", 'films'));
    await until(() => rows().includes('"rank"'), 'the rewrite');
    expect(rows()).toContain('"id": string;');
  } finally {
    await admin.query('DROP TABLE IF EXISTS public.migrated');
    await admin.end();
  }
});

it.each(['tsconfig.json', 'app/project.json'])('reports a removed %s, keeps watching, and recovers when it is back', { timeout: 20_000 }, async config => {
  put('tsconfig.json', { files: [], references: [{ path: './app/project.json' }] });
  put('app/project.json', { files: ['app.ts'], compilerOptions: { composite: true, types: [] } });
  symlinkSync(join(dir, 'app/node_modules'), join(dir, 'node_modules'), 'dir');
  const { child, seen } = start('tsconfig.json');
  await until(() => rows().includes('"id": number;'), 'the first write');
  await settle();
  renameSync(join(dir, config), join(dir, config + '.off'));
  await until(() => seen.stderr !== '', 'the error');
  await new Promise(done => setTimeout(done, 500));
  expect(seen.stderr).toContain(config);
  expect(child.exitCode).toBe(null);
  const printed = seen.stdout.length;
  renameSync(join(dir, config + '.off'), join(dir, config));
  await until(() => seen.stdout.length > printed, 'the recovery');
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  await until(() => rows().includes('"email"'), 'the rewrite');
  expect(seen.code).toBeUndefined();
});

it('closes on SIGINT and SIGTERM with exit 0', { timeout: 20_000 }, async () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    rmSync(out(), { force: true });
    const { child, seen } = start();
    await until(() => rows().includes('"id": number;'), 'the first write');
    child.kill(signal);
    await until(() => seen.code !== undefined, 'the exit');
    expect(seen).toMatchObject({ code: 0, stderr: '' });
  }
});

it('prints no password from a rejected query in a watch round', { timeout: 20_000 }, async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  await settle();
  put('app/app.ts', source('SELECT 1 AS id FROM public."' + secret.replace(/"/g, '""') + '"'));
  await until(() => seen.stderr.includes('[redacted]'), 'the error');
  expect(seen.stderr).toMatch(/app\.ts:3:\d+ Query "people": 42P01: relation "public\.\[redacted\]" does not exist/);
  expect(seen.stdout + seen.stderr).not.toContain(secret);
  expect(child.exitCode).toBe(null);
});

it('names the output file, not the last described query, when an idle connection is lost', { timeout: 20_000 }, async () => {
  const admin = new Client({ connectionString: env().WATCH_DB });
  await admin.connect();
  try {
    const pids = async () => (await admin.query("SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend'")).rows.map(row => row.pid as number);
    const before = await pids();
    const { seen } = start();
    await until(() => rows().includes('"id": number;'), 'the first write');
    await settle();
    // The only connection the watch added is its own.
    const added = (await pids()).filter(pid => !before.includes(pid));
    expect(added).toHaveLength(1);
    await admin.query('SELECT pg_terminate_backend($1)', [added[0]]);
    await until(() => seen.code !== undefined, 'the exit');
    expect(seen.code).toBe(1);
    expect(seen.stderr).toMatch(/generated\/zapatos\/queries\.ts:1:1 .*57P01/);
    expect(seen.stderr).not.toContain('app.ts');
  } finally { await admin.end(); }
});

it('prints no password when the watch cannot connect', async () => {
  put('zapatosconfig.json', { db: { connectionString: 'postgres://reader:' + encodeURIComponent(secret) + '@127.0.0.1:1/db' }, outDir: 'generated' });
  const { seen } = start();
  await until(() => seen.code !== undefined, 'the exit');
  expect(seen.code).toBe(1);
  expect(seen.stderr).toContain('ECONNREFUSED');
  expect(seen.stdout + seen.stderr).not.toContain(secret);
  expect(seen.stdout + seen.stderr).not.toContain('%22');
});

it('closes with exit 0 on SIGINT right after an edit', { timeout: 20_000 }, async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  await settle();
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  await new Promise(done => setTimeout(done, 50));
  child.kill('SIGINT');
  await until(() => seen.code !== undefined, 'the exit');
  expect(seen).toMatchObject({ code: 0, stderr: '' });
});

it.each([['--watch', '--check'], ['--check', '--watch'], ['--watch', '--watch'], ['--watch', '--help']])('rejects %s with usage', async (...args) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: dir });
  children.push(child);
  let stderr = '';
  child.stderr.on('data', chunk => stderr += chunk);
  const code = await new Promise(done => child.on('exit', done));
  expect(code).toBe(1);
  expect(stderr).toContain('Usage: pgcast-typegen [--check | --watch] [--project <tsconfig>]');
});

// Copyright (C) 2026 Alexandre Demartin

import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

const field = { name: 'id', dataTypeID: 23, notNull: true };
it('describes again only the queries whose text changed', async () => {
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

function start(...extra: string[]) {
  const child = spawn(process.execPath, [cli, '--watch', '--project', 'app/project.json', ...extra], { cwd: dir, env: {
    ...process.env, WATCH_DB: urlForDatabase(inject('pgcastDb')!.url, db.name), PGPASSWORD: secret } });
  children.push(child);
  const seen = { stdout: '', stderr: '', code: undefined as number | null | undefined };
  child.stdout.on('data', chunk => seen.stdout += chunk);
  child.stderr.on('data', chunk => seen.stderr += chunk);
  child.on('exit', code => seen.code = code);
  return { child, seen };
}
const rows = () => { try { return readFileSync(out(), 'utf8'); } catch { return ''; } };

it('rewrites the file on an edit and writes nothing when its bytes stay the same', async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  await until(() => rows().includes('"email"'), 'the rewrite');
  const before = statSync(out()).mtimeMs, lines = seen.stdout.split('\n').length;
  put('app/app.ts', source('SELECT id, email FROM public.users') + '\n// a comment');
  await new Promise(done => setTimeout(done, 1500));
  expect(statSync(out()).mtimeMs).toBe(before);
  expect(seen.stdout.split('\n')).toHaveLength(lines);
  expect(seen.stderr).toBe('');
  expect(child.exitCode).toBe(null);
});

it('prints a rejected query, keeps watching, and recovers once it is fixed', async () => {
  const { child, seen } = start();
  await until(() => rows().includes('"id": number;'), 'the first write');
  put('app/app.ts', source('SELECT id FROM public.nowhere'));
  await until(() => seen.stderr.includes('nowhere'), 'the error');
  expect(seen.stderr).toMatch(/app\.ts:3:\d+ Query "people": 42P01/);
  expect(child.exitCode).toBe(null);
  put('app/app.ts', source('SELECT id, email FROM public.users'));
  await until(() => rows().includes('"email"'), 'the recovery');
  expect(seen.code).toBeUndefined();
});

it('closes on SIGINT and SIGTERM with exit 0', async () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const { child, seen } = start();
    await until(() => rows().includes('"id": number;'), 'the first write');
    child.kill(signal);
    await until(() => seen.code !== undefined, 'the exit');
    expect(seen).toMatchObject({ code: 0, stderr: '' });
  }
});

it('prints no password from a failing watch round', async () => {
  put('zapatosconfig.json', { db: { connectionString: 'postgres://reader:' + secret.replace('"', '%22') + '@127.0.0.1:1/db' }, outDir: 'generated' });
  const { seen } = start();
  await until(() => seen.code !== undefined, 'the exit');
  expect(seen.code).toBe(1);
  expect(seen.stderr).toContain('ECONNREFUSED');
  expect(seen.stdout + seen.stderr).not.toContain(secret);
  expect(seen.stdout + seen.stderr).not.toContain('%22');
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

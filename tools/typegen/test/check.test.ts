// Copyright (C) 2026 Alexandre Demartin

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';
import { textTypes } from '../src/values';
import { writeQueries } from '../src/write';

const fixture = useTestDatabase(), cli = resolve(__dirname, '../dist/cli.js');
const sql = 'SELECT id FROM users', closing = 'Run the generator without --check to write it.';
const secret = 'sentinel"819', live = { connectionString: '{{CHECK_DB}}' };
let dir: string, path: string;
function source(entries: readonly (readonly string[])[], outDir = '.', moduleNames = 'zapatos') {
  writeFileSync(join(dir, 'app.ts'), [
    "import { sql, param } from 'zapatos/db';", `import type { Row } from ${JSON.stringify(outDir + '/' + moduleNames + '/queries')};`,
    ...entries.map(([name, text]) => 'sql<unknown, Row<' + JSON.stringify(name).replace(/\u2028/g, '\\u2028') + '>[]>`' + text + '`;'),
  ].join('\n'));
}
function config(db?: object, outDir = '.', moduleNames = 'zapatos') {
  writeFileSync(join(dir, 'pgcastconfig.json'), JSON.stringify({ db, outDir, moduleNames }));
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, CHECK_DB: urlForDatabase(inject('pgcastDb')!.url, fixture.name),
      PGHOST: '127.0.0.1', PGPORT: '1', PGPASSWORD: secret } });
}
function snapshot() {
  return [readFileSync(path), statSync(path).mtimeMs, readdirSync(dirname(path))];
}
function check(lines: string[], ...args: string[]) {
  const before = existsSync(path) ? snapshot() : undefined;
  const result = run(...(args.length ? args : ['--check']));
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe(lines.join('\n') + '\n');
  expect(result.status).toBe(lines.includes(closing) ? 1 : 0);
  if (before) expect(snapshot()).toEqual(before);
}
const current = (online = false) => 'The generated files in ' + dirname(path) + ' are up to date.' +
  (online ? '' : ' Rows were not checked against a database (no db in the config).');
const stale = (name: string, reason: string) => 'Out of date: ' + path + ' - Query ' + JSON.stringify(name) + ': ' + reason;

beforeEach(async () => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'pgcast-check-')));
  path = join(dir, 'zapatos', 'queries.ts');
  mkdirSync(join(dir, 'node_modules/@pgcast'), { recursive: true });
  for (const name of ['zapatos', '@pgcast/pgcast']) symlinkSync(dirname(require.resolve('@pgcast/pgcast/db')), join(dir, 'node_modules', name));
  symlinkSync(process.env.PGCAST_TEST_TYPESCRIPT ?? dirname(require.resolve('typescript/package.json')), join(dir, 'node_modules/typescript'));
  writeFileSync(join(dir, 'tsconfig.json'), '{"files":["app.ts"],"compilerOptions":{"types":[],"noLib":true}}');
  source([['people', sql]]);
  mkdirSync(dirname(path));
  await writeQueries(path, 'zapatos/db', new Map([['people', { text: sql, fields: [{ name: 'id', dataTypeID: 23, notNull: true }] }]]));
  utimesSync(path, 1000000000, 1000000000);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it.each([
  ['changed text', [['people', sql + ' LIMIT 1']], [['people', 'changed text']]],
  ['new query', [['people', sql], ['new', sql]], [['new', 'new query']]],
  ['renamed query', [['users', sql]], [['people', 'stale entry (no source query)'], ['users', 'new query']]],
  ['removed query', [], [['people', 'stale entry (no source query)']]],
] as const)('reports %s offline', (_, entries, differences) => {
  source(entries);
  check([...differences.map(([name, reason]) => stale(name, reason)), closing]);
});

it('reports a stale entry alongside changed and new queries in name order', async () => {
  await writeQueries(path, 'zapatos/db', new Map(['people', 'orphan'].map(name => [name, { text: sql, fields: null }])));
  source([['people', sql + ' LIMIT 1'], ['added', sql]]);
  check([stale('added', 'new query'), stale('orphan', 'stale entry (no source query)'), stale('people', 'changed text'), closing]);
});

it('leaves a current file untouched with either flag order and the default project', () => {
  check([current()]);
  check([current()], '--project', 'tsconfig.json', '--check');
  config(live);
  writeFileSync(join(dir, 'zapatosconfig.json'), '{}');
  check([current(true)], '--check', '--project', 'tsconfig.json');
});

it('matches stored forms offline and round-trips quoted names and text', () => {
  const odd = 'quoted"\n\u2028', plain = sql + ' WHERE id = ${param(x)}', json = 'SELECT ${param(x, true)} IS NULL AS "quoted""field"';
  source([['plain', plain], [odd, json]]);
  config(live);
  expect(run().status).toBe(0);
  config();
  check([current()]);
  source([['plain', plain], [odd, json + ' LIMIT 1']]);
  check([stale(odd, 'changed text').replace(/\u2028/g, '\\u2028'), closing]);
});

it('reports missing output without creating the directory', () => {
  rmSync(dirname(path), { recursive: true });
  check(['Missing: ' + path + ' - "people"', closing]);
  expect(existsSync(dirname(path))).toBe(false);
});

it.each(['invalid syntax', 'foreign module', 'duplicate name', 'nonliteral text'])('rejects %s without loading it', kind => {
  const file = readFileSync(path, 'utf8'), entry = '  "people": { text: "extra"; };';
  writeFileSync(path, kind === 'invalid syntax' ? file.slice(0, file.indexOf('row:')) :
    kind === 'foreign module' ? file + "require('fs').writeFileSync('executed', 'yes');" :
    kind === 'duplicate name' ? file.replace('export interface Queries {', 'export interface Queries {\n' + entry) :
    file.replace(JSON.stringify(sql), 'string'));
  const reason = kind === 'duplicate name' || kind === 'nonliteral text' ? 'Query "people": ' + kind :
    kind === 'invalid syntax' ? kind : 'invalid generated module';
  check(['Out of date: ' + path + ' - ' + reason, closing]);
  expect(existsSync(join(dir, 'executed'))).toBe(false);
});

it.each([['column type', 'TYPE text'], ['nullability', 'DROP NOT NULL']])('reports changed %s online', async (kind, alter) => {
  const table = kind === 'nullability' ? 'check_nullable' : 'check_type';
  await fixture.pool.query('CREATE TABLE ' + table + ' (id int NOT NULL)');
  source([['people', 'SELECT id FROM ' + table]]);
  config(live);
  expect(run().status).toBe(0);
  await fixture.pool.query('ALTER TABLE ' + table + ' ALTER id ' + alter);
  config();
  check([current()]);
  config(live);
  check([stale('people', 'changed row'), closing]);
  expect(run().status).toBe(0);
  check([current(true)]);
}, 30_000);

it('reports both changed text and changed row online', () => {
  source([['people', 'SELECT display_name FROM users']]);
  config(live);
  check([stale('people', 'changed text'), stale('people', 'changed row'), closing]);
});

it('checks changed module bytes online', () => {
  config(live);
  writeFileSync(path, readFileSync(path, 'utf8').trimEnd());
  check(['Out of date: ' + path + ' - changed module bytes ("people")', closing]);
});

it.each(['drift', 'missing file', 'refused connection'])('redacts quoted credentials on %s', async kind => {
  const outDir = './' + secret;
  path = join(dir, outDir, 'zapatos', 'queries.ts');
  mkdirSync(dirname(path), { recursive: true });
  await writeQueries(path, 'zapatos/db', new Map([[secret, { text: sql, fields: null }]]));
  source([[secret, sql]], outDir);
  config(undefined, outDir);
  const masked = path.replace(secret, '[redacted]');
  check([current().replace(secret, '[redacted]')]);
  if (kind === 'drift') {
    source([[secret, sql + ' LIMIT 1']], outDir);
    check([`Out of date: ${masked} - Query "[redacted]": changed text`, closing]);
  } else if (kind === 'missing file') {
    rmSync(path);
    check([`Missing: ${masked} - "[redacted]"`, closing]);
  } else {
    config({ host: '127.0.0.1', port: 1, password: secret }, outDir);
    const result = run('--check');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/Query "\[redacted\]".*ECONNREFUSED/);
    expect(result.stderr).not.toContain(secret);
    expect(result.stderr).not.toContain(JSON.stringify(secret).slice(1, -1));
  }
});

it.each(['deleted import', 'undeclared field type', 'CRLF', 'trailing whitespace'])('rejects %s offline', async kind => {
  await writeQueries(path, 'zapatos/db', new Map([['people', { text: sql, fields: [{ name: 'id', dataTypeID: 114 }] }]]));
  const file = readFileSync(path, 'utf8');
  writeFileSync(path, kind === 'deleted import' ? file.replace(/^import .*\n/m, '') :
    kind === 'undeclared field type' ? file.replace(': JSONValue | null;', ': UnknownType | null;') :
    kind === 'CRLF' ? file.replace(/\n/g, '\r\n') : file + ' ');
  const reason = kind === 'undeclared field type' ? 'Query "people": invalid generated module' : 'changed module bytes ("people")';
  check(['Out of date: ' + path + ' - ' + reason, closing]);
});

it.each(['zapatos', 'pgcast'] as const)('accepts every generated field type offline for %s', async moduleNames => {
  path = join(dir, moduleNames, 'queries.ts');
  mkdirSync(dirname(path), { recursive: true });
  source([['people', sql], ['empty', sql], ['noData', sql]], '.', moduleNames);
  config(undefined, '.', moduleNames);
  const fields = [true, false].flatMap(notNull => [
    ...Object.keys(textTypes).map(oid => ({ name: oid + notNull, dataTypeID: Number(oid), notNull })),
    { name: 'enum' + notNull, dataTypeID: 0, enumLabels: ['JSONValue', 'Buffer | null', 'PostgresInterval"'], notNull },
  ]);
  await writeQueries(path, `${moduleNames}/db`, new Map([
    ['people', { text: sql, fields }], ['empty', { text: sql, fields: [] }], ['noData', { text: sql, fields: null }],
  ]));
  check([current()]);
});

it('accepts a different generated field type offline and reports it online', () => {
  writeFileSync(path, readFileSync(path, 'utf8').replace(': number;', ': string;'));
  check([current()]);
  config(live);
  check([stale('people', 'changed row'), closing]);
});

it('prints one difference and the advice for a path containing CR and LF', async () => {
  const outDir = './first\r\nsecond';
  path = join(dir, outDir, 'zapatos', 'queries.ts');
  mkdirSync(dirname(path), { recursive: true });
  await writeQueries(path, 'zapatos/db', new Map([['people', { text: sql, fields: null }]]));
  source([['people', sql + ' LIMIT 1']], outDir);
  config(undefined, outDir);
  check([stale('people', 'changed text').replace('\r\n', '\\r\\n'), closing]);
});

// Copyright (C) 2026 Alexandre Demartin

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type * as TS from 'typescript';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { scan } from '../src/scan';
import { writeQueries } from '../src/write';

const ts: typeof TS = require(process.env.PGCAST_TEST_TYPESCRIPT || 'typescript');
const db: typeof import('@pgcast/pgcast/db') = require('@pgcast/pgcast/db');
const core = dirname(require.resolve('@pgcast/pgcast/db'));
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pgcast-slots-'));
  mkdirSync(join(dir, 'node_modules/@pgcast'), { recursive: true });
  for (const name of ['@pgcast/pgcast', 'zapatos', 'pgcast']) symlinkSync(core, join(dir, 'node_modules', name), 'dir');
  writeFileSync(join(dir, 'tsconfig.json'), '{"files":["app.ts"],"compilerOptions":{"types":[],"noLib":true}}');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function read(body: string, imports = "import { sql, param } from 'zapatos/db';", tag = 'sql') {
  writeFileSync(join(dir, 'app.ts'), ["import type { Row } from './queries';", imports,
    tag + "<unknown, Row<'films'>>`" + body + "`;"].join('\n'));
  return scan(ts, join(dir, 'tsconfig.json'), join(dir, 'queries.ts'));
}

it.each([
  ["'users'", db.sql<unknown>`SELECT ${'users'}`],
  ['`public.users`', db.sql<unknown>`SELECT ${`public.users`}`],
  ["param(x, 'int4')", db.sql`SELECT ${db.param(2, 'int4')}`],
  ['param(x, `int4[]`)', db.sql`SELECT ${db.param([2], `int4[]`)}`],
  ['param(x, false)', db.sql`SELECT ${db.param({ a: 2 }, false)}`],
] as const)('compiles %s as the application does', (expression, fragment) => {
  const { queries, diagnostics } = read('SELECT ${' + expression + '}');
  expect(diagnostics).toEqual([]);
  expect(queries.map(q => q.text)).toEqual([fragment.compile().text]);
});

it.each(['zapatos', 'pgcast'])('matches the application compiler for named and namespace imports from %s', name => {
  const settings = db.getConfig();
  try {
    for (const prefix of ['', 'zdb.']) {
      const clause = prefix ? '* as zdb' : '{ sql, param }', param = prefix + 'param';
      const body = "SELECT ${" + param + "(fail(), 'int4')}, ${" + param + "(xs, `int4[]`)}, ${" + param +
        "(xs, false)} FROM ${'public.users'} AS ${`a\"b`}";
      const result = read(body, `import ${clause} from '${name}/db';`, prefix + 'sql');
      expect(result.diagnostics).toEqual([]);
      for (const castArrayParamsToJson of [false, true]) for (const castObjectParamsToJson of [false, true]) {
        db.setConfig({ castArrayParamsToJson, castObjectParamsToJson });
        const compiled = db.sql<unknown>`SELECT ${db.param(1, 'int4')}, ${db.param([2], `int4[]`)}, ${db.param([3], false)} FROM ${'public.users'} AS ${`a"b`}`.compile();
        expect(compiled.values).toEqual([1, [2], [3]]);
        expect(result.queries.map(q => q.text)).toEqual([compiled.text]);
      }
    }
  } finally { db.setConfig(settings); }
});

it('reads the written cooked SQL back on TypeScript ' + ts.version, async () => {
  const body = "SELECT $$' \" \\` $ */ \\u2028\\u2029$$ AS ${'title'}";
  const compiled = db.sql<unknown>`SELECT $$' " \` $ */ \u2028\u2029$$ AS ${'title'}`.compile();
  const { queries, diagnostics } = read(body);
  expect(diagnostics).toEqual([]);
  const path = join(dir, 'queries.ts');
  await writeQueries(path, 'zapatos/db', new Map(queries.map(q => [q.name, { text: q.text, fields: [] }])));
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const strings: string[] = [];
  function visit(node: TS.Node) {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) strings.push(node.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(strings).toContain(compiled.text);
});

it.each([
  'v', '{ id: v }', 'and(v)', 'or(v)', 'not(v)', 'raw(v)', 'sql`nested`', 'cols(v)', 'vals(v)', 'v ? a : b', 'f(v)',
  'param(v, cast)', 'param(...xs, false)', 'param?.(v, false)', 'param(v, false, 3)',
  "param(v, '')",
])('identifies the placeholder %s after an accepted slot', expression => {
  const slot = '${ /* slot */ ' + expression + ' }', result = read("SELECT ${'id'},\n  " + slot);
  expect(result.queries).toEqual([]);
  expect(result.diagnostics).toEqual([{ file: join(dir, 'app.ts'), line: 3, column: 1, message: expect.stringContaining(slot) }]);
  const { message } = result.diagnostics[0];
  expect(message).toContain('Query "films"');
  expect(message).toContain('app.ts:4:3');
  if (expression === "param(v, '')") {
    expect(message).toContain("param() cast '' gives an empty name");
    try { db.sql`${db.param(1, '')}`.compile(); } catch (error) { expect(message).toContain((error as Error).message); }
  }
});

it.each(['\\8${"a"}', '${"a"}\\8${"b"}', '${"a"}\\8'])('refuses invalid cooked chunks in %s', body => {
  expect(read(body).diagnostics[0].message).toMatch(/films.*escape/i);
});

it('rejects a callee bound to a different function', () => {
  const slot = '${param(v, false)}', result = read("SELECT ${'id'}, " + slot, "import { sql, raw as param } from 'pgcast/db';");
  expect(result.diagnostics[0].message).toContain(slot);
});

it.each(['zapatos', 'pgcast', '@pgcast/pgcast'])('refuses a version mismatch in %s', name => {
  const path = join(dir, 'node_modules', name);
  rmSync(path);
  mkdirSync(path);
  writeFileSync(join(path, 'package.json'), '{"name":"@pgcast/pgcast","version":"7.0.0"}');
  writeFileSync(join(path, 'db.js'), 'throw Error("unexpected module execution");');
  writeFileSync(join(path, 'db.d.ts'), 'export declare const sql: any, param: any;');
  const result = read('SELECT ${p.param(x, false)}', "import { sql } from 'zapatos/db'; import * as p from 'pgcast/db';");
  expect(result.queries).toEqual([]);
  expect(result.diagnostics[0].message).toMatch(/7\.0\.0/);
  expect(result.diagnostics[0].message).toContain(require(join(core, 'package.json')).version);
});

it('calls the scoped compiler installed by the project', () => {
  const path = join(dir, 'node_modules/@pgcast/pgcast'), marker = join(dir, 'compiled');
  rmSync(path);
  mkdirSync(path);
  writeFileSync(join(path, 'package.json'), readFileSync(join(core, 'package.json')));
  writeFileSync(join(path, 'db.js'), `
    const db = require(${JSON.stringify(join(core, 'db.js'))});
    const calls = [];
    exports.param = (value, cast) => {
      calls.push([value === undefined, cast]);
      return db.param(value, cast);
    };
    exports.sql = (...args) => {
      require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify(calls));
      return db.sql(...args);
    };
  `);
  expect(read("SELECT ${param(x, 'int4')}, ${param(x, false)}").queries.map(q => q.text)).toEqual(['SELECT CAST($1 AS "int4"), $2']);
  expect(JSON.parse(readFileSync(marker, 'utf8'))).toEqual([[true, 'int4'], [true, false]]);
});

it.each([false, true])('checks mixed aliases with a separate installation: %s', separate => {
  const alias = join(dir, 'node_modules/pgcast');
  if (separate) {
    rmSync(alias);
    for (const file of ['db.js', 'dist/db', 'package.json']) cpSync(join(core, file), join(alias, file), { recursive: true });
    symlinkSync(resolve(__dirname, '../node_modules'), join(alias, 'node_modules'), 'dir');
  }
  const other: typeof db = require(join(alias, 'db.js'));
  const actual = db.sql`SELECT ${other.param(7, 'int4')}`.compile();
  const slot = "${param(x, 'int4')}", result = read('SELECT ' + slot,
    "import { sql } from 'zapatos/db'; import { param } from 'pgcast/db';");
  if (separate) {
    expect(actual.text).toContain('"value" = $2');
    expect(result.queries).toEqual([]);
    expect(result.diagnostics[0].message).toContain(slot);
    expect(result.diagnostics[0].message).toContain('same db installation');
  } else expect(result.queries.map(q => q.text)).toEqual([actual.text]);
});

it('distinguishes equal plain texts with different possible casts', () => {
  const body = "SELECT ${param(x)}`; sql<unknown, Row<'films'>>`SELECT ${param(x, false)}";
  expect(read(body).diagnostics[0]?.message).toContain('different SQL');
});

it('keeps the plain and JSON texts under either application cast setting', () => {
  const settings = db.getConfig(), slot = '${param(fail())}', forced = '${param(fail(), true)}';
  try {
    for (const castArrayParamsToJson of [false, true]) for (const castObjectParamsToJson of [false, true]) {
      db.setConfig({ castArrayParamsToJson, castObjectParamsToJson });
      const { queries, diagnostics } = read('SELECT ' + slot + ', ' + forced);
      const plain = db.param('x', true), json = db.param([1], true);
      const texts = [db.sql`SELECT ${plain}, ${plain}`, db.sql`SELECT ${json}, ${plain}`,
        db.sql`SELECT ${plain}, ${json}`, db.sql`SELECT ${json}, ${json}`].map(q => q.compile().text);
      expect(diagnostics).toEqual([]);
      expect(queries[0]).toMatchObject({ text: texts[0], variants: { texts: texts.slice(1) } });
      expect(db.getConfig()).toEqual({ ...settings, castArrayParamsToJson, castObjectParamsToJson });
      for (const v of ['x', [1, 2], { a: 1 }]) {
        const expected = Array.isArray(v) ? castArrayParamsToJson : typeof v === 'object' && castObjectParamsToJson;
        const actual = db.sql`SELECT ${db.param(v)}, ${db.param(v, true)}`.compile();
        expect(actual.text).toBe(texts[Number(expected) + (typeof v === 'object' ? 2 : 0)]);
      }
    }
  } finally { db.setConfig(settings); }
});

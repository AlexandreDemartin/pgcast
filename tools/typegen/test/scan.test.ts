// Copyright (C) 2026 Alexandre Demartin

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindings } from '../src/bindings';
import { scan } from '../src/scan';

const compiler: typeof ts = require(process.env.PGCAST_TEST_TYPESCRIPT || 'typescript');
const row = "import type { Row } from './generated/queries';";
const named = "import { sql } from 'zapatos/db';";
const query = (name: string, text = 'SELECT 1') => "sql<never, Row<'" + name + "'>[]>`" + text + "`;";
let dir: string;
function put(file: string, contents: string | object) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}
function project(files: string[]) {
  return scan(compiler, put('tsconfig.json', { files }), join(dir, 'generated/queries.ts'));
}
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pgcast-scan-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe.each(['sql', 'param'])('%s bindings on TypeScript ' + compiler.version, name => {
  function bound(source: string, expression: string) {
    const ast = compiler.createSourceFile('bindings.ts', source.replace(/FN/g, name) + '\n' + expression.replace(/FN/g, name),
      compiler.ScriptTarget.Latest, true);
    const last = ast.statements[ast.statements.length - 1] as ts.ExpressionStatement;
    return bindings(compiler, ast).matches(last.expression, name);
  }
  it.each([
    ['zapatos/db', '{ FN }', 'FN'], ['pgcast/db', '{ FN }', 'FN'],
    ['zapatos/db', '* as db', 'db.FN'], ['pgcast/db', '* as db', 'db.FN'], ['pgcast/db', '* as zdb', 'zdb.FN'],
  ])('accepts %s %s as %s', (module, clause, expression) => {
    expect(bound(`import ${clause} from '${module}';`, expression)).toBe(true);
  });

  it('refuses a type-only specifier', () => {
    const clause = "import { type FN } from 'pgcast/db';";
    // 4.1 cannot parse this syntax. Its whole file is refused before binding.
    if (compiler.version === '4.1.6') {
      put('a.ts', [row, clause.replace('FN', name), query('films')].join('\n'));
      const result = project(['a.ts']);
      expect(result.queries).toEqual([]);
      expect(result.diagnostics).toEqual([{ file: join(dir, 'a.ts'), line: 2, column: 15, message: expect.stringContaining('expected') }]);
    } else expect(bound(clause, 'FN')).toBe(false);
  });
  const direct = "import { FN } from 'pgcast/db';", namespace = "import * as db from 'zapatos/db';";
  it.each([
    ['', 'FN'], ["import { FN } from 'foreign';", 'FN'], ["import * as db from 'foreign';", 'db.FN'],
    ["import { raw as FN } from 'pgcast/db';", 'FN'], ["import type { FN } from 'pgcast/db';", 'FN'],
    ["import type * as db from 'pgcast/db';", 'db.FN'],
    ["import * as FN from 'pgcast/db';", 'FN'], [namespace, 'db.x.FN'], [namespace, 'this.FN'],
    [namespace + 'const { FN } = db;', 'FN'], [direct + 'function f(FN) {}', 'FN'],
    [direct + 'function f() { const FN = 0; }', 'FN'], [direct + 'function f({ a: [FN] }) {}', 'FN'],
    [direct + 'try {} catch (FN) {}', 'FN'], [direct + 'function FN() {}', 'FN'],
    [direct + "import { other as FN } from 'foreign';", 'FN'], [namespace + 'function f(db) {}', 'db.FN'],
    [direct + "import FN = require('foreign');", 'FN'], [direct + 'class FN {}', 'FN'],
    ["declare module 'other' { import { FN } from 'pgcast/db'; }", 'FN'],
    [direct + 'enum E { "FN" = 1 }', 'FN'], [direct + "enum E { ['FN'] = 1 }", 'FN'],
  ])('refuses %s with %s', (source, expression) => { expect(bound(source, expression)).toBe(false); });
});

it('reads cooked TSX text and resolves a missing output, with either import spelling', () => {
  const source = readFileSync(resolve(__dirname, 'fixtures/static.tsx.txt'), 'utf8');
  const a = put('src/a.tsx', source), b = put('src/b.tsx', source.replace('queries.js', 'queries.ts'));
  const expected = { queries: [{ name: 'films', text: "SELECT 'LEFT', '`', '${', '\u2028'",
    locations: [a, b].map(file => ({ file, line: 7, column: 3 })) }], diagnostics: [] };
  expect(project(['src/b.tsx', 'generated/queries.ts', 'src/a.tsx'])).toEqual(expected);
  put('generated/queries.ts', 'export type Row<N> = N;');
  expect(project(['src/a.tsx', 'src/b.tsx'])).toEqual(expected);
});

it('honours inherited globs, files, shared references and a cycle', () => {
  put('base.json', { include: ['src/**/*.ts'], exclude: ['src/skip*'] });
  put('middle.json', { extends: './base.json' });
  const config = put('tsconfig.json', { extends: './middle.json', references: [{ path: './b' }, { path: './a' }] });
  for (const ref of ['a', 'b']) put(ref + '/tsconfig.json', {
    files: ['../shared.cts', '../src/one.ts', '../extra.mts'], references: [{ path: '../tsconfig.json' }],
  });
  for (const file of ['src/one.ts', 'src/skip.ts', 'src/types.d.ts', 'extra.mts', 'shared.cts', 'outside.ts']) {
    put(file, [row.replace('./generated', file.startsWith('src/') ? '../generated' : './generated'), named, query(file)].join('\n'));
  }
  const result = scan(compiler, config, join(dir, 'generated/queries.ts'));
  expect(result.diagnostics).toEqual([]);
  expect(result.queries.map(q => [q.name, q.locations.length])).toEqual([['extra.mts', 1], ['shared.cts', 1], ['src/one.ts', 1]]);
});

it('respects the project selection of JS and JSX source files', () => {
  for (const file of ['a.js', 'b.jsx']) put(file, 'const missing = ;');
  put('valid.ts', '');
  for (const allowJs of [false, true]) {
    const config = put('tsconfig.json', { compilerOptions: { allowJs }, include: ['*'] });
    const result = scan(compiler, config, join(dir, 'queries.ts'));
    expect(result.diagnostics.map(d => d.file)).toEqual(allowJs ? [join(dir, 'a.js'), join(dir, 'b.jsx')] : []);
  }
});

it.each([
  [row, "import { sql as q } from 'pgcast/db';", query('a').replace('sql<', 'q<')],
  [row, named + "type Alias = Row<'a'>;", 'sql<never, Alias>`SELECT 1`;'],
  [row.replace('./generated/queries', './other'), named, query('a')],
  [row.replace('{ Row }', '{ Row as R }'), named, query('a').replace('Row<', 'R<')],
  [row, named, "function f<Row>() { " + query('a') + " }"],
])('leaves manual types and tags alone', (importRow, tag, statement) => {
  put('a.ts', [importRow, tag, statement].join('\n'));
  expect(project(['a.ts'])).toEqual({ queries: [], diagnostics: [] });
});

it.each([
  [named + '\nfunction f(sql) {}', 'sql', ''], [named, 'sql', 'function f() { class sql {} }'],
  ["import * as db from 'other';", 'db.sql', ''], [named, 'this.sql', ''],
])('reports the opted-in name, tag and position', (imports, tag, after) => {
  const file = put('a.ts', [row, imports, '  ' + query('films').replace('sql<', tag + '<'), after].join('\n'));
  const { queries, diagnostics } = project(['a.ts']);
  expect(queries).toEqual([]);
  expect(diagnostics).toEqual([{ file, line: imports.split('\n').length + 2, column: 3,
    message: expect.stringContaining('films') }]);
  expect(diagnostics[0].message).toContain(tag);
});

it.each(['v', 'whereable', 'db.conditions.eq(v)', 'db.raw(v)', 'sql`nested`', 'db.cols(v)', 'v ? a : b', 'f(v)', 'db.param(v, cast)'])(
  'reports the first placeholder %s with both positions', expression => {
    const placeholder = '${ /* one */ ' + expression + ' /* two */ }',
      file = put('a.ts', [row, named, query('films', 'SELECT\n  ' + placeholder + ' AND ${later}')].join('\n'));
    const result = project(['a.ts']);
    expect(result.queries).toEqual([]);
    expect(result.diagnostics).toEqual([{ file, line: 3, column: 1, message: expect.stringMatching(/only static templates/i) }]);
    for (const part of ['films', placeholder, '4:3']) expect(result.diagnostics[0].message).toContain(part);
    expect(result.diagnostics[0].message).not.toContain('later');
  });

it.each(['\\xG0', '\\u{110000}', '\\01', '\\8', '\\9'])('refuses an undefined cooked string for %s', escape => {
  const file = put('a.ts', [row, named, query('bad', escape)].join('\n'));
  put('b.ts', [row, named, query('good', '\\' + escape)].join('\n'));
  const result = project(['a.ts', 'b.ts']);
  expect(result.queries.map(q => q.text)).toEqual([escape]);
  if (compiler.version === '4.1.6' && ['\\xG0', '\\u{110000}'].includes(escape)) {
    expect(result.diagnostics).toEqual([{ file, line: 3, column: expect.any(Number), message: expect.stringMatching(/hexadecimal|unicode/i) }]);
  } else expect(result.diagnostics).toEqual([{ file, line: 3, column: 1, message: expect.stringMatching(/bad.*escape/i) }]);
});

it('diagnoses both names, and both locations for conflicting texts', () => {
  const a = put('a.ts', [row, named, query('conflict'), "sql<Row<'x'> | Row<'y'>>`SELECT 1`;", query('ok')].join('\n')),
    b = put('b.ts', [row, named, query('conflict', 'SELECT 2')].join('\n'));
  const result = project(['b.ts', 'a.ts']);
  expect(result.queries.map(q => q.name)).toEqual(['ok']);
  expect(result.diagnostics).toEqual([
    { file: a, line: 4, column: 1, message: expect.stringMatching(/"x".*"y"/) },
    { file: b, line: 3, column: 1, message: expect.stringMatching(/conflict.*a\.ts:3:1/) },
  ]);
});

it('reports the first parse error and skips the whole file', () => {
  const file = put('a.ts', [row, named, query('early'), 'const a = ;', 'const b = ;'].join('\n'));
  expect(project(['a.ts'])).toEqual({ queries: [], diagnostics: [
    { file, line: 4, column: 11, message: expect.stringContaining('Expression expected') },
  ] });
});

it('keeps a NUL followed by an escaped backslash and a digit', () => {
  put('a.ts', [row, named, query('valid', '\\0\\\\1')].join('\n'));
  expect(project(['a.ts']).queries.map(q => q.text)).toEqual(['\0\\1']);
});

it('reports malformed project references and deeply nested source', () => {
  const config = put('tsconfig.json', { references: [null] });
  expect(scan(compiler, config, join(dir, 'rows.ts')).diagnostics.map(d => d.file)).toEqual([config]);
  const file = put('deep.ts', '('.repeat(20000) + '1' + ')'.repeat(20000));
  expect(project(['deep.ts']).diagnostics.map(d => d.file)).toEqual([file]);
});

it('throws for an unreadable project', () => {
  expect(() => scan(compiler, join(dir, 'missing.json'), join(dir, 'rows.ts'))).toThrow(/missing\.json/);
});

#!/usr/bin/env node
// Copyright (C) 2026 Alexandre Demartin
// `npm run check:floor`, after `npm run build`: the declarations the package ships, read by the oldest TypeScript that
// its `typescript` peer allows. Each `.d.ts` that `npm pack` lists must parse with TypeScript 4.1 (`skipLibCheck` skips
// checking a declaration, never parsing it: since 6.7.0 an `import { type X }` line stopped 4.1 to 4.4, #603), and a
// consumer on 4.1 compiles against them and the fixture's generated schema, with `skipLibCheck` as website/install.md
// asks below 5.7. A lib check of the package's own declarations then fails on any error but `Buffer<ArrayBuffer>`
// (install.md): under `skipLibCheck`, a name 4.1 does not know (`Awaited`) becomes `any` and nothing fails. TypeScript
// 4.1.6 and the `@types` made for it, with `pg-protocol` and `pg-types`, which `@types/pg` asks for by range, are pinned and fetched once
// into node_modules/.cache/pgcast-ts41, never a dependency. With a directory argument, it checks that unpacked package
// instead (a release's `package/`).
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const
  root = fileURLToPath(new URL('..', import.meta.url)),
  floor = '4.1',
  tools = {'typescript': '4.1.6', '@types/node': '14.18.63', '@types/pg': '8.6.6', 'pg-protocol': '1.16.1', 'pg-types': '2.2.0'},
  cache = join(root, 'node_modules/.cache/pgcast-ts41'),
  pkg = join(cache, 'node_modules/zapatos'),
  consumer = join(cache, 'consumer'),
  peer = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).peerDependencies.typescript;

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8'});
  if (result.status !== 0) fail(result.stdout + result.stderr, `check:floor: ${command} ${args.join(' ')} failed`);
  return result.stdout;
}

if (peer !== `>=${floor}`) {
  fail(`check:floor: the typescript peer is ${peer}, not >=${floor}: update floor and the pinned tools of this script.`);
}

const installed = name => {
  try { return JSON.parse(readFileSync(join(cache, 'node_modules', name, 'package.json'), 'utf8')).version; }
  catch { return undefined; }
};
if (Object.entries(tools).some(([name, version]) => installed(name) !== version)) {
  rmSync(cache, {recursive: true, force: true});
  run('npm', ['install', '--prefix', cache, '--no-save', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund',
    ...Object.entries(tools).map(([name, version]) => `${name}@${version}`)]);
}

// the package as a consumer installs it, under the name its declarations and the generated schema import
rmSync(pkg, {recursive: true, force: true});
if (process.argv[2]) {
  cpSync(resolve(process.argv[2]), pkg, {recursive: true});
} else {
  const listed = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']))[0].files.map(f => f.path);
  if (!listed.some(path => path.startsWith('dist/'))) fail('check:floor: nothing in dist/ to check: run `npm run build` first.');
  for (const path of listed) {
    mkdirSync(dirname(join(pkg, path)), {recursive: true});
    cpSync(join(root, path), join(pkg, path));
  }
}

const
  ts = createRequire(join(cache, 'package.json'))('typescript'),
  host = {getCanonicalFileName: f => f, getCurrentDirectory: () => pkg, getNewLine: () => '\n'},
  declarations = readdirSync(pkg, {recursive: true}).filter(f => f.endsWith('.d.ts')).map(f => join(pkg, f)),
  syntax = ts.createProgram(declarations, {noResolve: true, noLib: true, types: []}).getSyntacticDiagnostics();

console.log(syntax.length ?
  `✗ TypeScript ${ts.version} cannot parse ${syntax.length === 1 ? 'a line' : 'lines'} of the shipped declarations:\n` +
    ts.formatDiagnostics(syntax, host) :
  `✓ TypeScript ${ts.version} parses the ${declarations.length} shipped declarations`);

// typed calls on each entry point, and a refused one for each, which an `any` would let through (TS2578)
const source = `import * as db from 'zapatos/db';
import * as gen from 'zapatos/generate';
import type * as s from 'zapatos/schema';

export const names = (pool: db.Queryable) =>
  db.select('users', db.all, { columns: ['display_name'] }).run(pool).then(rows => rows.map(row => row.display_name));
export const named: (pool: db.Queryable) => Promise<string[]> = names;
// @ts-expect-error display_name is text
export const numbered: (pool: db.Queryable) => Promise<number[]> = names;
// @ts-expect-error a table the schema does not have
export const films = (pool: db.Queryable) => db.select('films', db.all).run(pool);

const reports = db.sql<s.users.SQL>\`SELECT \${'id'} FROM \${'users'} WHERE \${'manager_id'} = \${db.param(1)}\`;
export const counted: (pool: db.Queryable) => Promise<number> = pool => db.withCTEs({ reports }, db.count('users', db.all)).run(pool);
// @ts-expect-error withCTEs() keeps count()'s number
export const countedText: (pool: db.Queryable) => Promise<string> = pool => db.withCTEs({ reports }, db.count('users', db.all)).run(pool);

export const user: s.users.Insertable = { email: 'ada@example.com', display_name: 'Ada' };
// @ts-expect-error display_name is NOT NULL with no default
export const nameless: s.users.Insertable = { email: 'ada@example.com' };

export const config: gen.Config = { db: { connectionString: 'postgres://localhost/films' }, outDir: 'src' };
// @ts-expect-error outDir is a path
export const outDirNumber: gen.Config = { db: {}, outDir: 1 };
`;
rmSync(consumer, {recursive: true, force: true});
mkdirSync(join(consumer, 'src'), {recursive: true});
cpSync(join(root, 'test/generated/zapatos'), join(consumer, 'zapatos'), {recursive: true});
writeFileSync(join(consumer, 'src/index.ts'), source);
writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
  include: ['src', 'zapatos'],
  compilerOptions: {
    target: 'ES2019', module: 'CommonJS', moduleResolution: 'node', strict: true, noEmit: true, skipLibCheck: true,
    types: ['node'],
  },
}, null, 2));

const compiled = spawnSync(process.execPath, [join(cache, 'node_modules/typescript/bin/tsc'), '-p', consumer, '--pretty', 'false'],
  {cwd: consumer, encoding: 'utf8'});
console.log(compiled.status === 0 ?
  `✓ a consumer on TypeScript ${ts.version} compiles against them, with skipLibCheck` :
  `✗ a consumer on TypeScript ${ts.version} does not compile against them, with skipLibCheck:\n${compiled.stdout}${compiled.stderr}`);

// the same program, every shipped declaration a root and checked: the one error allowed is core.d.ts's
// `Buffer<ArrayBuffer>` (TS2315), from the `@types/node` the package is built with, which install.md covers
const
  tsconfig = join(consumer, 'tsconfig.json'),
  // the file's path, so that `types` resolves from the consumer, not from the repository's newer @types/node
  config = ts.parseJsonConfigFileContent(JSON.parse(readFileSync(tsconfig, 'utf8')), ts.sys, consumer, undefined, tsconfig),
  real = realpathSync(pkg), // the path the compiler gives the files that an import resolves to
  program = ts.createProgram([...config.fileNames, ...declarations.map(file => real + file.slice(pkg.length))],
    {...config.options, skipLibCheck: false}),
  known = d => d.file.fileName === join(real, 'dist/db/core.d.ts') && d.code === 2315 &&
    ts.flattenDiagnosticMessageText(d.messageText, '\n') === "Type 'Buffer' is not generic.",
  lib = program.getSourceFiles().filter(file => file.fileName.startsWith(real + '/'))
    .flatMap(file => program.getSemanticDiagnostics(file)).filter(d => !known(d));
console.log(lib.length ?
  `✗ TypeScript ${ts.version} finds ${lib.length === 1 ? 'an error' : 'errors'} in the shipped declarations, without skipLibCheck:\n` +
    ts.formatDiagnostics(lib, host) :
  `✓ TypeScript ${ts.version} checks the shipped declarations, without skipLibCheck, Buffer<ArrayBuffer> aside`);

process.exit(syntax.length || compiled.status !== 0 || lib.length ? 1 : 0);

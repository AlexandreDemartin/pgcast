#!/usr/bin/env node
// `npm run bench:types`: the type-checking cost of bench/, a schema-heavy project, against
// bench/baseline.json. Fails when Instantiations or Types grow by more than 20 %.
// `--update` rewrites the baseline. Times and memory are shown, never compared: they depend on the machine.
//
// What is compared is the bench minus its floor (bench/tsconfig.floor.json: same options, no code),
// so that TypeScript's libs and @types/node, which do not depend on pgcast, do not dilute the threshold.
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const baselineName = 'bench/baseline.json';
const baselinePath = join(root, baselineName);
const threshold = 0.2;
const compared = ['Instantiations', 'Types'];
const shown = ['Check time', 'Memory used'];

const require = createRequire(import.meta.url);
const tscPath = require.resolve('typescript/bin/tsc');
const tsVersion = require('typescript/package.json').version;

function tsc(...args) {
  const result = spawnSync(process.execPath, [tscPath, ...args], {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr);
    console.error(`bench:types: tsc ${args.join(' ')} failed`);
    process.exit(1);
  }
  return result.stdout;
}

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

// every compared figure must be a finite integer: NaN would make every comparison false and the job pass
function integer(value, what) {
  const number = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isSafeInteger(number)) {
    fail(`bench:types: ${what} is ${JSON.stringify(value)}, not an integer.`);
  }
  return number;
}

function diagnostics(project) {
  const output = tsc('-p', project, '--noEmit', '--extendedDiagnostics');
  return Object.fromEntries([...output.matchAll(/^([A-Za-z ]+):\s+(\S+)$/gm)].map(([, key, value]) => [key, value]));
}

// the declarations of src/db that bench/tsconfig.json resolves 'zapatos/db' to, as `npm run typecheck` emits them
tsc('--emitDeclarationOnly', '--outDir', 'node_modules/.cache/pgcast');

const bench = diagnostics('bench');
const floor = diagnostics('bench/tsconfig.floor.json');
const current = Object.fromEntries(compared.map(key => [
  key,
  integer(bench[key], `${key} of tsc -p bench`) - integer(floor[key], `${key} of tsc -p bench/tsconfig.floor.json`),
]));

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify({typescript: tsVersion, ...current}, null, 2) + '\n');
  console.log(`bench:types: ${baselineName} updated`, current);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
for (const key of compared) {
  if (integer(baseline[key], `${key} in ${baselineName}`) <= 0) fail(`bench:types: ${key} in ${baselineName} is not positive.`);
}
const rows = [['', 'current', 'baseline', 'change']];
const failures = [];
for (const key of compared) {
  const change = current[key] / baseline[key] - 1;
  rows.push([key, current[key], baseline[key], `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)} %`]);
  if (change > threshold) failures.push(key);
}
for (const key of shown) rows.push([key, bench[key], '', '']);

const widths = rows[0].map((_, i) => Math.max(...rows.map(row => String(row[i]).length)));
for (const row of rows) console.log(row.map((cell, i) => String(cell)[i ? 'padStart' : 'padEnd'](widths[i])).join('  '));

if (baseline.typescript !== tsVersion) {
  console.log(`\nnote: the baseline was measured with TypeScript ${baseline.typescript}, this is ${tsVersion}`);
}
if (failures.length) {
  console.error(`\nbench:types: ${failures.join(' and ')} up by more than ${threshold * 100} % on ${baselineName}.`);
  console.error('Find the type that costs more, or, if the rise is justified, run `npm run bench:types -- --update`');
  console.error('and give the figures in the PR (skill type-tests).');
  process.exit(1);
}

#!/usr/bin/env node
// Copyright (C) 2026 Alexandre Demartin
//
// `npm run bench:runtime`: the time of each shortcut scenario against a throwaway database on TEST_DATABASE_URL's
// server, printed as a Markdown table and compared with bench/runtime/baseline.json. The proof every speed PR quotes,
// before and after (Epic #942).
//
// - The data: invented tables, filled by generate_series, the same on every run (no random()).
// - Each scenario runs as `default` and as `prepared` (`.prepared(name)` on the same query); `--config '<json>'` adds
//   `config` and `config, prepared`, the same queries built after `db.setConfig(<json>)`, so that an option's PR
//   compares with and without it in one process.
// - Client time: `--warmup` rounds (2), then `--rounds` rounds (9), each running every variant once, interleaved, the
//   order reversed every other round; the median of each variant. A scenario with `repeat` runs that many times per
//   round, and gives the time per call. A query that fails is recorded as such and not run again.
// - Server time, Postgres 17+ only: the median of 3 `EXPLAIN (ANALYZE, SERIALIZE TEXT)` of the compiled query,
//   whose Execution Time includes producing the output text (plain `EXPLAIN ANALYZE` leaves it out: 0.4 ms against
//   178 ms for a `SELECT *` of 10,000 rows of 4.6 KB). A server time above its client time is EXPLAIN's own per-row
//   instrumentation: compare server times with each other, and client times with each other.
// - The gate: a `default` or `prepared` median more than `threshold` above the baseline's, and at least `floor` ms
//   above it, or a query of the baseline that now fails. Timings move by about ±30 % between runs on one machine, so
//   the gate holds only on the baseline's machine and Postgres major version; elsewhere the change is shown, not gated.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {cpus, platform} from 'node:os';
import {dirname, join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';

const
  root = fileURLToPath(new URL('..', import.meta.url)),
  require = createRequire(import.meta.url),
  baselineName = 'bench/runtime/baseline.json',
  baselinePath = join(root, baselineName),
  threshold = 0.5,
  floor = 0.5,
  explains = 3,
  args = process.argv.slice(2),
  option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined,
  rounds = Number(option('--rounds') ?? 9),
  warmup = Number(option('--warmup') ?? 2),
  update = args.includes('--update');

function fail(...lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

for (const [name, value, least] of [['--rounds', rounds, 1], ['--warmup', warmup, 0]]) {
  if (!Number.isSafeInteger(value) || value < least) fail(`bench:runtime: ${name} takes a whole number, ${least} or more.`);
}

let override;
if (option('--config') !== undefined) {
  try { override = JSON.parse(option('--config')); } catch { /* refused below */ }
  if (override === null || typeof override !== 'object' || Array.isArray(override) || !Object.keys(override).length) {
    fail(`bench:runtime: --config takes a JSON object of db.setConfig() options, e.g. --config '{"castArrayParamsToJson":true}'.`);
  }
}

// the runtime as this checkout builds it
const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc')], {cwd: root, encoding: 'utf8'});
if (tsc.status !== 0) fail(tsc.stdout + tsc.stderr, 'bench:runtime: tsc failed');
const db = require(join(root, 'dist/db'));

// `config` undefined puts back the options that --config sets, as they were
const saved = db.getConfig();
const useConfig = config => db.setConfig(config ?? Object.fromEntries(Object.keys(override ?? {}).map(key => [key, saved[key]])));

/* === the data and the scenarios === */

// one statement each, run in order; `columns` and `jsonb*` share one table
const data = {
  films: [
    'CREATE TABLE studios (id int PRIMARY KEY, name text NOT NULL, founded int NOT NULL)',
    'CREATE TABLE films (id int PRIMARY KEY, studio_id int NOT NULL REFERENCES studios, title text NOT NULL, ' +
      'release_year int NOT NULL, runtime_minutes int NOT NULL)',
    'CREATE INDEX ON films (studio_id)',
    `INSERT INTO studios SELECT g, 'Studio ' || g, 1900 + g % 120 FROM generate_series(1, 1000) g`,
    `INSERT INTO films SELECT g, 1 + (g - 1) / 20, 'Film ' || g, 1920 + g % 100, 80 + g % 90 FROM generate_series(1, 20000) g`,
  ],
  profile: [
    'CREATE TABLE users (id int PRIMARY KEY, display_name text NOT NULL, email text NOT NULL, manager_id int REFERENCES users)',
    'CREATE TABLE accounts (id int PRIMARY KEY, owner_id int NOT NULL REFERENCES users, balance numeric NOT NULL, opened_on date NOT NULL)',
    'CREATE TABLE transfers (id int PRIMARY KEY, from_account int NOT NULL REFERENCES accounts, ' +
      'to_account int NOT NULL REFERENCES accounts, amount numeric NOT NULL, note text)',
    'CREATE INDEX ON accounts (owner_id)', 'CREATE INDEX ON transfers (from_account)', 'CREATE INDEX ON transfers (to_account)',
    `INSERT INTO users SELECT g, 'User ' || g, 'u' || g || '@example.com', NULLIF(g / 10, 0) FROM generate_series(1, 10000) g`,
    `INSERT INTO accounts SELECT g, 1 + g % 10000, g * 1.5, date '2020-01-01' + g % 1000 FROM generate_series(1, 30000) g`,
    `INSERT INTO transfers SELECT g, 1 + g % 30000, 1 + (g * 7) % 30000, g % 500, 'note ' || g FROM generate_series(1, 200000) g`,
  ],
  // about 80 bytes of jsonb text per item: 50 items make 4.6 KB, 1250 make 115 KB
  ...Object.fromEntries([['jsonb4k', 'payload_4k', 10000, 50], ['jsonb115k', 'payload_115k', 2000, 1250]].map(([key, table, rows, items]) => [key, [
    `CREATE TABLE ${table} (id int PRIMARY KEY, title text NOT NULL, created_at timestamptz NOT NULL, n int8 NOT NULL, payload jsonb NOT NULL)`,
    `INSERT INTO ${table} SELECT g, 'Title ' || g, timestamptz '2026-01-01' + g * interval '1 minute', g * 1000,
      (SELECT jsonb_build_object('items', jsonb_agg(jsonb_build_object('k', md5(g || ':' || i), 'v', md5(i || ':' || g), 'i', i)))
        FROM generate_series(1, ${items}) i)
      FROM generate_series(1, ${rows}) g`,
  ]])),
  sink: ['CREATE TABLE sink (id int PRIMARY KEY, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), n int8 NOT NULL)'],
};

// the profile query of bench/reads.ts, without its memberships: 3 levels of lateral
const profile = id => db.selectExactlyOne('users', {id}, {
  columns: ['id', 'display_name', 'email'],
  lateral: {
    manager: db.selectOne('users', {id: db.parent('manager_id')}, {columns: ['id', 'display_name']}),
    accounts: db.select('accounts', {owner_id: db.parent('id')}, {
      columns: ['id', 'balance', 'opened_on'], order: {by: 'opened_on', direction: 'DESC'},
      lateral: {
        sent: db.select('transfers', {from_account: db.parent('id')}, {
          columns: ['id', 'amount', 'note'],
          lateral: {to: db.selectExactlyOne('accounts', {id: db.parent('to_account')}, {columns: ['owner_id']})},
        }),
        received: db.count('transfers', {to_account: db.parent('id')}),
      },
    }),
  },
});

const rowsToInsert = n => Array.from({length: n}, (_, i) => ({id: i + 1, title: 'Title ' + i, n: i * 1000}));

// `query(k)` builds the k-th call's query; `before` runs, untimed, before each call
const allScenarios = [
  {id: 'lateral', name: '1000 parents × 20 children, one lateral', data: 'films',
    query: () => db.select('studios', db.all, {lateral: {films: db.select('films', {studio_id: db.parent('id')})}})},
  {id: 'profile', name: 'profile, 3 levels of lateral', data: 'profile', repeat: 50,
    query: k => profile(1 + (k * 37) % 10000)},
  {id: 'columns', name: '10,000 small rows, columns', data: 'jsonb4k',
    query: () => db.select('payload_4k', db.all, {columns: ['id', 'title', 'created_at', 'n']})},
  {id: 'jsonb4k', name: '10,000 rows × 4.6 KB jsonb', data: 'jsonb4k', query: () => db.select('payload_4k', db.all)},
  {id: 'jsonb115k', name: '2000 rows × 115 KB jsonb', data: 'jsonb115k', query: () => db.select('payload_115k', db.all)},
  {id: 'page', name: 'one page of 50 rows', data: 'films', repeat: 50,
    query: () => db.select('films', {id: db.conditions.gt(1000)}, {order: {by: 'id', direction: 'ASC'}, limit: 50})},
  {id: 'byKey', name: 'one row by primary key', data: 'films', repeat: 50,
    query: k => db.selectOne('films', {id: 1 + (k * 37) % 20000})},
  ...[[100, 20], [1000, 5], [10000, 1]].map(([n, repeat]) => {
    const rows = rowsToInsert(n);
    return {id: `insert${n}`, name: `insert() of ${n.toLocaleString('en-GB')} rows`, data: 'sink', repeat,
      before: 'TRUNCATE sink', query: () => db.insert('sink', rows)};
  }),
];

// `--scenarios lateral,page`: some of them, and only their data
const scenarios = option('--scenarios')?.split(',').map(id => allScenarios.find(s => s.id === id) ??
  fail(`bench:runtime: no scenario ${id}; the scenarios are ${allScenarios.map(s => s.id).join(', ')}.`)) ?? allScenarios;

const variants = [
  {label: 'default', prepared: false, config: undefined},
  {label: 'prepared', prepared: true, config: undefined},
  ...override ? [{label: 'config', prepared: false, config: override}, {label: 'config, prepared', prepared: true, config: override}] : [],
];

// a comparison where the config changes no query is said, not silent
if (override) {
  const compiled = (scenario, config) => {
    useConfig(config);
    const {text, values} = scenario.query(0).compile();
    return JSON.stringify([text, values]);
  };
  const changed = scenarios.filter(scenario => compiled(scenario, undefined) !== compiled(scenario, override));
  useConfig(undefined);
  console.error(`bench:runtime: the config changes the compiled SQL of ${changed.length ? changed.map(s => s.id).join(', ') : 'no scenario'}.`);
}

/* === the throwaway database === */

const envFile = join(root, 'src/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);  // the environment wins
if (!process.env.TEST_DATABASE_URL) {
  fail('bench:runtime: TEST_DATABASE_URL is not set: set it in src/.env or in the environment (AGENTS.md § Local environment).');
}

const pg = require('pg');
const database = `pgcast_test_${process.pid}_bench_runtime`;  // dropped by any `npm test` once this process is gone
const urlFor = name => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + name;
  return url.toString();
};
const connect = async url => {
  const client = new pg.Client({connectionString: url});
  client.on('error', () => {});  // a DROP DATABASE ... WITH (FORCE) elsewhere ends it: the query in progress rejects
  await client.connect();
  return client;
};
const withClient = async (url, fn) => {
  const client = await connect(url);
  try { return await fn(client); } finally { await client.end(); }
};

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const results = new Map();  // `${scenario.id}/${variant.label}` -> {times, error, server}
const key = (scenario, variant) => `${scenario.id}/${variant.label}`;
let serverVersion, serverVersionNum;

await withClient(process.env.TEST_DATABASE_URL, client => client.query(`CREATE DATABASE ${database}`));
try {
  const client = await connect(urlFor(database));
  try {
    ({server_version: serverVersion, server_version_num: serverVersionNum} = (await client.query(
      `SELECT current_setting('server_version') AS server_version, current_setting('server_version_num')::int AS server_version_num`)).rows[0]);

    for (const name of new Set(scenarios.map(s => s.data))) {
      for (const statement of data[name]) await client.query(statement);
    }
    await client.query('VACUUM ANALYZE');

    const call = async (scenario, variant, k) => {
      if (scenario.before) await client.query(scenario.before);
      useConfig(variant.config);
      const query = scenario.query(k);
      if (variant.prepared) query.prepared(`bench_${scenario.id}_${variant.label.replace(/\W+/g, '_')}`);
      const start = performance.now();
      await query.run(client);
      return performance.now() - start;
    };

    const pairs = scenarios.flatMap(scenario => variants.map(variant => [scenario, variant]));
    for (const [scenario, variant] of pairs) results.set(key(scenario, variant), {times: []});
    for (let round = 0; round < warmup + rounds; round++) {
      for (const [scenario, variant] of round % 2 ? [...pairs].reverse() : pairs) {
        const result = results.get(key(scenario, variant));
        if (result.error) continue;
        try {
          let total = 0;
          for (let k = 0; k < (scenario.repeat ?? 1); k++) total += await call(scenario, variant, k);
          if (round >= warmup) result.times.push(total / (scenario.repeat ?? 1));
        } catch (err) {
          result.error = `${err.code ?? err.name}: ${err.message}`;
        }
      }
      console.error(`bench:runtime: round ${round + 1} of ${warmup + rounds}${round < warmup ? ' (warm-up)' : ''}`);
    }

    // EXPLAIN runs the query: a prepared variant runs the same statement, so it has no server time of its own
    if (serverVersionNum >= 170000) {
      for (const [scenario, variant] of pairs.filter(([, variant]) => !variant.prepared)) {
        const result = results.get(key(scenario, variant));
        if (result.error) continue;
        const plans = [];
        for (let i = 0; i < explains; i++) {
          if (scenario.before) await client.query(scenario.before);
          useConfig(variant.config);
          const {text, values} = scenario.query(0).compile();
          plans.push((await client.query(`EXPLAIN (ANALYZE, SERIALIZE TEXT, FORMAT JSON) ${text}`, values)).rows[0]['QUERY PLAN'][0]);
        }
        result.server = {
          planning: median(plans.map(p => p['Planning Time'])),
          execution: median(plans.map(p => p['Execution Time'])),
          serialize: median(plans.map(p => p.Serialization?.Time ?? 0)),
          output: median(plans.map(p => p.Serialization?.['Output Volume'] ?? 0)),
        };
      }
    }
  } finally {
    useConfig(undefined);
    await client.end();
  }
} finally {
  await withClient(process.env.TEST_DATABASE_URL, client => client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
}

/* === the report and the gate === */

const
  machine = `${cpus()[0]?.model ?? 'unknown CPU'}, ${platform()}`,
  major = Math.floor(serverVersionNum / 10000),
  baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : undefined,
  gated = baseline?.machine === machine && baseline?.postgresMajor === major,
  ms = value => value === undefined ? '' : value.toFixed(value < 10 ? 2 : 1),
  percent = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)} %`,
  outside = [],
  serverColumns = serverVersionNum >= 170000,
  rows = [];

for (const scenario of scenarios) {
  for (const variant of variants) {
    const
      result = results.get(key(scenario, variant)),
      client = result.times.length ? median(result.times) : undefined,
      before = variant.config ? undefined : baseline?.scenarios?.[`${scenario.id}/${variant.label}`],
      spread = client === undefined ? '' : percent((Math.max(...result.times) - Math.min(...result.times)) / client).slice(1),
      change = before === undefined ? '' : before === null ? (result.error ? 'fails, as in the baseline' : 'fails in the baseline') :
        result.error ? 'fails' : percent(client / before - 1);
    if (gated && before !== undefined && before !== null && (result.error || (client / before - 1 > threshold && client - before >= floor))) {
      outside.push(`${scenario.id} ${variant.label} ${result.error ? 'fails' : percent(client / before - 1)}`);
    }
    rows.push([scenario.name, variant.label, result.error ? `fails: ${result.error}` : ms(client), spread,
      ...serverColumns ? [ms(result.server?.planning), ms(result.server?.execution), ms(result.server?.serialize),
        result.server ? String(Math.round(result.server.output)) : ''] : [],
      before === undefined || before === null ? '' : ms(before), change]);
  }
}

const header = ['Scenario', 'Variant', 'Client median (ms)', 'Spread',
  ...serverColumns ? ['Planning (ms)', 'Execution (ms)', 'of which serialize (ms)', 'Output (KB)'] : [], 'Baseline (ms)', 'Change'];
console.log(`\nPostgreSQL ${serverVersion}, Node ${process.versions.node}, ${machine}; medians of ${rounds} interleaved rounds ` +
  `after ${warmup} of warm-up${override ? `; config: \`${JSON.stringify(override)}\`` : ''}.`);
console.log(serverColumns ? `Server times: medians of ${explains} \`EXPLAIN (ANALYZE, SERIALIZE TEXT)\`; a prepared variant runs the same statement.\n` :
  'No server times: `EXPLAIN (SERIALIZE)` needs Postgres 17 or later.\n');
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map((_, i) => i < 2 ? '---' : '---:').join('|')}|`);
for (const row of rows) console.log(`| ${row.join(' | ')} |`);

if (update) {
  // the scenarios not run keep their times; a failure is kept as null
  const scenariosBefore = baseline && gated ? baseline.scenarios : {};
  mkdirSync(dirname(baselinePath), {recursive: true});
  writeFileSync(baselinePath, JSON.stringify({
    machine, postgresMajor: major, node: process.versions.node, rounds,
    scenarios: Object.fromEntries(allScenarios.flatMap(scenario => variants.filter(variant => !variant.config).map(variant => {
      const name = `${scenario.id}/${variant.label}`, result = results.get(key(scenario, variant));
      return result ? [name, result.error ? null : Number(median(result.times).toFixed(3))] : [name, scenariosBefore[name]];
    }).filter(([, value]) => value !== undefined))),
  }, null, 2) + '\n');
  console.log(`\nbench:runtime: ${baselineName} updated`);
  process.exit(0);
}

if (!baseline) fail(`\nbench:runtime: no ${baselineName}: run \`npm run bench:runtime -- --update\` and commit it.`);
if (!gated) {
  console.log(`\nbench:runtime: ${baselineName} was measured on ${baseline.machine}, Postgres ${baseline.postgresMajor}; ` +
    `this is ${machine}, Postgres ${major}: the change is shown, not gated.`);
} else if (outside.length) {
  fail(`\nbench:runtime: more than ${threshold * 100} % and ${floor} ms slower than ${baselineName}, or failing: ${outside.join(', ')}.`,
    'Rerun once (timings move by about ±30 % between runs); if it holds, find the cause, or, if the cost is justified,',
    'run `npm run bench:runtime -- --update` and give both tables in the PR.');
}

// Copyright (C) 2026 Alexandre Demartin
// Runs every example of examples/ against Postgres, on the docs schema, so that a query that type-checks but fails in
// Postgres fails CI (README.md § Examples); a failure names the page and the line that include the example. A cast
// panel's example sends one query: it runs on one client, between BEGIN and ROLLBACK. An example of several queries
// (examples/plain/) opens its own transactions, some at once: it gets a pool on its own copy of the database. An
// example that shows an error says which above `// ---cut---`, `// rejects with 42703` (a SQLSTATE) or
// `// rejects with NotExactlyOneError` (an error's name), and must reject with it. schema.sql goes into a temporary
// database on the server of TEST_DATABASE_URL (the environment, else ../src/.env). On it too, the playground's Postgres
// (PGlite, decision 005) must parse the docs schema's types as `pg` does, and every example runs again on its pool, as
// a Run gives it to the code. Run by `npm run docs:examples`, after the root `npm run build`.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import pg from 'pg';
import * as db from 'zapatos/db';
import { open, poolOf } from './.vitepress/playground/pglite.ts';
import { dropOrphanDocsDatabases } from './orphan-databases.mjs';

const envFile = new URL('../src/.env', import.meta.url);
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set (AGENTS.md § Local environment)');

const
  server = new URL(process.env.TEST_DATABASE_URL),
  schema = readFileSync(new URL('schema.sql', import.meta.url), 'utf8'),
  name = `pgcast_test_${process.pid}_docs`,  // a concurrent test run leaves pgcast_test_<pid>_* alone while <pid> lives
  copy = `${name}_copy`,
  timeLimit = 10_000,  // each example, in ms: all of them run in about 2 s
  urlOf = database => Object.assign(new URL(server), { pathname: `/${database}` }).toString(),
  admin = new pg.Client({ connectionString: server.toString() }),
  pending = [],  // what a stand-in `test()` was given, awaited before the example counts as run
  // Stand-ins for what an example only declares (`declare const tags: …`): a page shows how it is used, not made.
  standIns = {
    tags: Array.from({ length: 12_000 }, (_, i) => ({ film_id: 1000 + i % 4, tag: `tag ${i}` })),
    fetchSeatLimit: async () => 4,
    sendConfirmation: async () => {},
    test: (_, fn) => { pending.push(fn()); },
    assert,
  };

/** Where each example is shown: `page.md:line` of each `<<< ./examples/….ts` that includes it. */
const pagesOf = new Map();
for (const page of readdirSync(new URL('.', import.meta.url)).filter(file => file.endsWith('.md'))) {
  readFileSync(new URL(page, import.meta.url), 'utf8').split('\n').forEach((line, i) => {
    const example = line.match(/^<<< \.\/(examples\/[\w/-]+\.ts)/)?.[1];
    if (example) pagesOf.set(example, [...pagesOf.get(example) ?? [], `${page}:${i + 1}`]);
  });
}

/** Every name a `declare` line gives: `a` and `b` in `declare const a: A, b: Map<K, V>;`, not `V`. */
function declaredNames(source) {
  return [...source.matchAll(/^declare (const|let|var|function) (.*)/gm)].flatMap(([, kind, rest]) => {
    if (kind === 'function') return [rest.match(/^\w+/)?.[0]];
    const parts = [''];
    let depth = 0;
    for (let i = 0; i < rest.length; i++) {
      const char = rest[i];
      if (depth === 0 && (char === ';' || rest.startsWith('//', i))) break;  // the end, or a comment
      if ('<([{'.includes(char)) depth++;
      else if (')]}'.includes(char) || (char === '>' && rest[i - 1] !== '=')) depth--;  // `=>` closes nothing
      if (char === ',' && depth === 0) parts.push('');
      else parts[parts.length - 1] += char;
    }
    return parts.map(part => part.match(/^\s*(\w+)/)?.[1]);
  });
}

/**
 * Run one example with `pool` set to what it is given. Every example shares this process's `zapatos/db`, so the
 * configuration goes back to what it was before the next, as in `cast.data.ts`. `search` imports it afresh, for a
 * second run: a module runs once per URL.
 */
async function run(example, pool, search = '') {
  const
    file = new URL(example, import.meta.url),
    source = readFileSync(file, 'utf8'),
    declared = declaredNames(source),
    unknown = declared.filter(name => name !== 'pool' && !(name in standIns)),
    expected = source.match(/^\/\/ rejects with (\w+)/m)?.[1],
    config = db.getConfig();

  if (unknown.length > 0) throw new Error(`declares ${unknown.join(', ')}: add a stand-in to run-examples.mjs`);
  config.transactionRetryDelay = { ...config.transactionRetryDelay };
  Object.assign(globalThis, standIns, { pool });
  pending.length = 0;
  try {
    await import(file.href + search);
    await Promise.all(pending);
  } catch (error) {
    if (expected === undefined) throw error;
    if (![error?.code, error?.name].includes(expected)) {
      const got = error?.code ?? error?.name;
      throw new Error(`rejects with ${got}, not ${expected}: ${error?.message}`, { cause: error });
    }
    return;
  } finally {
    db.setConfig({ ...Object.fromEntries(Object.keys(db.getConfig()).map(key => [key, undefined])), ...config });
  }
  if (expected !== undefined) throw new Error(`ran with no error, though it says it rejects with ${expected}`);
}

const
  examples = ['examples/', 'examples/plain/'].flatMap(dir => readdirSync(new URL(dir, import.meta.url))
    .filter(file => file.endsWith('.ts')).map(file => dir + file)),
  problems = [];

let current;  // the example last started: a promise it leaves unawaited that rejects later is its problem

/** Note `error` as a problem of `example`, with where it is shown and, if the stack has it, the example's own line. */
function note(example, error, what = '') {
  const
    href = new URL(example, import.meta.url).href,  // as the stack names it: no regex built from a file name
    frame = `${error?.stack}\n${error?.cause?.stack}`.split('\n').find(at => /^[:?]/.test(at.split(href)[1] ?? '')),
    line = frame?.match(/:(\d+):\d+\)?$/)?.[1],
    where = (pagesOf.get(example) ?? ['(on no page)']).join(', ');
  what += error?.code ? `${error.code} ${error.message}` : String(error?.message ?? error);
  problems.push(`${where}: ${example}${line ? `:${line}` : ''}: ${what}`);
}

process.on('unhandledRejection', error => note(current, error, 'a promise it does not await rejects: '));

/**
 * The playground's PGlite, with its adapter's parsers, gives the rows `pg` gives through `client`: for each table of
 * the docs schema, and for what a query on it often selects. Given values, it gets them as `pg` sends them: the same
 * rows, or the same SQLSTATE. In a time zone ahead of UTC, as a reader's may be: `pg` makes a `date` midnight where
 * the code runs, and sends a `Date` as its local time.
 */
async function checkPlaygroundParsers(client) {
  const zone = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';  // before the first `Date` below
  const
    pglite = await open(schema),
    day = new Date(2030, 2, 1),  // midnight in Kolkata: 1 March there, 28 February in UTC
    { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"),
    queries = [
      ...tables.map(({ tablename }) => `SELECT * FROM "${tablename}" ORDER BY 1, 2`),
      `SELECT count(*), sum(runtime_minutes::int8), avg(runtime_minutes), array_agg(id::int8 ORDER BY id) AS ids,
        array_agg(runtime_minutes / 60.0 ORDER BY id) AS hours, array_agg(title ORDER BY id) AS titles FROM films`,
      `SELECT starts_at::date AS day, array_agg(starts_at::date) OVER () AS days, array_agg(starts_at) OVER () AS times,
        location, array_agg(location) OVER () AS locations, to_jsonb(cinemas) AS cinema, row_to_json(cinemas) AS row
        FROM screenings JOIN cinemas ON cinemas.id = cinema_id ORDER BY screenings.id`,
      `SELECT '\\x00ff'::bytea AS bytes, ARRAY['\\x01'::bytea] AS byte_arrays, 'director'::crew_job AS job,
        ARRAY['director'::crew_job] AS jobs, 'A1'::seat_label AS seat, ARRAY['A1'::seat_label] AS seats,
        '2030-03-01'::date AS day, '0050-03-01'::date AS early, '0001-03-01 BC'::date AS bc, 'infinity'::date AS never,
        '-infinity'::timestamp AS always, ARRAY['infinity'::timestamptz] AS forever`,
    ],
    given = [
      // arrays: an enum's, a domain's, of what `pg` quotes, of bytes, of dates, nested; one as `jsonb` rejects
      ['SELECT name FROM crew WHERE job = ANY($1) ORDER BY 1', [['director', 'editor']]],
      ['SELECT $1::crew_job[] AS jobs, $2::seat_label[] AS seats, $3::text[] AS texts, $4::int[] AS grid',
        [['director', 'composer'], ['A1', 'B12'], ['a"b', 'c,d', 'e\\f', '{}', '', null], [[1, 2], [3, null]]]],
      ['SELECT $1::bytea[] AS bytes, $2::timestamptz[] AS times, $3::date[] AS days',
        [[Buffer.from([1, 255]), new Uint8Array([2])], [day, null], [day]]],
      ['SELECT $1::jsonb AS list', [[1, 2]]],
      ['SELECT $1::seat_label[] AS seats', [['a1']]],
      // a `Date` as each type that takes one, as text, and in a year BC
      ['SELECT $1::date AS day, $1::date::text AS shown, $2::timestamp::text AS local, $3::timestamptz AS at',
        [day, new Date(2030, 2, 1, 10, 30, 15, 250), new Date(Date.UTC(2030, 2, 1, 22))]],
      ['SELECT $1::text AS text, $2::date AS bc', [day, new Date(-62_200_000_000_000)]],
      // an object as JSON, or what its `toPostgres()` gives; bytes, sent as they are; null and undefined; the rest
      // as text
      ['SELECT $1::text AS text, $2::jsonb AS json, $3::text AS own',
        [{ a: 1 }, { film: { title: 'Ink' }, ids: [1, 2] }, { toPostgres: () => 'its own' }]],
      ['SELECT $1::bytea AS bytes, $2::bytea AS view, $3::text AS text',
        [Buffer.from([0, 255]), new Uint8Array([1, 2, 3]).subarray(1), Buffer.from('café')]],
      ['SELECT $1::bool AS yes, $2::bool AS no, $3::text AS nothing, $4::int AS missing, $5::int8 AS big, ' +
        '$6::numeric AS number, $7::float8 AS infinite', [true, false, null, undefined, 2n ** 63n - 1n, 1.5, -Infinity]],
    ],
    // its rows, or its error's code
    answer = async query => {
      try {
        return { rows: (await query).rows };
      } catch (error) {
        return { rejects: error.code ?? error.message };
      }
    };

  try {
    for (const [text, values] of [...queries.map(text => [text]), ...given]) {
      const [expected, got] = [await answer(client.query({ text, values })), await answer(pglite.query(text, values))];
      try {
        assert.deepStrictEqual(got, expected);
      } catch (error) {
        const shown = values ? ` given ${inspect(values, { breakLength: Infinity })}` : '';
        problems.push(`the playground's PGlite answers \`${text}\`${shown} unlike pg: ${error.message}`);
      }
    }
  } finally {
    if (zone === undefined) delete process.env.TZ;  // `= undefined` would set it to 'undefined'
    else process.env.TZ = zone;
    await pglite.close();
  }
}

/** Print the problems, if any, and set the exit code. */
function report() {
  if (problems.length > 0) {
    console.error(`The examples check failed (README.md § Examples):\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`The examples ran against Postgres: ${examples.length}, each on the docs schema, on pg and on ` +
      "the playground's PGlite, which parses its types as pg does and gets its values as pg sends them.");
  }
}

/**
 * Run `example`, noting its failure; `on` names where, if not on `pg`. One that does not settle in time ends the run:
 * its client may never be free.
 */
async function check(example, pool, on) {
  current = example;
  let timer;
  try {
    const timedOut = new Promise(resolve => { timer = setTimeout(resolve, timeLimit, true); });
    if (await Promise.race([run(example, pool, on && '?pglite'), timedOut])) {
      note(example, new Error(`does not settle within ${timeLimit / 1000} s; the examples after it did not run`), on);
      for (const database of [copy, name]) await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      report();
      process.exit();
    }
  } catch (error) {
    note(example, error, on);
  } finally {
    clearTimeout(timer);
  }
}

await admin.connect();
await dropOrphanDocsDatabases(admin);
await admin.query(`CREATE DATABASE "${name}"`);
try {
  const client = new pg.Client({ connectionString: urlOf(name) });
  client.on('error', () => {});  // DROP … WITH (FORCE) ends its session when an example does not settle
  await client.connect();
  try {
    await client.query(schema);
    await checkPlaygroundParsers(client);
    for (const example of examples.filter(example => !example.startsWith('examples/plain/'))) {
      await client.query('BEGIN');
      await check(example, client);
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();  // a template database has no other session
  }
  for (const example of examples.filter(example => example.startsWith('examples/plain/'))) {
    await admin.query(`CREATE DATABASE "${copy}" TEMPLATE "${name}"`);
    const pool = new pg.Pool({ connectionString: urlOf(copy) });
    // DROP … WITH (FORCE) ends the sessions of a client the example did not release: their errors are expected.
    pool.on('error', () => {}).on('connect', client => client.on('error', () => {}));
    let settled = false;
    try {
      await check(example, pool);
      const busy = pool.totalCount - pool.idleCount, waiting = pool.waitingCount;
      settled = busy === 0 && waiting === 0;
      if (!settled) note(example, new Error(
        `leaves clients in use (${busy}) or queries waiting (${waiting}): await each query, release each client`));
    } finally {
      if (settled) await pool.end();  // it would wait for an unreleased client for good
      await admin.query(`DROP DATABASE "${copy}" WITH (FORCE)`);
    }
  }
  // Again on the playground's pool, `pool` of a Run: a cast panel's example on its client, between BEGIN and ROLLBACK,
  // as on `pg`; an example of several queries on a fresh PGlite, as each Run starts.
  const
    playground = "on the playground's PGlite: ",
    poolOn = pglite => poolOf(({ text, values }) => pglite.query(text, values)),
    shared = await open(schema),
    lent = await poolOn(shared).connect();
  try {
    for (const example of examples.filter(example => !example.startsWith('examples/plain/'))) {
      await lent.query({ text: 'BEGIN' });
      await check(example, lent, playground);
      await lent.query({ text: 'ROLLBACK' });
    }
  } finally {
    lent.release();
    await shared.close();
  }
  for (const example of examples.filter(example => example.startsWith('examples/plain/'))) {
    const pglite = await open(schema);
    try {
      await check(example, poolOn(pglite), playground);
    } finally {
      await pglite.close();
    }
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

report();

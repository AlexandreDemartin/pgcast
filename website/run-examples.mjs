// Copyright (C) 2026 Alexandre Demartin
// Runs every example of examples/ against Postgres, on the docs schema, so that a query that type-checks but fails in
// Postgres fails CI (README.md § Examples); a failure names the page and the line that include the example. A cast
// panel's example sends one query: it runs on one client, between BEGIN and ROLLBACK. An example of several queries
// (examples/plain/) opens its own transactions, some at once: it gets a pool on its own copy of the database. An
// example that shows an error says which above `// ---cut---`, `// rejects with 42703` (a SQLSTATE) or
// `// rejects with NotExactlyOneError` (an error's name), and must reject with it. schema.sql goes into a temporary
// database on the server of TEST_DATABASE_URL (the environment, else ../src/.env). Run by `npm run docs:examples`,
// after the root `npm run build`.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import * as db from 'zapatos/db';
import { dropOrphanDocsDatabases } from './orphan-databases.mjs';

const envFile = new URL('../src/.env', import.meta.url);
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set (AGENTS.md § Local environment)');

const
  server = new URL(process.env.TEST_DATABASE_URL),
  name = `pgcast_test_${process.pid}_docs`,  // a concurrent test run leaves pgcast_test_<pid>_* alone while <pid> lives
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

/**
 * Run one example with `pool` set to what it is given. Every example shares this process's `zapatos/db`, so the
 * configuration goes back to what it was before the next, as in `cast.data.ts`.
 */
async function run(example, pool) {
  const
    file = new URL(example, import.meta.url),
    source = readFileSync(file, 'utf8'),
    declared = [...source.matchAll(/^declare (?:const|let|var|function) (\w+)/gm)].map(([, name]) => name),
    unknown = declared.filter(name => name !== 'pool' && !(name in standIns)),
    expected = source.match(/^\/\/ rejects with (\w+)/m)?.[1],
    config = db.getConfig();

  if (unknown.length > 0) throw new Error(`declares ${unknown.join(', ')}: add a stand-in to run-examples.mjs`);
  config.transactionRetryDelay = { ...config.transactionRetryDelay };
  Object.assign(globalThis, standIns, { pool });
  pending.length = 0;
  try {
    await import(file.href);
    await Promise.all(pending);
  } catch (error) {
    if (expected === undefined || ![error?.code, error?.name].includes(expected)) throw error;
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

/** Run `example` and note its failure with where it is shown and, if the stack has it, the example's own line. */
async function check(example, pool) {
  try {
    await run(example, pool);
  } catch (error) {
    const
      href = new URL(example, import.meta.url).href,  // as the stack names it: no regex built from a file name
      frame = error?.stack?.split('\n').find(at => at.includes(`${href}:`)),
      line = frame?.match(/:(\d+):\d+\)?$/)?.[1],
      where = (pagesOf.get(example) ?? ['(on no page)']).join(', '),
      what = error?.code ? `${error.code} ${error.message}` : String(error?.message ?? error);
    problems.push(`${where}: ${example}${line ? `:${line}` : ''}: ${what}`);
  }
}

await admin.connect();
await dropOrphanDocsDatabases(admin);
await admin.query(`CREATE DATABASE "${name}"`);
try {
  const client = new pg.Client({ connectionString: urlOf(name) });
  await client.connect();
  try {
    await client.query(readFileSync(new URL('schema.sql', import.meta.url), 'utf8'));
    for (const example of examples.filter(example => !example.startsWith('examples/plain/'))) {
      await client.query('BEGIN');
      await check(example, client);
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();  // a template database has no other session
  }
  for (const example of examples.filter(example => example.startsWith('examples/plain/'))) {
    const copy = `${name}_copy`;
    await admin.query(`CREATE DATABASE "${copy}" TEMPLATE "${name}"`);
    const pool = new pg.Pool({ connectionString: urlOf(copy) });
    try {
      await check(example, pool);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE "${copy}"`);
    }
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

if (problems.length > 0) {
  console.error(`The examples check failed (README.md § Examples):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The examples ran against Postgres: ${examples.length}, each on the docs schema.`);
}

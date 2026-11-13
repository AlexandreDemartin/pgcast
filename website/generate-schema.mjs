// Copyright (C) 2026 Alexandre Demartin
// Regenerates zapatos/schema.d.ts from schema.sql with pgcast's own generator, as a user would: loads schema.sql into
// a temporary database on the server of TEST_DATABASE_URL (the environment, else ../src/.env), runs generate(), then
// drops the database. Before the drop, the home's loop: loop/alter.sql changes a column, and generate() writes
// loop/zapatos/schema.d.ts from the result. Run by `npm run docs:schema`, after the root `npm run build`.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { generate } from 'zapatos/generate';
import { dropOrphanDocsDatabases } from './orphan-databases.mjs';

const envFile = new URL('../src/.env', import.meta.url);
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set (AGENTS.md § Local environment)');

const
  server = new URL(process.env.TEST_DATABASE_URL),
  name = `pgcast_test_${process.pid}_docs`,  // a concurrent test run leaves pgcast_test_<pid>_* alone while <pid> lives
  url = Object.assign(new URL(server), { pathname: `/${name}` }).toString(),
  admin = new pg.Client({ connectionString: server.toString() }),
  sqlFile = file => readFileSync(new URL(file, import.meta.url), 'utf8');

await admin.connect();
await dropOrphanDocsDatabases(admin);
await admin.query(`CREATE DATABASE "${name}"`);
try {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query(sqlFile('schema.sql'));
    await generate({ db: { connectionString: url }, outDir: fileURLToPath(new URL('.', import.meta.url)) });
    // only the loop's schema.d.ts is kept: its custom types are zapatos/custom/'s, edited, not the new placeholders
    // (whose notices go unsaid; the first generate() gave any other warning)
    await client.query(sqlFile('loop/alter.sql'));
    const outDir = mkdtempSync(join(tmpdir(), 'pgcast-loop-'));
    try {
      await generate({ db: { connectionString: url }, outDir, warningListener: false });
      copyFileSync(join(outDir, 'zapatos', 'schema.d.ts'), new URL('loop/zapatos/schema.d.ts', import.meta.url));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  } finally {
    await client.end();
  }
} finally {
  // No FORCE: it would terminate a connection of generate()'s pool still closing (pool.end() does not wait for the
  // sockets), and the pool has no 'error' handler. A plain DROP waits up to 5 s for those sessions to go.
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

// Copyright (C) 2026 Alexandre Demartin
// Regenerates zapatos/schema.d.ts from schema.sql with pgcast's own generator, as a user would: loads schema.sql into
// a temporary database on the server of TEST_DATABASE_URL (the environment, else ../src/.env), runs generate(), then
// drops the database. Run by `npm run docs:schema`, after the root `npm run build`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { generate } from 'zapatos/generate';

const envFile = new URL('../src/.env', import.meta.url);
if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set (AGENTS.md § Local environment)');

const
  server = new URL(process.env.TEST_DATABASE_URL),
  name = `pgcast_test_docs_${process.pid}`,  // the prefix the test suite owns
  url = Object.assign(new URL(server), { pathname: `/${name}` }).toString(),
  admin = new pg.Client({ connectionString: server.toString() });

await admin.connect();
await admin.query(`CREATE DATABASE "${name}"`);
try {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(readFileSync(new URL('schema.sql', import.meta.url), 'utf8'));
  await client.end();
  await generate({ db: { connectionString: url }, outDir: fileURLToPath(new URL('.', import.meta.url)) });
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

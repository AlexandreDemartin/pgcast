// Copyright (C) 2026 Alexandre Demartin
//
// Shared by the global setup and the per-file helper. The tests create and drop
// only databases whose name starts with PREFIX; every DROP goes through
// dropDatabase(), which refuses any other name.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const PREFIX = 'pgcast_test_';

export interface PgcastDbContext {
  /** Server URL used for CREATE / DROP DATABASE. */
  url: string;
  /** Template database holding the fixture. */
  template: string;
  /** Name prefix of this run's databases. */
  prefix: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgcastDb: PgcastDbContext | null;
  }
}

export const missingUrlMessage =
  'TEST_DATABASE_URL is not set: integration tests need a Postgres server. ' +
  'Set it in src/.env or in the environment (AGENTS.md § Environnement local).';

/** Reads TEST_DATABASE_URL, from `src/.env` when it exists, else from the environment. */
export function testDatabaseUrl(): string | undefined {
  const envFile = fileURLToPath(new URL('../../src/.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return process.env.TEST_DATABASE_URL || undefined;
}

/** Name prefix of every database created by the run of process `pid`. */
export const runPrefix = (pid: number) => `${PREFIX}${pid}_`;

/** Same server and credentials as `url`, other database. */
export function urlForDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = '/' + encodeURIComponent(database);
  return u.toString();
}

const quoteIdent = (name: string) => '"' + name.replace(/"/g, '""') + '"';

/** Databases left by runs whose process is gone (or with a name we do not recognise). */
export function orphanDatabases(names: string[], isAlive: (pid: number) => boolean): string[] {
  return names.filter(name => {
    if (!name.startsWith(PREFIX)) return false;
    const pid = /^pgcast_test_(\d+)_/.exec(name)?.[1];
    return pid === undefined || !isAlive(Number(pid));
  });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';  // exists, owned by someone else
  }
}

/** Runs `fn` on a short-lived connection to the database of `url` (catalog reads, CREATE / DROP DATABASE). */
export async function withAdminClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function listTestDatabases(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE starts_with(datname, $1) ORDER BY datname', [PREFIX]);
  return rows.map(r => r.datname);
}

export async function createDatabase(client: pg.Client, name: string, template: string): Promise<void> {
  if (!name.startsWith(PREFIX)) throw new Error(`refusing to create ${name}: not a ${PREFIX}* database`);
  await client.query(`CREATE DATABASE ${quoteIdent(name)} TEMPLATE ${quoteIdent(template)}`);
}

export async function dropDatabase(client: pg.Client, name: string): Promise<void> {
  if (!name.startsWith(PREFIX)) throw new Error(`refusing to drop ${name}: not a ${PREFIX}* database`);
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
}

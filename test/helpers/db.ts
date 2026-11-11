// Copyright (C) 2026 Alexandre Demartin
//
// Integration test helper. Call useTestDatabase() at the top of a test file:
//   - beforeAll: a fresh database, copied from the fixture template;
//   - each test: one client inside BEGIN, rolled back afterwards;
//   - afterAll: the database is dropped.
// A test must not COMMIT: its writes would leak into the next tests of the file.

import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, inject } from 'vitest';
import { createDatabase, dropDatabase, missingUrlMessage, urlForDatabase, withAdminClient } from './databases';

export interface TestDatabase {
  /** Name of this file's database. */
  readonly name: string;
  /** The current test's client, inside a transaction rolled back after the test. */
  readonly client: pg.PoolClient;
}

export function useTestDatabase(): TestDatabase {
  const ctx = inject('pgcastDb');
  let name: string | undefined;
  let pool: pg.Pool | undefined;
  let client: pg.PoolClient | undefined;

  if (!ctx) {
    // every test of the file fails with the reason, none is reported as skipped
    beforeEach(() => { throw new Error(missingUrlMessage); });
    return accessors();
  }

  beforeAll(async () => {
    name = ctx.prefix + randomBytes(4).toString('hex');
    await withAdminClient(ctx.url, c => createDatabase(c, name!, ctx.template));
    pool = new pg.Pool({ connectionString: urlForDatabase(ctx.url, name) });
  });

  afterAll(async () => {
    await pool?.end();
    if (name) await withAdminClient(ctx.url, c => dropDatabase(c, name!));
  });

  beforeEach(async () => {
    client = await pool!.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    const c = client;
    client = undefined;
    if (!c) return;
    try {
      await c.query('ROLLBACK');
      c.release();
    } catch (err) {
      c.release(err as Error);  // broken connection: destroy it rather than reuse it
      throw err;
    }
  });

  return accessors();

  function accessors(): TestDatabase {
    return {
      get name() {
        if (!name) throw new Error('useTestDatabase(): no database before beforeAll');
        return name;
      },
      get client() {
        if (!client) throw new Error('useTestDatabase(): client used outside a test');
        return client;
      },
    };
  }
}

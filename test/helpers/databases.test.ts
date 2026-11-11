// Unit tests of the harness itself: no database needed.
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  createDatabase, createTemplateDatabase, dropDatabase, orphanDatabases, runPrefix, urlForDatabase,
} from './databases';

const noQueryClient = {
  query: () => { throw new Error('must not reach the server'); },
} as unknown as pg.Client;

describe('test database naming', () => {
  it('only ever selects pgcast_test_* databases, and only those of dead runs', () => {
    const alive = new Set([100]);
    const names = [
      'pgcast', 'postgres', 'pgcast_testing', 'pgcastXtestX_1_a', 'other_pgcast_test_1_a',
      `${runPrefix(100)}template`, `${runPrefix(100)}0a1b2c3d`,
      `${runPrefix(200)}template`, `${runPrefix(200)}0a1b2c3d`,
      'pgcast_test_leftover',
    ];
    expect(orphanDatabases(names, pid => alive.has(pid), 1)).toEqual([
      'pgcast_test_200_template', 'pgcast_test_200_0a1b2c3d', 'pgcast_test_leftover',
    ]);
  });

  it('treats databases with our own pid as orphans: a killed run whose pid we reused', () => {
    const names = [`${runPrefix(100)}template`, `${runPrefix(100)}0a1b2c3d`, `${runPrefix(200)}template`];
    expect(orphanDatabases(names, () => true, 100)).toEqual(['pgcast_test_100_template', 'pgcast_test_100_0a1b2c3d']);
  });

  it('points the server URL at another database, keeping credentials and options', () => {
    expect(urlForDatabase('postgres://u:p%40ss@db.local:5433/pgcast?sslmode=disable', 'pgcast_test_1_ab'))
      .toBe('postgres://u:p%40ss@db.local:5433/pgcast_test_1_ab?sslmode=disable');
  });

  it('never puts the URL, hence the password, in its error', () => {
    // accepted by pg (socket host), rejected by new URL()
    let error: unknown;
    try {
      urlForDatabase('postgres://user:s3cret@/mydb', 'pgcast_test_1_ab');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/TEST_DATABASE_URL must be a URL with a host/);
    expect(inspect(error, { showHidden: true, depth: null })).not.toContain('s3cret');
  });

  it('refuses to create or drop a database outside the prefix', async () => {
    await expect(dropDatabase(noQueryClient, 'pgcast')).rejects.toThrow(/refusing to drop pgcast/);
    await expect(dropDatabase(noQueryClient, 'postgres')).rejects.toThrow(/refusing/);
    await expect(createDatabase(noQueryClient, 'pgcast_copy', 'template0')).rejects.toThrow(/refusing to create/);
    await expect(createTemplateDatabase(noQueryClient, 'template1')).rejects.toThrow(/refusing to create/);
  });
});

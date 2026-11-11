// Unit tests of the harness itself: no database needed.
import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDatabase, dropDatabase, orphanDatabases, runPrefix, urlForDatabase } from './databases';

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
    expect(orphanDatabases(names, pid => alive.has(pid))).toEqual([
      'pgcast_test_200_template', 'pgcast_test_200_0a1b2c3d', 'pgcast_test_leftover',
    ]);
  });

  it('points the server URL at another database, keeping credentials and options', () => {
    expect(urlForDatabase('postgres://u:p%40ss@db.local:5433/pgcast?sslmode=disable', 'pgcast_test_1_ab'))
      .toBe('postgres://u:p%40ss@db.local:5433/pgcast_test_1_ab?sslmode=disable');
  });

  it('refuses to create or drop a database outside the prefix', async () => {
    await expect(dropDatabase(noQueryClient, 'pgcast')).rejects.toThrow(/refusing to drop pgcast/);
    await expect(dropDatabase(noQueryClient, 'postgres')).rejects.toThrow(/refusing/);
    await expect(createDatabase(noQueryClient, 'pgcast_copy', 'template0')).rejects.toThrow(/refusing to create/);
  });
});

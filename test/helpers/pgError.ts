// Copyright (C) 2026 Alexandre Demartin
//
// Runs a query expected to fail inside a savepoint, so that the test's
// transaction stays usable, and returns the Postgres error's code and message.

import type pg from 'pg';

export interface PgErrorSummary { code: string | undefined; message: string }

export async function pgError(client: pg.ClientBase, run: () => Promise<unknown>): Promise<PgErrorSummary> {
  await client.query('SAVEPOINT pgcast_expected_error');
  try {
    await run();
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT pgcast_expected_error');
    const { code, message } = err as { code?: string; message: string };
    return { code, message };
  }
  await client.query('RELEASE SAVEPOINT pgcast_expected_error');
  throw new Error('expected the query to fail');
}

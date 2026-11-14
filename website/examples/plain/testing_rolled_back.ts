import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare function test(name: string, fn: () => Promise<void>): void;
declare const assert: { deepEqual(actual: unknown, expected: unknown): void };
// The function of « The function to test », which the build checks against that block
// #region copy
async function programme(queryable: db.Queryable, studio_id: number) {
  const films = await db.select('films', { studio_id }, {
    columns: ['title', 'release_year'],
    order: { by: 'release_year', direction: 'ASC' },
  }).run(queryable);
  return films.map(film => `${film.title} (${film.release_year})`);
}
// #endregion copy
// ---cut---
async function rolledBack(body: (client: pg.PoolClient) => Promise<void>) {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN');
    await body(client);
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    try {
      await client.query('ROLLBACK');
      client.release();
    } catch (err) {
      client.release(err as Error);  // a broken connection: destroyed, not reused
      if (!failed) throw err;  // else the test's own error, which says why it failed
    }
  }
}

test('programme() lists a studio’s films, oldest first', () => rolledBack(async client => {
  const studio = await db.insert('studios', { name: 'Marrowbank Pictures' }).run(client);
  await db.insert('films', [
    { studio_id: studio.id, title: 'Tidewater', release_year: 2021, runtime_minutes: 95 },
    { studio_id: studio.id, title: 'The Quiet Ferry', release_year: 1988, runtime_minutes: 110 },
  ]).run(client);

  assert.deepEqual(await programme(client, studio.id), ['The Quiet Ferry (1988)', 'Tidewater (2021)']);
}));

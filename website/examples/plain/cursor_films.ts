import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const titles = await db.readCommitted(pool, async txnClient => {
  const read: string[] = [];
  const films = db.sql<s.films.SQL, s.films.Selectable[]>`
    SELECT * FROM ${'films'} WHERE ${{ studio_id: 1000 }} ORDER BY ${'id'}`;
  for await (const batch of db.cursor(txnClient, films, { batchSize: 100 })) {
    read.push(...batch.map(film => film.title));  // batch: s.films.Selectable[]
  }
  return read;
});

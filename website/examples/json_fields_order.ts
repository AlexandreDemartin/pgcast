import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsByPrizes() {
  const prizes = db.sql<s.films.SQL, number | null>`jsonb_array_length(${'details'}->'prizes')`;
  return db.select('films', db.all, {
    columns: ['id', 'title'],
    extras: { prizes },
    order: { by: prizes, direction: 'DESC', nulls: 'LAST' },
  });
}

const films = await filmsByPrizes().run(pool);

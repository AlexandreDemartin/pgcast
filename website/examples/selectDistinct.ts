import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const firstShows = await db.select('screenings', db.all, {
  columns: ['cinema_id', 'film_id', 'starts_at'],
  distinct: 'cinema_id',
  order: [
    { by: 'cinema_id', direction: 'ASC' },
    { by: 'starts_at', direction: 'ASC' },
  ],
}).run(pool);

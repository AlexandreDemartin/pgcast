import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const rating = await db.upsert('ratings', {
  film_id: 1002,
  stars: 4,
}, ['film_id', 'stars'], {
  updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` },
}).run(pool);

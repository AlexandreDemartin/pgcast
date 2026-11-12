import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const rating = await db.upsert('ratings', {
  film_id: 1002,
  stars: 4,
  votes: 2,
}, ['film_id', 'stars'], { reportAction: 'suppress' }).run(pool);

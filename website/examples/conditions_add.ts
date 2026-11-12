import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const ratings = await db.update('ratings', {
  votes: db.conditions.add(1),
}, { film_id: 1000, stars: 5 }).run(pool);

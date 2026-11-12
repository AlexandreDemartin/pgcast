import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinemaIds = await db.select('screenings', db.all, {
  columns: ['cinema_id'],
  distinct: true,
}).run(pool);

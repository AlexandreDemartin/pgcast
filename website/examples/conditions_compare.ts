import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', {
  release_year: db.conditions.gte(2000),
  studio_id: db.conditions.ne(1001),
}).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.conditions.or(
  { studio_id: 1002 },
  { release_year: db.conditions.lt(1980) },
)).run(pool);

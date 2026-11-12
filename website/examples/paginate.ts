import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);

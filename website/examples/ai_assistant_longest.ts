import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const longest = await db.select('films', { studio_id: 1000 }, {
  columns: ['title', 'runtime_minutes'],
  order: { by: 'runtime_minutes', direction: 'DESC' },
  limit: 3,
}).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const minutes = await db.sum('films', { studio_id: 1000 }, {
  columns: ['runtime_minutes'],
}).run(pool);

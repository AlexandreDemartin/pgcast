import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const meanRuntime = await db.avg('films', db.all, {
  columns: ['runtime_minutes'],
}).run(pool);

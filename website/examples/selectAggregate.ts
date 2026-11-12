import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const spread = await db.select('films', db.all, {
  columns: ['runtime_minutes'],
}, db.SelectResultMode.Numeric, 'stddev_pop').run(pool);

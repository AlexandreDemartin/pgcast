import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const latest = await db.selectOne('films', { studio_id: 1000 }, {
  order: { by: 'release_year', direction: 'DESC' },
}).run(pool);

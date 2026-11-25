import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('studios', db.all, {
  columns: ['id', 'name'],
  lateral: { films: db.count('films', { studio_id: db.parent('id') }) },
}).run(pool);

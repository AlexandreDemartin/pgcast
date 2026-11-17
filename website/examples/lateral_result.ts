import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.sql`"lateral_castSize".result >= ${db.param(3)}`, {
  columns: ['title'],
  lateral: { castSize: db.count('roles', { film_id: db.parent('id') }) },
  order: { by: db.sql`"lateral_castSize".result`, direction: 'DESC' },
}).run(pool);

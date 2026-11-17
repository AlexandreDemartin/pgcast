import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('films', db.all, {
  columns: ['studio_id'],
  extras: { films: db.sql<s.films.SQL, number>`count(*)::int` },
  lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) },
  groupBy: db.sql<s.films.SQL>`${'studio_id'}, "lateral_studio".result`,
}).run(pool);

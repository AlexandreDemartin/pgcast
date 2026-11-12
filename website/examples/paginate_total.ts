import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  extras: { total: db.sql<s.films.SQL, number>`count(*) OVER ()` },
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);

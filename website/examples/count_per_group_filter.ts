import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinemas = await db.select('screenings', db.all, {
  columns: ['cinema_id'],
  extras: {
    screenings: db.sql<s.screenings.SQL, number>`count(*)`,
    subtitled: db.sql<s.screenings.SQL, number>`count(*) FILTER (WHERE ${{ subtitled: true }})`,
  },
  groupBy: 'cinema_id',
  order: { by: 'cinema_id', direction: 'ASC' },
}).run(pool);

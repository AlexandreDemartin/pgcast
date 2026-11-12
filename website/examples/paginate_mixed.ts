import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
const last = { id: 1002, title: "The Cartographer's Silence", release_year: 2008 };
// ---cut---
const nextPage = await db.select('films', db.conditions.or(
  { release_year: db.conditions.lt(last.release_year) },
  { release_year: last.release_year, id: db.conditions.gt(last.id) },
), {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'ASC' },
  ],
  limit: 2,
}).run(pool);

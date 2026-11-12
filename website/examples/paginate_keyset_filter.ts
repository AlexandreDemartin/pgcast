import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
const last = { id: 1002, title: "The Cartographer's Silence", release_year: 2008 };
// ---cut---
const nextPage = await db.select('films', {
  studio_id: 1000,
  release_year: db.sql`(${db.self}, ${'id'}) < (${db.param(last.release_year)}, ${db.param(last.id)})`,
}, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);

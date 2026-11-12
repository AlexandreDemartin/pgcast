import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const popular = await db.select('ratings', db.all, {
  columns: ['film_id'],
  extras: { votes: db.sql<s.ratings.SQL, number>`sum(${'votes'})` },
  groupBy: 'film_id',
  having: db.sql<s.ratings.SQL>`sum(${'votes'}) >= ${db.param(10)}`,
}).run(pool);

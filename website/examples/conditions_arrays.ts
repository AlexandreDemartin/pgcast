import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', {
  genres: db.conditions.arrayOverlaps<string[]>([['romance', 'thriller']]),
}).run(pool);

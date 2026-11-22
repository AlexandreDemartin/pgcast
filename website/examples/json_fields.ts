import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.all, {
  columns: ['id', 'title'],
  extras: { format: db.sql<s.films.SQL, string | null>`${'details'}->>'format'` },
}).run(pool);

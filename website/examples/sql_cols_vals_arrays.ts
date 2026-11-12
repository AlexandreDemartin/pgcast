import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.sql<s.films.SQL, s.films.OnlyCols<['id', 'title']>[]>`SELECT ${db.cols(['id', 'title'])}
  FROM ${'films'} WHERE ${'id'} IN (${db.vals([1000, 1002])})`.run(pool);

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const distinctCinemas = await db.sql<s.screenings.SQL, { cinemas: number }[]>`SELECT count(DISTINCT ${'cinema_id'})::int AS cinemas
  FROM ${'screenings'}`.run(pool);

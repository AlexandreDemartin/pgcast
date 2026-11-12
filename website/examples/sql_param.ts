import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screenings = await db.sql<s.screenings.SQL, s.screenings.Selectable[]>`SELECT *
  FROM ${'screenings'}
  WHERE ${'starts_at'} >= ${db.param('2030-03-02T00:00:00Z', 'timestamptz')}`.run(pool);

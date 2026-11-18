import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // on the page, asPool(sql); at build, cast.data.ts passes a pool that records the query
// ---cut---
const screenings = await db.sql<s.screenings.SQL, s.screenings.Selectable[]>`
  SELECT * FROM ${'screenings'} WHERE ${{ film_id: 1000 }}`.run(pool);

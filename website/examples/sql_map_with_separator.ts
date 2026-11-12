import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.sql<s.films.SQL, s.films.Selectable[]>`SELECT *
  FROM ${'films'} WHERE ${db.mapWithSeparator(
    ['The Salt Orchard', 'A Lantern for Edith'],
    db.sql` OR `,
    title => ({ title }),
  )}`.run(pool);

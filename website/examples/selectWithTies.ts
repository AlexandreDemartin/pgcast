import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const leads = await db.select('roles', db.all, {
  columns: ['film_id', 'character'],
  order: { by: 'billing', direction: 'ASC' },
  limit: 1,
  withTies: true,
}).run(pool);

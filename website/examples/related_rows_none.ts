import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinemas = await db.select('cinemas', db.conditions.not(db.conditions.exists('screenings',
  { cinema_id: db.parent('id'), subtitled: true }, { parent: 'cinemas' },
)), { columns: ['id', 'name'] }).run(pool);

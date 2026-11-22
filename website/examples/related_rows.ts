import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.conditions.exists('screenings',
  { film_id: db.parent('id'), cinema_id: 1000 }, { parent: 'films' },
), { columns: ['id', 'title'] }).run(pool);

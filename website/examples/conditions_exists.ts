import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.conditions.and(
  { release_year: db.conditions.lt(2000) },
  db.conditions.exists('roles', { film_id: db.parent('id'), actor_id: 1003 }, { parent: 'films' }),
)).run(pool);

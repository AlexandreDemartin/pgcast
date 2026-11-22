import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('studios', db.all, {
  columns: ['name'],
  lateral: {
    films: db.count('films', db.conditions.and(
      { studio_id: db.parent('id') },
      db.conditions.exists('roles', { film_id: db.parent('id'), actor_id: 1003 }, { parent: 'films' }),
    )),
  },
}).run(pool);

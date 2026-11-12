import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const film = await db.selectOne('films', { id: 1000 }, {
  columns: ['title'],
  lateral: {
    actors: db.select('roles', { film_id: db.parent('id') }, {
      order: { by: 'billing', direction: 'ASC' },
      lateral: db.selectExactlyOne('actors', { id: db.parent('actor_id') }),
    }),
  },
}).run(pool);

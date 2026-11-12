import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const film = await db.selectOne('films', { id: 1000 }, {
  columns: ['title'],
  lateral: {
    cast: db.select('roles', { film_id: db.parent('id') }, {
      columns: ['character', 'billing'],
      order: { by: 'billing', direction: 'ASC' },
    }),
  },
}).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studio = await db.selectOne('studios', { id: 1000 }, {
  lateral: {
    films: db.select('films', { studio_id: db.parent('id') }, {
      lateral: { cast: db.select('roles', { film_id: db.parent('id') }) },
    }),
  },
}).prepared('studio_with_films').run(pool);

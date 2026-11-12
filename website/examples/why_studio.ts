import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studio = await db.selectOne('studios', { id: 1000 }, {
  columns: ['name'],
  lateral: {
    films: db.select('films', { studio_id: db.parent('id') }, {
      columns: ['title', 'release_year'],
      order: { by: 'release_year', direction: 'ASC' },
    }),
  },
}).run(pool);

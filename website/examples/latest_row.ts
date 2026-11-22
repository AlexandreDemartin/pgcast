import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.all, {
  columns: ['id', 'title'],
  lateral: {
    next: db.selectOne('screenings', {
      film_id: db.parent('id'),
      starts_at: db.conditions.gte('2030-03-02T00:00:00Z'),
    }, {
      columns: ['cinema_id', 'starts_at'],
      order: [
        { by: 'starts_at', direction: 'ASC' },
        { by: 'id', direction: 'ASC' },
      ],
    }),
  },
}).run(pool);

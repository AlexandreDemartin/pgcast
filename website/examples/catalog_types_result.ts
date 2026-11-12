import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title'],
  extras: {
    year: 'release_year',
    hours: db.sql<s.films.SQL, number>`round(${'runtime_minutes'} / 60.0, 1)`,
  },
  lateral: {
    studio: db.selectOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }),
    roles: db.count('roles', { film_id: db.parent('id') }),
  },
}).run(pool);

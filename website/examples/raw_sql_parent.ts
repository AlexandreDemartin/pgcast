import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('studios', db.all, {
  columns: ['name'],
  lateral: {
    titles: db.sql<s.films.SQL, string | null>`SELECT
        string_agg(${'title'}, ', ' ORDER BY ${'release_year'}) AS result
      FROM ${'films'} WHERE ${'studio_id'} = ${db.parent('id')}`,
  },
}).run(pool);

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('studios', db.all, {
  columns: ['name'],
  lateral: {
    films: db.sql<s.films.SQL, s.films.JSONSelectable[] | null>`SELECT
        jsonb_agg(to_jsonb(f) ORDER BY ${'release_year'}) AS result
      FROM films_of(${db.parent('id')}) AS f`,
  },
}).run(pool);

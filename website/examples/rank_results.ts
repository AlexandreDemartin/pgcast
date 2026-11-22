import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function searchFilms(input: string) {
  const query = db.sql`websearch_to_tsquery('english', ${db.param(input)})`;
  return db.select('films', { title_search: db.conditions.websearchToTsquery('english', input) }, {
    columns: ['id', 'title'],
    extras: { headline: db.sql<s.films.SQL, string>`ts_headline('english', ${'title'}, ${query})` },
    order: { by: db.sql<s.films.SQL>`ts_rank(${'title_search'}, ${query})`, direction: 'DESC' },
  });
}

const films = await searchFilms('orchard or lantern or salt').run(pool);

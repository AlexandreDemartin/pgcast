import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function searchFilmsAndTaglines(input: string) {
  const vector = db.sql<s.films.SQL>`setweight(to_tsvector('english', ${'title'}), 'A')
    || setweight(to_tsvector('english', coalesce(${'tagline'}, '')), 'B')`;
  const query = db.sql`websearch_to_tsquery('english', ${db.param(input)})`;
  return db.select('films', db.sql<s.films.SQL>`(${vector}) @@ ${query}`, {
    columns: ['id', 'title', 'tagline'],
    order: { by: db.sql<s.films.SQL>`ts_rank(${vector}, ${query})`, direction: 'DESC' },
  });
}

const films = await searchFilmsAndTaglines('orchard or map').run(pool);

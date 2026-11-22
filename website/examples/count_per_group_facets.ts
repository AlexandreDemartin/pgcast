import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const genres = await db.sql<s.films.SQL, { genre: string; films: number }[]>`
  SELECT genre, count(*)::int AS films
  FROM ${'films'}, unnest(${'genres'}) AS genre
  WHERE ${{ release_year: db.conditions.lt(2010) }}
  GROUP BY genre
  ORDER BY films DESC, genre`.run(pool);

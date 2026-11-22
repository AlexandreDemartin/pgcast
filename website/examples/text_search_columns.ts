import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, '\\$&');
}
// ---cut---
function searchFilms(input: string) {
  const pattern = `%${escapeLike(input)}%`;
  return db.select('films', db.conditions.or(
    { title: db.conditions.ilike(pattern) },
    { tagline: db.conditions.ilike(pattern) },
  ), { columns: ['id', 'title', 'tagline'] });
}

const films = await searchFilms('map').run(pool);

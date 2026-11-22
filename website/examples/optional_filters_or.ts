import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
type FilmSearch = { studioId?: number; before?: number };

function filmsMatchingAny(search: FilmSearch) {
  const parts: s.films.Whereable[] = [];
  if (search.studioId !== undefined) parts.push({ studio_id: search.studioId });
  if (search.before !== undefined) parts.push({ release_year: db.conditions.lt(search.before) });
  return db.select('films', db.conditions.or(...parts), { columns: ['id', 'title'] });
}

const films = await filmsMatchingAny({ studioId: 1002, before: 1980 }).run(pool);

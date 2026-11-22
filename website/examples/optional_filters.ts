import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
type FilmSearch = { studioId?: number; before?: number; actorId?: number };

function filmsMatching(search: FilmSearch) {
  const parts: (s.films.Whereable | db.SQLFragment<boolean | null>)[] = [];
  if (search.studioId !== undefined) parts.push({ studio_id: search.studioId });
  if (search.before !== undefined) parts.push({ release_year: db.conditions.lt(search.before) });
  if (search.actorId !== undefined) parts.push(db.conditions.exists('roles',
    { film_id: db.parent('id'), actor_id: search.actorId }, { parent: 'films' }));
  return db.select('films', db.conditions.and(...parts), { columns: ['id', 'title'] });
}

const films = await filmsMatching({ studioId: 1000, actorId: 1003 }).run(pool);

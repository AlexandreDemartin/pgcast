import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function sortedFilms(by: string, direction: string) {
  const sortable = ['title', 'release_year', 'runtime_minutes'] as const;
  const column = sortable.find(c => c === by) ?? 'title';
  return db.sql<s.films.SQL, s.films.Selectable[]>`SELECT * FROM ${'films'}
    ORDER BY ${column} ${db.raw(direction === 'desc' ? 'DESC' : 'ASC')}`;
}

const longestFirst = await sortedFilms('runtime_minutes', 'desc').run(pool);

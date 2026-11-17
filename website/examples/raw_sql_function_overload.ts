import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function studioFilms(studioId: number) {
  return db.sql<s.films.SQL, s.films.Selectable[]>`SELECT * FROM films_of(${db.param(studioId, 'int4')})`;
}

const films = await studioFilms(1000).run(pool);

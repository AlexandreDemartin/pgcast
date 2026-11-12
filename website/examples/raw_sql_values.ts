import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function studioFilms(studioId: number, genre: string) {
  return db.sql<s.films.SQL, s.films.Selectable[]>`SELECT * FROM ${'films'}
    WHERE ${{ studio_id: studioId }} AND ${db.param(genre)} = ANY(${'genres'})`;
}

const dramas = await studioFilms(1000, 'drama').run(pool);

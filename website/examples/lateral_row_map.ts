import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
export function castLateral() {
  return {
    cast: db.select('roles', { film_id: db.parent('id') }, {
      columns: ['character', 'billing'],
      order: { by: 'billing', direction: 'ASC' },
    }),
  };
}

export type FilmWithCast = s.films.JSONSelectable & db.LateralResult<ReturnType<typeof castLateral>>;

const films = await db.select('films', db.all, { lateral: castLateral() }).run(pool);
const leads = films.map((film: FilmWithCast) => film.cast[0]?.character);

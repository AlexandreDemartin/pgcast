import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function removeRatings(filmId?: number) {
  const where: s.ratings.Whereable = {};
  if (filmId) where.film_id = filmId;
  return db.deletes('ratings', where);
}

const removed = await removeRatings().run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
import type * as s from 'zapatos/schema';

const row: s.films.Insertable = {
  studio_id: 1002,
  title: 'The Night Ferry to Orkesund',
  release_year: 2024,
  runtime_minutes: 117,
};
const newFilm = await db.insert('films', row).run(pool);

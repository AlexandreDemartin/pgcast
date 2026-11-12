import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function copyTags(fromFilm: number, toFilm: number) {
  const columns: s.tags.Column[] = ['film_id', 'tag'];
  return db.sql<s.tags.SQL, s.tags.Selectable[]>`INSERT INTO ${'tags'} (${db.cols(columns)})
    SELECT ${db.param(toFilm)}, ${'tag'} FROM ${'tags'} WHERE ${{ film_id: fromFilm }}
    ON CONFLICT DO NOTHING RETURNING *`;
}

const copied = await copyTags(1000, 1003).run(pool);

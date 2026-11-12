import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function screeningsAt(cinemaId: number, subtitledOnly: boolean) {
  const subtitled = subtitledOnly ? db.sql<s.screenings.SQL>` AND ${'subtitled'}` : [];
  return db.sql<s.screenings.SQL, s.screenings.Selectable[]>`SELECT *
    FROM ${'screenings'} WHERE ${'cinema_id'} = ${db.param(cinemaId)}${subtitled}`;
}

const subtitledAtTheLantern = await screeningsAt(1000, true).run(pool);

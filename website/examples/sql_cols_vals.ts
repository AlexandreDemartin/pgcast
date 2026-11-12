import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function insertTag(tag: s.tags.Insertable) {
  return db.sql<s.tags.SQL, s.tags.Selectable[]>`INSERT INTO ${'tags'} (${db.cols(tag)})
    VALUES (${db.vals(tag)}) RETURNING *`;
}

const inserted = await insertTag({ tag: 'coastal', film_id: 1000 }).run(pool);

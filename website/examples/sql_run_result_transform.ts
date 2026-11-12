import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmCountQuery() {
  const query = db.sql<s.films.SQL, number>`SELECT count(*) FROM ${'films'}`;
  query.runResultTransform = qr => Number(qr.rows[0].count);
  return query;
}

const filmCount = await filmCountQuery().run(pool);

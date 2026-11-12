import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const compiled = db.sql<s.films.SQL>`SELECT *
  FROM ${'films'} WHERE ${{ studio_id: 1000 }}`.compile();

await pool.query(compiled);  // what run() would send

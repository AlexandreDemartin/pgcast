import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const recentCount = await db.withCTEs(
  { recent: db.sql<s.films.SQL>`SELECT ${'id'} FROM ${'films'} WHERE ${'release_year'} > ${db.param(1990)}` },
  db.count('films', db.sql<s.films.SQL>`${'id'} IN (SELECT id FROM recent)`),
).run(pool);

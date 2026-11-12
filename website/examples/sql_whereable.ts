import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.sql<s.films.SQL, s.films.Selectable[]>`SELECT *
  FROM ${'films'} WHERE ${{
    studio_id: 1000,
    runtime_minutes: db.sql`${db.self} > ${db.param(100)}`,
  }}`.run(pool);

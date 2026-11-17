import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function totalRuntime(filmIds: number[]) {
  return db.sql<s.films.SQL, { minutes: string | null }[]>`SELECT
    total_runtime(VARIADIC ${db.param(filmIds)}) AS minutes`;
}

const total = await totalRuntime([1000, 1001]).run(pool);

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinemas = await db.select('cinemas', db.all, {
  columns: ['id'],
  extras: {
    cinema: 'name',
    km: db.sql<s.cinemas.SQL, number>`${'location'} <-> point(${db.param(0)}, ${db.param(0)})`,
  },
}).run(pool);

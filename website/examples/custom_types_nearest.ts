import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const nearest = await db.selectOne('cinemas', db.all, {
  columns: ['name', 'location'],
  order: {
    by: db.sql<s.cinemas.SQL>`${'location'} <-> point(${db.param(0.5)}, ${db.param(1)})`,
    direction: 'ASC',
  },
}).run(pool);

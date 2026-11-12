import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const here = await db.select('cinemas',
  db.sql<s.cinemas.SQL>`${'location'} ~= ${db.param('(0.4,1.2)')}`).run(pool);

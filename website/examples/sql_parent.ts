import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const studios = await db.select('studios', db.all, {
  lateral: {
    films: db.select('films', { studio_id: db.parent('id') }, { columns: ['title'] }),
  },
}).run(pool);

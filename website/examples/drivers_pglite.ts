import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // on the page, asPool(pglite); at build, cast.data.ts passes a pool that records the query
// ---cut---
const titles = await db.select('films', { release_year: 1974 }, {
  columns: ['title'],
}).run(pool);

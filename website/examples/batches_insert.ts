import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const tags = await db.insert('tags', [
  { film_id: 1000, tag: 'orchards' },
  { film_id: 1000, tag: 'slow cinema' },
  { film_id: 1002, tag: 'maps' },
]).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const tagsBefore = await db.withCTEs(
  { added: db.insert('tags', { film_id: 1000, tag: 'harvest' }) },
  db.count('tags', { film_id: 1000 }),
).run(pool);

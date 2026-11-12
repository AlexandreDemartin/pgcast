import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const added = await db.upsert('tags', [
  { film_id: 1000, tag: 'orchards' },
  { film_id: 1003, tag: 'lighthouses' },
], ['film_id', 'tag'], { updateColumns: db.doNothing }).run(pool);

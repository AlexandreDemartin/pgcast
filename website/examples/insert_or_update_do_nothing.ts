import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const role = await db.upsert('roles', {
  film_id: 1001,
  billing: 3,
  actor_id: 1007,
  character: 'Aunt Lise',
}, ['film_id', 'billing'], { updateColumns: db.doNothing }).run(pool);

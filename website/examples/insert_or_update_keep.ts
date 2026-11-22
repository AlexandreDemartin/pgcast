import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const role = await db.upsert('roles', {
  film_id: 1000,
  billing: 2,
  actor_id: 1005,
  character: 'Silas',
}, ['film_id', 'billing'], { updateColumns: 'actor_id' }).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const roles = await db.upsert('roles', [
  { film_id: 1000, billing: 3, actor_id: 1007, character: 'The surveyor' },
  { film_id: 1000, billing: 4, actor_id: 1002, character: 'The orchard keeper' },
], ['film_id', 'billing']).run(pool);

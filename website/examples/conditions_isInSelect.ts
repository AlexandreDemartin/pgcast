import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const actors = await db.select('actors', {
  id: db.conditions.isInSelect('roles', { billing: 1 }, 'actor_id'),
}).run(pool);

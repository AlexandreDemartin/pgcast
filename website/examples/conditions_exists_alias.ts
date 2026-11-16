import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const crew = await db.select('crew', db.conditions.not(
  db.conditions.exists('crew', { mentor_id: db.parent('id') }, { parent: 'crew', alias: 'mentees' }),
)).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const mentors = await db.select('crew', {
  id: db.conditions.isInSelect('crew', db.all, 'mentor_id'),
}, { columns: ['id', 'name'] }).run(pool);

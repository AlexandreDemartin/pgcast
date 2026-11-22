import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const crew = await db.select('crew', {
  id: db.conditions.not(db.conditions.isInSelect('crew', { mentor_id: db.conditions.isNotNull }, 'mentor_id')),
}, { columns: ['id', 'name'] }).run(pool);

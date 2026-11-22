import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.update('films', {
  details: db.sql`${db.self} || ${db.param({ format: '70mm', restored: true }, 'jsonb')}`,
}, { id: 1003 }, { returning: ['id', 'details'] }).run(pool);

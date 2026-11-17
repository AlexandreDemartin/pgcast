import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', {
  details: db.conditions.jsonbPathExists('$.prizes[*] ? (@ starts with $prefix)', { prefix: 'Silver' }),
}, { columns: ['title'] }).run(pool);

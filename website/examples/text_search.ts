import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, '\\$&');
}

const films = await db.select('films', {
  title: db.conditions.ilike(`%${escapeLike('bay')}%`),
}, { columns: ['id', 'title'] }).run(pool);

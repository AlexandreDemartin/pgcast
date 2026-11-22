import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, '\\$&');
}
// ---cut---
const films = await db.select('films', {
  title: db.conditions.ilikeAny('salt bay'.split(/\s+/).filter(Boolean).map(word => `%${escapeLike(word)}%`)),
}, { columns: ['id', 'title'] }).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function prefixQuery(input: string) {
  const words = input.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.map(word => `${word}:*`).join(' & ');
}

const films = await db.select('films', {
  title_search: db.sql`${db.self} @@ to_tsquery('english', ${db.param(prefixQuery('the cart'))})`,
}, { columns: ['id', 'title'] }).run(pool);

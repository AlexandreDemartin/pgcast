import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const tags: s.tags.Insertable[];  // 100,000 of them, say
// ---cut---
const chunkSize = 5_000;  // two columns a row: 10,000 parameters a query

await db.readCommitted(pool, async txnClient => {
  for (let i = 0; i < tags.length; i += chunkSize) {
    await db.insert('tags', tags.slice(i, i + chunkSize)).run(txnClient);
  }
});

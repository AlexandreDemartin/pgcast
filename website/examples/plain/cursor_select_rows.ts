import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const titles = await db.readCommitted(pool, async txnClient => {
  const read: string[] = [];
  const films = db.selectRows('films', { studio_id: 1000 }, {
    columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' },
  });
  for await (const batch of db.cursor(txnClient, films, { batchSize: 100 })) {
    read.push(...batch.map(film => film.title));  // batch: { id: number; title: string }[]
  }
  return read;
});

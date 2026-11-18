import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
const index = {
  async add(films: Pick<s.films.JSONSelectable, 'id' | 'title'>[]) {
    console.log(films);
  },
};
// ---cut---
await db.repeatableReadRO(pool, async txnClient => {
  const query = db.selectRows('films', db.all, {
    columns: ['id', 'title'],
    order: { by: 'id', direction: 'ASC' },
  });
  for await (const films of db.cursor(txnClient, query, { batchSize: 2 })) {
    await index.add(films);
  }
});

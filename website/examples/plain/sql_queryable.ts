import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const titlesOf = (queryable: db.Queryable, studio_id: number) =>
  db.select('films', { studio_id }, { columns: ['title'] }).run(queryable);

const larkspur = await titlesOf(pool, 1000);
const inTxn = await db.readCommitted(pool, txnClient => titlesOf(txnClient, 1000));

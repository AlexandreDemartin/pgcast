import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.insert('seat_bookings', [
  { screening_id: 1000, seat: 'C4', customer: 'Ada Quill' },
  { screening_id: 1000, seat: 'C5', customer: 'Felix Ambrose' },
  { screening_id: 1001, seat: 'D2', customer: 'Ada Quill' },
]).run(pool);

const bookings = await db.readCommitted(pool, async txnClient => {
  await db.setLocal(txnClient, { role: 'cinema_customer', 'app.customer': 'Ada Quill' });
  return db.select('seat_bookings', db.all).run(txnClient);
});

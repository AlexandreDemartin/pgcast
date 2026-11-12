import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const client = await pool.connect();
let before: number, after: number;
try {
  before = await db.count('seat_bookings', { screening_id: 1000 }).run(client);
  await db.readCommitted(client, txnClient =>
    db.insert('seat_bookings', { screening_id: 1000, seat: 'G2', customer: 'Tamsin Rowe' }).run(txnClient));
  after = await db.count('seat_bookings', { screening_id: 1000 }).run(client);
} finally {
  client.release();
}

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookPair = (customer: string) =>
  db.serializable(pool, async txnClient => {
    await db.insert('seat_bookings', { screening_id: 1001, seat: 'H1', customer }).run(txnClient);
    await db.insert('seat_bookings', { screening_id: 1001, seat: 'H2', customer }).run(txnClient);
    return true;
  });

const booked = await bookPair('Wren Abernathy').catch(err => {
  if (db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) return false;  // H1 is not booked either
  throw err;
});

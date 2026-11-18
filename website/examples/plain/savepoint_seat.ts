import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.insert('seat_bookings', { screening_id: 1002, seat: 'K2', customer: 'Felix Ambrose' }).run(pool);

const booked = await db.serializable(pool, async txnClient => {
  const seats: string[] = [];
  for (const seat of ['K1', 'K2', 'K3']) {
    try {
      await db.savepoint(txnClient, spClient =>
        db.insert('seat_bookings', { screening_id: 1002, seat, customer: 'Odile Marchetti' }).run(spClient));
      seats.push(seat);
    } catch (err) {
      if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;  // 40001 and 40P01 go up, to the retry
    }
  }
  return seats;
});

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const bookSeats = (txnClientOrPool: pg.Pool | db.TxnClientForSerializable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });
// ---cut---
const reply = async (seats: string[], customer: string) => {
  try {
    const booked = await bookSeats(pool, 1001, seats, customer);
    return booked ? 'Booked' : 'Four seats each, at most';
  } catch (err: any) {
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) return 'Seat taken';
    if (db.isDatabaseError(err, 'TransactionRollback_SerializationFailure', 'TransactionRollback_DeadlockDetected'))
      return 'Busy: please try again';
    throw err;
  }
};

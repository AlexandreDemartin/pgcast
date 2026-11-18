import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookSeat = (seat: string, customer: string) =>
  db.readCommitted(pool, async txnClient => {
    await db.advisoryXactLock(txnClient, [2, 1002]);  // 2: a screening's seats, 1002: its id
    const sold = await db.count('seat_bookings', { screening_id: 1002 }).run(txnClient);
    if (sold >= 50) return false;
    await db.insert('seat_bookings', { screening_id: 1002, seat, customer }).run(txnClient);
    return true;
  });

const booked = await bookSeat('C4', 'Tobias Marchbank');

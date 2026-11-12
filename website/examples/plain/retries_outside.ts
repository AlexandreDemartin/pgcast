import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare function fetchSeatLimit(customer: string): Promise<number>;
declare function sendConfirmation(customer: string, seats: string[]): Promise<void>;
// ---cut---
const screening_id = 1000, seats = ['D4', 'D5'], customer = 'Ines Calloway';

// before: runs once
const limit = await fetchSeatLimit(customer);

const booked = await db.serializable(pool, async txnClient => {
  const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
  if (held + seats.length > limit) return null;
  return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
});

// after: runs once, and only once committed
if (booked) await sendConfirmation(customer, booked.map(booking => booking.seat));

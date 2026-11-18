import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
await db.insert('seat_bookings', { screening_id: 1000, seat: 'F8', customer: 'Hollis Brightwater' }).run(pool);
// ---cut---
const bookFreeSeats = (screening_id: number, seats: string[], customer: string) =>
  db.serializable(pool, async txnClient => {
    const booked: string[] = [], taken: string[] = [];
    for (const seat of seats) {
      try {
        await db.savepoint(txnClient, spClient =>
          db.insert('seat_bookings', { screening_id, seat, customer }).run(spClient));
        booked.push(seat);
      } catch (err) {
        if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;  // a 40001 goes up, to the retry
        taken.push(seat);
      }
    }
    return { booked, taken };
  });

const result = await bookFreeSeats(1000, ['F7', 'F8', 'F9'], 'Mara Quillfeather');

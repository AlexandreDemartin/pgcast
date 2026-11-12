import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const booking = { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' };
await db.insert('seat_bookings', booking).run(pool);

try {
  await db.insert('seat_bookings', booking).run(pool);
} catch (err: any) {
  if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;
  console.log(err.constraint);  // seat_bookings_pkey
}

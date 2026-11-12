import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const booking = await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' })
  .run(pool)
  .catch(err => {
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) return undefined;  // taken
    throw err;
  });

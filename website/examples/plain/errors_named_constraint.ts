import assert from 'node:assert/strict';
import type pg from 'pg';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
declare const pool: pg.Pool;

const book = (screening_id: number) =>
  db.insert('seat_bookings', { screening_id, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
await book(1002);
await assert.rejects(book(1002), seatTaken);
await assert.rejects(book(1042), (err: pg.DatabaseError) =>
  err.constraint === 'seat_bookings_screening_id_fkey' && seatTaken(err) === false);
// ---cut---
function seatTaken(err: pg.DatabaseError) {
  const bookingKey: s.seat_bookings.Constraint = 'seat_bookings_pkey';
  return err.code === '23505' && err.schema === 'public' &&
    err.table === 'seat_bookings' && err.constraint === bookingKey;
}

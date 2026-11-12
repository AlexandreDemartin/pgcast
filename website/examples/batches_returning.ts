import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const bookings = await db.upsert('seat_bookings', [
  { screening_id: 1000, seat: 'F7', customer: 'Ines Calloway', booked_at: '2030-02-20T09:15:00Z' },
  { screening_id: 1000, seat: 'F8', customer: 'Barnaby Quill-Hart' },
], ['screening_id', 'seat'], { updateColumns: 'customer', returning: ['seat'] }).run(pool);

const newSeats = bookings.filter(b => b.$action === 'INSERT').map(b => b.seat);

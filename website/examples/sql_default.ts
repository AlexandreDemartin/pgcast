import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const bookings = await db.sql<s.seat_bookings.SQL, s.seat_bookings.Selectable[]>`INSERT INTO ${'seat_bookings'}
  (${'screening_id'}, ${'seat'}, ${'customer'}, ${'booked_at'})
  VALUES (${db.vals([1000, 'C7', 'Wren Hollis', db.Default])}) RETURNING *`.run(pool);

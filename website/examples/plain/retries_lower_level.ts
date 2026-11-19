import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const bookSeats = (txnClientOrPool: db.Queryable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });
// rejects with Error
// ---cut---
await db.readCommitted(pool, txnClient => bookSeats(txnClient, 1000, ['G1'], 'Wren Abernathy'));

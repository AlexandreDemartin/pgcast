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
// a couple: both bookings, or neither
const couple = await db.serializable(pool, async txnClient => {
  const wren = await bookSeats(txnClient, 1000, ['G1'], 'Wren Abernathy');
  const barnaby = await bookSeats(txnClient, 1000, ['G2'], 'Barnaby Quill');
  if (!wren || !barnaby) throw new Error('Both seats, or neither');  // rolls back the other one
  return [...wren, ...barnaby];
});

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookSeats = (txnClientOrPool: pg.Pool | db.TxnClientForSerializable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;  // four each, at most
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });

// the same customer, in two tabs at once
const [tabOne, tabTwo] = await Promise.all([
  bookSeats(pool, 1000, ['D4', 'D5'], 'Ines Calloway'),
  bookSeats(pool, 1000, ['E4', 'E5', 'E6'], 'Ines Calloway'),
]);

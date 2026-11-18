import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookSeats = (screening_id: number, seats: string[], customer: string) =>
  db.readCommitted(pool, async txnClient => {
    await db.advisoryXactLock(txnClient, [2, screening_id]);  // 2: a screening's bookings
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;  // four each, at most
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });

// the same customer, in two tabs at once
const [tabOne, tabTwo] = await Promise.all([
  bookSeats(1000, ['D4', 'D5'], 'Ines Calloway'),
  bookSeats(1000, ['E4', 'E5', 'E6'], 'Ines Calloway'),
]);

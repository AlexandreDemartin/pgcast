import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookSeat = (seat: string, customer: string) =>
  db.serializable(pool, async txnClient => {
    const taken = await db.selectOne('seat_bookings', { screening_id: 1000, seat }).run(txnClient);
    if (taken) return false;
    await db.insert('seat_bookings', { screening_id: 1000, seat, customer }).run(txnClient);
    return true;
  });

const [ines, barnaby] = await Promise.all([
  bookSeat('F7', 'Ines Calloway'),
  bookSeat('F7', 'Barnaby Quill'),
]);

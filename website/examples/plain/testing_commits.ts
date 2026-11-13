import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare function test(name: string, fn: () => Promise<void>): void;
declare const assert: { equal(actual: unknown, expected: unknown): void };
// ---cut---
const bookSeat = (pool: pg.Pool, screening_id: number, seat: string, customer: string) =>
  db.serializable(pool, txnClient => db.insert('seat_bookings', { screening_id, seat, customer }).run(txnClient));

test('bookSeat() books a free seat', async () => {
  try {
    const booking = await bookSeat(pool, 1002, 'C7', 'Ines Calloway');
    assert.equal(booking.seat, 'C7');
    assert.equal(await db.count('seat_bookings', { screening_id: 1002 }).run(pool), 1);
  } finally {
    await db.deletes('seat_bookings', { screening_id: 1002, customer: 'Ines Calloway' }).run(pool);
  }
});

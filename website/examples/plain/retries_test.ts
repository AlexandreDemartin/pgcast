import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare function test(name: string, fn: () => Promise<void>): void;
declare const assert: { equal(actual: unknown, expected: unknown): void; deepEqual(actual: unknown, expected: unknown): void };
const bookSeats = (txnClientOrPool: pg.Pool | db.TxnClientForSerializable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });
// ---cut---
db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });

test('a booking runs again after a serialization failure', async () => {
  await db.deletes('seat_bookings', { screening_id: 1003 }).run(pool);  // so that it runs again on the same database
  let attempts = 0;
  const booked = await db.serializable(pool, async txnClient => {
    const seats = await bookSeats(txnClient, 1003, ['H1', 'H2'], 'Tamsin Rowe');
    if (++attempts === 1) throw Object.assign(new Error('A serialization failure, for the test'), { code: '40001' });
    return seats;
  });

  assert.equal(attempts, 2);
  assert.deepEqual(booked?.map(booking => booking.seat), ['H1', 'H2']);
  assert.equal(await db.count('seat_bookings', { screening_id: 1003, customer: 'Tamsin Rowe' }).run(pool), 2);
});

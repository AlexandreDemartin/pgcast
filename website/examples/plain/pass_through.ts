import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const bookSeat = (seat: string, customer: string, txnClientOrPool: typeof pool | db.TxnClientForSerializable) =>
  db.serializable(txnClientOrPool, txnClient =>
    db.insert('seat_bookings', { screening_id: 1001, seat, customer }).run(txnClient));

const pair = await db.serializable(pool, txnClient => Promise.all([
  bookSeat('G1', 'Wren Abernathy', txnClient),
  bookSeat('G2', 'Wren Abernathy', txnClient),
]));

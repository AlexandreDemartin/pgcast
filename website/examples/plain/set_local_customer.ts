import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const myBookings = (customer: string) =>
  db.readCommitted(pool, async txnClient => {
    await db.setLocal(txnClient, { 'app.customer': customer });
    return db.select('seat_bookings', db.all, { columns: ['screening_id', 'seat'] }).run(txnClient);
  });

const bookings = await myBookings('Ada Quill');

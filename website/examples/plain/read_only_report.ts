import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const report = await db.serializableRODeferrable(pool, async txnClient => ({
  films: await db.count('films', db.all).run(txnClient),
  bookings: await db.count('seat_bookings', db.all).run(txnClient),
}));

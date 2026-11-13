import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const postponed = await db.update('screenings', {
  starts_at: db.sql`${db.self} + ${db.param('1 day', 'interval')}`,
}, { id: 1000 }).run(pool);

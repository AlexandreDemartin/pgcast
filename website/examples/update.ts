import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screenings = await db.update('screenings', {
  starts_at: db.sql`${db.self} + interval '15 minutes'`,
  subtitled: true,
}, { id: 1002 }).run(pool);

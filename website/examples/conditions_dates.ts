import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screenings = await db.select('screenings', {
  starts_at: db.conditions.after(new Date('2030-03-02T00:00:00Z')),
}).run(pool);

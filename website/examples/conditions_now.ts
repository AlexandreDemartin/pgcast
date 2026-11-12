import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const thisWeek = await db.select('screenings', {
  starts_at: db.conditions.and(
    db.conditions.after(db.conditions.now),
    db.conditions.before(db.conditions.fromNow(7, 'days')),
  ),
}).run(pool);

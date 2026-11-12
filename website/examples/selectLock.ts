import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screening = await db.selectOne('screenings', { id: 1000 }, {
  lock: { for: 'UPDATE', wait: 'NOWAIT' },
}).run(pool);

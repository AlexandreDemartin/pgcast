import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screening = await db.selectExactlyOne(
  'screenings', { id: 1000 }, { columns: ['starts_at'] },
).run(pool);

const startsAt = db.toDate(screening.starts_at);

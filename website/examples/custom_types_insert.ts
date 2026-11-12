import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinema = await db.insert('cinemas', {
  name: 'The Harbour Lights',
  location: '(1.5,2.5)',
}).run(pool);

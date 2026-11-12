import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const film = await db.selectOne('films', {
  title: 'The Salt Orchard',
}).run(pool);

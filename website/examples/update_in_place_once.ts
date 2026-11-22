import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const screenings = await db.update('screenings', {
  subtitled: db.sql`coalesce(${db.self}, ${db.param(true)})`,
}, { id: 1002 }, { returning: ['id', 'subtitled'] }).run(pool);

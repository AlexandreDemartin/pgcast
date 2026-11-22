import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.update('films', {
  genres: db.sql`array_append(${db.self}, ${db.param('mystery')})`,
}, { id: 1003, genres: db.conditions.not(db.conditions.arrayContains(['mystery'])) },
{ returning: ['id', 'genres'] }).run(pool);

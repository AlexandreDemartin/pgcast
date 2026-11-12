import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const film = await db.insert('films', {
  studio_id: 1000,
  title: 'Winter at Fennick Lock',
  release_year: 2032,
  runtime_minutes: 108,
}, {
  returning: ['id'],
  extras: {
    name: 'title',
    shouted: db.sql<s.films.SQL, string>`upper(${'title'})`,
  },
}).run(pool);

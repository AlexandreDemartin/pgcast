import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.all, {
  columns: ['id', 'title', 'genres'],
  lateral: {
    alike: db.select('films', {
      genres: db.sql`${db.self} && ${db.parent('genres')}`,
      id: db.conditions.ne(db.parent('id')),
    }, { alias: 'other', columns: ['title'] }),
  },
}).run(pool);

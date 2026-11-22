import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.all, {
  columns: ['id', 'title', 'runtime_minutes'],
  lateral: {
    sameLength: db.select('films', {
      runtime_minutes: db.sql`${db.self} BETWEEN ${db.parent('runtime_minutes')} - 10 AND ${db.parent('runtime_minutes')} + 10`,
      id: db.conditions.ne(db.parent('id')),
    }, { alias: 'other', columns: ['title'] }),
  },
}).run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.select('films', db.all, {
  columns: ['id', 'title'],
  lateral: {
    sameFormat: db.select('films', {
      details: db.sql`${db.self}->>'format' = ${db.parent('details')}->>'format'`,
      id: db.conditions.ne(db.parent('id')),
    }, { alias: 'other', columns: ['title'] }),
  },
}).run(pool);

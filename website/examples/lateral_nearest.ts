import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const cinemas = await db.select('cinemas', db.all, {
  columns: ['name'],
  lateral: {
    nearest: db.selectOne('cinemas', { id: db.conditions.ne(db.parent('id')) }, {
      alias: 'other',
      columns: ['name'],
      extras: { km: db.sql<s.cinemas.SQL, number>`${'location'} <-> ${db.parent('location')}` },
      order: { by: db.sql<s.cinemas.SQL>`${'location'} <-> ${db.parent('location')}`, direction: 'ASC' },
    }),
  },
}).run(pool);

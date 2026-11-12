import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const crew = await db.select('crew', db.all, {
  columns: ['name', 'job'],
  order: { by: 'id', direction: 'ASC' },
  lateral: {
    mentor: db.selectOne('crew', { id: db.parent('mentor_id') }, { alias: 'mentor', columns: ['name'] }),
    proteges: db.count('crew', { mentor_id: db.parent('id') }, { alias: 'protege' }),
  },
}).run(pool);

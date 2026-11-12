import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
db.setConfig({ castArrayParamsToJson: true });

const films = await db.update('films', { genres: ['mystery', 'drama'] }, { id: 1003 })
  .run(pool);

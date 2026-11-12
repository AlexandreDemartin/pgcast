import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsTitled(title: string) {  // the title comes from the caller
  return db.select('films', { title });
}

const films = await filmsTitled("x' OR TRUE --").run(pool);

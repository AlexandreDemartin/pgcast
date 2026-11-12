import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsMatching(filter: any) {  // a request's JSON body, as it came
  return db.select('films', filter);
}

const films = await filmsMatching({ 'title" = "title" OR TRUE OR "title': 'x' }).run(pool);

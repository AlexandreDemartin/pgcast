import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// The function of « Test the query a function builds », which the build checks against that block
// #region copy
function filmSearch(params: URLSearchParams) {
  const words = params.get('title'), before = params.get('before');
  return db.select('films', {
    ...(words === null ? {} : { title: db.conditions.ilike(`%${words}%`) }),
    ...(before === null ? {} : { release_year: db.conditions.lt(Number(before)) }),
  }, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } });
}
// #endregion copy
// ---cut---
const films = await filmSearch(new URLSearchParams('title=lantern&before=2000')).run(pool);

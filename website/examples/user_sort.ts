import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsSortedBy(sort: string, dir: string) {
  const direction = dir === 'desc' ? 'DESC' : 'ASC';  // anything else is ASC
  const sorts: Record<string, db.OrderSpecForTable<'films'>> = {
    year: { by: 'release_year', direction },
    title: { by: 'title', direction },
    tagline: { by: 'tagline', direction, nulls: 'LAST' },
  };
  const order = Object.hasOwn(sorts, sort) ? sorts[sort] : sorts.year;
  return db.select('films', db.all, {
    columns: ['id', 'title', 'tagline'],
    order: [order, { by: 'id', direction }],
  });
}

const films = await filmsSortedBy('tagline', 'desc').run(pool);

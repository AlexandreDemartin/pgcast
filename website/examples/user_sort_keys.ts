import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsSortedBy(sort: string) {
  const columns: Record<string, db.OrderSpecForTable<'films'>['by']> = {
    year: 'release_year',
    title: 'title',
    runtime: 'runtime_minutes',
  };
  const order: db.OrderSpecForTable<'films'>[] = [];
  for (const key of sort.split(',')) {
    const name = key.replace(/^-/, '');
    if (Object.hasOwn(columns, name)) {
      order.push({ by: columns[name], direction: key.startsWith('-') ? 'DESC' : 'ASC' });
    }
  }
  return db.select('films', db.all, {
    columns: ['id', 'title', 'runtime_minutes'],
    order: [...order, { by: 'id', direction: 'ASC' }],
  });
}

const films = await filmsSortedBy('-runtime,title').run(pool);

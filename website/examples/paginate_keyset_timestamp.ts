import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// Page 1 as the reader asks for it, run on a pool that gives back its rows, so that the build records only the next page
const rowsOfPage1 = { query: async () => ({ rows: [{ result: [
  { id: 1000, film_id: 1000, starts_at: '2030-03-01T19:30:00+00:00' },
  { id: 1001, film_id: 1002, starts_at: '2030-03-01T21:45:00+00:00' },
] }] }) } as unknown as pg.Pool;
const page = await db.select('screenings', db.all, {
  columns: ['id', 'film_id', 'starts_at'],
  order: [
    { by: 'starts_at', direction: 'ASC' },
    { by: 'id', direction: 'ASC' },
  ],
  limit: 2,
}).run(rowsOfPage1);
const last = page.at(-1);
if (last === undefined) throw new Error('No next page');
// the playground gives the type of the next const
// ---cut---
const nextPage = await db.select('screenings',
  db.sql<s.screenings.SQL>`(${'starts_at'}, ${'id'}) > (${db.param(last.starts_at)}, ${db.param(last.id)})`, {
  columns: ['id', 'film_id', 'starts_at'],
  order: [
    { by: 'starts_at', direction: 'ASC' },
    { by: 'id', direction: 'ASC' },
  ],
  limit: 2,
}).run(pool);

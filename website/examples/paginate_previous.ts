import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// Page 2 as the reader asks for it, run on a pool that gives back its rows, so that the build records only the page before
const rowsOfPage2 = { query: async () => ({ rows: [{ result: [
  { id: 1001, title: 'A Lantern for Edith', release_year: 1991 },
  { id: 1000, title: 'The Salt Orchard', release_year: 1974 },
] }] }) } as unknown as pg.Pool;
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
  offset: 2,
}).run(rowsOfPage2);
const first = page.at(0);
if (first === undefined) throw new Error('No page before');
// the playground gives the type of the next const
// ---cut---
const previousPage = await db.select('films',
  db.sql<s.films.SQL>`(${'release_year'}, ${'id'}) > (${db.param(first.release_year)}, ${db.param(first.id)})`, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'ASC' },
    { by: 'id', direction: 'ASC' },
  ],
  limit: 2,
}).run(pool);
previousPage.reverse();  // back to newest first

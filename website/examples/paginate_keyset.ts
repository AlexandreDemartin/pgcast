import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// Page 1 as the reader asks for it, run on a pool that gives back its rows, so that the build records only the next page
const rowsOfPage1 = { query: async () => ({ rows: [{ result: [
  { id: 1003, title: 'Small Hours at Calder Bay', release_year: 2019 },
  { id: 1002, title: "The Cartographer's Silence", release_year: 2008 },
] }] }) } as unknown as pg.Pool;
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(rowsOfPage1);
const last = page.at(-1);
if (last === undefined) throw new Error('No next page');
// ---cut---
const nextPage = await db.select('films',
  db.sql<s.films.SQL>`(${'release_year'}, ${'id'}) < (${db.param(last.release_year)}, ${db.param(last.id)})`, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);

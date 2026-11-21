// @filename: examples/typed_sql_films.ts
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
import type { Row } from '../zapatos/queries';

function filmsByStudio(studioId: number) {
  return db.sql<s.films.SQL, Row<'films-by-studio'>[]>`SELECT title, tagline
    FROM films WHERE studio_id = ${db.param(studioId, false)}`;
}

const films = await filmsByStudio(1000).run(pool);

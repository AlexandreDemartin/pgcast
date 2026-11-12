import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function filmsTitled(title: string) {
  return db.sql<s.films.SQL, s.films.Selectable[]>`SELECT * FROM ${'films'}
    WHERE ${{ title: db.sql`lower(${db.self}) = lower(${db.param(title)})` }}`;
}

const found = await filmsTitled('the salt orchard').run(pool);

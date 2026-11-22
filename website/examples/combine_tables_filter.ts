import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function peopleNamed(pattern: string) {
  const name = db.conditions.ilike(pattern);
  return db.sql<s.actors.SQL | s.crew.SQL, { kind: 'actor' | 'crew'; id: number; name: string }[]>`
    SELECT 'actor' AS kind, ${'id'}, ${'name'} FROM ${'actors'} WHERE ${{ name }}
    UNION ALL
    SELECT 'crew', ${'id'}, ${'name'} FROM ${'crew'} WHERE ${{ name }}
    ORDER BY ${'name'}, kind, ${'id'}`;
}

const found = await peopleNamed('%or%').run(pool);

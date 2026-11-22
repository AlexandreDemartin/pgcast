import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const deleted = await db.deletes('screenings', {
  id: db.sql<s.screenings.SQL>`${db.self} IN (
    SELECT ${'id'} FROM ${'screenings'}
    WHERE ${{ starts_at: db.conditions.lt('2030-03-03T00:00:00Z') }}
    ORDER BY ${'starts_at'}, ${'id'}
    LIMIT ${db.param(2)})`,
}, { returning: ['id'] }).run(pool);

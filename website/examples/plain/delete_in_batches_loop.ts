import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
async function deleteScreeningsBefore(cutoff: db.TimestampTzString, size: number) {
  let total = 0;
  for (;;) {
    const batch = await db.deletes('screenings', {  // on the pool: each batch commits on its own
      id: db.sql<s.screenings.SQL>`${db.self} IN (
        SELECT ${'id'} FROM ${'screenings'}
        WHERE ${{ starts_at: db.conditions.lt(cutoff) }}
        ORDER BY ${'starts_at'}, ${'id'}
        LIMIT ${db.param(size)})`,
    }, { returning: ['id'] }).run(pool);
    if (batch.length === 0) return total;
    total += batch.length;
  }
}

const deleted = await deleteScreeningsBefore('2030-03-03T00:00:00Z', 2);

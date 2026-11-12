import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function screeningsWithin(from: Date, hours: number) {
  return db.sql<s.screenings.SQL, s.screenings.Selectable[]>`SELECT * FROM ${'screenings'}
    WHERE ${'starts_at'} >= ${db.param(from)}
      AND ${'starts_at'} < ${db.param(from, 'timestamptz')}
        + make_interval(hours => ${db.param(hours)})`;
}

const evening = await screeningsWithin(new Date('2030-03-01T18:00:00Z'), 4).run(pool);

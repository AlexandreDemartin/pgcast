import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
function screeningsOn(day: db.DateString, zone: string) {
  const midnight = db.sql`(${db.param(day)}::timestamp AT TIME ZONE ${db.param(zone)})`;
  const nextMidnight = db.sql`((${db.param(day)}::date + 1)::timestamp AT TIME ZONE ${db.param(zone)})`;
  return db.select('screenings', {
    starts_at: db.conditions.and(db.conditions.gte(midnight), db.conditions.lt(nextMidnight)),
  }, { columns: ['id', 'film_id', 'starts_at'] });
}

const screenings = await screeningsOn('2030-03-02', 'Asia/Tokyo').run(pool);

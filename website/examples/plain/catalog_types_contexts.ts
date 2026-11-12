import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const [row] = await db.sql<s.screenings.SQL, s.screenings.Selectable[]>`
  SELECT * FROM ${'screenings'} WHERE ${{ id: 1000 }}`.run(pool);

const json = await db.selectExactlyOne('screenings', { id: 1000 }).run(pool);

row.starts_at;   // a Date: pg parsed the timestamptz
json.starts_at;  // a string: to_jsonb() wrote it

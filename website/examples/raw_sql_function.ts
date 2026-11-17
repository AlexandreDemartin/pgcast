import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
type Span = { first_at: db.TimestampTzString | null, last_at: db.TimestampTzString | null };

const films = await db.select('films', { studio_id: 1000 }, {
  columns: ['title'],
  extras: {
    label: db.sql<s.films.SQL, string | null>`film_label(${'title'}, ${'release_year'})`,
    screened: db.sql<s.films.SQL, Span | null>`screening_span(${'id'})`,
  },
}).run(pool);

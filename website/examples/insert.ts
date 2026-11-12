import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const films = await db.insert('films', [{
  studio_id: 1001,
  title: 'The Tidewater Ledger',
  release_year: 2031,
  runtime_minutes: 117,
  tagline: 'Every debt comes in with the tide.',
}, {
  studio_id: 1002,
  title: 'Moths over Harrowgate',
  release_year: 2031,
  runtime_minutes: 95,
}]).run(pool);

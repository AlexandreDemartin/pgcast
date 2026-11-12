import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const film = await db.upsert('films', {
  id: 1002,
  studio_id: 1000,
  title: "The Cartographer's Silence",
  release_year: 2008,
  runtime_minutes: 131,
  tagline: null,
}, 'id', { noNullUpdateColumns: 'tagline' }).run(pool);

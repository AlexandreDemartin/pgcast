import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
db.setConfig({ castObjectParamsToJson: true });

const pitches = await db.sql<db.SQL, { title: string }[]>`SELECT
  ${db.param({ title: 'The Lighthouse Wager', runtime_minutes: 101 })}
  ->> 'title' AS title`.run(pool);

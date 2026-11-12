import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
db.setConfig({ castArrayParamsToJson: true });

const lengths = await db.sql<db.SQL, { n: number }[]>`SELECT
  json_array_length(${db.param(['mystery', 'drama'])}) AS n`.run(pool);

import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
const txnClient: db.Queryable = pool;  // stands for the client of a transaction(): the whole job is on the page
// ---cut---
const lock = await db.sql<db.SQL, [{ locked: boolean }]>`
  SELECT pg_try_advisory_xact_lock(${db.param(3)}, ${db.param(1001)}) AS locked`.run(txnClient);

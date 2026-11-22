import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const runAlone = <T>(key: readonly [number, number], job: (txnClient: db.TxnClientForReadCommitted) => Promise<T>) =>
  db.readCommitted(pool, async txnClient => {
    const [{ locked }] = await db.sql<db.SQL, [{ locked: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${db.param(key[0])}, ${db.param(key[1])}) AS locked`.run(txnClient);
    if (!locked) return undefined;  // another worker is running this job: skip it
    return job(txnClient);
  });

const settled = await runAlone([3, 1001], txnClient =>  // 3: settle the subtitles, 1001: a cinema's id
  db.update('screenings', { subtitled: false }, {
    cinema_id: 1001,
    subtitled: db.conditions.isNull,
    starts_at: db.conditions.lt('2030-03-03T00:00:00Z'),
  }).run(txnClient));

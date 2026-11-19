import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const assert: { deepEqual(actual: unknown, expected: unknown): void };
// ---cut---
const lateral = db.sql<db.SQL, string>`SELECT to_jsonb(now()) AS result`;
const timestamps = await db.select('studios', { id: 1000 }, { lateral }).run(pool);
assert.deepEqual(timestamps.map(value => typeof value), ['string']);

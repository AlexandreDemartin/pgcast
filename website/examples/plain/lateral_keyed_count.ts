import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const assert: { deepEqual(actual: unknown, expected: unknown): void };
// ---cut---
const count = await db.selectExactlyOne('studios', { id: 1000 }, {
  columns: [],
  lateral: { n: db.count('films', { studio_id: db.parent('id') }) },
}).run(pool);
assert.deepEqual(count, { n: 2 });

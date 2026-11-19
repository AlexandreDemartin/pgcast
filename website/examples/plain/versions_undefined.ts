import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// rejects with Error
// ---cut---
await db.update('films', { tagline: undefined }, { id: 1002 }).run(pool);

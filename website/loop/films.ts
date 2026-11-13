// @errors: 18047
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const film = await db.selectExactlyOne('films', { id: 1000 }).run(pool);
const hours = film.runtime_minutes / 60;

// @filename: examples/typed_sql_count.ts
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
import type { NotNull, Row } from '../zapatos/queries';

const counts = await db.sql<never, NotNull<Row<'film-count'>, 'total'>[]>
  `SELECT count(*) AS total FROM films`.run(pool);

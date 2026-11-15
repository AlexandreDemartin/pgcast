import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// rejects with 42703
// ---cut---
const rows = await db.sql<s.tags.SQL>`SELECT ${db.cols(['film_id', 'tagz'])} FROM ${'tags'}`.run(pool);

// @ts-expect-error tagz is no column of tags
db.cols<s.tags.Column[]>(['film_id', 'tagz']);
// @ts-expect-error nor a key of an Updatable
db.vals<s.tags.Updatable>({ film_id: 1000, tagz: 'coastal' });
// @ts-expect-error satisfies checks it too
db.cols(['film_id', 'tagz'] satisfies s.tags.Column[]);

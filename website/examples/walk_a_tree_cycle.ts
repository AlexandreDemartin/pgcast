import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const mentors = await db.sql<s.crew.SQL, { id: number; name: string; depth: number }[]>`
  WITH RECURSIVE chain AS (
    SELECT ${'id'}, ${'name'}, ${'mentor_id'}, 0 AS depth
    FROM ${'crew'} WHERE ${{ id: 1003 }}
    UNION ALL
    SELECT ${'crew'}.${'id'}, ${'crew'}.${'name'}, ${'crew'}.${'mentor_id'}, chain.depth + 1
    FROM ${'crew'} JOIN chain ON ${'crew'}.${'id'} = chain.mentor_id
  ) CYCLE id SET is_loop USING path
  SELECT id, name, depth FROM chain WHERE NOT is_loop ORDER BY depth`.run(pool);

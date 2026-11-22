import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const team = await db.sql<s.crew.SQL, { id: number; name: string; depth: number }[]>`
  WITH RECURSIVE team AS (
    SELECT ${'id'}, ${'name'}, 0 AS depth
    FROM ${'crew'} WHERE ${{ id: 1000 }}
    UNION ALL
    SELECT ${'crew'}.${'id'}, ${'crew'}.${'name'}, team.depth + 1
    FROM ${'crew'} JOIN team ON ${'crew'}.${'mentor_id'} = team.id
  )
  SELECT id, name, depth FROM team ORDER BY depth, name`.run(pool);

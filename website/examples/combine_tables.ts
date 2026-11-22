import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
const people = await db.sql<s.actors.SQL | s.crew.SQL, { kind: 'actor' | 'crew'; id: number; name: string }[]>`
  SELECT 'actor' AS kind, ${'id'}, ${'name'} FROM ${'actors'}
  UNION ALL
  SELECT 'crew', ${'id'}, ${'name'} FROM ${'crew'}
  ORDER BY ${'name'}, kind, ${'id'}
  LIMIT ${db.param(5)} OFFSET ${db.param(0)}`.run(pool);

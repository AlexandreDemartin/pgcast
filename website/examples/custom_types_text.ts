import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import type pg from 'pg';
declare const pool: pg.Pool;  // at build, cast.data.ts passes a pool that records the query
// ---cut---
type Cinema = Pick<s.cinemas.Selectable, 'name' | 'location'>;

const cinemas = await db.sql<s.cinemas.SQL, Cinema[]>`SELECT ${'name'}, ${'location'}::text AS ${'location'}
  FROM ${'cinemas'}`.run(pool);

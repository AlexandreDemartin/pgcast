/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import type * as pg from 'pg';
import type { EnumData } from './enums';

// kept out of zapatos/generate's exports, like quote.ts

/** The labels of each enum in alphabetical order, as `enumDataForSchema()` gives them, and in their declared order, as the generator writes them. */
export type EnumOrders = { alphabetical: EnumData; declared: EnumData };

/**
 * Read the enums of a schema in one query: the labels of each in alphabetical order, as Postgres sorts them,
 * and in their declared order, ranked by Postgres on `enumsortorder`: a `float4`, fractional after
 * `ALTER TYPE … ADD VALUE … BEFORE`, whose text the session may round (`extra_float_digits` 0 or below).
 */
export const enumOrdersForSchema = async (schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) => {
  const
    { rows } = await queryFn({
      text: `
        SELECT
          n.nspname AS schema
        , t.typname AS name
        , e.enumlabel AS value
        , row_number() OVER (PARTITION BY e.enumtypid ORDER BY e.enumsortorder)::int AS sortorder
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        ORDER BY t.typname ASC, e.enumlabel ASC`,
      values: [schemaName],
    }),
    // Object.create(null): an enum may be named toString or __proto__
    alphabetical: EnumData = Object.create(null),
    declared: EnumData = Object.create(null);

  for (const row of rows) (alphabetical[row.name] ??= []).push(row.value);
  for (const row of [...rows].sort((a, b) => a.sortorder - b.sortorder)) (declared[row.name] ??= []).push(row.value);

  return { alphabetical, declared } as EnumOrders;
};

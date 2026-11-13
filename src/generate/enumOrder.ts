/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import type * as pg from 'pg';
import type { CompleteConfig } from './config';
import type { EnumData } from './enums';

// kept out of zapatos/generate's exports, like enumLabel.ts

type EnumOrder = NonNullable<CompleteConfig['enumOrder']>;
export type EnumOrders = Record<EnumOrder, EnumData>;

/** The `enumOrder` of a config, `'alphabetical'` when absent. Any other value throws. */
export const enumOrderOf = (config: CompleteConfig): EnumOrder => {
  const order = config.enumOrder ?? 'alphabetical';
  if (order !== 'alphabetical' && order !== 'declared') {
    throw new Error(`Unknown enumOrder ${JSON.stringify(order)}: use 'alphabetical' (the default) or 'declared'.`);
  }
  return order;
};

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
    alphabetical: EnumData = {},
    declared: EnumData = {};

  for (const row of rows) (alphabetical[row.name] ??= []).push(row.value);
  for (const row of [...rows].sort((a, b) => a.sortorder - b.sortorder)) (declared[row.name] ??= []).push(row.value);

  return { alphabetical, declared } as EnumOrders;
};

/** The names of the enums whose declared order is not alphabetical. */
export const enumsOutOfOrder = ({ alphabetical, declared }: EnumOrders) =>
  Object.keys(alphabetical).filter(name => alphabetical[name].some((value, i) => value !== declared[name][i]));

/**
 * Without `enumOrder: 'declared'`, note the enums it would write otherwise, once per run: the `every.<name>` tuple
 * of each lists its labels in alphabetical order, not in the order Postgres declares, sorts and compares them in.
 */
export const warnAboutEnumOrder = (enums: { schema: string; name: string }[], config: CompleteConfig) => {
  if (enums.length === 0) return;

  const
    warn = config.warningListener === true ? console.log : config.warningListener || (() => void 0),
    sorted = enums.map(({ schema, name }) => `${schema}.${name}`).sort(),
    one = enums.length === 1,
    list = one ? sorted[0] : sorted.slice(0, -1).join(', ') + ' and ' + sorted[sorted.length - 1];

  warn(`Note: every.${one ? enums[0].name : '<name>'} lists the labels of ${one ? 'enum' : 'enums'} ${list} ` +
    `in alphabetical order, not in their declared order, by which Postgres sorts and compares them. ` +
    `Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.`);
};

/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import type * as pg from 'pg';

// kept out of zapatos/generate's exports, like enumOrder.ts

/** The base type of a domain's innermost domain, by the domain's `[schema, name]`, or by its array type's. */
export type DomainRoots = Record<string, { schema: string; name: string; isArray: boolean }>;

/**
 * Read in one query the base type under the domains of each domain, and of each domain's array type: information_schema
 * gives a domain over a domain its inner domain as its type, and an array of a domain its array type.
 */
export const domainRootsInDatabase = async (queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) => {
  const
    { rows } = await queryFn({
      text: `
        WITH RECURSIVE bases AS (
          SELECT oid AS domain, typbasetype AS base FROM pg_catalog.pg_type WHERE typtype = 'd'
          UNION ALL
          SELECT bases.domain, t.typbasetype FROM bases JOIN pg_catalog.pg_type t ON t.oid = bases.base AND t.typtype = 'd'
        )
        SELECT tn.nspname AS "typeSchema", t.typname AS "typeName", n.nspname AS schema, r.typname AS name
        , t.oid = d.typarray AS "isArray"
        FROM bases
        JOIN pg_catalog.pg_type r ON r.oid = bases.base AND r.typtype <> 'd'
        JOIN pg_catalog.pg_namespace n ON n.oid = r.typnamespace
        JOIN pg_catalog.pg_type d ON d.oid = bases.domain
        JOIN pg_catalog.pg_type t ON t.oid IN (d.oid, d.typarray)
        JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
        ORDER BY "typeSchema", "typeName"`,
      values: [],
    }),
    roots: DomainRoots = Object.create(null);

  for (const { typeSchema, typeName, ...root } of rows) roots[JSON.stringify([typeSchema, typeName])] = root;
  return roots;
};

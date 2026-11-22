/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';


export interface Relation {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'fdw' | 'mview';
  insertable: boolean;
}

export const relationsInSchema = async (schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>): Promise<Relation[]> => {
  const { rows } = await queryFn({
    text: `
      SELECT $1 as schema
      , table_name AS name
      , lower(table_name) AS lname  -- using a case-insensitive sort, but you can't order by a function in a UNION query
      , CASE table_type WHEN 'VIEW' THEN 'view' WHEN 'FOREIGN' THEN 'fdw' ELSE 'table' END AS type
      , CASE WHEN is_insertable_into = 'YES' THEN true ELSE false END AS insertable
      FROM information_schema.tables
      WHERE table_schema = $1 AND table_type != 'LOCAL TEMPORARY'

      UNION ALL

      SELECT $1 as schema
      , matviewname AS name
      , lower(matviewname) AS lname
      , 'mview'::text AS type
      , false AS insertable
      FROM pg_catalog.pg_matviews
      WHERE schemaname = $1

      ORDER BY lname, name
    `,
    values: [schemaName]
  });

  return rows;
};

export const columnsForRelation = async (rel: Relation, schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) => {
  const { rows } = await queryFn({
    text:
      rel.type === 'mview'
        ? `
        SELECT
          a.attname AS "column"
        , a.attnotnull = 'f' AS "isNullable"
        , true AS "isGenerated"  -- true, to reflect that we can't write to materalized views
        , false AS "hasDefault"   -- irrelevant, since we can't write to materalized views
        , NULL as "defaultValue"
        , CASE WHEN t1.typtype = 'd' THEN t2.typname ELSE t1.typname END AS "udtName"
        , CASE WHEN t1.typtype = 'd' THEN t1.typname ELSE NULL END AS "domainName"
        , CASE WHEN t1.typtype = 'd' THEN n2.nspname ELSE n1.nspname END AS "udtSchema"
        , CASE WHEN t1.typtype = 'd' THEN n1.nspname ELSE NULL END AS "domainSchema"
        , d.description AS "description"     
        FROM pg_catalog.pg_class c
        LEFT JOIN pg_catalog.pg_attribute a ON c.oid = a.attrelid
        LEFT JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        LEFT JOIN pg_catalog.pg_type t1 ON t1.oid = a.atttypid
        LEFT JOIN pg_catalog.pg_type t2 ON t2.oid = t1.typbasetype
        LEFT JOIN pg_catalog.pg_namespace n1 ON n1.oid = t1.typnamespace
        LEFT JOIN pg_catalog.pg_namespace n2 ON n2.oid = t2.typnamespace
        LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
        WHERE c.relkind = 'm' AND a.attnum >= 1 AND c.relname = $1 AND n.nspname = $2
        ORDER BY "column"`
        : `
        SELECT
          column_name AS "column"
        , is_nullable = 'YES' AS "isNullable"
        , is_generated = 'ALWAYS' OR identity_generation = 'ALWAYS' AS "isGenerated"
        , column_default IS NOT NULL OR identity_generation = 'BY DEFAULT' AS "hasDefault"
        , column_default::text AS "defaultValue"
        , udt_name AS "udtName"
        , domain_name AS "domainName"
        , udt_schema AS "udtSchema"
        , domain_schema AS "domainSchema"
        , d.description AS "description"
        FROM information_schema.columns AS c
        LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname = c.table_schema
        LEFT JOIN pg_catalog.pg_class cl ON cl.relkind IN ('r', 'v', 'f', 'p') AND cl.relname = c.table_name AND cl.relnamespace = ns.oid
        LEFT JOIN pg_catalog.pg_description d ON d.objoid = cl.oid AND d.objsubid = c.ordinal_position
        WHERE c.table_name = $1 AND c.table_schema = $2
        ORDER BY "column"`,
    values: [rel.name, schemaName],
  });

  return rows;
};

// Copyright (C) 2026 Alexandre Demartin

import type { CompleteConfig, EnumData } from '@pgcast/pgcast/generate';
import { enumDataForSchema, relationsInSchema } from '@pgcast/pgcast/generate';
import type { Client, FieldDef, QueryConfig } from 'pg';
import type { ResultField } from './values';

type Field = ResultField & Pick<FieldDef, 'tableID' | 'columnID'>;
interface Origin {
  relid: number; attnum: number; schema: string; relation: string; proved: boolean;
  decoded: number; typeSchema: string; typeName: string; labels: string[]; enumLabels?: string[];
}
const guard = /U&|(?<![a-z_])(left|right|full|rollup|cube|grouping|merge|old|new)(?![a-z0-9_$])/i;

/** Check this statement's origins while Parse still holds its relation locks. */
export async function refineOrigins(client: Client, text: string, fields: Field[], schemas: CompleteConfig['schemas']) {
  const origins = fields.filter(f => f.tableID && f.columnID);
  if (!origins.length) return;
  await client.query('SET LOCAL search_path = pg_catalog, pg_temp');
  const version = Number((await client.query('SHOW server_version_num')).rows[0].server_version_num),
    validated = version >= 180000 ? `AND EXISTS (
      SELECT FROM pg_constraint k WHERE k.conrelid = a.attrelid AND k.conkey = ARRAY[a.attnum]
        AND k.contype = 'n' AND k.convalidated AND k.conenforced)` : '',
    { rows } = await client.query<Origin>(`
      WITH RECURSIVE
      origins AS (
        SELECT DISTINCT a.attrelid, a.attnum, a.attname, a.atttypid
        FROM unnest($1::oid[], $2::smallint[]) f(relid, num)
        JOIN pg_attribute a ON a.attrelid = f.relid AND a.attnum = f.num AND NOT a.attisdropped
      ), tree(root, relid) AS (
        SELECT attrelid, attrelid FROM origins
        UNION
        SELECT root, i.inhrelid FROM tree JOIN pg_inherits i ON i.inhparent = tree.relid
      ), bases(declared, oid) AS (
        SELECT DISTINCT atttypid, atttypid FROM origins
        UNION ALL
        SELECT b.declared, t.typbasetype FROM bases b JOIN pg_type t ON t.oid = b.oid WHERE t.typtype = 'd'
      )
      SELECT o.attrelid AS relid, o.attnum, ns.nspname AS schema, r.relname AS relation,
        (SELECT bool_and(c.relkind IN ('r','p') AND NOT c.relhasrules AND coalesce(a.attnotnull, false) ${validated})
         FROM tree JOIN pg_class c ON c.oid = tree.relid
         LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = o.attname AND NOT a.attisdropped
         WHERE tree.root = o.attrelid) AS proved,
        t.oid AS decoded, tn.nspname AS "typeSchema", t.typname AS "typeName",
        ARRAY(SELECT e.enumlabel::text FROM pg_enum e WHERE e.enumtypid = t.oid ORDER BY e.enumlabel) AS labels
      FROM origins o JOIN pg_class r ON r.oid = o.attrelid JOIN pg_namespace ns ON ns.oid = r.relnamespace
      JOIN bases b ON b.declared = o.atttypid JOIN pg_type t ON t.oid = b.oid AND t.typtype <> 'd'
      JOIN pg_namespace tn ON tn.oid = t.typnamespace`, [origins.map(f => f.tableID), origins.map(f => f.columnID)]);

  const relations = new Map<string, Set<string>>(), enums = new Map<string, EnumData>(),
    query = (q: QueryConfig) => client.query(q);
  for (const o of rows) {
    if (!o.labels.length || o.schema === 'pg_catalog' || o.schema === 'information_schema' ||
        !Object.prototype.hasOwnProperty.call(schemas, o.schema)) continue;
    const rules = schemas[o.schema];
    if (rules.exclude === '*' || rules.exclude.includes(o.relation) ||
        (rules.include !== '*' && !rules.include.includes(o.relation))) continue;
    if (!relations.has(o.schema)) relations.set(o.schema, new Set((await relationsInSchema(o.schema, query)).map(r => r.name)));
    if (!relations.get(o.schema)!.has(o.relation)) continue;
    if (!enums.has(o.typeSchema)) enums.set(o.typeSchema, await enumDataForSchema(o.typeSchema, query));
    const labels = enums.get(o.typeSchema)![o.typeName];
    if (Array.isArray(labels) && labels.length === o.labels.length && labels.every((v, i) => v === o.labels[i])) {
      o.enumLabels = labels;
    }
  }

  const facts = new Map(rows.map(o => [`${o.relid}/${o.attnum}`, o])), guarded = guard.test(text);
  for (const f of origins) {
    const o = facts.get(`${f.tableID}/${f.columnID}`);
    if (o?.decoded !== f.dataTypeID) continue;
    f.notNull = o.proved && !guarded;
    if (o.enumLabels) f.enumLabels = o.enumLabels;
  }
}

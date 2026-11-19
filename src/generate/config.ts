/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import type * as pg from 'pg';
import { schemaRulesAsTyped } from './schemaRules';


export interface RequiredConfig {
  // nothing is required any more
}

export interface OptionalConfig {
  db: pg.ClientConfig;
  outDir: string;
  outExt: string;
  schemas: SchemaRules;
  debugListener: boolean | ((s: string) => void);
  progressListener: boolean | ((s: string) => void);
  warningListener: boolean | ((s: string) => void);
  customTypesTransform: 'PgMy_type' | 'my_type' | 'PgMyType' | ((s: string) => string);
  columnOptions: ColumnOptions;
  schemaJSDoc: boolean;
  unprefixedSchema: string | null;
  customJSONParsingForLargeNumbers: boolean;
  // optional, so a CompleteConfig written for 6.6.1 still compiles
  typeEnumsAcrossSchemas?: boolean;  // look up an enum in its own schema by default; false uses the relation's schema
  enumOrder?: 'alphabetical' | 'declared';  // Postgres's declared order by default; 'alphabetical' sorts the labels
  // optional too; read it with ?? 'zapatos'
  moduleNames?: 'zapatos' | 'pgcast';  // the folder written, and the module names it declares and imports: pgcast/schema, pgcast/db…
  // optional for a CompleteConfig written for 6.6.1; the CLI sets false
  rejectOnQueryError?: boolean;  // reject with the query or connection error by default; false prints it and exits
  uniqueIndexConstraintsOnly?: boolean;  // UniqueIndex lists usable ON CONFLICT ON CONSTRAINT arbiters by default; false lists all unique indexes
  constraintNames?: boolean;  // true adds each relation's Constraint type, including all its unique indexes
  domainsTypedByContext?: boolean;  // use the base type by context when the placeholder matches the type generated with these settings
  enumArraysTypedAsText?: boolean;  // pg returns an enum array as text in Selectable by default; false keeps the label array for a custom parser
  intervalsTypedAsObjects?: boolean;  // pg returns a PostgresInterval in Selectable by default; false keeps string for a custom parser
  // optional too; read it with ?? false
  domainsTypedAsUnions?: boolean;  // a domain over text whose valid CHECK lists its values is declared as their union, which a new placeholder names
}

/** The type of `schemas`: by schema, the relations to generate. */
export interface SchemaRules {
  [schema: string]: {
    /**
     * `'*'`, or the names of the relations to generate, case included. A name the schema doesn't have
     * generates nothing, and is reported through `warningListener`.
     */
    include: '*' | string[];
    exclude: '*' | string[];
  };
}

/** The type of `columnOptions`: by table, then by column, how `Insertable` and `Updatable` type it. */
export interface ColumnOptions {
  [k: string]: {  // table name or "*"
    [k: string]: {  // column name
      insert?: 'auto' | 'excluded' | 'optional';
      update?: 'auto' | 'excluded';
    };
  };
}

export type Config = RequiredConfig & Partial<OptionalConfig>;
export type CompleteConfig = RequiredConfig & OptionalConfig;

const defaultConfig: Config = {
  outDir: '.',
  outExt: '.d.ts',
  schemas: { public: { include: '*', exclude: [] } },
  debugListener: false,
  progressListener: false,
  warningListener: true,
  customTypesTransform: 'PgMy_type',
  columnOptions: {},
  schemaJSDoc: true,
  unprefixedSchema: 'public',
  customJSONParsingForLargeNumbers: false,
};

export const moduleRoot = () => {
  // __dirname could be either ./generate (ts) or ./dist/generate (js)
  const parentDir = path.join(__dirname, '..');
  return fs.existsSync(path.join(parentDir, 'package.json')) ?
    parentDir :
    path.join(parentDir, '..');
};

export const finaliseConfig = (config: Config) => {
  const finalConfig = { ...defaultConfig, ...config } as CompleteConfig;
  finalConfig.schemas = schemaRulesAsTyped(finalConfig.schemas);  // a rule missing include or exclude (#301), or giving one as a string (#442)
  return finalConfig;
};

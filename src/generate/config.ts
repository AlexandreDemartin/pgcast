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
  // optional, so a CompleteConfig written for 6.6.1 still compiles; read it with ?? false, deprecated: true in 7.0
  typeEnumsAcrossSchemas?: boolean;  // an enum of another schema is typed by its own labels, not by its name in the relation's schema
  // optional too; read it with ?? 'alphabetical', as Zapatos 6.6.1 sorts labels, deprecated: 'declared' in 7.0
  enumOrder?: 'alphabetical' | 'declared';  // the order of an enum's labels: 'declared' is Postgres's, by which it sorts and compares them
  // optional too; read it with ?? 'zapatos'
  moduleNames?: 'zapatos' | 'pgcast';  // the folder written, and the module names it declares and imports: pgcast/schema, pgcast/db…
  // optional too; read it with ?? false, and with == null for the note (left out, or null from JSON); deprecated: true in 7.0; the CLI sets false
  rejectOnQueryError?: boolean;  // a failed query, the connection included, rejects generate() with its error, rather than exit
  // optional too; read it with ?? false, deprecated: true in 7.0
  uniqueIndexConstraintsOnly?: boolean;  // UniqueIndex lists only what ON CONFLICT ON CONSTRAINT takes: UNIQUE and PRIMARY KEY constraints, valid, not DEFERRABLE nor WITHOUT OVERLAPS
  // optional too; read it with ?? false, deprecated: true in 7.0
  domainsTypedByContext?: boolean;  // a domain over int8, numeric, bytea, money or a date, or an array of one, is typed by context, as its base type is, while its placeholder holds what the generator wrote; a domain over a domain, or an array of a domain, by its innermost base type
  // optional too; read it with ?? false, and with == null for the note (left out, or null from JSON); deprecated: true in 7.0
  enumArraysTypedAsText?: boolean;  // an array of an enum, or a domain over one, is string in Selectable: pg returns it as its text; false keeps the array, for a parser set with pg.types.setTypeParser
}

interface SchemaRules {
  [schema: string]: {
    /**
     * `'*'`, or the names of the relations to generate, case included. A name the schema doesn't have
     * generates nothing, and is reported through `warningListener`.
     */
    include: '*' | string[];
    exclude: '*' | string[];
  };
}

interface ColumnOptions {
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

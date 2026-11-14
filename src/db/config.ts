/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

export interface SQLQuery {
  text: string;
  values: any[];
  name?: string;
}

/**
 * The runtime configuration. A key added by pgcast is optional, so that a
 * `Config` written for Zapatos 6.6.1 still compiles; read it with `?? <default>`.
 */
export interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;   // see https://github.com/brianc/node-postgres/issues/2012
  castObjectParamsToJson: boolean;  // useful if json will be cast onward differently from text
  upsertRequiresSameKeys?: boolean;  // multi-row upsert, no updateColumns: a key missing from a row, still set from EXCLUDED, throws
  undefinedMeansMissing?: boolean;  // an undefined value is a missing key: DEFAULT in insert, left out of update and upsert
  transactionRequiresCommit?: boolean;  // transaction() rejects when Postgres answers its COMMIT with ROLLBACK
  transactionRequiresIdleClient?: boolean;  // transaction() rejects a client already inside a transaction block, before its START TRANSACTION
  selectExactlyOneChecksForSecondRow?: boolean;  // selectExactlyOne() run on its own asks for LIMIT 2, and throws on a second row
  aggregatesTypedByColumn?: boolean;  // sum/avg/min/max give null on an empty set, min/max the column's value: declare it in ConfigTypes too
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
}
export type NewConfig = Partial<Config>;

/**
 * The options of `Config` that change a type, as you set them: the compiler cannot read `setConfig()`.
 * Declare each in a module of your project, a file with an `import` or an
 * `export` (`export {}` in a `.d.ts`), e.g.
 * `declare module 'zapatos/db' { interface ConfigTypes { aggregatesTypedByColumn: true } }`.
 */
export interface ConfigTypes { }

const defaults: Config = {
  transactionAttemptsMax: 5,
  transactionRetryDelay: { minMs: 25, maxMs: 250 },
  castArrayParamsToJson: false,
  castObjectParamsToJson: false,
  upsertRequiresSameKeys: false,  // the default in 7.0
  undefinedMeansMissing: false,  // the default in 7.0
  transactionRequiresCommit: false,  // the default in 7.0
  transactionRequiresIdleClient: false,  // the default in 7.0
  selectExactlyOneChecksForSecondRow: false,  // stays the default in 7.0
  aggregatesTypedByColumn: false,  // the default in 7.0
};

let config: Config = { ...defaults };

/**
 * Get (a copy of) the current configuration.
 */
export const getConfig = () => {
  const d = config.transactionRetryDelay;  // its one nested object, copied too; the listeners are functions, kept as they are
  return { ...config, transactionRetryDelay: d && { minMs: d.minMs, maxMs: d.maxMs } };
};

/**
 * Set key(s) on the configuration, and return (a copy of) the new configuration.
 * A key that has a default and is set to `undefined` (or `null`) goes back to
 * that default.
 * @param newConfig Partial configuration object
 */
export const setConfig = (newConfig: NewConfig) => {
  config = { ...config, ...newConfig };
  (Object.keys(defaults) as (keyof Config)[]).forEach(<K extends keyof Config>(key: K) => { config[key] ??= defaults[key]; });
  return getConfig();
};

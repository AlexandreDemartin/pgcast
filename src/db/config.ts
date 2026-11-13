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
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
}
export type NewConfig = Partial<Config>;

let config: Config = {  // defaults
  transactionAttemptsMax: 5,
  transactionRetryDelay: { minMs: 25, maxMs: 250 },
  castArrayParamsToJson: false,
  castObjectParamsToJson: false,
  upsertRequiresSameKeys: false,  // the default in 7.0
  undefinedMeansMissing: false,  // the default in 7.0
  transactionRequiresCommit: false,  // the default in 7.0
};

/**
 * Get (a copy of) the current configuration.
 */
export const getConfig = () => ({ ...config });

/**
 * Set key(s) on the configuration.
 * @param newConfig Partial configuration object
 */
export const setConfig = (newConfig: NewConfig) =>
  config = { ...config, ...newConfig };

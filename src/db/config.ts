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
 * An event of `transaction()`'s retries, as `transactionEventListener` gets it,
 * at each point where `transactionListener` gets its message, with the same
 * numbers: `rollback` when an attempt failed with 40001 or 40P01 and another
 * is left, before the wait of `delayMs`; `retry` when the next attempt starts,
 * before its `START TRANSACTION`; `giveUp` when the last attempt failed.
 * A listener that throws makes `transaction()` reject with its error, as a
 * throwing `transactionListener` does, once its `ROLLBACK` is sent; an error
 * whose `code` is 40001 or 40P01, thrown at `retry`, fails that attempt, which
 * is retried while an attempt is left, as any 40001.
 */
export type TransactionEvent =
  | { type: 'rollback'; code: '40001' | '40P01'; attempt: number; maxAttempts: number; delayMs: number }
  | { type: 'retry'; attempt: number; maxAttempts: number }
  | { type: 'giveUp'; code: '40001' | '40P01'; attempt: number; maxAttempts: number };

/**
 * The runtime configuration. A key added by pgcast is optional, so that a
 * `Config` written for Zapatos 6.6.1 still compiles; read it with `?? <default>`.
 */
export interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;   // see https://github.com/brianc/node-postgres/issues/2012
  castObjectParamsToJson: boolean;  // useful if json will be cast onward differently from text
  selectExactlyOneChecksForSecondRow?: boolean;  // selectExactlyOne() run on its own asks for LIMIT 2, and throws on a second row
  shortcutsUseJson?: boolean;  // select() and its kin, and the writes' RETURNING, build their JSON with to_json, json_agg and json_build_object, not their jsonb twins
  topLevelSelectAsRows?: boolean;  // select() run or compiled on its own is selectRows()'s query, one row per result; nested, its aggregate
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
  transactionEventListener?: (event: TransactionEvent, txnId?: number) => void;  // called right after transactionListener, at its three points; a property, so that under strictFunctionTypes a listener must take all three types
}
export type NewConfig = Partial<Config>;

/**
 * The options of `Config` that change a type, as you set them: the compiler cannot read `setConfig()`.
 * Declare each in a module of your project, a file with an `import` or an
 * `export` (`export {}` in a `.d.ts`), e.g.
 * `declare module 'zapatos/db' { interface ConfigTypes { aggregatesTypedByColumn: false } }`.
 */
export interface ConfigTypes { }

const defaults: Config = {
  transactionAttemptsMax: 5,
  transactionRetryDelay: { minMs: 25, maxMs: 250 },
  castArrayParamsToJson: false,
  castObjectParamsToJson: false,
  selectExactlyOneChecksForSecondRow: false,  // stays the default in 7.0
  shortcutsUseJson: false,  // the only behaviour in 8.0 (decision 019)
  topLevelSelectAsRows: false,  // the only behaviour in 8.0 (decision 019)
};

let config: Config = { ...defaults };

  aggregatesTypedByColumn: true,  // sum() and avg() give null on an empty set, min() and max() the column's value as pg parses it
// the runtime keys 8.0 removed (decision 019 § 4), each with the value whose behaviour 8.0 always has, through 8.x:
// setConfig() takes that value, null or undefined, and keeps none of them, and throws on any other
const removedOptions: { [key: string]: boolean } = {
  upsertRequiresSameKeys: true,  // a batch whose rows have different keys throws as it is built, unless updateColumns
  undefinedMeansMissing: true,  // an undefined value is a missing key: DEFAULT in insert, left out of update and upsert
  transactionRequiresCommit: true,  // transaction() rejects when Postgres answers its COMMIT with ROLLBACK
  transactionRequiresIdleClient: true,  // transaction() rejects a client already inside a transaction block, before its START TRANSACTION
  transactionRequiresSatisfyingLevel: true,  // transaction() rejects the client of a transaction at a level that doesn't satisfy its own
};

/**
 * Get (a copy of) the current configuration.
 */
export const getConfig = () => {
  const d = config.transactionRetryDelay;  // its one nested object, copied too; the listeners are functions, kept as they are
  let delay = d;
  try { delay = d && { minMs: d.minMs, maxMs: d.maxMs }; }
  catch { /* a getter that throws: kept as it is, so that transaction() throws reading it, not every query, as in Zapatos 6.6.1 */ }
  return { ...config, transactionRetryDelay: delay };
};

/**
 * Set key(s) on the configuration, and return (a copy of) the new configuration.
 * A key that has a default and is set to `undefined` (or `null`) goes back to
 * that default. A key that 8.0 removed throws, unless it is set to the value
 * 8.0 always behaves as, `null` or `undefined`, and none of them is kept.
 * @param newConfig Partial configuration object
 */
export const setConfig = (newConfig: NewConfig) => {
  const given: { [key: string]: unknown } = { ...newConfig };
  Object.keys(removedOptions).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(given, key)) return;
    const kept = removedOptions[key];
    if (given[key] != null && given[key] !== kept) {
      throw new Error(`${key} was removed in 8.0, which always does what ${key}: ${kept} did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-${key}`);
    }
    delete given[key];
  });
  config = { ...config, ...given };
  (Object.keys(defaults) as (keyof Config)[]).forEach(<K extends keyof Config>(key: K) => { config[key] ??= defaults[key]; });
  return getConfig();
};

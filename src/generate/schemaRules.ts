/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import type { CompleteConfig, Config } from './config';

// kept out of zapatos/generate's exports, like enumOrder.ts

type SchemaRules = CompleteConfig['schemas'];

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The keys a rule leaves out or sets to `null`; none for a rule that is not an object, left as it is. */
const missingKeys = (rule: unknown) =>
  isObject(rule) ? (['include', 'exclude'] as const).filter(key => rule[key] === undefined || rule[key] === null) : [];

/**
 * `schemas`, each rule missing `include` or `exclude` (in JSON or untyped JavaScript) given the default rule's:
 * `'*'`, `[]`. Zapatos 6.6.1 threw a `TypeError` when it read the missing key, and generated as these defaults do
 * when it did not: with `exclude: '*'`, an `include` list matching nothing, a schema with no relation.
 */
export const schemaRulesWithDefaults = (schemas: SchemaRules): SchemaRules =>
  !isObject(schemas) ? schemas :
    Object.fromEntries(Object.keys(schemas).map(schema => {
      const rule = schemas[schema];
      return [schema, missingKeys(rule).length === 0 ? rule : { ...rule, include: rule.include ?? '*', exclude: rule.exclude ?? [] }];
    }));

/** Note each rule of the supplied `schemas` missing `include` or `exclude`, and the default it takes. */
export const warnAboutRulesWithoutKeys = (suppliedConfig: Config, config: CompleteConfig) => {
  const { schemas } = suppliedConfig;
  if (!isObject(schemas)) return;

  const
    warn = config.warningListener === true ? console.log : config.warningListener || (() => void 0),
    defaults = { include: '"include": "*"', exclude: '"exclude": []' };

  for (const schema of Object.keys(schemas)) {
    const missing = missingKeys(schemas[schema]);
    if (missing.length === 0) continue;
    warn(`Note: the schemas rule of "${schema}" has no ${missing.join(' nor ')}, ` +
      `so it takes ${missing.map(key => defaults[key]).join(' and ')}, as the default rule does. ` +
      `Write ${missing.length === 1 ? 'the key' : 'the keys'} in the rule to silence this note.`);
  }
};

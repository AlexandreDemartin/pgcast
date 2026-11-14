/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import type { CompleteConfig, Config } from './config';

// kept out of zapatos/generate's exports, like enumOrder.ts

type SchemaRules = CompleteConfig['schemas'];

const
  isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x),
  keys = ['include', 'exclude'] as const;

/** The keys a rule leaves out or sets to `null`; none for a rule that is not an object, left as it is. */
const missingKeys = (rule: unknown) =>
  isObject(rule) ? keys.filter(key => rule[key] === undefined || rule[key] === null) : [];

/** The keys a rule gives as a string other than `'*'`: one name. */
const stringKeys = (rule: unknown) =>
  isObject(rule) ? keys.filter(key => typeof rule[key] === 'string' && rule[key] !== '*') : [];

const asList = (names: '*' | string[]) => typeof names === 'string' && names !== '*' ? [names] : names;

/**
 * `schemas`, each rule (in JSON or untyped JavaScript) given the shape its type states:
 * - a missing `include` or `exclude` takes the default rule's, `'*'` or `[]`. Zapatos 6.6.1 threw a `TypeError` when
 *   it read the missing key, and generated as these defaults do when it did not: with `exclude: '*'`, an `include`
 *   list matching nothing, a schema with no relation;
 * - a string other than `'*'` becomes a one-name list. Zapatos 6.6.1 read it with `String.prototype.indexOf`, so it
 *   also matched each relation whose name is part of it: `'films'` matched `film` too.
 */
export const schemaRulesAsTyped = (schemas: SchemaRules): SchemaRules =>
  !isObject(schemas) ? schemas :
    Object.fromEntries(Object.keys(schemas).map(schema => {
      const rule = schemas[schema];
      return [schema, missingKeys(rule).length === 0 && stringKeys(rule).length === 0 ? rule :
        { ...rule, include: asList(rule.include ?? '*'), exclude: asList(rule.exclude ?? []) }];
    }));

/** Note each rule of the supplied `schemas` missing `include` or `exclude`, or giving one as a string. */
export const warnAboutSchemaRules = (suppliedConfig: Config, config: CompleteConfig) => {
  const { schemas } = suppliedConfig;
  if (!isObject(schemas)) return;

  const
    warn = config.warningListener === true ? console.log : config.warningListener || (() => void 0),
    defaults = { include: '"include": "*"', exclude: '"exclude": []' };

  for (const schema of Object.keys(schemas)) {
    const rule = schemas[schema], missing = missingKeys(rule);
    if (missing.length > 0) {
      warn(`Note: the schemas rule of "${schema}" has no ${missing.join(' nor ')}, ` +
        `so it takes ${missing.map(key => defaults[key]).join(' and ')}, as the default rule does. ` +
        `Write ${missing.length === 1 ? 'the key' : 'the keys'} in the rule to silence this note.`);
    }

    for (const key of stringKeys(rule)) {
      const name = rule[key] as string;
      warn(`Note: the schemas rule of "${schema}" gives ${key} as a string, ${JSON.stringify(name)}, ` +
        `so it is read as the list ${JSON.stringify([name])}. ` +
        'Zapatos 6.6.1 also matched each relation whose name is part of the string. Write the list to silence this note.');
    }
  }
};

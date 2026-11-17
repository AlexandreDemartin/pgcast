/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import type * as pg from 'pg';
import type { CompleteConfig } from './config';
import { enumTypesForEnumData } from './enums';
import { moduleNamesOf } from './moduleNames';
import { jsdocText } from './quote';

// kept out of zapatos/generate's exports, like domainRoots.ts

/** A domain typed by the values of its `CHECK`, in its order, with its `COMMENT ON DOMAIN`. */
export interface DomainUnion { schema: string; name: string; values: string[]; comment: string | null }

const
  literal = `'(?:[^']|'')*'::text`,
  // VALUE IN ('a', 'b') and VALUE = ANY (ARRAY['a', 'b']) as pg_get_constraintdef() writes them, and VALUE IN ('a'), matched
  // whole: NULL, another cast, NOT VALID or an OR is another text
  valuesCheck = new RegExp(`^CHECK \\(\\(VALUE = (?:ANY \\(ARRAY\\[${literal}(?:, ${literal})*\\]\\)|${literal})\\)\\)$`);

/**
 * Read in one query the domains of `schemas` over text with one `CHECK` of that form, valid; another `CHECK` only
 * narrows its values. From Postgres 17, a domain's `NOT NULL` is a `pg_constraint` row too, `contype = 'n'`.
 */
export const domainUnionsInDatabase = async (schemas: string[], queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) => {
  const
    { rows } = await queryFn({
      text: `
        SELECT n.nspname AS schema, t.typname AS name, c.convalidated AS valid, pg_catalog.pg_get_constraintdef(c.oid) AS def
        , d.description AS comment, current_setting('standard_conforming_strings') AS "standardStrings"
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_catalog.pg_constraint c ON c.contypid = t.oid AND c.contype = 'c'
        LEFT JOIN pg_catalog.pg_description d
          ON d.objoid = t.oid AND d.classoid = 'pg_catalog.pg_type'::regclass AND d.objsubid = 0
        WHERE t.typtype = 'd' AND t.typbasetype = 'pg_catalog.text'::regtype AND n.nspname = ANY($1)
        ORDER BY n.nspname, t.typname, c.conname`,
      values: [schemas],
    }),
    checks = new Map<string, any[]>();

  for (const row of rows) {
    const key = JSON.stringify([row.schema, row.name]);
    checks.set(key, [...checks.get(key) ?? [], row]);
  }
  return [...checks.values()].flatMap((domainChecks): DomainUnion[] => {
    const forms = domainChecks.filter(check => valuesCheck.test(check.def));
    if (forms.length !== 1 || !forms[0].valid) return [];
    const
      { schema, name, def, comment, standardStrings } = forms[0],
      values: string[] = def.match(/'(?:[^']|'')*'::text/g).map((value: string) => value.slice(1, -7).replace(/''/g, `'`));
    // with standard_conforming_strings off, pg_get_constraintdef() doubles a backslash, and writes no E before the quote
    if (standardStrings === 'off' && values.some(value => value.includes('\\'))) return [];
    return [{ schema, name, values: [...new Set(values)], comment }];
  });
};

/** The unions of one schema, declared as its enums are, each under `schemaJSDoc` with its name and its comment. */
export const unionTypesForDomains = (unions: DomainUnion[], schemaPrefix: string, schemaJSDoc: boolean) =>
  unions.map(({ name, values, comment }) => {
    const lines = (text: string) => jsdocText(text).split(/\r\n?|\n/).join('\n * ');
    return (schemaJSDoc ? `\n/**\n * ${lines(`**${schemaPrefix}${name}**`)}\n * - Domain in database` +
      (comment ? `\n *\n * ${lines(comment)}` : '') + '\n */' : '') + enumTypesForEnumData({ [name]: values });
  }).join('');

/**
 * Note each placeholder on disk whose text is not what this run writes naming its union, in the order of the unions:
 * it still types its columns. One that names the union with an import that `zapatos/schema` also declares as a type of
 * the placeholder's own name, as 6.10.0 wrote it (`importing`), names it already, and fails to compile (TS2440).
 */
export const warnAboutPlaceholdersOnDisk = (placeholders: (readonly [name: string, domain: string, union: string])[],
  files: Record<string, string>, config: CompleteConfig, importing: Record<string, string> = {}) => {
  const
    warn = config.warningListener === true ? console.log : config.warningListener || (() => void 0),
    names = moduleNamesOf(config);

  for (const [name, domain, union] of placeholders) {
    const file = path.join(config.outDir, names, 'custom', name + config.outExt);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text === files[name]) continue;
    warn(`Note: ${domain} is typed by the values of its CHECK as ${union} in ${names}/schema (domainsTypedAsUnions), ` +
      (text === importing[name] ?
        `and its placeholder ${file}, written before, names it too, but imports ${name} from ${names}/schema, which ` +
        `also declares a type of that name, the placeholder's own: it fails to compile (TS2440). Delete it: ` +
        `the next run writes it naming the union with no import.` :
        `but its placeholder ${file}, written before, still types its columns. To type them by the database, delete it: ` +
        `the next run writes it naming the union.`));
  }
};

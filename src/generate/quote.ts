/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

// Kept out of `zapatos/generate`'s exports: how the generated file writes a Postgres name or a text.

/**
 * Write a string as a TypeScript string literal between `quote`: an enum label, a relation, index or column name.
 * A `\`, the quote, a CR and a LF are escaped; nothing else changes.
 */
export const stringLiteral = (value: string, quote: `'` | `"` = `'`) =>
  quote + value.replace(quote === `'` ? /[\\']/g : /[\\"]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + quote;

/** Write a text into a JSDoc: a backslash goes into each `*` `/` pair, which would end the JSDoc there. */
export const jsdocText = (text: string) => text.replace(/\*\//g, '*\\/');

const
  // the reserved words, and the type operators that start a type: `keyof.Table` does not parse
  refusedAsNamespace = new Set(('break case catch class const continue debugger default delete do else enum export ' +
    'extends false finally for function if import in instanceof new null return super switch this throw true try ' +
    'typeof var void while with infer keyof readonly unique').split(' ')),
  // and `as` for a type. Only words whose output does not parse: an enum named `string` keeps Zapatos 6.6.1's
  // output, refused at type-check (TS2457) but typed `string` under skipLibCheck
  refusedAsType = new Set([...refusedAsNamespace, 'as']);

/**
 * The TypeScript name of a schema or a relation (`'namespace'`), or of an enum (`'type'`): its Postgres name if
 * TypeScript takes it there; otherwise each run of characters an identifier cannot hold becomes `_`, a name that
 * starts with a digit takes a `_` before it, and a refused word a `_` after it: `odd table` is `odd_table`,
 * `2nd take` is `_2nd_take` and `class` is `class_`. Strings keep the Postgres name.
 */
export const tsIdentifier = (name: string, as: 'namespace' | 'type') => {
  const refused = as === 'type' ? refusedAsType : refusedAsNamespace;
  if (/^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u.test(name) && !refused.has(name)) return name;
  const legal = name.replace(/[^\p{ID_Continue}$\u200C\u200D]+/gu, '_').replace(/^(?![\p{ID_Start}$_])/u, '_');
  return refused.has(legal) ? legal + '_' : legal;
};

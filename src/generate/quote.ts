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

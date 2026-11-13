/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

/**
 * Write an enum label as a TypeScript string literal type, the one place labels are quoted. Kept out of
 * `zapatos/generate`'s exports. A `'` or a `\` in the label is not escaped yet: #48.
 */
export const enumLabel = (value: string) => `'${value}'`;

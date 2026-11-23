// Copyright (C) 2026 Alexandre Demartin
//
// A generic helper that forwards its arguments to db.select() (#918), type-checked by
// `npm run bench:types:large` against the synthetic schema of scripts/bench-types-large.mjs.

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

export function selectWith<T extends s.Table, C extends db.ColumnsOption<T> = undefined,
  E extends db.ExtrasOption<T> = undefined, L extends db.LateralOption<C, E> = undefined, A extends string = never>(
  table: T, where: s.WhereableForTable<T>, options?: db.SelectOptionsForTable<T, C, L, E, A>,
) {
  return db.select(table, where, options);
}

// Copyright (C) 2026 Alexandre Demartin
//
// A generic helper that only calls parent() on a column of its table (#918), type-checked by
// `npm run bench:types:large` against the synthetic schema of scripts/bench-types-large.mjs.

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

export function parentOf<T extends s.Table>(col: s.ColumnForTable<T>) {
  return db.parent(col);
}

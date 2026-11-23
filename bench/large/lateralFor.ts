// Copyright (C) 2026 Alexandre Demartin
//
// A generic lateral on a column of any table (#918), type-checked by `npm run bench:types:large`
// against the synthetic schema of scripts/bench-types-large.mjs.

import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

export function lateralFor<T extends s.Table>(col: s.ColumnForTable<T>) {
  return db.selectExactlyOne('depot_batch', { id: db.parent(col) }, { columns: ['id'] });
}

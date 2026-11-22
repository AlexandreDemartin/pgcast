// Copyright (C) 2026 Alexandre Demartin
//
// `Relation` and `relationsInSchema` by the path that a declaration written by hand under node10 resolution gives
// them on Zapatos 6.6.1 and pgcast 7.1: `import("zapatos/dist/generate/tables").Relation`. Both moved to
// src/generate/relations.ts (#885); tables.ts re-exports them, or that declaration breaks (TS2694).
// ./tsconfig.json maps the path to the declarations of src/generate.

import { describe, expectTypeOf, test } from 'vitest';
import type * as generate from 'zapatos/generate';
import { relationsInSchema, type Relation } from 'zapatos/dist/generate/tables';

describe('zapatos/dist/generate/tables', () => {
  test('still names Relation and relationsInSchema, as zapatos/generate does', () => {
    expectTypeOf<Relation>().toEqualTypeOf<generate.Relation>();
    expectTypeOf<Relation>().not.toBeAny();
    expectTypeOf<Relation['type']>().toEqualTypeOf<'table' | 'view' | 'fdw' | 'mview'>();
    expectTypeOf(relationsInSchema).toEqualTypeOf<typeof generate.relationsInSchema>();
    expectTypeOf(relationsInSchema).returns.resolves.toEqualTypeOf<Relation[]>();
  });

  test('does not name the column reads, which zapatos/generate does not export', () => {
    // @ts-expect-error columnsForRelation stays out of tables.ts
    void (null as unknown as typeof import('zapatos/dist/generate/tables').columnsForRelation);
  });
});

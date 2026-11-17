// Copyright (C) 2026 Alexandre Demartin
//
// `NoInfer` of src/db/utils.ts, which src/db no longer uses (#578), by the path that declarations a package emitted
// under node10 resolution, against Zapatos 6.6.1 or against pgcast before #578, give it:
// `import("zapatos/dist/db/utils").NoInfer<A>`. Deleted, these declarations break: TS2694, or with `skipLibCheck`
// an `any` that lets every lock through. ./tsconfig.json maps the path to the declarations of src/db.

import { describe, expectTypeOf, test } from 'vitest';
import type { NoInfer } from 'zapatos/dist/db/utils';

describe('NoInfer of zapatos/dist/db/utils', () => {
  test('is its argument, and T is not inferred from it', () => {
    expectTypeOf<NoInfer<'a'>>().toEqualTypeOf<'a'>();
    expectTypeOf<NoInfer<'a'>>().not.toBeAny();
    const choose = <T extends string>(options: T[], chosen: NoInfer<T>) => chosen;
    expectTypeOf(choose(['a', 'b'], 'a')).toEqualTypeOf<'a' | 'b'>();
    // @ts-expect-error 'c' is not one of the options: T is inferred from them alone
    choose(['a', 'b'], 'c');
  });
});

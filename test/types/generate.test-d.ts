// Copyright (C) 2026 Alexandre Demartin
//
// The declared type of check() (src/generate/write.ts), as a script imports it from zapatos/generate: it takes the
// Config of generate() and resolves to a boolean, the files being up to date (#559).

import { describe, expectTypeOf, test } from 'vitest';
import { check, generate, type Config } from 'zapatos/generate';

describe('check()', () => {
  test('takes the Config of generate() and resolves to a boolean', () => {
    expectTypeOf(check).parameters.toEqualTypeOf<Parameters<typeof generate>>();
    expectTypeOf(check).parameters.toEqualTypeOf<[suppliedConfig: Config]>();
    expectTypeOf(check({})).toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(check({})).not.toBeAny();
    expectTypeOf(check({ outDir: './src', progressListener: line => void line, warningListener: false })).resolves.toEqualTypeOf<boolean>();
  });

  test('refuses what generate() refuses, and its result is no list of files', async () => {
    // @ts-expect-error the config is required, as for generate()
    void check();
    // @ts-expect-error outdir is no key of the config: outDir is
    void check({ outdir: './src' });
    // @ts-expect-error a listener takes a line, not a list of them
    void check({ warningListener: (lines: string[]) => void lines });
    // @ts-expect-error it resolves to a boolean, not the files that differ
    void (await check({})).length;
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// The declared type of check() (src/generate/write.ts), as a script imports it from zapatos/generate: it takes the
// Config of generate() and resolves to a boolean, the files being up to date (#559). And the types of two options,
// exported under their names so that a package's declarations can write them out (#584).

import { describe, expectTypeOf, test } from 'vitest';
import { check, generate, type ColumnOptions, type CompleteConfig, type Config, type OptionalConfig, type SchemaRules } from 'zapatos/generate';

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

describe('SchemaRules and ColumnOptions', () => {
  test('are the types of the schemas and columnOptions options', () => {
    expectTypeOf<SchemaRules>().toEqualTypeOf<OptionalConfig['schemas']>();
    expectTypeOf<SchemaRules>().not.toBeAny();
    expectTypeOf<ColumnOptions>().toEqualTypeOf<OptionalConfig['columnOptions']>();
    expectTypeOf<ColumnOptions>().not.toBeAny();
    const
      schemas: SchemaRules = { public: { include: '*', exclude: ['events'] } },
      columnOptions: ColumnOptions = { '*': { created_at: { insert: 'excluded', update: 'excluded' } } };
    expectTypeOf(generate).toBeCallableWith({ schemas, columnOptions });
  });

  test('refuse what the options refuse', () => {
    // @ts-expect-error a rule takes both include and exclude
    void ({ public: { include: '*' } } satisfies SchemaRules);
    // @ts-expect-error insert is 'auto', 'excluded' or 'optional'
    void ({ users: { id: { insert: 'never' } } } satisfies ColumnOptions);
  });
});

// decision 019 § 4: a key 8.0 removed leaves the config's type, its kept value included; a config built in a variable
// with other keys still compiles, which is why the generator refuses the key at run time too
describe('the removed options typeEnumsAcrossSchemas and enumOrder', () => {
  test('are no keys of the config', () => {
    expectTypeOf<'typeEnumsAcrossSchemas' extends keyof OptionalConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'enumOrder' extends keyof OptionalConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'typeEnumsAcrossSchemas' | 'enumOrder' extends keyof CompleteConfig ? true : false>().toEqualTypeOf<false>();
  });

  test('fail to compile in a literal, old value or kept, alone or beside a kept key', () => {
    // @ts-expect-error TS2353: removed in 8.0
    void generate({ typeEnumsAcrossSchemas: false });
    // @ts-expect-error TS2353: removed in 8.0, even with the value 8.0 keeps
    void generate({ outDir: './src', typeEnumsAcrossSchemas: true });
    // @ts-expect-error TS2353: removed in 8.0
    void check({ enumOrder: 'alphabetical' });
    // @ts-expect-error TS2353: removed in 8.0, even with the value 8.0 keeps
    void check({ outDir: './src', enumOrder: 'declared' });
    // @ts-expect-error TS2353: removed in 8.0
    const config: Config = { outDir: './src', enumOrder: 'declared' };
    void config;
  });

  test('compile in a variable with other keys, as any extra key does', () => {
    const legacy = { outDir: './src', typeEnumsAcrossSchemas: false, enumOrder: 'alphabetical' };
    expectTypeOf(generate).toBeCallableWith(legacy);
    expectTypeOf(check).toBeCallableWith(legacy);
  });
});

describe('the removed options uniqueIndexConstraintsOnly and domainsTypedByContext', () => {
  test('are no keys of the config', () => {
    expectTypeOf<'uniqueIndexConstraintsOnly' extends keyof OptionalConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'domainsTypedByContext' extends keyof OptionalConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'uniqueIndexConstraintsOnly' extends keyof CompleteConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'domainsTypedByContext' extends keyof CompleteConfig ? true : false>().toEqualTypeOf<false>();
  });

  test('fail to compile in a literal, old value or kept, alone or beside a kept key', () => {
    // @ts-expect-error TS2353: removed in 8.0
    void generate({ uniqueIndexConstraintsOnly: false });
    // @ts-expect-error TS2353: removed in 8.0, even with the value 8.0 keeps
    void generate({ outDir: './src', uniqueIndexConstraintsOnly: true });
    // @ts-expect-error TS2353: removed in 8.0
    void check({ domainsTypedByContext: false });
    // @ts-expect-error TS2353: removed in 8.0, even with the value 8.0 keeps
    void check({ outDir: './src', domainsTypedByContext: true });
    // @ts-expect-error TS2353: removed in 8.0
    const config: Config = { outDir: './src', uniqueIndexConstraintsOnly: true };
    void config;
  });

  test('compile in a variable with other keys, as any extra key does', () => {
    const legacy = { outDir: './src', uniqueIndexConstraintsOnly: false, domainsTypedByContext: false };
    expectTypeOf(generate).toBeCallableWith(legacy);
    expectTypeOf(check).toBeCallableWith(legacy);
  });
});

describe('the removed option rejectOnQueryError', () => {
  test('is no key of the config', () => {
    expectTypeOf<'rejectOnQueryError' extends keyof OptionalConfig ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'rejectOnQueryError' extends keyof CompleteConfig ? true : false>().toEqualTypeOf<false>();
  });

  test('fails to compile in a literal, old value or kept, alone or beside a kept key', () => {
    // @ts-expect-error TS2353: removed in 8.0
    void generate({ rejectOnQueryError: false });
    // @ts-expect-error TS2353: removed in 8.0, even with the value 8.0 keeps
    void generate({ outDir: './src', rejectOnQueryError: true });
    // @ts-expect-error TS2353: removed in 8.0
    void check({ outDir: './src', rejectOnQueryError: false });
    // @ts-expect-error TS2353: removed in 8.0
    const config: Config = { outDir: './src', rejectOnQueryError: false };
    void config;
  });

  test('compiles in a variable with other keys, as any extra key does', () => {
    const legacy = { outDir: './src', rejectOnQueryError: false };
    expectTypeOf(generate).toBeCallableWith(legacy);
    expectTypeOf(check).toBeCallableWith(legacy);
  });
});

// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the codegen output against the fixture: what Zapatos 6.6.1
// produces today, surprises included (they are fixed in chapter 2, not here).
//   * tsForConfig(): one frozen file per configuration, in test/__snapshots__/codegen/;
//   * generate(): the files written to disk for the main configuration, frozen in
//     test/generated/, which `npm run typecheck` compiles (test/generated/tsconfig.json).
// Update after an intended change: `npx vitest run -u test/integration/codegen.test.ts`.
// -u never deletes a file: a stale snapshot is removed by hand (the orphan test names it).
// Without rejectOnQueryError, tsForConfig() calls process.exit(1) on a failed query: a test that causes one
// mocks process.exit (§ generate() on a failed query).

import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import {
  definitionForRelationInSchema, enumDataForSchema, finaliseConfig, generate, relationsInSchema, tsForConfig, type Config,
} from '../../src/generate';
import * as runtime from '../../src/db';
import { cliConfig } from '../../src/generate/cliConfig';
import { createDatabase, dropDatabase, urlForDatabase, withAdminClient } from '../helpers/databases';
import { useTestDatabase } from '../helpers/db';
import { pgError } from '../helpers/pgError';

const t = useTestDatabase();

const snapshotDir = '../__snapshots__/codegen';
const generatedDir = fileURLToPath(new URL('../generated', import.meta.url));

type Schemas = NonNullable<Config['schemas']>;
const all = { include: '*' as const, exclude: [] };
const only = (...include: string[]) => ({ include, exclude: [] });

/** The configuration test/generated/ is produced with: every fixture schema with relations but `edge`. */
const main: Config = { schemas: { public: all, extra: all }, unprefixedSchema: 'public' };

/** Custom types of every kind: domains, composites, a custom range, unknown built-ins, cross-schema enums. */
const customTypesSchemas: Schemas = { public: only('users', 'products'), extra: only('type_zoo') };

// [snapshot file name, configuration]
const variants: [string, Config][] = [
  ['unprefixedSchema-null', {
    schemas: { public: only('users', 'OrderLines'), extra: only('articles') }, unprefixedSchema: null,
  }],
  ['schemaJSDoc-false', { schemas: { public: only('users', 'accounts') }, schemaJSDoc: false }],
  ['customTypesTransform-PgMy_type', { schemas: customTypesSchemas, customTypesTransform: 'PgMy_type' }],
  ['customTypesTransform-my_type', { schemas: customTypesSchemas, customTypesTransform: 'my_type' }],
  ['customTypesTransform-PgMyType', { schemas: customTypesSchemas, customTypesTransform: 'PgMyType' }],
  ['customTypesTransform-function', { schemas: customTypesSchemas, customTypesTransform: s => `Custom_${s}` }],
  ['typeEnumsAcrossSchemas', { schemas: customTypesSchemas, typeEnumsAcrossSchemas: true }],
  // the same, but the order of the labels
  ['enumOrder-declared', { schemas: customTypesSchemas, typeEnumsAcrossSchemas: true, enumOrder: 'declared' }],
  // pgcast/schema, pgcast/custom and pgcast/db, and the zapatos/schema that src/db's declarations import
  ['moduleNames-pgcast', { schemas: customTypesSchemas, moduleNames: 'pgcast' }],
  // main, whose output is test/generated/: only the UniqueIndex of products, extra.articles and account_totals differ
  ['uniqueIndexConstraintsOnly', { ...main, uniqueIndexConstraintsOnly: true }],
  // only extra.type_zoo's c_int8_domain differs, in the four interfaces but Selectable; the placeholders are the same
  ['domainsTypedByContext', { schemas: customTypesSchemas, domainsTypedByContext: true }],
  // typeEnumsAcrossSchemas's, but extra.type_zoo's c_enum_array in Selectable: any without it
  ['enumArraysTypedAsText', { schemas: customTypesSchemas, typeEnumsAcrossSchemas: true, enumArraysTypedAsText: true }],
  // only extra.type_zoo's c_interval differs, in the four interfaces but JSONSelectable; the placeholders are the same
  ['intervalsTypedAsObjects', { schemas: customTypesSchemas, intervalsTypedAsObjects: true }],
  ['columnOptions', {
    schemas: { public: only('users', 'accounts'), extra: only('articles') },
    columnOptions: {
      '*': {
        owner_id: { insert: 'optional' },  // accounts.owner_id: NOT NULL, no default
        created_at: { insert: 'excluded', update: 'excluded' },
        author_id: { update: 'excluded' },
      },
      // a table entry replaces the '*' entry of the same column as a whole: users.created_at is insertable again
      users: { created_at: { update: 'auto' }, display_name: { insert: 'optional', update: 'excluded' } },
      // a table of another schema is keyed with its prefix...
      'extra.articles': { body: { insert: 'excluded' } },
      // ...and only with it: neither key below matches anything
      articles: { author_id: { insert: 'excluded' } },
      'public.accounts': { balance: { update: 'excluded' } },
    },
  }],
  ['include-exclude-lists', {
    schemas: {
      // exclude wins; no_such_table generates nothing, with a warning (§ include entries that match no relation)
      public: { include: ['users', 'accounts', 'products', 'no_such_table'], exclude: ['products'] },
      extra: { include: '*', exclude: ['type_zoo', 'imported_lines'] },
    },
  }],
  ['exclude-star', { schemas: { public: { include: '*', exclude: '*' }, extra: { include: ['articles'], exclude: '*' } } }],
  ['edge', { schemas: { edge: all } }],
];

const withoutCustomTypes = ['exclude-star', 'edge'];

const db = () => ({ connectionString: urlForDatabase(inject('pgcastDb')!.url, t.name) });
const quiet = { warningListener: false, progressListener: false, debugListener: false } as const;
const noDebug = () => void 0;

const codegen = (config: Config) => tsForConfig(finaliseConfig({ ...config, ...quiet, db: db() }), noDebug);

/** The same, on a server that refuses every connection: a run that rejects with its own error sent no query. */
const unreachable = { connectionString: 'postgres://nobody@127.0.0.1:1/none' };
const codegenWithoutQueries = (config: Config) =>
  tsForConfig(finaliseConfig({ ...config, ...quiet, db: unreachable }), noDebug);

/** The warnings of a run, but the bigint note, which comes once per process. */
const warningsOf = async (config: Config) => {
  const warnings: string[] = [];
  await tsForConfig(finaliseConfig({
    ...config, ...quiet, warningListener: s => warnings.push(s), db: db(), outDir: 'src',
  }), noDebug);
  return warnings.filter(w => !w.startsWith('Note: this database has bigint'));
};

/**
 * The same, but the notes on enums, unique indexes, domains, arrays of an enum and intervals, which have their own
 * tests (§ typeEnumsAcrossSchemas, § enumOrder, § uniqueIndexConstraintsOnly, § domainsTypedByContext,
 * § enumArraysTypedAsText, § intervalsTypedAsObjects).
 */
const warningsFor = async (schemas: Schemas, config: Config = {}) =>
  (await warningsOf({ ...config, schemas })).filter(w => !w.includes('typeEnumsAcrossSchemas') &&
    !w.includes('enumOrder') && !w.includes('uniqueIndexConstraintsOnly') && !w.includes('domainsTypedByContext') &&
    !w.includes('enumArraysTypedAsText') && !w.includes('intervalsTypedAsObjects'));

/** Custom type placeholders, sorted by name: tsForConfig() inserts them in query completion order. */
const customFiles = (files: Record<string, string>) =>
  Object.keys(files).sort().map(name => `// ===== custom/${name}.d.ts =====\n${files[name]}`).join('\n');

/** The namespace of `table` in a generated schema, up to its last type. */
const tableBlock = (schema: string, table: string) => {
  const start = schema.indexOf(`export namespace ${table} {`);
  return schema.slice(start, schema.indexOf('\n  }\n', schema.indexOf('export type SQL = ', start)));
};

describe('tsForConfig()', () => {
  it.each(variants)('%s', async (name, config) => {
    const { ts: schema, customTypeSourceFiles } = await codegen(config);
    await expect(schema).toMatchFileSnapshot(`${snapshotDir}/${name}.d.ts`);
    const hasCustomTypes = Object.keys(customTypeSourceFiles).length > 0;
    expect(hasCustomTypes).toBe(!withoutCustomTypes.includes(name));
    if (hasCustomTypes) {
      await expect(customFiles(customTypeSourceFiles)).toMatchFileSnapshot(`${snapshotDir}/${name}.custom.d.ts`);
    }
  });

  it('gives the same text on two successive runs', async () => {
    const first = await codegen(main);
    const second = await codegen(main);
    expect(second.ts).toBe(first.ts);
    expect(customFiles(second.customTypeSourceFiles)).toBe(customFiles(first.customTypeSourceFiles));
  });
});

// Each test here runs one to three tsc compiles: 5.6 s on CI and 12.8 s locally under load, past the 5 s default (#525).
describe('variant snapshots', { timeout: 30_000 }, () => {
  const snapshotPath = fileURLToPath(new URL(snapshotDir, import.meta.url));
  let declarationDir: string;

  // the declarations of src/db, emitted afresh: a consumer compiles against them, not the sources;
  // under node_modules, so that they resolve 'pg'
  beforeAll(() => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    mkdirSync(join(root, 'node_modules/.cache'), { recursive: true });
    declarationDir = mkdtempSync(join(root, 'node_modules/.cache/pgcast-declarations-'));
    const { config } = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, root);
    ts.createProgram(fileNames, { ...options, emitDeclarationOnly: true, outDir: declarationDir }).emit();
  });
  afterAll(() => { if (declarationDir) rmSync(declarationDir, { recursive: true, force: true }); });

  /** `<moduleNames>/db`, and only it, as test/generated/tsconfig.json maps 'zapatos/db', to the declarations emitted here. */
  const dbPaths = (config: Config) => ({ [`${config.moduleNames ?? 'zapatos'}/db`]: [join(declarationDir, 'db')] });

  it.each(variants)('%s compiles with its custom types', (name, variant) => {
    const { config } = ts.readConfigFile(join(generatedDir, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, generatedDir);
    const custom = join(snapshotPath, `${name}.custom.d.ts`);
    const rootNames = [join(snapshotPath, `${name}.d.ts`), ...(withoutCustomTypes.includes(name) ? [] : [custom])];
    const program = ts.createProgram(rootNames, { ...options, paths: dbPaths(variant) });
    const errors = ts.getPreEmitDiagnostics(program).map(d =>
      `${d.file ? relative(snapshotPath, d.file.fileName) : ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(errors).toEqual([]);
  });

  /**
   * The type errors of `probe`, compiled against the schema and custom types that `config` generates, each placeholder
   * named in `edits` replaced by its text, as a user edits it.
   */
  const probeErrors = async (config: Config, probe: string, extraOptions: ts.CompilerOptions = {}, edits: Record<string, string> = {}) => {
    const { ts: schema, customTypeSourceFiles } = await codegen(config);
    const dir = mkdtempSync(join(declarationDir, 'probe-'));
    writeFileSync(join(dir, 'schema.d.ts'), schema);
    writeFileSync(join(dir, 'custom.d.ts'), customFiles({ ...customTypeSourceFiles, ...edits }));
    writeFileSync(join(dir, 'probe.ts'), probe);
    const { config: tsconfig } = ts.readConfigFile(join(generatedDir, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(tsconfig, ts.sys, generatedDir);
    const rootNames = ['schema.d.ts', 'custom.d.ts', 'probe.ts'].map(f => join(dir, f));
    const program = ts.createProgram(rootNames, { ...options, ...extraOptions, paths: dbPaths(config) });
    return ts.getPreEmitDiagnostics(program).map(d =>
      `${d.file ? relative(dir, d.file.fileName) : ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  };

  it('typeEnumsAcrossSchemas: an enum of another schema takes its labels, and only them', async () => {
    expect(await probeErrors({ ...main, typeEnumsAcrossSchemas: true }, `
      import type * as s from 'zapatos/schema';
      export const ok: s.products.Insertable = { sku: 'x', price_cents: 1, status: 'draft' };
      // @ts-expect-error not a label of extra.status
      export const ko: s.products.Insertable = { sku: 'x', price_cents: 1, status: 'nope' };
      export const moods: s.extra.type_zoo.Selectable['c_enum_array'] = ['happy', 'sad'];
      // @ts-expect-error not a label of public.mood
      export const meh: s.extra.type_zoo.Selectable['c_enum_array'] = ['meh'];
    `)).toEqual([]);
  });

  /** Two constraints kept by uniqueIndexConstraintsOnly, two unique indexes refused, each line after a `refused` comment. */
  const constraintProbe = (refused: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      const row = { sku: 'x', price_cents: 1, status: 'draft' } as const;
      export const kept = [
        db.upsert('products', row, db.constraint('products_pkey')),
        db.upsert('products', row, db.constraint('products_sku_variant_key')),
      ];
      export const dropped = [
        ${refused} a plain unique index, which ON CONFLICT ON CONSTRAINT refuses (42704)
        db.upsert('products', row, db.constraint('products_status_sku_key')),
        ${refused} a partial unique index on an expression, refused too
        db.upsert('products', row, db.constraint('products_title_lower_key')),
      ];
      // a Record keyed by UniqueIndex, which lists every unique index without the option
      export const labels: Record<s.products.UniqueIndex, string> = {
        products_pkey: 'id', products_sku_variant_key: 'sku and variant',
        ${refused} no longer keys of the Record
        products_status_sku_key: 'status, sku and variant', products_title_lower_key: 'title',
      };`;

  // one codegen and one compile per `it`: the three in one took more than the 5 s default on CI
  it('uniqueIndexConstraintsOnly: constraint() takes a constraint, and no other unique index', async () => {
    expect(await probeErrors({ ...main, uniqueIndexConstraintsOnly: true }, constraintProbe('// @ts-expect-error')))
      .toEqual([]);
  });

  it('uniqueIndexConstraintsOnly off: constraint() takes all four unique indexes, as in Zapatos 6.6.1', async () => {
    expect(await probeErrors(main, constraintProbe('//'))).toEqual([]);
  });

  it('uniqueIndexConstraintsOnly off: each refusal of the key-on probe is an unused directive', async () => {
    expect(await probeErrors(main, constraintProbe('// @ts-expect-error'))).toEqual(Array(3).fill(
      "probe.ts TS2578 Unused '@ts-expect-error' directive."));
  });

  it('enumOrder-declared: every.<enum> takes the declared order, and only it', async () => {
    expect(await probeErrors({ ...main, enumOrder: 'declared' }, `
      import type * as s from 'zapatos/schema';
      export const moods: s.every.mood = ['sad', 'ok', 'happy'];
      // @ts-expect-error the alphabetical order
      export const sorted: s.every.mood = ['happy', 'ok', 'sad'];
      export const statuses: s.extra.every.status = ['draft', 'published', 'archived'];
      // @ts-expect-error the alphabetical order
      export const sortedStatuses: s.extra.every.status = ['archived', 'draft', 'published'];
      export const mood: s.users.Insertable['mood'] = 'ok';
      // @ts-expect-error not a label of public.mood
      export const meh: s.users.Insertable['mood'] = 'meh';
    `)).toEqual([]);
  });

  // without the zapatos/schema that src/db's declarations import, every type below is `any`:
  // an error under skipLibCheck: false, and only the unused @ts-expect-error under skipLibCheck: true
  it.each([false, true])("moduleNames-pgcast: pgcast/db and pgcast/schema are typed, not `any` (skipLibCheck: %s)", async skipLibCheck => {
    expect(await probeErrors({ schemas: customTypesSchemas, moduleNames: 'pgcast' }, `
      import * as db from 'pgcast/db';
      import type * as s from 'pgcast/schema';
      import { expectTypeOf } from 'expect-type';
      declare const pool: db.Queryable;
      export const probe = async () => {
        const users = await db.select('users', { mood: 'ok' }, { columns: ['id', 'display_name'] }).run(pool);
        expectTypeOf(users).not.toBeAny();
        expectTypeOf(users).toEqualTypeOf<{ id: number; display_name: string }[]>();
        const user = await db.selectOne('users', { id: 1 }).run(pool);
        expectTypeOf(user).not.toBeAny();
        expectTypeOf(user).toEqualTypeOf<s.users.JSONSelectable | undefined>();
        const added = await db.insert('users', { email: 'ada@example.com', display_name: 'Ada' }).run(pool);
        expectTypeOf(added.display_name).toEqualTypeOf<string>();
        expectTypeOf<s.SelectableForTable<'users'>>().toEqualTypeOf<s.users.Selectable>();
        expectTypeOf<s.Table>().not.toBeAny();
        // @ts-expect-error not a table
        db.select('no_such_table', db.all);
        // @ts-expect-error not a column of users
        db.select('users', { no_such_column: 1 });
        // @ts-expect-error display_name is a text column
        db.insert('users', { email: 'ada@example.com', display_name: 1 });
        // @ts-expect-error not a label of mood
        db.select('users', { mood: 'meh' });
      };
    `, { skipLibCheck })).toEqual([]);
  });

  describe('domainsTypedByContext, compiled', () => {
    // extra.type_zoo.c_int8_domain, of the fixture's public.ticket_no, and domains over the other base types
    beforeAll(() => t.pool.query(`
      CREATE SCHEMA ctx_probe;
      CREATE DOMAIN ctx_probe.release_day AS date;
      CREATE DOMAIN ctx_probe.blob AS bytea;
      CREATE DOMAIN ctx_probe.cost AS money;
      CREATE TABLE ctx_probe.sales (id int PRIMARY KEY, day ctx_probe.release_day, data ctx_probe.blob, cost ctx_probe.cost);`));
    afterAll(() => t.pool.query('DROP SCHEMA ctx_probe CASCADE'));

    const config = { schemas: { extra: only('type_zoo'), ctx_probe: all } };
    const on = { ...config, domainsTypedByContext: true };
    const edited = (name: string, type: string) => ({
      [name]: `declare module 'zapatos/custom' {\n  import type * as db from 'zapatos/db';\n  export type ${name} = ${type};\n}\n`,
    });

    /**
     * Each context of a placeholder left as generated, one line after each marker: `byContext` before what only the
     * option lets through, `once` before what only its absence does; the last call is refused either way.
     */
    const generatedProbe = (byContext: string, once: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const sel: s.extra.type_zoo.Selectable, json: s.extra.type_zoo.JSONSelectable;
      declare const sale: s.ctx_probe.sales.JSONSelectable;
      // Selectable: what pg returns, a string, either way
      export const fromPg: string | null = sel.c_int8_domain;
      export const reads = [
        ${byContext} JSONSelectable: the shortcuts give a number
        json.c_int8_domain satisfies number | null,
        ${once} the placeholder's string, which the shortcuts never give
        json.c_int8_domain satisfies string | null,
        ${byContext} a date as JSON's string
        sale.day satisfies db.DateString | null,
        ${once} a Date, which the shortcuts never give
        sale.day satisfies Date | null,
        ${byContext} a bytea as its hex string
        sale.data satisfies db.ByteArrayString | null,
      ];
      export const writes = [
        ${byContext} Whereable: a number, which Postgres takes
        db.select('extra.type_zoo', { c_int8_domain: 1 }),
        ${byContext} Insertable: a number
        db.insert('extra.type_zoo', { c_int8_domain: 1 }),
        ${byContext} Updatable: a bigint
        db.update('extra.type_zoo', { c_int8_domain: BigInt(1) }, { id: 1 }),
        ${byContext} a date as a string
        db.insert('ctx_probe.sales', { id: 1, day: '2030-03-01' }),
        ${byContext} a bytea as its hex string
        db.update('ctx_probe.sales', { data: '\\\\xdead' }, { id: 1 }),
        ${byContext} money as a number
        db.insert('ctx_probe.sales', { id: 1, cost: 5 }),
        // @ts-expect-error not a number, either way
        db.insert('extra.type_zoo', { c_int8_domain: 'abc' }),
        // @ts-expect-error not a date, either way
        db.select('ctx_probe.sales', { day: 5 }),
      ];`;

    it('types each context as its base type, while the placeholder holds what the generator wrote', async () => {
      expect(await probeErrors(on, generatedProbe('//', '// @ts-expect-error'))).toEqual([]);
    });

    it('is off by default: the placeholder\'s type in all five, as in Zapatos 6.6.1', async () => {
      expect(await probeErrors(config, generatedProbe('// @ts-expect-error', '//'))).toEqual([]);
    });

    it('each refusal of one probe is an unused directive in the other', async () => {
      const both = generatedProbe('// @ts-expect-error', '// @ts-expect-error');
      const unused = "probe.ts TS2578 Unused '@ts-expect-error' directive.";
      expect(await probeErrors(on, both)).toEqual(Array(9).fill(unused));
      expect(await probeErrors(config, both)).toEqual(Array(2).fill(unused));
    });

    /** An edited placeholder, with or without the option: its type in all five; `refused` marks what it refuses. */
    const editedProbe = (refused: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const json: s.extra.type_zoo.JSONSelectable;
      export const reads = [
        json.c_int8_domain satisfies number | db.Int8String | null,
        ${refused} the edited type, not the shortcuts' number alone
        json.c_int8_domain satisfies number | null,
      ];
      export const writes = [
        db.insert('extra.type_zoo', { c_int8_domain: 1 }),
        ${refused} not in the edited type
        db.insert('extra.type_zoo', { c_int8_domain: BigInt(1) }),
        ${refused} not a number
        db.insert('extra.type_zoo', { c_int8_domain: 'abc' }),
      ];`;
    const docsWorkaround = edited('PgTicket_no', 'number | db.Int8String');

    it.each([false, true])('keeps an edited placeholder\'s type in all five (domainsTypedByContext: %s)', async key => {
      expect(await probeErrors({ ...config, domainsTypedByContext: key }, editedProbe('// @ts-expect-error'), {}, docsWorkaround))
        .toEqual([]);
    });

    it('the edited probe\'s refusals are unused with the placeholder left as generated, or edited to any', async () => {
      const unused = "probe.ts TS2578 Unused '@ts-expect-error' directive.";
      // as generated, typed by context: a number, a bigint; 'abc' is refused still
      expect(await probeErrors(on, editedProbe('// @ts-expect-error'))).toEqual(Array(2).fill(unused));
      // any stays any, with the option too
      expect(await probeErrors(on, editedProbe('// @ts-expect-error'), {}, edited('PgTicket_no', 'any')))
        .toEqual(Array(3).fill(unused));
    });

    it('keeps a brand, refusing the base type\'s values', async () => {
      const brand = edited('PgTicket_no', "db.Int8String & { readonly __brand: 'ticket_no' }");
      const probe = `
        import * as db from 'zapatos/db';
        // @ts-expect-error not branded
        export const plain = db.insert('extra.type_zoo', { c_int8_domain: '1' });
        // @ts-expect-error not branded
        export const number = db.insert('extra.type_zoo', { c_int8_domain: 1 });`;
      expect(await probeErrors(on, probe, {}, brand)).toEqual([]);
      expect(await probeErrors(on, probe)).toEqual(Array(2).fill("probe.ts TS2578 Unused '@ts-expect-error' directive."));
    });
  });

  describe('domainsTypedByContext over a domain, or of an array of a domain, compiled (#484)', () => {
    beforeAll(() => t.pool.query(`
      CREATE SCHEMA nest_probe;
      CREATE TYPE nest_probe.genre AS ENUM ('comedy', 'drama');
      CREATE DOMAIN nest_probe.genre_d AS nest_probe.genre;
      CREATE DOMAIN nest_probe.vip_genre AS nest_probe.genre_d;
      CREATE DOMAIN nest_probe.label AS text;
      CREATE DOMAIN nest_probe.vip_label AS nest_probe.label;
      CREATE DOMAIN nest_probe.ticket_no AS bigint;
      CREATE DOMAIN nest_probe.vip_ticket_no AS nest_probe.ticket_no;
      CREATE DOMAIN nest_probe.release_day AS date;
      CREATE DOMAIN nest_probe.vip_day AS nest_probe.release_day;
      CREATE TABLE nest_probe.films (id int PRIMARY KEY, genre nest_probe.vip_genre, label nest_probe.vip_label,
        no nest_probe.vip_ticket_no, day nest_probe.vip_day, genres nest_probe.genre_d[], nos nest_probe.ticket_no[]);`));
    afterAll(() => t.pool.query('DROP SCHEMA nest_probe CASCADE'));

    const config = { schemas: { nest_probe: all } };
    const on = { ...config, domainsTypedByContext: true };
    const unused = "probe.ts TS2578 Unused '@ts-expect-error' directive.";

    /** Each context of the placeholders left as generated, `any`: `refused` marks what only the option refuses. */
    const generatedProbe = (refused: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const sel: s.nest_probe.films.Selectable, json: s.nest_probe.films.JSONSelectable, text: string;
      export const reads = [
        // pg parses a domain over a domain by the base type of the innermost domain
        sel.no satisfies db.Int8String | null,
        sel.day satisfies Date | null,
        sel.genre satisfies s.nest_probe.genre | null,
        // and returns an array of a domain as its text
        sel.genres satisfies string | null,
        json.no satisfies number | null,
        json.day satisfies db.DateString | null,
        json.genres satisfies s.nest_probe.genre[] | null,
        ${refused} pg's string, not the number the shortcuts give
        sel.no satisfies number | null,
        ${refused} the text pg returns, not an array
        sel.genres satisfies s.nest_probe.genre[] | null,
        ${refused} the shortcuts' number, not pg's string
        json.no satisfies db.Int8String | null,
      ];
      export const writes = [
        db.insert('nest_probe.films', {
          id: 1, no: 1, day: '2030-03-01', label: 'x', genre: 'comedy', genres: ['comedy'], nos: [1, BigInt(2)] }),
        db.select('nest_probe.films', { day: new Date(), label: text }),
        db.update('nest_probe.films', { no: BigInt(1) }, { id: 1 }),
        ${refused} not a label of genre, which Postgres refuses (22P02)
        db.insert('nest_probe.films', { id: 1, genre: 'horror' }),
        ${refused} any string, not a label
        db.insert('nest_probe.films', { id: 1, genre: text }),
        ${refused} not an array
        db.insert('nest_probe.films', { id: 1, nos: 'abc' }),
        ${refused} not a number
        db.update('nest_probe.films', { no: 'abc' }, { id: 1 }),
        ${refused} not a date
        db.select('nest_probe.films', { day: 5 }),
      ];`;

    it('types each context by the base type of the innermost domain', async () => {
      expect(await probeErrors(on, generatedProbe('// @ts-expect-error'))).toEqual([]);
    });

    it('is off by default: any in all five, as in Zapatos 6.6.1, so that each refusal is the option\'s', async () => {
      expect(await probeErrors(config, generatedProbe('//'))).toEqual([]);
      expect(await probeErrors(config, generatedProbe('// @ts-expect-error'))).toEqual(Array(8).fill(unused));
    });

    /** Edited placeholders, with or without the option: their type in all five; `refused` marks what they refuse. */
    const editedProbe = (refused: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const sel: s.nest_probe.films.Selectable, json: s.nest_probe.films.JSONSelectable;
      export const reads = [
        json.no satisfies number | db.Int8String | null,
        sel.genres satisfies s.nest_probe.genre[] | null,
        ${refused} the edited type, not the shortcuts' number alone
        json.no satisfies number | null,
      ];
      export const writes = [
        db.insert('nest_probe.films', { id: 1, no: 1, genres: ['comedy'] }),
        ${refused} not in the edited type
        db.insert('nest_probe.films', { id: 1, no: BigInt(1) }),
        ${refused} not a label
        db.insert('nest_probe.films', { id: 1, genres: ['horror'] }),
      ];`;
    const placeholder = (name: string, type: string) => `declare module 'zapatos/custom' {\n  import type * as db from ` +
      `'zapatos/db';\n  import type { nest_probe } from 'zapatos/schema';\n  export type ${name} = ${type};\n}\n`;
    const edits = {
      PgVip_ticket_no: placeholder('PgVip_ticket_no', 'number | db.Int8String'),
      Pg_genre_d: placeholder('Pg_genre_d', 'nest_probe.genre[]'),
    };

    it.each([false, true])('keeps an edited placeholder\'s type in all five (domainsTypedByContext: %s)', async key => {
      expect(await probeErrors({ ...config, domainsTypedByContext: key }, editedProbe('// @ts-expect-error'), {}, edits))
        .toEqual([]);
    });

    it('the edited probe\'s refusals are unused with the placeholders left as generated', async () => {
      // typed by the innermost domain: a number, a bigint, pg's text for the array; 'horror' is refused still
      expect(await probeErrors(on, editedProbe('// @ts-expect-error'))).toEqual([
        "probe.ts TS1360 Type 'string | null' does not satisfy the expected type 'genre[] | null'.   " +
          "Type 'string' is not assignable to type 'genre[]'.",
        ...Array(2).fill(unused),
      ]);
      expect(await probeErrors(config, editedProbe('// @ts-expect-error'))).toEqual(Array(3).fill(unused));
    });
  });

  describe('enumArraysTypedAsText, compiled', () => {
    beforeAll(() => t.pool.query(`
      CREATE SCHEMA arr_probe;
      CREATE TYPE arr_probe.mood AS ENUM ('sad', 'ok', 'happy');
      CREATE DOMAIN arr_probe.moods AS arr_probe.mood[];
      CREATE TABLE arr_probe.films (id int PRIMARY KEY, moods arr_probe.mood[], dmoods arr_probe.moods);`));
    afterAll(() => t.pool.query('DROP SCHEMA arr_probe CASCADE'));

    const config = { schemas: { arr_probe: all } };
    const on = { ...config, enumArraysTypedAsText: true };
    const unused = "probe.ts TS2578 Unused '@ts-expect-error' directive.";

    /** Each context with the placeholder left as generated: `refused` marks what only the option refuses. */
    const probe = (refused: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const sel: s.arr_probe.films.Selectable, json: s.arr_probe.films.JSONSelectable;
      export const reads = [
        json.moods satisfies s.arr_probe.mood[] | null,
        json.dmoods satisfies s.arr_probe.mood[] | null,
        ${refused} the text pg returns, not an array
        sel.moods satisfies s.arr_probe.mood[] | null,
        ${refused} the text pg returns, through a domain
        sel.dmoods satisfies s.arr_probe.mood[] | null,
      ];
      export const writes = [
        db.insert('arr_probe.films', { id: 1, moods: ['happy'], dmoods: json.dmoods }),
        db.select('arr_probe.films', { moods: ['ok'] }),
        // @ts-expect-error not a label of mood, which Postgres refuses (22P02)
        db.insert('arr_probe.films', { id: 1, moods: ['angry'] }),
        ${refused} pg's text written back: the writes take an array
        db.insert('arr_probe.films', { id: 1, moods: sel.moods }),
      ];`;
    const asText = `
      import type * as s from 'zapatos/schema';
      declare const sel: s.arr_probe.films.Selectable;
      export const text: string | null = sel.moods;
      export const domainText: string | null = sel.dmoods;`;

    it('types the text pg returns in Selectable, and only there', async () => {
      expect(await probeErrors(on, probe('// @ts-expect-error'))).toEqual([]);
      expect(await probeErrors(on, asText)).toEqual([]);
    });

    it('is off by default: an array, as in Zapatos 6.6.1, so that each refusal is the option\'s', async () => {
      expect(await probeErrors(config, probe('//'))).toEqual([]);
      expect(await probeErrors(config, probe('// @ts-expect-error'))).toEqual(Array(3).fill(unused));
      expect((await probeErrors(config, asText)).map(e => e.slice(0, 15))).toEqual(Array(2).fill('probe.ts TS2322'));
    });

    it('keeps an edited placeholder\'s type in Selectable', async () => {
      const edits = { PgMoods: "declare module 'zapatos/custom' {\n  export type PgMoods = string[];\n}\n" };
      const edited = `
        import type * as s from 'zapatos/schema';
        declare const sel: s.arr_probe.films.Selectable;
        export const moods = sel.dmoods satisfies string[] | null;`;
      expect(await probeErrors(on, edited, {}, edits)).toEqual([]);
    });
  });

  it('labels, index and column names take their quote and backslash, typeEnumsAcrossSchemas on or off', async () => {
    // tone_types is never generated: its enum is written out label by label with typeEnumsAcrossSchemas
    await t.pool.query(String.raw`
      CREATE SCHEMA quoting_probe;
      CREATE SCHEMA tone_types;
      CREATE TYPE quoting_probe.marks AS ENUM ('back\slash', 'trail\', 'it''s');
      CREATE TYPE tone_types.tone AS ENUM ('back\slash', 'trail\', 'it''s');
      CREATE TABLE quoting_probe.takes ("back\slash" int, "say ""cut""" int, m quoting_probe.marks, tone tone_types.tone);
      CREATE UNIQUE INDEX "idx\back" ON quoting_probe.takes ("back\slash");`);
    try {
      const probe = String.raw`
        import type * as s from 'zapatos/schema';
        export const mark: s.quoting_probe.takes.Selectable['m'] = 'back\\slash';
        export const trail: s.quoting_probe.takes.Selectable['m'] = 'trail\\';
        export const quoted: s.quoting_probe.takes.Selectable['m'] = "it's";
        // @ts-expect-error the backslash is part of the label
        export const lost: s.quoting_probe.takes.Selectable['m'] = 'backslash';
        export const column: s.quoting_probe.takes.Selectable['back\\slash'] = 1;
        export const said: s.quoting_probe.takes.Selectable['say "cut"'] = 1;
        // @ts-expect-error the backslash is part of the name
        export const lostColumn: s.quoting_probe.takes.Selectable['backslash'] = 1;
        export const index: s.quoting_probe.takes.UniqueIndex = 'idx\\back';
        // @ts-expect-error the backslash is part of the name
        export const lostIndex: s.quoting_probe.takes.UniqueIndex = 'idxback';
      `;
      const acrossSchemas = String.raw`
        export const tone: s.quoting_probe.takes.Insertable['tone'] = 'back\\slash';
        export const toneTrail: s.quoting_probe.takes.Insertable['tone'] = 'trail\\';
        export const toneQuoted: s.quoting_probe.takes.Insertable['tone'] = "it's";
        // @ts-expect-error the backslash is part of the label
        export const toneLost: s.quoting_probe.takes.Insertable['tone'] = 'backslash';
      `;
      expect.soft(await probeErrors({ schemas: { quoting_probe: all } }, probe)).toEqual([]);
      expect.soft(await probeErrors({ schemas: { quoting_probe: all }, typeEnumsAcrossSchemas: true }, probe + acrossSchemas))
        .toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA quoting_probe, tone_types CASCADE');
    }
  });

  it('awkward names compile, typed under their legal identifiers and keyed by their real names', async () => {
    await t.pool.query(String.raw`
      CREATE SCHEMA "probe-names";
      CREATE TYPE "probe-names"."as" AS ENUM ('a', 'b');
      CREATE TABLE "probe-names".keyof (s "probe-names"."as");
      CREATE TABLE "probe-names"."it's\here" ("back\slash" int, "say ""cut""" int);
      CREATE UNIQUE INDEX "idx\back" ON "probe-names"."it's\here" ("back\slash");`);
    try {
      expect(await probeErrors({ schemas: { 'probe-names': all } }, String.raw`
        import type * as s from 'zapatos/schema';
        export const str: s.probe_names.keyof_.Selectable['s'] = 'a';
        // @ts-expect-error not a label of "probe-names"."as"
        export const text: s.probe_names.keyof_.Selectable['s'] = 'some text';
        export const row: s.SelectableForTable<'probe-names.it\'s\\here'> = { 'back\\slash': 1, 'say "cut"': null };
        export const table: s.probe_names.it_s_here.Table = 'probe-names.it\'s\\here';
        export const index: s.probe_names.it_s_here.UniqueIndex = 'idx\\back';
        export const schema: s.Schema = 'probe-names';
      `)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA "probe-names" CASCADE');
    }
  });

  // 6.6.1's output, kept: TS2457 is a type-check error, which skipLibCheck hides, and the column is then
  // TypeScript's own type. Only a name whose output does not parse takes a legal identifier.
  it.each([false, true])("an enum named after one of TypeScript's own types keeps 6.6.1's output (skipLibCheck: %s)", async skipLibCheck => {
    await t.pool.query(`
      CREATE SCHEMA builtin_names;
      CREATE TYPE builtin_names."string" AS ENUM ('a');
      CREATE TYPE builtin_names."number" AS ENUM ('one');
      CREATE TABLE builtin_names.takes (s builtin_names."string", n builtin_names."number");`);
    try {
      const errors = await probeErrors({ schemas: { builtin_names: all } }, `
        import type * as s from 'zapatos/schema';
        export const text: s.builtin_names.takes.Selectable['s'] = 'some text';
        export const count: s.builtin_names.takes.Selectable['n'] = 1;
      `, { skipLibCheck });
      expect([...new Set(errors)].sort()).toEqual(skipLibCheck ? [] : [
        "schema.d.ts TS2457 Type alias name cannot be 'number'.",
        "schema.d.ts TS2457 Type alias name cannot be 'string'.",
      ]);
    } finally {
      await t.pool.query('DROP SCHEMA builtin_names CASCADE');
    }
  });

  // 6.6.1's keyof[] and readonly[] parse, as keyof [] and readonly [], which take none of the labels;
  // unique[] fails to compile without skipLibCheck (TS1005), and is `any` with it
  it('an array of an enum named after a type operator is typed by its labels', async () => {
    await t.pool.query(`
      CREATE SCHEMA array_ops;
      CREATE TYPE array_ops."keyof" AS ENUM ('a');
      CREATE TYPE array_ops."readonly" AS ENUM ('a');
      CREATE TYPE array_ops."unique" AS ENUM ('a');
      CREATE TABLE array_ops.takes (k array_ops."keyof"[], r array_ops."readonly"[], u array_ops."unique"[]);`);
    try {
      const { ts: schema } = await codegen({ schemas: { array_ops: all } });
      expect.soft(schema).toContain('k: keyof_[] | null;');
      expect.soft(schema).toContain('r: readonly_[] | null;');
      expect.soft(schema).toContain('u: unique_[] | null;');
      for (const skipLibCheck of [false, true]) expect.soft(await probeErrors({ schemas: { array_ops: all } }, `
        import type * as s from 'zapatos/schema';
        export const k: s.array_ops.takes.Selectable['k'] = ['a'];
        export const r: s.array_ops.takes.Selectable['r'] = ['a'];
        export const u: s.array_ops.takes.Selectable['u'] = ['a'];
        // @ts-expect-error an array's key, not a label
        export const key: s.array_ops.takes.Selectable['k'] = 'length';
        // @ts-expect-error not an array of labels
        export const text: s.array_ops.takes.Selectable['u'] = 'some text';
      `, { skipLibCheck })).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA array_ops CASCADE');
    }
  });

  // 6.6.1 imported zapatos/db for db.JSONValue alone: the other placeholders below failed with TS2503 or
  // TS2304, and under skipLibCheck typed their column `any`
  describe('a placeholder imports the db type or the enum it names', () => {
    beforeAll(() => t.pool.query(`
      CREATE SCHEMA placeholder_imports;
      CREATE TYPE placeholder_imports.genre AS ENUM ('comedy', 'drama');
      CREATE DOMAIN placeholder_imports.ticket_no AS bigint;
      CREATE DOMAIN placeholder_imports.takings AS numeric;
      CREATE DOMAIN placeholder_imports.show_time AS time;
      CREATE DOMAIN placeholder_imports.run_dates AS daterange;
      CREATE DOMAIN placeholder_imports.notes_list AS jsonb[];
      CREATE DOMAIN placeholder_imports.genre_d AS placeholder_imports.genre;
      CREATE DOMAIN placeholder_imports.genres_d AS placeholder_imports.genre[];
      CREATE DOMAIN placeholder_imports.title AS text;
      CREATE DOMAIN placeholder_imports.notes AS jsonb;
      CREATE TABLE placeholder_imports.sales (
        ticket_no placeholder_imports.ticket_no, takings placeholder_imports.takings,
        show_time placeholder_imports.show_time, run_dates placeholder_imports.run_dates,
        notes_list placeholder_imports.notes_list, genre placeholder_imports.genre_d,
        genres placeholder_imports.genres_d, title placeholder_imports.title, notes placeholder_imports.notes);
      -- enums that may name a global type: their placeholders compile, and keep 6.6.1's text
      CREATE SCHEMA placeholder_globals;
      CREATE TYPE placeholder_globals."Date" AS ENUM ('d');
      CREATE TYPE placeholder_globals."string" AS ENUM ('s');
      CREATE DOMAIN placeholder_globals.date_d AS placeholder_globals."Date";
      CREATE DOMAIN placeholder_globals.string_d AS placeholder_globals."string";
      CREATE TABLE placeholder_globals.takes (d placeholder_globals.date_d, s placeholder_globals.string_d);
    `));
    afterAll(() => t.pool.query('DROP SCHEMA placeholder_imports, placeholder_globals CASCADE'));

    const sales = { schemas: { placeholder_imports: all } };
    const placeholder = (module: string, imports: string[], type: string) => `/*
** Please edit this file as needed **
It's been generated by Zapatos as a custom type definition placeholder, and won't be overwritten
*/

declare module '${module}/custom' {
${imports.map(line => `  ${line}\n`).join('')}  export type ${type};  // replace with your custom type or interface as desired
}
`;

    /** The text and the import of the placeholders `names`, the relations of `schemas` read in each order in turn. */
    const placeholdersInEveryOrder = async (schemas: string[], config: Config, names: string[]) => {
      const
        q = (query: pg.QueryConfig) => t.pool.query(query),
        relations = (await Promise.all(schemas.map(async schema =>
          (await relationsInSchema(schema, q)).map(rel => ({ rel, schema, enums: enumDataForSchema(schema, q) })))))
          .flat(),
        orders = (list: typeof relations): (typeof relations)[] => list.length <= 1 ? [list] :
          list.flatMap((first, i) => orders(list.filter((_, j) => j !== i)).map(rest => [first, ...rest])),
        complete = finaliseConfig({ ...quiet, ...config }),
        read: Record<string, Record<string, { type: string; imports: string | null }>> = {};
      for (const order of orders(relations)) {
        // shared across the relations, as tsForConfig shares them
        const customTypes = Object.create(null), origins = Object.create(null), customTypeImports = Object.create(null);
        for (const { rel, schema, enums } of order) await definitionForRelationInSchema(
          rel, schema, await enums, customTypes, complete, q, origins, undefined, undefined, customTypeImports);
        read[order.map(r => `${r.schema}.${r.rel.name}`).join(', ')] = Object.fromEntries(names.map(name =>
          [name, { type: customTypes[name], imports: customTypeImports[name] || null }]));
      }
      return read;
    };

    /** The same read for every order, and there are `count` of them. */
    const expectInEveryOrder = (read: Awaited<ReturnType<typeof placeholdersInEveryOrder>>, count: number,
      expected: Record<string, { type: string; imports: string | null }>) => {
      expect(Object.keys(read)).toHaveLength(count);
      expect(read).toEqual(Object.fromEntries(Object.keys(read).map(order => [order, expected])));
    };

    it.each([
      ['in a schema of its own', sales, 'zapatos', 'placeholder_imports', 'placeholder_imports.genre'],
      ['in unprefixedSchema', { ...sales, unprefixedSchema: 'placeholder_imports' }, 'zapatos', 'genre', 'genre'],
      ["with moduleNames: 'pgcast'", { ...sales, moduleNames: 'pgcast' as const }, 'pgcast', 'placeholder_imports', 'placeholder_imports.genre'],
    ])('%s', async (_, config: Config, names, imported, genre) => {
      const
        { customTypeSourceFiles: files } = await codegen(config),
        db = `import type * as db from '${names}/db';`,
        schema = `import type { ${imported} } from '${names}/schema';`;
      expect.soft(files.PgTicket_no).toBe(placeholder(names, [db], 'PgTicket_no = db.Int8String'));
      expect.soft(files.PgTakings).toBe(placeholder(names, [db], 'PgTakings = db.NumericString'));
      expect.soft(files.PgShow_time).toBe(placeholder(names, [db], 'PgShow_time = db.TimeString'));
      expect.soft(files.PgRun_dates).toBe(placeholder(names, [db], 'PgRun_dates = db.DateRangeString'));
      expect.soft(files.PgNotes_list).toBe(placeholder(names, [db], 'PgNotes_list = db.JSONValue[]'));
      expect.soft(files.PgGenre_d).toBe(placeholder(names, [schema], `PgGenre_d = ${genre}`));
      expect.soft(files.PgGenres_d).toBe(placeholder(names, [schema], `PgGenres_d = ${genre}[]`));
      // as before
      expect.soft(files.PgTitle).toBe(placeholder(names, [], 'PgTitle = string'));
      expect.soft(files.PgNotes).toBe(placeholder(names, [db], 'PgNotes = db.JSONValue'));

      const table = config.unprefixedSchema === 'placeholder_imports' ? 's.sales' : 's.placeholder_imports.sales';
      expect(await probeErrors(config, `
        import type * as s from '${names}/schema';
        type Sale = ${table}.Selectable;
        export const ticket: Sale['ticket_no'] = '1';
        // @ts-expect-error a number is not a db.Int8String
        export const ticketNumber: Sale['ticket_no'] = 1;
        export const takings: Sale['takings'] = '1.50';
        export const showTime: Sale['show_time'] = '20:30:00';
        export const runDates: Sale['run_dates'] = '[2026-01-01,2026-02-01)';
        export const notesList: Sale['notes_list'] = [{ cut: 'final' }];
        export const genre: Sale['genre'] = 'drama';
        // @ts-expect-error not a label of genre
        export const western: Sale['genre'] = 'western';
        export const genres: Sale['genres'] = ['comedy'];
        // @ts-expect-error not an array of labels
        export const genreList: Sale['genres'] = ['western'];
      `)).toEqual([]);
    });

    it("leaves an enum whose name may be a global type as 6.6.1 wrote it, prefixed or not", async () => {
      for (const unprefixedSchema of ['public', 'placeholder_globals']) {
        const { customTypeSourceFiles: files } = await codegen({ schemas: { placeholder_globals: all }, unprefixedSchema });
        expect.soft(files.PgDate_d).toBe(placeholder('zapatos', [], 'PgDate_d = Date'));
        expect.soft(files.PgString_d).toBe(placeholder('zapatos', [], 'PgString_d = string'));
      }
    });

    it('with typeEnumsAcrossSchemas, still imports an enum that only its own schema uses', async () => {
      const { customTypeSourceFiles: files } = await codegen({ ...sales, typeEnumsAcrossSchemas: true });
      const schema = `import type { placeholder_imports } from 'zapatos/schema';`;
      expect.soft(files.PgGenre_d).toBe(placeholder('zapatos', [schema], 'PgGenre_d = placeholder_imports.genre'));
      expect.soft(files.PgGenres_d).toBe(placeholder('zapatos', [schema], 'PgGenres_d = placeholder_imports.genre[]'));
    });

    // with typeEnumsAcrossSchemas off, each relation reads `genre` in its own schema: an import would type one
    // of them with the other's labels, and its text would hang on which relation is read last
    describe('a domain whose relations would import different enums', () => {
      beforeAll(() => t.pool.query(`
        CREATE SCHEMA placeholder_home;
        CREATE SCHEMA placeholder_archive;
        CREATE TYPE placeholder_home.genre AS ENUM ('comedy', 'drama');
        CREATE TYPE placeholder_archive.genre AS ENUM ('silent');
        CREATE DOMAIN placeholder_home.genre_d AS placeholder_home.genre;
        CREATE DOMAIN placeholder_home.genres_d AS placeholder_home.genre[];
        CREATE TABLE placeholder_home.films (genre placeholder_home.genre_d, genres placeholder_home.genres_d);
        CREATE TABLE placeholder_home.shorts (genre placeholder_home.genre_d, genres placeholder_home.genres_d);
        CREATE TABLE placeholder_archive.reels (genre placeholder_home.genre_d, genres placeholder_home.genres_d);
      `));
      afterAll(() => t.pool.query('DROP SCHEMA placeholder_home, placeholder_archive CASCADE'));

      const
        unprefixed = ['placeholder_home', 'placeholder_archive', null],
        bothOrders = [
          { placeholder_home: all, placeholder_archive: all }, { placeholder_archive: all, placeholder_home: all },
        ],
        homeAndArchive = ['placeholder_home', 'placeholder_archive'];

      it.each(unprefixed)("keeps 6.6.1's text, with no import, unprefixedSchema %s", async unprefixedSchema => {
        for (const schemas of bothOrders) {
          const { customTypeSourceFiles: files } = await codegen({ schemas, unprefixedSchema });
          expect(files.PgGenre_d).toBe(placeholder('zapatos', [], 'PgGenre_d = genre'));
        }
      });

      it.each(unprefixed)('in whichever order the relations are read, unprefixedSchema %s', async unprefixedSchema => {
        expectInEveryOrder(await placeholdersInEveryOrder(homeAndArchive, { unprefixedSchema }, ['PgGenre_d']), 6,
          { PgGenre_d: { type: 'genre', imports: null } });
      });

      // with it, every relation reads placeholder_home.genre: the labels written out for placeholder_archive.reels
      // type them all, and placeholder_home's relations, which name the enum, never replace them
      describe('with typeEnumsAcrossSchemas', () => {
        const labels = "('comedy' | 'drama')";

        it.each(unprefixed)('writes the labels, with no import, unprefixedSchema %s', async unprefixedSchema => {
          for (const schemas of bothOrders) {
            const { customTypeSourceFiles: files } =
              await codegen({ schemas, unprefixedSchema, typeEnumsAcrossSchemas: true });
            expect.soft(files.PgGenre_d).toBe(placeholder('zapatos', [], `PgGenre_d = ${labels}`));
            expect.soft(files.PgGenres_d).toBe(placeholder('zapatos', [], `PgGenres_d = ${labels}[]`));
          }
          const reels = unprefixedSchema === 'placeholder_archive' ? 's.reels' : 's.placeholder_archive.reels';
          expect(await probeErrors({ schemas: bothOrders[0], unprefixedSchema, typeEnumsAcrossSchemas: true }, `
            import type * as s from 'zapatos/schema';
            export const genre: ${reels}.Selectable['genre'] = 'drama';
            // @ts-expect-error not a label of placeholder_home.genre
            export const western: ${reels}.Selectable['genre'] = 'western';
            export const genres: ${reels}.Selectable['genres'] = ['comedy'];
            // @ts-expect-error not an array of its labels
            export const silent: ${reels}.Selectable['genres'] = ['silent'];
          `)).toEqual([]);
        });

        it.each(unprefixed)('in whichever order the relations are read, unprefixedSchema %s', async unprefixedSchema => {
          const config = { unprefixedSchema, typeEnumsAcrossSchemas: true };
          expectInEveryOrder(await placeholdersInEveryOrder(homeAndArchive, config, ['PgGenre_d', 'PgGenres_d']), 6,
            { PgGenre_d: { type: labels, imports: null }, PgGenres_d: { type: `${labels}[]`, imports: null } });
        });
      });

      // 6.6.1 wrote genre or any, by which of the relations it read last
      describe('and by a relation of a schema with no genre', () => {
        beforeAll(() => t.pool.query(`
          CREATE SCHEMA placeholder_shelf;
          CREATE TABLE placeholder_shelf.cans (genre placeholder_home.genre_d, genres placeholder_home.genres_d);
        `));
        afterAll(() => t.pool.query('DROP SCHEMA placeholder_shelf CASCADE'));

        it.each(unprefixed)('gets any, with no import, in whichever order the relations are read, unprefixedSchema %s',
          async unprefixedSchema => {
            expectInEveryOrder(await placeholdersInEveryOrder([...homeAndArchive, 'placeholder_shelf'], { unprefixedSchema },
              ['PgGenre_d', 'PgGenres_d']), 24, { PgGenre_d: { type: 'any', imports: null }, PgGenres_d: { type: 'any', imports: null } });
          });
      });
    });

    // without typeEnumsAcrossSchemas, a relation of placeholder_lending finds no genre in its schema and reads the
    // domain as `any`; 6.6.1 wrote genre or any, by which relation it read last
    describe('a domain that a relation of a schema with no enum of that name uses too', () => {
      beforeAll(() => t.pool.query(`
        CREATE SCHEMA placeholder_lending;
        CREATE TABLE placeholder_lending.loans (genre placeholder_imports.genre_d, genres placeholder_imports.genres_d);
      `));
      afterAll(() => t.pool.query('DROP SCHEMA placeholder_lending CASCADE'));

      const unprefixed = ['placeholder_imports', 'placeholder_lending', null];

      it.each(unprefixed)('gets any, with no import, in whichever order the relations are read, unprefixedSchema %s',
        async unprefixedSchema => {
          expectInEveryOrder(await placeholdersInEveryOrder(['placeholder_imports', 'placeholder_lending'],
            { unprefixedSchema }, ['PgGenre_d', 'PgGenres_d']), 2,
          { PgGenre_d: { type: 'any', imports: null }, PgGenres_d: { type: 'any', imports: null } });
          for (const schemas of [
            { placeholder_imports: all, placeholder_lending: all }, { placeholder_lending: all, placeholder_imports: all },
          ]) {
            const { customTypeSourceFiles: files } = await codegen({ schemas, unprefixedSchema });
            expect.soft(files.PgGenre_d).toBe(placeholder('zapatos', [], 'PgGenre_d = any'));
            expect.soft(files.PgGenres_d).toBe(placeholder('zapatos', [], 'PgGenres_d = any'));
          }
        });
    });

    // two domains named code_d, each over an enum, which placeholder_reels_a reads as `mood` and `any`: one
    // placeholder (#42), which 6.6.1 gave the column read last, by name
    it('leaves two types of one name in one relation as 6.6.1 wrote them', async () => {
      await t.pool.query(`
        CREATE SCHEMA placeholder_reels_a;
        CREATE SCHEMA placeholder_reels_b;
        CREATE TYPE placeholder_reels_a.mood AS ENUM ('tense');
        CREATE TYPE placeholder_reels_b.feel AS ENUM ('calm');
        CREATE DOMAIN placeholder_reels_a.code_d AS placeholder_reels_a.mood;
        CREATE DOMAIN placeholder_reels_b.code_d AS placeholder_reels_b.feel;
        CREATE TABLE placeholder_reels_a.mixed (a placeholder_reels_b.code_d, b placeholder_reels_a.code_d);
      `);
      try {
        const { customTypeSourceFiles: files } = await codegen({ schemas: { placeholder_reels_a: all } });
        expect(files.PgCode_d).toBe(placeholder('zapatos', [], 'PgCode_d = mood'));
      } finally {
        await t.pool.query('DROP SCHEMA placeholder_reels_a, placeholder_reels_b CASCADE');
      }
    });

    // with typeEnumsAcrossSchemas, the relation of the enum's schema names it `string`, TypeScript's own type, and
    // imports nothing, as the relation that writes its labels out: their text differs, not their import
    describe('a domain over an enum that may name a global type, used by a relation of another schema', () => {
      beforeAll(() => t.pool.query(`
        CREATE SCHEMA placeholder_loans;
        CREATE TABLE placeholder_loans.takes (d placeholder_globals.date_d, s placeholder_globals.string_d);
      `));
      afterAll(() => t.pool.query('DROP SCHEMA placeholder_loans CASCADE'));

      it.each(['placeholder_globals', 'placeholder_loans', null])(
        'gets the labels with typeEnumsAcrossSchemas, in whichever order the relations are read, unprefixedSchema %s',
        async unprefixedSchema => {
          const config = { unprefixedSchema, typeEnumsAcrossSchemas: true };
          expectInEveryOrder(await placeholdersInEveryOrder(['placeholder_globals', 'placeholder_loans'], config,
            ['PgDate_d', 'PgString_d']), 2,
          { PgDate_d: { type: "'d'", imports: null }, PgString_d: { type: "'s'", imports: null } });
          for (const schemas of [
            { placeholder_globals: all, placeholder_loans: all }, { placeholder_loans: all, placeholder_globals: all },
          ]) {
            const { customTypeSourceFiles: files } = await codegen({ ...config, schemas });
            expect.soft(files.PgDate_d).toBe(placeholder('zapatos', [], `PgDate_d = 'd'`));
            expect.soft(files.PgString_d).toBe(placeholder('zapatos', [], `PgString_d = 's'`));
          }
        });

      // without it, placeholder_loans finds no "Date" nor "string" in its schema: 6.6.1 wrote Date and string, or any
      it.each(['placeholder_globals', 'placeholder_loans', null])(
        'gets any without typeEnumsAcrossSchemas, in whichever order the relations are read, unprefixedSchema %s',
        async unprefixedSchema => {
          expectInEveryOrder(await placeholdersInEveryOrder(['placeholder_globals', 'placeholder_loans'],
            { unprefixedSchema }, ['PgDate_d', 'PgString_d']), 2,
          { PgDate_d: { type: 'any', imports: null }, PgString_d: { type: 'any', imports: null } });
          for (const schemas of [
            { placeholder_globals: all, placeholder_loans: all }, { placeholder_loans: all, placeholder_globals: all },
          ]) {
            const { customTypeSourceFiles: files } = await codegen({ schemas, unprefixedSchema });
            expect.soft(files.PgDate_d).toBe(placeholder('zapatos', [], 'PgDate_d = any'));
            expect.soft(files.PgString_d).toBe(placeholder('zapatos', [], 'PgString_d = any'));
          }
        });
    });
  });

  describe('intervalsTypedAsObjects, compiled (#499)', () => {
    const config = { schemas: { extra: only('type_zoo') } };

    /** extra.type_zoo.c_interval: `asObjects` before what only the option lets through, `asText` before what only its absence does. */
    const intervalProbe = (asObjects: string, asText: string) => `
      import * as db from 'zapatos/db';
      import type * as s from 'zapatos/schema';
      declare const client: db.Queryable;
      export const probe = async () => {
        const [row] = await db.sql<s.extra.type_zoo.SQL, s.extra.type_zoo.Selectable[]>\`SELECT * FROM \${'extra.type_zoo'}\`.run(client);
        const json = await db.selectExactlyOne('extra.type_zoo', { id: 1 }).run(client);
        const read = row!.c_interval!;
        // the shortcuts' JSON: the text, either way
        json.c_interval satisfies string | null;
        ${asObjects} Selectable: pg's object
        row!.c_interval satisfies db.PostgresInterval | null;
        ${asObjects} one of its parts
        read.days satisfies number | undefined;
        ${asText} the text, which pg returns only with a type parser of your own
        row!.c_interval satisfies string | null;
        // written back as it was read, either way: Postgres takes the object through toPostgres()
        db.insert('extra.type_zoo', { c_interval: read });
        db.update('extra.type_zoo', { c_interval: read }, { id: 1 });
        db.select('extra.type_zoo', { c_interval: read });
        // the text, either way
        db.insert('extra.type_zoo', { c_interval: '1 day' });
        // @ts-expect-error a plain object, which Postgres refuses (22007), either way
        db.insert('extra.type_zoo', { c_interval: { days: 1 } });
        // @ts-expect-error in an update too
        db.update('extra.type_zoo', { c_interval: { days: 1 } }, { id: 1 });
        // @ts-expect-error and in a filter
        db.select('extra.type_zoo', { c_interval: { days: 1 } });
      };`;

    it('types Selectable as pg parses it, takes it back in a write, and refuses a plain object', async () => {
      expect(await probeErrors({ ...config, intervalsTypedAsObjects: true }, intervalProbe('//', '// @ts-expect-error')))
        .toEqual([]);
    });

    it.each([undefined, false])('is the text in all five, as in Zapatos 6.6.1 (intervalsTypedAsObjects: %s)', async key => {
      const keyed = { ...config, ...key === undefined ? {} : { intervalsTypedAsObjects: key } };
      expect(await probeErrors(keyed, intervalProbe('// @ts-expect-error', '//'))).toEqual([]);
    });

    it('each refusal of one probe is an unused directive in the other', async () => {
      const both = intervalProbe('// @ts-expect-error', '// @ts-expect-error');
      const unused = "probe.ts TS2578 Unused '@ts-expect-error' directive.";
      expect(await probeErrors({ ...config, intervalsTypedAsObjects: true }, both)).toEqual(Array(2).fill(unused));
      expect(await probeErrors(config, both)).toEqual([unused]);
    });
  });

  it('holds no orphan file', () => {
    const expected = variants.flatMap(([name]) =>
      withoutCustomTypes.includes(name) ? [`${name}.d.ts`] : [`${name}.custom.d.ts`, `${name}.d.ts`]);
    expect(readdirSync(snapshotPath).sort()).toEqual(expected.sort());
  });
});

describe('surprises, frozen as they are', () => {
  it('drops COMMENT ON of tables, views, schemas and types', async () => {
    const { ts: schema } = await codegen(main);
    for (const comment of [
      'People who can sign in', 'Users not currently sad', 'Balances per owner, refreshed on demand',
      'Second application schema', 'How a user feels', 'Case-insensitive e-mail address',
    ]) expect(schema).not.toContain(comment);
  });

  it('src/db type-checks against the stub schema of src/typings, not against a generated one', () => {
    // test/generated/tsconfig.json, with 'zapatos/db' read from the sources instead of their declarations
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const configPath = join(generatedDir, 'tsconfig.json');
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, generatedDir);
    const program = ts.createProgram(fileNames, { ...options, paths: { 'zapatos/db': [join(root, 'src/db')] } });
    const errors = ts.getPreEmitDiagnostics(program).map(d => `${relative(root, d.file!.fileName)} TS${d.code}`);
    expect([...new Set(errors)]).toMatchInlineSnapshot(`
      [
        "src/db/shortcuts.ts TS7053",
        "src/db/shortcuts.ts TS2345",
      ]
    `);
  });
});

describe('UniqueIndex', () => {
  it("lists only the table's own unique indexes", async () => {
    const { ts: schema } = await codegen(main);
    // shared_name_idx is unique on extra.articles, and a plain index on public.transfers
    expect(tableBlock(schema, 'articles')).toContain(`export type UniqueIndex = 'articles_pkey' | 'shared_name_idx';`);
    expect(tableBlock(schema, 'transfers')).toContain(`export type UniqueIndex = 'transfers_pkey';`);
  });

  it('keeps a name that unique constraints of two schemas share, for each', async () => {
    // tsForConfig() reads through its own connection: the schemas are committed, then dropped
    await t.pool.query(`
      CREATE SCHEMA shared_a; CREATE SCHEMA shared_b; CREATE SCHEMA shared_c;
      CREATE TABLE shared_a.items_a (k int, CONSTRAINT shared_key UNIQUE (k));
      CREATE TABLE shared_b.items_b (k int, CONSTRAINT shared_key UNIQUE (k));
      CREATE TABLE shared_c.items_c (k int);
      CREATE INDEX shared_key ON shared_c.items_c (k);`);
    try {
      const { ts: schema } = await codegen({ schemas: { shared_a: all, shared_b: all, shared_c: all } });
      expect(tableBlock(schema, 'items_a')).toContain(`export type UniqueIndex = 'shared_key';`);
      expect(tableBlock(schema, 'items_b')).toContain(`export type UniqueIndex = 'shared_key';`);
      expect(tableBlock(schema, 'items_c')).toContain('export type UniqueIndex = never;');  // a plain index
    } finally {
      await t.pool.query('DROP SCHEMA shared_a, shared_b, shared_c CASCADE');
    }
  });

  it("gives a partition in another schema than its parent's the unique indexes the catalog gives it", async () => {
    await t.pool.query(`
      CREATE SCHEMA part_a; CREATE SCHEMA part_b;
      CREATE TABLE part_a.events (id int, k int, CONSTRAINT events_k_key UNIQUE (k, id)) PARTITION BY RANGE (id);
      CREATE TABLE part_b.events_1 PARTITION OF part_a.events FOR VALUES FROM (0) TO (100);
      CREATE TABLE part_b.events_2 (id int, k int);
      CREATE UNIQUE INDEX events_2_own ON part_b.events_2 (k, id);
      ALTER TABLE part_a.events ATTACH PARTITION part_b.events_2 FOR VALUES FROM (100) TO (200);
      CREATE TABLE part_b.events_3 (id int, k int);
      CREATE UNIQUE INDEX events_k_key ON part_b.events_3 (k, id);  -- the parent's name, in the partition's schema
      ALTER TABLE part_a.events ATTACH PARTITION part_b.events_3 FOR VALUES FROM (200) TO (300);`);
    try {
      const { ts: schema } = await codegen({ schemas: { part_a: all, part_b: all } });
      const { rows } = await t.pool.query<{ relname: string; names: string[] }>(`
        SELECT c.relname, coalesce(array_agg(i.relname::text ORDER BY i.relname) FILTER (WHERE i.oid IS NOT NULL), '{}') AS names
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_index x ON x.indrelid = c.oid AND x.indisunique
        LEFT JOIN pg_class i ON i.oid = x.indexrelid
        WHERE n.nspname IN ('part_a', 'part_b') AND c.relkind IN ('r', 'p')
        GROUP BY c.relname`);
      const fromCatalog = Object.fromEntries(rows.map(r => [r.relname, r.names.map(n => `'${n}'`).join(' | ') || 'never']));
      const generated = Object.fromEntries(rows.map(r =>
        [r.relname, /export type UniqueIndex = (.*);/.exec(tableBlock(schema, r.relname))?.[1]]));
      expect(generated).toEqual(fromCatalog);
      expect(fromCatalog).toEqual({
        events: "'events_k_key'",
        events_1: "'events_1_k_id_key'",
        // attached: its own unique index, and the one Postgres adds for the parent's constraint
        events_2: "'events_2_k_id_key' | 'events_2_own'",
        events_3: "'events_3_k_id_key' | 'events_k_key'",
      });
    } finally {
      await t.pool.query('DROP SCHEMA part_a, part_b CASCADE');
    }
  });
});

describe('uniqueIndexConstraintsOnly', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  let version = 0;
  beforeAll(async () => {
    ({ rows: [{ version }] } = await t.pool.query("SELECT current_setting('server_version_num')::int AS version"));
    await t.pool.query(`
      CREATE SCHEMA arb;
      CREATE TABLE arb.items (
        id int PRIMARY KEY, sku text, code text, slug text, title text, a int, b int,
        deleted boolean NOT NULL DEFAULT false, during int4range,
        CONSTRAINT items_sku_key UNIQUE (sku),
        CONSTRAINT items_ab_key UNIQUE (a, b) DEFERRABLE,
        CONSTRAINT items_during_excl EXCLUDE USING gist (during WITH &&));
      CREATE UNIQUE INDEX items_code_idx ON arb.items (code);
      CREATE UNIQUE INDEX items_slug_live_idx ON arb.items (slug) WHERE NOT deleted;
      CREATE UNIQUE INDEX items_title_lower_idx ON arb.items (lower(title));
      -- a foreign key's conindid is items_pkey, of another table
      CREATE TABLE arb.item_notes (item_id int REFERENCES arb.items, note text);
      CREATE TABLE arb.renamed (id int, CONSTRAINT renamed_old_key UNIQUE (id));
      ALTER INDEX arb.renamed_old_key RENAME TO renamed_new_key;  -- the constraint takes the new name
      CREATE TABLE arb.parts (id int, k int, CONSTRAINT parts_id_k_key UNIQUE (id, k)) PARTITION BY LIST (k);
      CREATE TABLE arb.parts_1 PARTITION OF arb.parts FOR VALUES IN (1);
      -- the documented way to build a partitioned table's constraint: invalid until each partition's index is attached
      CREATE TABLE arb.halves (id int, k int) PARTITION BY LIST (k);
      CREATE TABLE arb.halves_1 PARTITION OF arb.halves FOR VALUES IN (1);
      ALTER TABLE ONLY arb.halves ADD CONSTRAINT halves_id_k_key UNIQUE (id, k);
      CREATE TABLE arb.dupes (id int);
      INSERT INTO arb.dupes VALUES (1), (1);
      CREATE MATERIALIZED VIEW arb.item_counts AS SELECT 1 AS id;
      CREATE UNIQUE INDEX item_counts_id_key ON arb.item_counts (id);` +
      (version >= 150000 ? `CREATE TABLE arb.nnd (id int, CONSTRAINT nnd_id_key UNIQUE NULLS NOT DISTINCT (id));` : '') +
      // an exclusion constraint to Postgres, whose index is unique: range columns, so no btree_gist
      (version >= 180000 ? `CREATE TABLE arb.spans (id int4range, valid daterange, CONSTRAINT spans_pkey PRIMARY KEY (id, valid WITHOUT OVERLAPS));` : ''));
    // a failed CREATE UNIQUE INDEX CONCURRENTLY leaves its index behind, invalid; outside a transaction block
    await t.pool.query('CREATE UNIQUE INDEX CONCURRENTLY dupes_id_idx ON arb.dupes (id)')
      .then(() => { throw new Error('dupes_id_idx was built'); }, (e: pg.DatabaseError) => { if (e.code !== '23505') throw e; });
  });
  afterAll(() => t.pool.query('DROP SCHEMA arb CASCADE'));

  const arb = { schemas: { arb: all }, schemaJSDoc: false };
  const notesFor = async (config: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => w.includes('uniqueIndexConstraintsOnly'));
  };
  /** Each relation's `UniqueIndex`, as written: a relation's namespace starts with its `Table`, a schema's doesn't. */
  const uniqueIndexes = async (config: Config) => {
    const { ts: schema } = await codegen(config);
    return Object.fromEntries([...schema.matchAll(
      /export namespace (\w+) \{\s*export type Table = [^;]*;[^]*?export type UniqueIndex = ([^;]*);/g)]
      .map(([, rel, type]) => [rel, type]));
  };
  /** By version: the relation that Postgres 15 and 18 add, and its `UniqueIndex`. */
  const gated = (nnd: string, spans: string) => ({
    ...version >= 150000 ? { nnd } : {},
    ...version >= 180000 ? { spans } : {},
  });

  it('is off by default: UniqueIndex lists every unique index, as in Zapatos 6.6.1', async () => {
    expect(await uniqueIndexes(arb)).toEqual({
      dupes: "'dupes_id_idx'",
      halves: "'halves_id_k_key'",
      halves_1: 'never',
      item_counts: "'item_counts_id_key'",
      item_notes: 'never',
      items: "'items_ab_key' | 'items_code_idx' | 'items_pkey' | 'items_sku_key' | 'items_slug_live_idx' | 'items_title_lower_idx'",
      parts: "'parts_id_k_key'",
      parts_1: "'parts_1_id_k_key'",
      renamed: "'renamed_new_key'",
      ...gated("'nnd_id_key'", "'spans_pkey'"),
    });
  });

  it('lists only the non-deferrable UNIQUE and PRIMARY KEY constraints', async () => {
    expect(await uniqueIndexes({ ...arb, uniqueIndexConstraintsOnly: true })).toEqual({
      dupes: 'never',
      halves: 'never',
      halves_1: 'never',
      item_counts: 'never',
      item_notes: 'never',
      items: "'items_pkey' | 'items_sku_key'",
      parts: "'parts_id_k_key'",
      parts_1: "'parts_1_id_k_key'",
      renamed: "'renamed_new_key'",
      ...gated("'nnd_id_key'", 'never'),
    });
  });

  it('keeps each name that ON CONFLICT ON CONSTRAINT takes, and only them, as Postgres answers', async () => {
    const answers: Record<string, string | null> = {}, nothing: Record<string, string | null> = {};
    const off = await uniqueIndexes(arb);
    // a row, since Postgres refuses a deferrable arbiter only once it inserts one
    const rows: Record<string, string> = {
      parts: '(id, k) VALUES (1, 1)', parts_1: '(id, k) VALUES (1, 1)', halves: '(id, k) VALUES (1, 1)',
      spans: "(id, valid) VALUES ('[1,2)', '[2026-01-01,2026-02-01)')",
    };
    for (const [rel, type] of Object.entries(off)) {
      for (const name of type === 'never' ? [] : type.slice(1, -1).split("' | '")) {
        for (const [into, action] of [[answers, 'DO UPDATE SET id = EXCLUDED.id'], [nothing, 'DO NOTHING']] as const) {
          await t.client.query('SAVEPOINT arbiter');
          try {
            await t.client.query(`INSERT INTO arb.${rel} ${rows[rel] ?? '(id) VALUES (1)'} ON CONFLICT ON CONSTRAINT ${name} ${action}`);
            into[name] = null;
          } catch (e) {
            into[name] = (e as pg.DatabaseError).code!;
          }
          await t.client.query('ROLLBACK TO SAVEPOINT arbiter');
        }
      }
    }
    expect(answers).toEqual({
      dupes_id_idx: '42704',  // an index left by a failed CREATE UNIQUE INDEX CONCURRENTLY, with no constraint
      halves_id_k_key: '42P10',  // there is no unique or exclusion constraint matching the ON CONFLICT specification
      item_counts_id_key: '42704',  // a materialised view has no constraint
      items_ab_key: '55000',  // ON CONFLICT does not support deferrable unique constraints
      items_code_idx: '42704',  // constraint "items_code_idx" for table "items" does not exist
      items_pkey: null,
      items_sku_key: null,
      items_slug_live_idx: '42704',
      items_title_lower_idx: '42704',
      parts_id_k_key: null,
      parts_1_id_k_key: null,
      renamed_new_key: null,
      ...version >= 150000 ? { nnd_id_key: null } : {},
      ...version >= 180000 ? { spans_pkey: '42809' } : {},  // ON CONFLICT DO UPDATE not supported with exclusion constraints
    });
    // DO NOTHING refuses each of them with the same code, and takes a WITHOUT OVERLAPS key, as any exclusion constraint
    expect(nothing).toEqual({ ...answers, ...version >= 180000 ? { spans_pkey: null } : {} });
    const on = Object.values(await uniqueIndexes({ ...arb, uniqueIndexConstraintsOnly: true }))
      .flatMap(type => type === 'never' ? [] : type.slice(1, -1).split("' | '"));
    expect(on.sort()).toEqual(Object.keys(answers).filter(name => answers[name] === null).sort());
  });

  it('lists no exclusion constraint, on or off: Postgres takes one only with DO NOTHING', async () => {
    const update = `INSERT INTO arb.items (id) SELECT 1 WHERE false ON CONFLICT ON CONSTRAINT items_during_excl DO UPDATE SET id = 1`;
    expect(await pgError(t.client, () => t.client.query(update)))
      .toEqual({ code: '42809', message: 'ON CONFLICT DO UPDATE not supported with exclusion constraints' });
    for (const on of [false, true]) {
      expect((await uniqueIndexes({ ...arb, uniqueIndexConstraintsOnly: on })).items).not.toContain('items_during_excl');
    }
  });

  it('is off by default, with one note per run that names each unique index it would leave out', async () => {
    expect(await notesFor(arb)).toEqual([
      'Note: UniqueIndex lists arb.dupes.dupes_id_idx, arb.halves.halves_id_k_key, ' +
      'arb.item_counts.item_counts_id_key, arb.items.items_ab_key, arb.items.items_code_idx, ' +
      'arb.items.items_slug_live_idx' + (version >= 180000 ? ', arb.items.items_title_lower_idx and arb.spans.spans_pkey' :
        ' and arb.items.items_title_lower_idx') +
      ', unique indexes of no UNIQUE or PRIMARY KEY constraint, of a DEFERRABLE or WITHOUT OVERLAPS one, or not yet valid: ' +
      'db.constraint() takes them, and Postgres refuses them in ON CONFLICT ON CONSTRAINT ... DO UPDATE, and in ' +
      '... DO NOTHING except a WITHOUT OVERLAPS key. ' +
      'Set uniqueIndexConstraintsOnly: true to leave them out; it will be the default in pgcast 7.0.',
    ]);
    expect(await notesFor({ schemas: { extra: only('articles') } })).toEqual([
      'Note: UniqueIndex lists extra.articles.shared_name_idx, a unique index of no UNIQUE or PRIMARY KEY constraint, ' +
      'of a DEFERRABLE or WITHOUT OVERLAPS one, or not yet valid: db.constraint() takes it, and Postgres refuses it in ' +
      'ON CONFLICT ON CONSTRAINT ... DO UPDATE, and in ... DO NOTHING except a WITHOUT OVERLAPS key. ' +
      'Set uniqueIndexConstraintsOnly: true to leave it out; ' +
      'it will be the default in pgcast 7.0.',
    ]);
  });

  it('gives no note with the option on, or when no unique index would be left out', async () => {
    expect(await notesFor({ ...arb, uniqueIndexConstraintsOnly: true })).toEqual([]);
    expect(await notesFor({ ...main, uniqueIndexConstraintsOnly: true })).toEqual([]);
    expect(await notesFor({ schemas: { public: only('users', 'accounts') } })).toEqual([]);
  });

  it('leaves the output as it was without the option, or with false', async () => {
    const { ts: absent } = await codegen(main);
    expect((await codegen({ ...main, uniqueIndexConstraintsOnly: false })).ts).toBe(absent);
    expect(absent).toBe(readFileSync(join(generatedDir, 'zapatos/schema.d.ts'), 'utf8'));
  });

  it('is optional in Config, read as false when absent', () => {
    expect(finaliseConfig({}).uniqueIndexConstraintsOnly).toBeUndefined();
    const right: Config = { uniqueIndexConstraintsOnly: true };
    void right;
    // @ts-expect-error a boolean
    const wrong: Config = { uniqueIndexConstraintsOnly: 'yes' };
    void wrong;
  });
});

describe('domainsTypedByContext', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA ctx;
    CREATE DOMAIN ctx.ticket_no AS bigint;
    CREATE DOMAIN ctx.amount AS numeric(12, 2);
    CREATE DOMAIN ctx.release_day AS date;
    CREATE DOMAIN ctx.local_ts AS timestamp;
    CREATE DOMAIN ctx.starts AS timestamptz;
    CREATE DOMAIN ctx.blob AS bytea;
    CREATE DOMAIN ctx.cost AS money;
    CREATE DOMAIN ctx.ticket_nos AS bigint[];
    -- typed alike in every context, or any: nothing to change
    CREATE DOMAIN ctx.label AS text;
    CREATE DOMAIN ctx.minutes AS int4;
    CREATE DOMAIN ctx.notes AS jsonb;
    CREATE TYPE ctx.genre AS ENUM ('comedy', 'drama');
    CREATE DOMAIN ctx.genre_d AS ctx.genre;
    -- a domain over a domain, and an array of a domain, any as generated: information_schema gives the inner domain
    -- as the udt of the first, the array type of the second (#484)
    CREATE DOMAIN ctx.vip_ticket_no AS ctx.ticket_no;
    CREATE DOMAIN ctx.premium_ticket_no AS ctx.vip_ticket_no;
    CREATE DOMAIN ctx.vip_day AS ctx.release_day;
    CREATE DOMAIN ctx.vip_label AS ctx.label;
    CREATE DOMAIN ctx.vip_genre AS ctx.genre_d;
    CREATE DOMAIN ctx.ticket_list AS ctx.ticket_no[];
    -- whose base type, an array of a domain, has a root of its own
    CREATE DOMAIN ctx.vip_ticket_list AS ctx.ticket_list;
    -- any under its domains too: a point, an array of a domain over an array
    CREATE DOMAIN ctx.spot AS point;
    CREATE DOMAIN ctx.vip_spot AS ctx.spot;
    -- an enum of another schema, whose name ctx gives another enum
    CREATE SCHEMA ctx_box;
    CREATE TYPE ctx_box.tone AS ENUM ('warm', 'dry');
    CREATE TYPE ctx.tone AS ENUM ('loud');
    CREATE DOMAIN ctx_box.tone_d AS ctx_box.tone;
    CREATE DOMAIN ctx.vip_tone AS ctx_box.tone_d;
    CREATE TABLE ctx.tickets (
      id int PRIMARY KEY, no ctx.ticket_no NOT NULL, amount ctx.amount, day ctx.release_day, ts ctx.local_ts,
      at ctx.starts, data ctx.blob, cost ctx.cost, nos ctx.ticket_nos);
    CREATE MATERIALIZED VIEW ctx.ticket_days AS SELECT id, day FROM ctx.tickets;
    CREATE TABLE ctx.quiet (label ctx.label, minutes ctx.minutes, notes ctx.notes, genre ctx.genre_d, spot ctx.vip_spot,
      nos ctx.ticket_nos[]);
    CREATE TABLE ctx.nested (
      id int PRIMARY KEY, premium ctx.premium_ticket_no NOT NULL, vip ctx.vip_ticket_no, day ctx.vip_day,
      label ctx.vip_label, genre ctx.vip_genre, arr ctx.ticket_no[], labels ctx.label[], list ctx.ticket_list,
      tone ctx.vip_tone, vip_list ctx.vip_ticket_list);
    CREATE MATERIALIZED VIEW ctx.nested_days AS SELECT day, arr FROM ctx.nested;
    CREATE TABLE ctx_box.films (id int PRIMARY KEY, tones ctx_box.tone_d[]);
  `));
  afterAll(() => t.pool.query('DROP SCHEMA ctx, ctx_box CASCADE'));

  const ctx = { schemas: { ctx: all }, schemaJSDoc: false, unprefixedSchema: 'ctx' };
  const on = { ...ctx, domainsTypedByContext: true };
  const notesFor = async (config: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => w.includes('domainsTypedByContext'));
  };
  /** The line of `column` in each interface of `table`: Selectable, JSONSelectable, Whereable, Insertable, Updatable. */
  const linesOf = (schema: string, table: string, column: string) =>
    tableBlock(schema, table).split('\n').map(line => line.trim()).filter(line => new RegExp(`^${column}\\??: `).test(line));

  /** The five lines of a nullable column with no default, given its Selectable type and its type in each other context. */
  const nullable = (column: string, selectable: string, json: string, input: string) => {
    const where = `${input} | db.Parameter<${input}> | db.SQLFragment | db.ParentColumn`,
      write = `${input} | db.Parameter<${input}> | null | db.DefaultType | db.SQLFragment`;
    return [
      `${column}: ${selectable} | null;`,
      `${column}: ${json} | null;`,
      `${column}?: ${where} | db.SQLFragment<any, ${where}>;`,
      `${column}?: ${write};`,
      `${column}?: ${write} | db.SQLFragment<any, ${write}>;`,
    ];
  };

  it('is off by default: a domain takes its placeholder in all five interfaces, as in Zapatos 6.6.1', async () => {
    const { ts: schema } = await codegen(ctx);
    expect(linesOf(schema, 'tickets', 'no')).toEqual([
      'no: c.PgTicket_no;',
      'no: c.PgTicket_no;',
      'no?: c.PgTicket_no | db.Parameter<c.PgTicket_no> | db.SQLFragment | db.ParentColumn | ' +
        'db.SQLFragment<any, c.PgTicket_no | db.Parameter<c.PgTicket_no> | db.SQLFragment | db.ParentColumn>;',
      'no: c.PgTicket_no | db.Parameter<c.PgTicket_no> | db.SQLFragment;',
      'no?: c.PgTicket_no | db.Parameter<c.PgTicket_no> | db.SQLFragment | ' +
        'db.SQLFragment<any, c.PgTicket_no | db.Parameter<c.PgTicket_no> | db.SQLFragment>;',
    ]);
    expect(linesOf(schema, 'tickets', 'day')).toEqual(nullable('day', 'c.PgRelease_day', 'c.PgRelease_day', 'c.PgRelease_day'));
  });

  it('types the four other contexts as the base type, unless the placeholder was edited', async () => {
    const { ts: schema } = await codegen(on);
    const inContext = (placeholder: string, generated: string) => (type: string) =>
      `db.DomainInContext<${placeholder}, ${generated}, ${type}>`;
    const no = inContext('c.PgTicket_no', 'db.Int8String'), noInput = no('(number | db.Int8String | bigint)');
    expect(linesOf(schema, 'tickets', 'no')).toEqual([
      'no: c.PgTicket_no;',
      `no: ${no('number')};`,
      `no?: ${noInput} | db.Parameter<${noInput}> | db.SQLFragment | db.ParentColumn | ` +
        `db.SQLFragment<any, ${noInput} | db.Parameter<${noInput}> | db.SQLFragment | db.ParentColumn>;`,
      `no: ${noInput} | db.Parameter<${noInput}> | db.SQLFragment;`,
      `no?: ${noInput} | db.Parameter<${noInput}> | db.SQLFragment | db.SQLFragment<any, ${noInput} | db.Parameter<${noInput}> | db.SQLFragment>;`,
    ]);
    const cases: [string, string, string, string, string][] = [
      ['amount', 'c.PgAmount', 'db.NumericString', 'number', '(number | db.NumericString)'],
      ['day', 'c.PgRelease_day', 'Date', 'db.DateString', '(db.DateString | Date)'],
      ['ts', 'c.PgLocal_ts', 'Date', 'db.TimestampString', '(db.TimestampString | Date)'],
      ['at', 'c.PgStarts', 'Date', 'db.TimestampTzString', '(db.TimestampTzString | Date)'],
      ['data', 'c.PgBlob', 'Buffer', 'db.ByteArrayString', '(db.ByteArrayString | Buffer)'],
      ['cost', 'c.PgCost', 'string', 'string', '(number | string)'],
      ['nos', 'c.PgTicket_nos', 'db.Int8String[]', 'number[]', '(number | db.Int8String | bigint)[]'],
    ];
    for (const [column, placeholder, generated, json, input] of cases) {
      const typed = inContext(placeholder, generated);
      expect.soft(linesOf(schema, 'tickets', column), column).toEqual(nullable(column, placeholder, typed(json), typed(input)));
    }
    // a materialised view has a Selectable, a JSONSelectable and a Whereable
    const day = inContext('c.PgRelease_day', 'Date');
    expect(linesOf(schema, 'ticket_days', 'day')).toEqual(nullable('day', 'c.PgRelease_day', day('db.DateString'), day('(db.DateString | Date)')).slice(0, 3));
  });

  it('types a bigint domain\'s JSON for customJSONParsingForLargeNumbers', async () => {
    const { ts: schema } = await codegen({ ...on, customJSONParsingForLargeNumbers: true });
    expect(linesOf(schema, 'tickets', 'no')[1]).toBe('no: db.DomainInContext<c.PgTicket_no, db.Int8String, (number | db.Int8String)>;');
  });

  describe('a domain over a domain, or an array of a domain (#484)', () => {
    const inAny = (placeholder: string) => (type: string) => `db.DomainInContext<${placeholder}, any, ${type}>`;
    const int8Input = '(number | db.Int8String | bigint)';

    it('types all five by the base type of the innermost domain, while the placeholder holds any', async () => {
      const { ts: schema } = await codegen(on);
      const premium = inAny('c.PgPremium_ticket_no'), premiumInput = premium(int8Input);
      // three domains deep, NOT NULL
      expect(linesOf(schema, 'nested', 'premium')).toEqual([
        `premium: ${premium('db.Int8String')};`,
        `premium: ${premium('number')};`,
        `premium?: ${premiumInput} | db.Parameter<${premiumInput}> | db.SQLFragment | db.ParentColumn | ` +
          `db.SQLFragment<any, ${premiumInput} | db.Parameter<${premiumInput}> | db.SQLFragment | db.ParentColumn>;`,
        `premium: ${premiumInput} | db.Parameter<${premiumInput}> | db.SQLFragment;`,
        `premium?: ${premiumInput} | db.Parameter<${premiumInput}> | db.SQLFragment | ` +
          `db.SQLFragment<any, ${premiumInput} | db.Parameter<${premiumInput}> | db.SQLFragment>;`,
      ]);
      // column, placeholder, Selectable, JSONSelectable, Whereable, Insertable and Updatable
      const cases: [string, string, string, string, string][] = [
        ['vip', 'c.PgVip_ticket_no', 'db.Int8String', 'number', int8Input],
        ['day', 'c.PgVip_day', 'Date', 'db.DateString', '(db.DateString | Date)'],
        ['label', 'c.PgVip_label', 'string', 'string', 'string'],
        ['genre', 'c.PgVip_genre', 'genre', 'genre', 'genre'],
        // pg returns an array of a domain, or a domain over one, as its text: an OID it does not know
        ['arr', 'c.Pg_ticket_no', 'string', 'number[]', '(number | db.Int8String | bigint)[]'],
        ['labels', 'c.Pg_label', 'string', 'string[]', 'string[]'],
        ['list', 'c.PgTicket_list', 'string', 'number[]', '(number | db.Int8String | bigint)[]'],
        ['vip_list', 'c.PgVip_ticket_list', 'string', 'number[]', '(number | db.Int8String | bigint)[]'],
      ];
      for (const [column, placeholder, selectable, json, input] of cases) {
        const typed = inAny(placeholder);
        expect.soft(linesOf(schema, 'nested', column), column)
          .toEqual(nullable(column, typed(selectable), typed(json), typed(input)));
      }
      // a materialised view has a Selectable, a JSONSelectable and a Whereable
      const day = inAny('c.PgVip_day'), arr = inAny('c.Pg_ticket_no');
      expect(linesOf(schema, 'nested_days', 'day'))
        .toEqual(nullable('day', day('Date'), day('db.DateString'), day('(db.DateString | Date)')).slice(0, 3));
      expect(linesOf(schema, 'nested_days', 'arr'))
        .toEqual(nullable('arr', arr('string'), arr('number[]'), arr('(number | db.Int8String | bigint)[]')).slice(0, 3));
    });

    it('is off by default: the placeholder in all five, as in Zapatos 6.6.1', async () => {
      const { ts: schema } = await codegen(ctx);
      for (const [column, placeholder] of [['vip', 'c.PgVip_ticket_no'], ['arr', 'c.Pg_ticket_no'], ['list', 'c.PgTicket_list'],
        ['vip_list', 'c.PgVip_ticket_list']]) {
        expect.soft(linesOf(schema, 'nested', column), column).toEqual(nullable(column, placeholder, placeholder, placeholder));
      }
    });

    it('types an enum of the relation\'s schema by its name, and one of another schema by its labels, never by its name', async () => {
      const box = { ...on, schemas: { ctx: all, ctx_box: all } };
      const tones = inAny('c.Pg_tone_d'), tone = inAny('c.PgVip_tone'), labels = "('dry' | 'warm')";
      for (const typeEnumsAcrossSchemas of [false, true]) {
        const { ts: schema } = await codegen({ ...box, typeEnumsAcrossSchemas });
        // in a prefixed schema: its namespace's enum
        expect(linesOf(schema, 'films', 'tones')).toEqual(nullable('tones', tones('string'), tones('tone[]'), tones('tone[]')));
        // ctx_box.tone, not ctx.tone
        expect(linesOf(schema, 'nested', 'tone')).toEqual(nullable('tone', tone(labels), tone(labels), tone(labels)));
      }
    });

    it('types what pg, the shortcuts and Postgres give: a domain over a domain parsed, an array of a domain as text', async () => {
      const row = await runtime.insert('ctx.nested' as any, {
        id: 1, premium: BigInt(1), vip: '2', day: '2030-03-01', label: 'x', genre: 'comedy',
        arr: [1, BigInt(2)], labels: ['a'], list: ['3'], tone: 'dry', vip_list: [4, BigInt(5)],
      }).run(t.client) as any;
      // the shortcuts' JSON
      expect(row).toEqual({ id: 1, premium: 1, vip: 2, day: '2030-03-01', label: 'x', genre: 'comedy',
        arr: [1, 2], labels: ['a'], list: [3], tone: 'dry', vip_list: [4, 5] });
      // pg's own parsing
      const { rows: [fromPg] } = await t.client.query('SELECT premium, vip, day, arr, labels, list, vip_list FROM ctx.nested');
      expect({ ...fromPg, day: fromPg.day instanceof Date }).toEqual({
        premium: '1', vip: '2', day: true, arr: '{1,2}', labels: '{a}', list: '{3}', vip_list: '{4,5}' });
    });
  });

  it('writes the same placeholders, and leaves the domains typed alike in every context, or any, as they were', async () => {
    const off = await codegen(ctx), typed = await codegen(on);
    expect(typed.customTypeSourceFiles).toEqual(off.customTypeSourceFiles);
    expect(tableBlock(typed.ts, 'quiet')).toBe(tableBlock(off.ts, 'quiet'));
  });

  it('notes each column it would change, once per run, without the option', async () => {
    expect(await notesFor(ctx)).toEqual([
      'Note: ctx.ticket_days.day (ctx.release_day), ctx.tickets.amount (ctx.amount), ctx.tickets.at (ctx.starts), ' +
      'ctx.tickets.cost (ctx.cost), ctx.tickets.data (ctx.blob), ctx.tickets.day (ctx.release_day), ' +
      'ctx.tickets.no (ctx.ticket_no), ctx.tickets.nos (ctx.ticket_nos) and ctx.tickets.ts (ctx.local_ts) have domains ' +
      'over a type typed by context, such as int8 or date: as generated, their placeholders type them in all five ' +
      'interfaces as pg returns them, though a write takes more and, except for money, the shortcuts\' JSON gives ' +
      'another type. ' +
      'Set domainsTypedByContext: true to type them by context while their placeholders hold what the generator ' +
      'wrote for them; it will be the default in pgcast 7.0.',
      'Note: ctx.nested.arr (ctx.ticket_no[]), ctx.nested.day (ctx.vip_day), ctx.nested.genre (ctx.vip_genre), ' +
      'ctx.nested.label (ctx.vip_label), ctx.nested.labels (ctx.label[]), ctx.nested.list (ctx.ticket_list), ' +
      'ctx.nested.premium (ctx.premium_ticket_no), ctx.nested.tone (ctx.vip_tone), ctx.nested.vip (ctx.vip_ticket_no), ' +
      'ctx.nested.vip_list (ctx.vip_ticket_list), ctx.nested_days.arr ' +
      '(ctx.ticket_no[]) and ctx.nested_days.day (ctx.vip_day) have domains over a domain, or arrays of a domain: ' +
      'as generated, their placeholders type them as `any`. Set domainsTypedByContext: true to type them by the base ' +
      'type of the innermost domain while their placeholders hold `any`; it will be the default in pgcast 7.0.',
    ]);
    expect(await notesFor({ ...ctx, schemas: { ctx_box: all } })).toEqual([
      'Note: ctx_box.films.tones (ctx_box.tone_d[]) has a domain over a domain, or an array of a domain: as generated, ' +
      'its placeholder types it as `any`. Set domainsTypedByContext: true to type it by the base type of the innermost ' +
      'domain while its placeholder holds `any`; it will be the default in pgcast 7.0.',
    ]);
    expect(await notesFor({ ...ctx, schemas: { ctx: only('ticket_days') } })).toEqual([
      'Note: ctx.ticket_days.day (ctx.release_day) has a domain over a type typed by context, such as int8 or date: ' +
      'as generated, its placeholder types it in all five interfaces as pg returns it, though a write takes more and, ' +
      'except for money, the shortcuts\' JSON gives another type. Set domainsTypedByContext: true to type it by context while ' +
      'its placeholder holds what the generator wrote for it; it will be the default in pgcast 7.0.',
    ]);
  });

  it('gives no note with the option on, or when no domain would change', async () => {
    expect(await notesFor(on)).toEqual([]);
    expect(await notesFor({ ...ctx, schemas: { ctx: only('quiet') } })).toEqual([]);
    expect(await notesFor({ schemas: { public: only('users', 'products') } })).toEqual([]);
  });

  it('types what Postgres and the shortcuts give: a write it takes, a row as JSON', async () => {
    const row = await runtime.insert('ctx.tickets' as any, {
      id: 1, no: 1, amount: 1.5, day: '2030-03-01', ts: '2030-03-01T19:30:00', at: '2030-03-01T19:30:00+00:00',
      data: '\\xdead', cost: 5, nos: [1, 2],
    }).run(t.client) as any;
    expect(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Array.isArray(v) ? v.map(e => typeof e) : typeof v])))
      .toEqual({ id: 'number', no: 'number', amount: 'number', day: 'string', ts: 'string', at: 'string',
        data: 'string', cost: 'string', nos: ['number', 'number'] });
    expect(row.data).toBe('\\xdead');
  });

  it('leaves the output as it was without the option, or with false', async () => {
    const { ts: absent } = await codegen(main);
    expect((await codegen({ ...main, domainsTypedByContext: false })).ts).toBe(absent);
    expect(absent).toBe(readFileSync(join(generatedDir, 'zapatos/schema.d.ts'), 'utf8'));
  });

  it('is optional in Config, read as false when absent', () => {
    expect(finaliseConfig({}).domainsTypedByContext).toBeUndefined();
    const right: Config = { domainsTypedByContext: true };
    void right;
    // @ts-expect-error a boolean
    const wrong: Config = { domainsTypedByContext: 'yes' };
    void wrong;
  });
});

describe('enumArraysTypedAsText', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA arr;
    CREATE TYPE arr.mood AS ENUM ('sad', 'ok', 'happy');
    CREATE TYPE arr.tone AS ENUM ('dry', 'a b', 'c,d');
    CREATE DOMAIN arr.moods AS arr.mood[];
    CREATE DOMAIN arr.one_mood AS arr.mood;
    CREATE TABLE arr.films (
      id int PRIMARY KEY, moods arr.mood[], moods_nn arr.mood[] NOT NULL DEFAULT '{}', grid arr.mood[][],
      tones arr.tone[], dmoods arr.moods,
      -- not arrays of an enum, or any as generated: nothing to change
      mood arr.mood, texts text[], omoods arr.one_mood[]);
    CREATE VIEW arr.films_v AS SELECT id, moods FROM arr.films;
    CREATE MATERIALIZED VIEW arr.films_m AS SELECT id, moods FROM arr.films;
    -- an enum of another schema: by name, the enum of the same name in arr_box; any in arr_solo, which has none
    CREATE SCHEMA arr_box;
    CREATE TYPE arr_box.mood AS ENUM ('blue', 'grey');
    CREATE TABLE arr_box.films (id int PRIMARY KEY, moods arr.mood[], own arr_box.mood[]);
    CREATE SCHEMA arr_solo;
    CREATE TABLE arr_solo.films (id int PRIMARY KEY, moods arr.mood[]);
    -- enums named like built-ins: an array of the built-in is no array of an enum, the enum's own array is
    CREATE SCHEMA arr_edge;
    CREATE TYPE arr_edge.int4 AS ENUM ('x', 'y');
    CREATE TYPE arr_edge.text AS ENUM ('p');
    CREATE TABLE arr_edge.films (id int PRIMARY KEY, nums int4[], words text[], own arr_edge.int4[]);
    -- a domain over an array of an enum, also used in arr_none, which has no enum of that name: its placeholder is any
    CREATE SCHEMA arr_dom;
    CREATE TYPE arr_dom.mood AS ENUM ('sad', 'happy');
    CREATE DOMAIN arr_dom.moods AS arr_dom.mood[];
    CREATE TABLE arr_dom.films (id int PRIMARY KEY, moods arr_dom.mood[], dmoods arr_dom.moods);
    CREATE SCHEMA arr_none;
    CREATE TABLE arr_none.films (id int PRIMARY KEY, dmoods arr_dom.moods);
  `));
  afterAll(() => t.pool.query('DROP SCHEMA arr, arr_box, arr_solo, arr_edge, arr_dom, arr_none CASCADE'));

  const config = { schemas: { arr: all, arr_box: all, arr_solo: all }, schemaJSDoc: false, unprefixedSchema: 'arr' };
  const on = { ...config, enumArraysTypedAsText: true };
  const notesFor = async (given: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...given, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => w.includes('enumArraysTypedAsText'));
  };
  /** The line of `column` in each interface of `table`: Selectable, JSONSelectable, Whereable, Insertable, Updatable. */
  const linesOf = (schema: string, table: string, column: string) =>
    tableBlock(schema, table).split('\n').map(line => line.trim()).filter(line => new RegExp(`^${column}\\??: `).test(line));
  /** The Selectable line of `column`, then its JSONSelectable line. */
  const readsOf = (schema: string, table: string, column: string) => linesOf(schema, table, column).slice(0, 2);

  /** The five lines of a nullable column with no default, given its Selectable type and its type in each other context. */
  const nullable = (column: string, selectable: string, other: string) => {
    const where = `${other} | db.Parameter<${other}> | db.SQLFragment | db.ParentColumn`,
      write = `${other} | db.Parameter<${other}> | null | db.DefaultType | db.SQLFragment`;
    return [
      `${column}: ${selectable} | null;`,
      `${column}: ${other} | null;`,
      `${column}?: ${where} | db.SQLFragment<any, ${where}>;`,
      `${column}?: ${write};`,
      `${column}?: ${write} | db.SQLFragment<any, ${write}>;`,
    ];
  };

  it('is off by default: an array of an enum is an array in Selectable, as in Zapatos 6.6.1', async () => {
    const { ts: schema } = await codegen(config);
    expect(linesOf(schema, 'films', 'moods')).toEqual(nullable('moods', 'mood[]', 'mood[]'));
    expect(readsOf(schema, 'films', 'dmoods')).toEqual(['dmoods: c.PgMoods | null;', 'dmoods: c.PgMoods | null;']);
  });

  it('types an array of an enum as a string in Selectable, and only there', async () => {
    const { ts: schema } = await codegen(on);
    expect(linesOf(schema, 'films', 'moods')).toEqual(nullable('moods', 'string', 'mood[]'));
    expect(linesOf(schema, 'films', 'tones')).toEqual(nullable('tones', 'string', 'tone[]'));
    // pg returns a two-dimensional array as its text too
    expect(readsOf(schema, 'films', 'grid')).toEqual(['grid: string | null;', 'grid: mood[] | null;']);
    expect(readsOf(schema, 'films', 'moods_nn')).toEqual(['moods_nn: string;', 'moods_nn: mood[];']);
    expect(readsOf(schema, 'films_v', 'moods')).toEqual(['moods: string | null;', 'moods: mood[] | null;']);
    expect(readsOf(schema, 'films_m', 'moods')).toEqual(['moods: string | null;', 'moods: mood[] | null;']);
    // typed by name in arr_box, as without the option: both are arrays of an enum, whose text pg returns
    expect(readsOf(tableBlock(schema, 'arr_box'), 'films', 'moods')).toEqual(['moods: string | null;', 'moods: mood[] | null;']);
    expect(readsOf(tableBlock(schema, 'arr_box'), 'films', 'own')).toEqual(['own: string | null;', 'own: mood[] | null;']);
  });

  it('types a domain over an array of an enum as a string in Selectable while its placeholder holds what the generator wrote', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen(on);
    expect(linesOf(schema, 'films', 'dmoods')).toEqual(
      nullable('dmoods', 'db.DomainInContext<c.PgMoods, mood[], string>', 'c.PgMoods'));
    expect(customTypeSourceFiles.PgMoods).toContain('export type PgMoods = mood[];');
  });

  it('types the labels\' array of an enum of another schema, with typeEnumsAcrossSchemas', async () => {
    const { ts: schema } = await codegen({ ...on, typeEnumsAcrossSchemas: true });
    const labels = `('happy' | 'ok' | 'sad')[]`;
    expect(readsOf(tableBlock(schema, 'arr_box'), 'films', 'moods')).toEqual(['moods: string | null;', `moods: ${labels} | null;`]);
    expect(readsOf(tableBlock(schema, 'arr_solo'), 'films', 'moods')).toEqual(['moods: string | null;', `moods: ${labels} | null;`]);
  });

  it('leaves the placeholders, any, and the columns that are no array of an enum as they were', async () => {
    const off = await codegen(config), typed = await codegen(on);
    expect(typed.customTypeSourceFiles).toEqual(off.customTypeSourceFiles);
    for (const column of ['id', 'mood', 'texts', 'omoods']) {
      expect(linesOf(typed.ts, 'films', column)).toEqual(linesOf(off.ts, 'films', column));
    }
    // an any custom type without typeEnumsAcrossSchemas
    expect(tableBlock(typed.ts, 'arr_solo')).toBe(tableBlock(off.ts, 'arr_solo'));
    expect(readsOf(tableBlock(typed.ts, 'arr_solo'), 'films', 'moods')).toEqual(['moods: c.Pg_mood | null;', 'moods: c.Pg_mood | null;']);
  });

  it('leaves an array of a built-in as it was, though its relation\'s schema has an enum of the built-in\'s name', async () => {
    const edge = { schemas: { arr_edge: all }, schemaJSDoc: false };
    for (const given of [{}, { typeEnumsAcrossSchemas: true }, { unprefixedSchema: null }, { domainsTypedByContext: true }]) {
      const off = (await codegen({ ...edge, ...given })).ts, typed = (await codegen({ ...edge, ...given, enumArraysTypedAsText: true })).ts;
      for (const column of ['id', 'nums', 'words']) {
        expect(linesOf(tableBlock(typed, 'arr_edge'), 'films', column)).toEqual(linesOf(tableBlock(off, 'arr_edge'), 'films', column));
      }
      expect(readsOf(tableBlock(typed, 'arr_edge'), 'films', 'nums')).toEqual(['nums: number[] | null;', 'nums: number[] | null;']);
      expect(readsOf(tableBlock(typed, 'arr_edge'), 'films', 'words')).toEqual(['words: string[] | null;', 'words: string[] | null;']);
      // the enum's own array, typed number[] by the built-in's name as in Zapatos 6.6.1, is the text pg returns
      expect(readsOf(tableBlock(typed, 'arr_edge'), 'films', 'own')).toEqual(['own: string | null;', 'own: number[] | null;']);
      expect(await notesFor({ ...edge, ...given })).toEqual(['Note: arr_edge.films.own (arr_edge.int4[]) is an array of an ' +
        'enum, which pg returns as its text, such as \'{a,b}\', though Selectable types it as an array. Set ' +
        'enumArraysTypedAsText: true to type it as a string there, or false to keep the array if pg.types.setTypeParser ' +
        'parses it; true will be the default in pgcast 7.0.']);
    }
  });

  it('notes each column it would change, once per run, with the option left out', async () => {
    expect(await notesFor(config)).toEqual([
      'Note: arr.films.dmoods (arr.moods), arr.films.grid (arr.mood[]), arr.films.moods (arr.mood[]), ' +
      'arr.films.moods_nn (arr.mood[]), arr.films.tones (arr.tone[]), arr.films_m.moods (arr.mood[]), ' +
      'arr.films_v.moods (arr.mood[]), arr_box.films.moods (arr.mood[]) and arr_box.films.own (arr_box.mood[]) are ' +
      'arrays of an enum, which pg returns as their text, such as \'{a,b}\', though Selectable types them as arrays. ' +
      'Set enumArraysTypedAsText: true to type them as strings there, or false to keep the arrays if ' +
      'pg.types.setTypeParser parses them; true will be the default in pgcast 7.0.',
    ]);
    const viewNote = 'Note: arr.films_v.moods (arr.mood[]) is an array of an enum, which pg returns as its text, such ' +
      'as \'{a,b}\', though Selectable types it as an array. Set enumArraysTypedAsText: true to type it as a string ' +
      'there, or false to keep the array if pg.types.setTypeParser parses it; true will be the default in pgcast 7.0.';
    expect(await notesFor({ ...config, schemas: { arr: only('films_v') } })).toEqual([viewNote]);
    // null, as a JSON config may hold, is the key left out
    expect(await notesFor({ ...config, schemas: { arr: only('films_v') }, enumArraysTypedAsText: null as any })).toEqual([viewNote]);
    // with typeEnumsAcrossSchemas, arr_solo's column takes the labels' array, no longer any
    expect((await notesFor({ ...config, schemas: { arr_solo: all }, typeEnumsAcrossSchemas: true }))[0])
      .toMatch(/^Note: arr_solo\.films\.moods \(arr\.mood\[\]\) is an array of an enum/);
  });

  it('notes no column of a domain whose placeholder ends any, which stays any with the option', async () => {
    const both = { schemas: { arr_dom: all, arr_none: all }, schemaJSDoc: false };
    const typed = await codegen({ ...both, enumArraysTypedAsText: true });
    expect(typed.customTypeSourceFiles.PgMoods).toContain('export type PgMoods = any;');
    expect(readsOf(tableBlock(typed.ts, 'arr_dom'), 'films', 'dmoods'))
      .toEqual(['dmoods: db.DomainInContext<c.PgMoods, mood[], string> | null;', 'dmoods: c.PgMoods | null;']);
    const note = (columns: string) => `Note: ${columns} is an array of an enum, which pg returns as its text, such as ` +
      '\'{a,b}\', though Selectable types it as an array. Set enumArraysTypedAsText: true to type it as a string there, or ' +
      'false to keep the array if pg.types.setTypeParser parses it; true will be the default in pgcast 7.0.';
    expect(await notesFor(both)).toEqual([note('arr_dom.films.moods (arr_dom.mood[])')]);
    // without arr_none, the placeholder holds mood[], which the option changes
    expect((await notesFor({ ...both, schemas: { arr_dom: all } }))[0])
      .toMatch(/^Note: arr_dom\.films\.dmoods \(arr_dom\.moods\) and arr_dom\.films\.moods \(arr_dom\.mood\[\]\) are arrays/);
  });

  it('gives no note with true or false, or when no column would change', async () => {
    expect(await notesFor(on)).toEqual([]);
    expect(await notesFor({ ...config, enumArraysTypedAsText: false })).toEqual([]);
    expect(await notesFor({ ...config, schemas: { arr_solo: all } })).toEqual([]);
    expect(await notesFor(main)).toEqual([]);
  });

  it('types what pg and the shortcuts give: an array of an enum as its text, and as JSON', async () => {
    const row = await runtime.insert('arr.films' as any, { id: 1, moods: ['happy', 'sad'], dmoods: ['ok'] })
      .run(t.client) as any;
    expect([row.moods, row.dmoods, row.moods_nn]).toEqual([['happy', 'sad'], ['ok'], []]);
    const { rows: [fromPg] } = await t.client.query('SELECT moods, dmoods, moods_nn FROM arr.films');
    expect(fromPg).toEqual({ moods: '{happy,sad}', dmoods: '{ok}', moods_nn: '{}' });
    const { rows: [fromView] } = await t.client.query('SELECT moods FROM arr.films_v');
    expect(fromView).toEqual({ moods: '{happy,sad}' });
  });

  it('leaves the output as it was without the option, or with false', async () => {
    const absent = await codegen(config), off = await codegen({ ...config, enumArraysTypedAsText: false });
    expect(off.ts).toBe(absent.ts);
    expect(off.customTypeSourceFiles).toEqual(absent.customTypeSourceFiles);
    expect((await codegen({ ...main, enumArraysTypedAsText: false })).ts)
      .toBe(readFileSync(join(generatedDir, 'zapatos/schema.d.ts'), 'utf8'));
  });

  it('is optional in Config, read as false when absent', () => {
    expect(finaliseConfig({}).enumArraysTypedAsText).toBeUndefined();
    const right: Config = { enumArraysTypedAsText: true };
    void right;
    // @ts-expect-error a boolean
    const wrong: Config = { enumArraysTypedAsText: 'yes' };
    void wrong;
  });
});

describe('intervalsTypedAsObjects', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA iv;
    CREATE DOMAIN iv.span AS interval;
    -- a domain over a domain, and an array of a domain: any, but with domainsTypedByContext (#484)
    CREATE DOMAIN iv.vip_span AS iv.span;
    CREATE TABLE iv.runs (id int PRIMARY KEY, runtime interval, breaks interval[], span iv.span, vip iv.vip_span, spans iv.span[]);
    -- a domain over interval[], and a domain over an array of a domain
    CREATE DOMAIN iv.span_list AS interval[];
    CREATE DOMAIN iv.span_set AS iv.span[];
    -- an array of a domain over interval[], and a domain over one: any, even with domainsTypedByContext
    CREATE DOMAIN iv.list_set AS iv.span_list[];
    CREATE TABLE iv.lists (list iv.span_list, set iv.span_set, lists iv.span_list[], list_set iv.list_set);
    CREATE TABLE iv.gaps (gap interval);
    CREATE TABLE iv.quiet (id int PRIMARY KEY, label text);
  `));
  afterAll(() => t.pool.query('DROP SCHEMA iv CASCADE'));

  const iv = { schemas: { iv: all }, schemaJSDoc: false, unprefixedSchema: 'iv' };
  const on = { ...iv, intervalsTypedAsObjects: true };
  const notesFor = async (config: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => w.includes('intervalsTypedAsObjects'));
  };
  /** The line of `column` in each interface of `table`: Selectable, JSONSelectable, Whereable, Insertable, Updatable. */
  const linesOf = (schema: string, table: string, column: string) =>
    tableBlock(schema, table).split('\n').map(line => line.trim()).filter(line => new RegExp(`^${column}\\??: `).test(line));
  /** The five lines of a nullable column with no default, given its Selectable type and its type in each other context. */
  const nullable = (column: string, selectable: string, json: string, input: string) => {
    const where = `${input} | db.Parameter<${input}> | db.SQLFragment | db.ParentColumn`,
      write = `${input} | db.Parameter<${input}> | null | db.DefaultType | db.SQLFragment`;
    return [
      `${column}: ${selectable} | null;`,
      `${column}: ${json} | null;`,
      `${column}?: ${where} | db.SQLFragment<any, ${where}>;`,
      `${column}?: ${write};`,
      `${column}?: ${write} | db.SQLFragment<any, ${write}>;`,
    ];
  };
  const placeholder = (name: string, type: string) =>
    `${type.startsWith('db.') ? `  import type * as db from 'zapatos/db';\n` : ''}  export type ${name} = ${type};`;
  const object = 'db.PostgresInterval', input = '(string | db.PostgresInterval)';
  const inContext = (custom: string, generated: string) => (type: string) => `db.DomainInContext<${custom}, ${generated}, ${type}>`;

  it.each([undefined, false])('is the text in all five by default, as in Zapatos 6.6.1 (intervalsTypedAsObjects: %s)', async key => {
    const { ts: schema, customTypeSourceFiles: files } = await codegen({ ...iv, ...key === undefined ? {} : { intervalsTypedAsObjects: key } });
    expect(linesOf(schema, 'runs', 'runtime')).toEqual(nullable('runtime', 'string', 'string', 'string'));
    expect(linesOf(schema, 'runs', 'breaks')).toEqual(nullable('breaks', 'string[]', 'string[]', 'string[]'));
    expect(linesOf(schema, 'runs', 'span')).toEqual(nullable('span', 'c.PgSpan', 'c.PgSpan', 'c.PgSpan'));
    expect(files.PgSpan).toContain(placeholder('PgSpan', 'string'));
  });

  it('types Selectable as pg parses it, and a write takes that back; the JSON stays the text', async () => {
    const { ts: schema, customTypeSourceFiles: files } = await codegen(on);
    expect(linesOf(schema, 'runs', 'runtime')).toEqual(nullable('runtime', object, 'string', input));
    expect(linesOf(schema, 'runs', 'breaks')).toEqual(nullable('breaks', `${object}[]`, 'string[]', `${input}[]`));
    // a domain over one: its placeholder, which as generated holds what pg returns
    expect(linesOf(schema, 'runs', 'span')).toEqual(nullable('span', 'c.PgSpan', 'c.PgSpan', 'c.PgSpan'));
    expect(files.PgSpan).toContain(placeholder('PgSpan', object));
    // any, as without the option
    expect(linesOf(schema, 'runs', 'vip')).toEqual(nullable('vip', 'c.PgVip_span', 'c.PgVip_span', 'c.PgVip_span'));
    expect(linesOf(schema, 'runs', 'spans')).toEqual(nullable('spans', 'c.Pg_span', 'c.Pg_span', 'c.Pg_span'));
  });

  it('types a domain over one by context with domainsTypedByContext, and one under other domains by its base type', async () => {
    const { ts: schema } = await codegen({ ...on, domainsTypedByContext: true });
    const span = inContext('c.PgSpan', object), vip = inContext('c.PgVip_span', 'any'), spans = inContext('c.Pg_span', 'any');
    expect(linesOf(schema, 'runs', 'span')).toEqual(nullable('span', 'c.PgSpan', span('string'), span(input)));
    expect(linesOf(schema, 'runs', 'vip')).toEqual(nullable('vip', vip(object), vip('string'), vip(input)));
    // pg returns an array of a domain as its text
    expect(linesOf(schema, 'runs', 'spans')).toEqual(nullable('spans', spans('string'), spans('string[]'), spans(`${input}[]`)));
  });

  it('leaves a domain over one alike in every context with domainsTypedByContext alone', async () => {
    const { ts: schema } = await codegen({ ...iv, domainsTypedByContext: true });
    const vip = inContext('c.PgVip_span', 'any'), spans = inContext('c.Pg_span', 'any');
    expect(linesOf(schema, 'runs', 'span')).toEqual(nullable('span', 'c.PgSpan', 'c.PgSpan', 'c.PgSpan'));
    expect(linesOf(schema, 'runs', 'vip')).toEqual(nullable('vip', vip('string'), vip('string'), vip('string')));
    expect(linesOf(schema, 'runs', 'spans')).toEqual(nullable('spans', spans('string'), spans('string[]'), spans('string[]')));
  });

  const note = (list: string, one = false) => `Note: ${list} ${one ? 'is' : 'are'} of interval or of a type that wraps it ` +
    `in arrays or domains: as generated, ${one ? 'it is typed as its' : 'they are typed as their'} ` +
    `text, though pg's default type parser returns an interval from a query of your own as an object, a PostgresInterval. ` +
    `Set intervalsTypedAsObjects: true to type ${one ? 'it' : 'them'} as pg parses ${one ? 'it' : 'them'}; it will be the ` +
    `default in pgcast 7.0. Set it to false to keep the text, if a type parser of yours returns it.`;

  it('notes each column it would change, once per run, when left out', async () => {
    // interval, an array of it, and a domain over either
    expect(await notesFor(iv)).toEqual([note('iv.gaps.gap (interval), iv.lists.list (iv.span_list), ' +
      'iv.runs.breaks (interval[]), iv.runs.runtime (interval) and iv.runs.span (iv.span)')]);
    // left out, or null from JSON
    expect(await notesFor({ ...iv, intervalsTypedAsObjects: null as unknown as boolean, schemas: { iv: only('gaps') } }))
      .toEqual([note('iv.gaps.gap (interval)', true)]);
    // under other domains too, which only domainsTypedByContext types by their base type: an array of a domain, a domain
    // over a domain, a domain over an array of a domain
    expect(await notesFor({ ...iv, domainsTypedByContext: true, schemas: { iv: only('runs', 'lists') } })).toEqual([
      note('iv.lists.list (iv.span_list), iv.lists.set (iv.span_set), iv.runs.breaks (interval[]), iv.runs.runtime (interval), ' +
        'iv.runs.span (iv.span), iv.runs.spans (iv.span[]) and iv.runs.vip (iv.vip_span)')]);
  });

  it('leaves out an array of a domain over interval[], or a domain over one, whose types it never changes', async () => {
    for (const byContext of [false, true]) {
      const keyed = (key?: boolean) => codegen({ ...iv, domainsTypedByContext: byContext, ...key === undefined ? {} : { intervalsTypedAsObjects: key } });
      const types = ({ ts: schema, customTypeSourceFiles: files }: Awaited<ReturnType<typeof codegen>>) =>
        [linesOf(schema, 'lists', 'lists'), linesOf(schema, 'lists', 'list_set'), files.Pg_span_list, files.PgList_set];
      const absent = types(await keyed());
      expect(types(await keyed(true))).toEqual(absent);
      expect(types(await keyed(false))).toEqual(absent);
      expect((await notesFor({ ...iv, domainsTypedByContext: byContext })).join()).not.toMatch(/iv\.lists\.(lists|list_set) /);
    }
  });

  it('gives no note with true or false, or when no column would change', async () => {
    expect(await notesFor(on)).toEqual([]);
    expect(await notesFor({ ...iv, intervalsTypedAsObjects: false })).toEqual([]);
    expect(await notesFor({ ...iv, schemas: { iv: only('quiet') } })).toEqual([]);
  });

  describe('a type of yours named interval', () => {
    // an enum, a composite and a domain over text, each named interval, next to pg_catalog's interval and its array
    beforeAll(() => t.pool.query(`
      CREATE SCHEMA iv_enum;
      CREATE TYPE iv_enum."interval" AS ENUM ('short', 'long');
      CREATE DOMAIN iv_enum.enum_wrap AS iv_enum."interval";
      CREATE DOMAIN iv_enum.enum_wrap2 AS iv_enum.enum_wrap;
      CREATE TABLE iv_enum.cuts (id int PRIMARY KEY, a iv_enum."interval", b iv_enum."interval"[], w2 iv_enum.enum_wrap2,
        c pg_catalog.interval, d pg_catalog.interval[]);
      CREATE SCHEMA iv_domain;
      CREATE DOMAIN iv_domain."interval" AS text;
      CREATE DOMAIN iv_domain.text_wrap AS iv_domain."interval";
      CREATE TABLE iv_domain.takes (id int PRIMARY KEY, a iv_domain."interval", b iv_domain."interval"[], w iv_domain.text_wrap,
        x iv_enum."interval", c pg_catalog.interval, d pg_catalog.interval[]);
      CREATE SCHEMA iv_row;
      CREATE TABLE iv_row."interval" (n int);
      CREATE TABLE iv_row.reels (id int PRIMARY KEY, a iv_row."interval", b iv_row."interval"[], c pg_catalog.interval);
    `));
    afterAll(() => t.pool.query('DROP SCHEMA iv_enum, iv_domain, iv_row CASCADE'));

    const named = { schemas: { iv_enum: all, iv_domain: all, iv_row: all }, schemaJSDoc: false };
    const alike = (column: string, type: string) => nullable(column, type, type, type);

    it.each([false, true])('is typed as without the key, and pg_catalog\'s by the key (domainsTypedByContext: %s)', async byContext => {
      for (const key of [undefined, false, true]) {
        const { ts: schema, customTypeSourceFiles: files } =
          await codegen({ ...named, domainsTypedByContext: byContext, ...key === undefined ? {} : { intervalsTypedAsObjects: key } });
        // by its name, as text, as in Zapatos 6.6.1, whatever the key
        expect(linesOf(schema, 'cuts', 'a')).toEqual(alike('a', 'string'));
        expect(linesOf(schema, 'cuts', 'b')).toEqual(alike('b', 'string[]'));
        expect(linesOf(schema, 'cuts', 'w2'))
          .toEqual(alike('w2', byContext ? 'db.DomainInContext<c.PgEnum_wrap2, any, string>' : 'c.PgEnum_wrap2'));
        expect(linesOf(schema, 'takes', 'a')).toEqual(alike('a', 'c.PgInterval'));
        expect(linesOf(schema, 'takes', 'b')).toEqual(alike('b', 'string[]'));
        expect(linesOf(schema, 'takes', 'w')).toEqual(alike('w', 'c.PgText_wrap'));
        expect(linesOf(schema, 'takes', 'x')).toEqual(alike('x', 'string'));
        expect(linesOf(schema, 'reels', 'a')).toEqual(alike('a', 'string'));
        expect(linesOf(schema, 'reels', 'b')).toEqual(alike('b', 'string[]'));
        expect([files.PgEnum_wrap2, files.PgInterval, files.PgText_wrap]).toEqual([
          expect.stringContaining(placeholder('PgEnum_wrap2', 'any')), expect.stringContaining(placeholder('PgInterval', 'string')),
          expect.stringContaining(placeholder('PgText_wrap', 'string')),
        ]);
        // pg_catalog's, by the key
        for (const table of ['cuts', 'takes', 'reels']) {
          expect(linesOf(schema, table, 'c')).toEqual(key ? nullable('c', object, 'string', input) : alike('c', 'string'));
        }
        for (const table of ['cuts', 'takes']) {
          expect(linesOf(schema, table, 'd'))
            .toEqual(key ? nullable('d', `${object}[]`, 'string[]', `${input}[]`) : alike('d', 'string[]'));
        }
      }
    });

    it.each([false, true])('is left out of the note, which names pg_catalog\'s (domainsTypedByContext: %s)', async byContext => {
      expect(await notesFor({ ...named, domainsTypedByContext: byContext })).toEqual([note('iv_domain.takes.c (interval), ' +
        'iv_domain.takes.d (interval[]), iv_enum.cuts.c (interval), iv_enum.cuts.d (interval[]) and iv_row.reels.c (interval)')]);
      for (const key of [false, true]) {
        expect(await notesFor({ ...named, domainsTypedByContext: byContext, intervalsTypedAsObjects: key })).toEqual([]);
      }
      // nor named by the note of typeEnumsAcrossSchemas, whatever the key
      for (const key of [undefined, false, true]) {
        const keyed = { ...named, domainsTypedByContext: byContext, ...key === undefined ? {} : { intervalsTypedAsObjects: key } };
        expect((await warningsOf(keyed)).filter(w => w.includes('takes.x'))).toEqual([]);
      }
    });
  });

  it('types what pg, the shortcuts and Postgres give: an object from pg, the text as JSON', async () => {
    const written = await runtime.insert('iv.runs' as any, {
      id: 1, runtime: '1 day 02:00:00', breaks: ['01:00:00'], span: '3 mons', vip: '1 year', spans: ['00:05:00'],
    }).run(t.client) as any;
    // the shortcuts' JSON, at the top level and in a lateral
    const text = { id: 1, runtime: '1 day 02:00:00', breaks: ['01:00:00'], span: '3 mons', vip: '1 year', spans: ['00:05:00'] };
    expect(written).toEqual(text);
    const withLateral = await runtime.selectExactlyOne('iv.runs' as any, { id: 1 } as any, {
      lateral: { again: runtime.selectExactlyOne('iv.runs' as any, { id: runtime.parent('id' as any) } as any) },
    } as any).run(t.client) as any;
    expect(withLateral.again).toEqual(text);
    // pg's own parsing: an object of each part that isn't zero, with toPostgres() and toISO(); an array of a domain as text
    const { rows: [fromPg] } = await t.client.query('SELECT runtime, breaks, span, vip, spans FROM iv.runs');
    const parts = (v: any) => ({ ...v, toPostgres: typeof v.toPostgres, toISO: typeof v.toISO });
    expect({ runtime: parts(fromPg.runtime), breaks: fromPg.breaks.map(parts), span: parts(fromPg.span), vip: parts(fromPg.vip),
      spans: fromPg.spans }).toEqual({
      runtime: { days: 1, hours: 2, toPostgres: 'function', toISO: 'function' },
      breaks: [{ hours: 1, toPostgres: 'function', toISO: 'function' }],
      span: { months: 3, toPostgres: 'function', toISO: 'function' },
      vip: { years: 1, toPostgres: 'function', toISO: 'function' },
      spans: '{00:05:00}',
    });
    // written back as it was read
    await runtime.update('iv.runs' as any, { runtime: fromPg.span, breaks: [fromPg.runtime] } as any, { id: 1 } as any).run(t.client);
    const { rows: [stored] } = await t.client.query('SELECT runtime::text, breaks::text FROM iv.runs');
    expect(stored).toEqual({ runtime: '3 mons', breaks: '{"1 day 02:00:00"}' });
    // a plain object is no interval to Postgres; last, as the error aborts the transaction
    await expect(runtime.insert('iv.runs' as any, { id: 2, runtime: { days: 1 } } as any).run(t.client))
      .rejects.toMatchObject({ code: '22007' });
  });

  it('leaves the output as it was without the option, or with false', async () => {
    const { ts: absent } = await codegen(main);
    expect((await codegen({ ...main, intervalsTypedAsObjects: false })).ts).toBe(absent);
    expect(absent).toBe(readFileSync(join(generatedDir, 'zapatos/schema.d.ts'), 'utf8'));
  });

  it('is optional in Config, read as false when absent', () => {
    expect(finaliseConfig({}).intervalsTypedAsObjects).toBeUndefined();
    const right: Config = { intervalsTypedAsObjects: true };
    void right;
    // @ts-expect-error a boolean
    const wrong: Config = { intervalsTypedAsObjects: 'yes' };
    void wrong;
  });
});

describe('column comments', () => {
  /** The comment lines of each column's JSDoc in the `Selectable` of `table`, their indentation trimmed. */
  const commentLines = (schema: string, table: string) => {
    const block = tableBlock(schema, table);
    const selectable = block.slice(block.indexOf('interface Selectable {'), block.indexOf('interface JSONSelectable {'));
    // a JSDoc: `* **name**`, `*`, the comment lines, then `* - <type>`, `* - <nullability>` and the line of `*/`
    return Object.fromEntries([...selectable.matchAll(/\/\*\*\n([\s\S]*?)\*\/\n\s*(\w+)/g)].map(([, doc, column]) =>
      [column, doc.split('\n').map(line => line.trimStart()).slice(2, -3)]));
  };

  it('puts every line of a multi-line comment behind its own *', async () => {
    const { ts: schema } = await codegen(main);
    expect(commentLines(schema, 'users').manager_id).toEqual(['* Line manager.', '* Nullable: the top of the tree has none.']);
  });

  it('prefixes every line whatever its line break, on a table and a materialized view', async () => {
    // tsForConfig() reads through its own connection: the schema is committed, then dropped
    await t.pool.query(String.raw`
      CREATE SCHEMA comment_lines;
      CREATE TABLE comment_lines.notes (lf int, crlf int, cr int, blank int, trail int, lead int, indented int, one int, ls int, ps int);
      COMMENT ON COLUMN comment_lines.notes.lf IS E'First line\nsecond line';
      COMMENT ON COLUMN comment_lines.notes.crlf IS E'First line\r\nsecond line';
      COMMENT ON COLUMN comment_lines.notes.cr IS E'First line\rsecond line';
      COMMENT ON COLUMN comment_lines.notes.blank IS E'Paragraph one\n\nParagraph two';
      COMMENT ON COLUMN comment_lines.notes.trail IS E'Ends with a line break\n';
      COMMENT ON COLUMN comment_lines.notes.lead IS E'\nStarts with a line break';
      COMMENT ON COLUMN comment_lines.notes.indented IS E'A list:\n  - one\n  - two';
      COMMENT ON COLUMN comment_lines.notes.one IS 'A single line';
      COMMENT ON COLUMN comment_lines.notes.ls IS E'Before\u2028after';
      COMMENT ON COLUMN comment_lines.notes.ps IS E'Before\u2029after';
      CREATE MATERIALIZED VIEW comment_lines.note_totals AS SELECT count(*) AS n FROM comment_lines.notes;
      COMMENT ON COLUMN comment_lines.note_totals.n IS E'Count of notes\nrefreshed on demand';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_lines: all } });
      expect({ ...commentLines(schema, 'notes'), ...commentLines(schema, 'note_totals') }).toEqual({
        lf: ['* First line', '* second line'],
        crlf: ['* First line', '* second line'],
        cr: ['* First line', '* second line'],
        blank: ['* Paragraph one', '* ', '* Paragraph two'],
        trail: ['* Ends with a line break', '* '],
        lead: ['* ', '* Starts with a line break'],
        indented: ['* A list:', '*   - one', '*   - two'],
        one: ['* A single line'],
        // one line, as under Zapatos 6.6.1: TypeScript does not end a JSDoc line at U+2028 or U+2029, nor
        // does the namespace's indentation now, which 6.6.1 wrote after them (#481)
        ls: ['* Before\u2028after'],
        ps: ['* Before\u2029after'],
        n: ['* Count of notes', '* refreshed on demand'],
      });
      expect(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_lines CASCADE');
    }
  });

  it('prefixes every line of a multi-line default, in an unprefixed and a prefixed schema', async () => {
    /** Each column's JSDoc in the `Selectable` of `table`, from its default line to its end, indentation trimmed. */
    const defaultLines = (schema: string, table: string) => {
      const block = tableBlock(schema, table);
      const selectable = block.slice(block.indexOf('interface Selectable {'), block.indexOf('interface JSONSelectable {'));
      return Object.fromEntries([...selectable.matchAll(/\/\*\*\n([\s\S]*?)\*\/\n\s*(\w+)/g)].map(([, doc, column]) => {
        const lines = doc.split('\n').map(line => line.trimStart());
        return [column, lines.slice(lines.findIndex(line => line.includes(', default: ')), -1)];
      }));
    };
    const columns = (schema: string) => String.raw`lf text DEFAULT E'two\nlines', crlf text DEFAULT E'two\r\nlines', cr text DEFAULT E'two\rlines',
      blank text DEFAULT E'a\n\nb', trail text DEFAULT E'ends\n', lead text DEFAULT E'\nstarts',
      indented text DEFAULT E'a\n  b', star text DEFAULT E'a\n* b', arr text[] DEFAULT ARRAY[E'a\nb'],
      seq bigint DEFAULT nextval(E'${schema}."two\nlines"'), closer text DEFAULT E'a\n*/ b', tagged text DEFAULT E'a\nb',
      one text DEFAULT 'single line', at text DEFAULT 'a @x', ls text DEFAULT E'a\u2028b'`;
    // tsForConfig() reads through its own connection: the schemas are committed, then dropped
    await t.pool.query(String.raw`
      CREATE SCHEMA default_lines;
      CREATE SCHEMA default_lines_ns;
      CREATE SEQUENCE default_lines."two${'\n'}lines";
      CREATE TABLE default_lines.unprefixed (${columns('default_lines')});
      CREATE SEQUENCE default_lines_ns."two${'\n'}lines";
      CREATE TABLE default_lines_ns.prefixed (${columns('default_lines_ns')});
      COMMENT ON COLUMN default_lines.unprefixed.tagged IS E'Old.\n@deprecated use lf';
      COMMENT ON COLUMN default_lines_ns.prefixed.tagged IS E'Old.\n@deprecated use lf';`);
    try {
      const { ts: schema } = await codegen({ schemas: { default_lines: all, default_lines_ns: all }, unprefixedSchema: 'default_lines' });
      const expected = (sequence: string) => ({
        lf: ["* - Nullable, default: `'two", "* lines'::text`"],
        crlf: ["* - Nullable, default: `'two", "* lines'::text`"],
        cr: ["* - Nullable, default: `'two", "* lines'::text`"],
        blank: ["* - Nullable, default: `'a", '* ', "* b'::text`"],
        trail: ["* - Nullable, default: `'ends", "* '::text`"],
        lead: ["* - Nullable, default: `'", "* starts'::text`"],
        // its indentation, and a * it starts with, kept behind the JSDoc's own *
        indented: ["* - Nullable, default: `'a", "*   b'::text`"],
        star: ["* - Nullable, default: `'a", "* * b'::text`"],
        arr: ["* - Nullable, default: `ARRAY['a", "* b'::text]`"],
        seq: [`* - Nullable, default: \`nextval('${sequence}"two`, `* lines"'::regclass)\``],
        closer: ["* - Nullable, default: `'a", "* *\\/ b'::text`"],
        // the comment's tag still after the generated lines (#309)
        tagged: ["* - Nullable, default: `'a", "* b'::text`", '*', '* @deprecated use lf'],
        // one line: as under Zapatos 6.6.1, byte for byte
        one: ["* - Nullable, default: `'single line'::text`"],
        at: ["* - Nullable, default: `'a @x'::text`"],
        // one line too at U+2028, at which no JSDoc line ends, and no namespace's indentation after it (#481)
        ls: [`* - Nullable, default: \`'a\u2028b'::text\``],
      });
      expect.soft(defaultLines(schema, 'unprefixed')).toEqual(expected('default_lines.'));
      expect.soft(defaultLines(schema, 'prefixed')).toEqual(expected('default_lines_ns.'));
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA default_lines, default_lines_ns CASCADE');
    }
  });

  it('writes a comment holding */ with its */ escaped, every line behind its own *', async () => {
    // a */ would end the JSDoc: Zapatos 6.6.1 wrote it as it is, and only a /* after it kept the file parsing
    await t.pool.query(String.raw`
      CREATE SCHEMA comment_closer;
      CREATE TABLE comment_closer.notes (reopen int, later int, plain int);
      COMMENT ON COLUMN comment_closer.notes.reopen IS E'Closes here */\n/* and reopens';
      COMMENT ON COLUMN comment_closer.notes.later IS E'line one\nCloses */\n/* reopens';
      COMMENT ON COLUMN comment_closer.notes.plain IS E'First line\nsecond line';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_closer: all } });
      expect.soft(commentLines(schema, 'notes')).toEqual({
        reopen: ['* Closes here *\\/', '* /* and reopens'],
        later: ['* line one', '* Closes *\\/', '* /* reopens'],
        plain: ['* First line', '* second line'],
      });
      expect.soft(schema).toMatch(/\* Closes here \*\\\/\n +\* \/\* and reopens\n/);  // the line after it, behind its *
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_closer CASCADE');
    }
  });

  it('keeps the comments of views, foreign tables and partitioned tables', async () => {
    const { ts: schema } = await codegen(main);
    expect({
      kind: commentLines(schema, 'events').kind,
      line: commentLines(schema, 'imported_lines').line,
      display_name: commentLines(schema, 'active_users').display_name,
    }).toEqual({
      kind: ['* Partitioned table column comment'],
      line: ['* Foreign table column comment'],
      display_name: ['* View column comment'],
    });
  });

  it('gives each relation its own comments, and invents none', async () => {
    // Postgres copies no comment to a partition, an inheriting table or a view
    await t.pool.query(String.raw`
      CREATE SCHEMA comment_kinds;
      CREATE TABLE comment_kinds.shows (id int NOT NULL, kind text NOT NULL, note text) PARTITION BY LIST (kind);
      COMMENT ON COLUMN comment_kinds.shows.kind IS 'Kind of show';
      COMMENT ON COLUMN comment_kinds.shows.note IS E'Free note\nover two lines';
      CREATE TABLE comment_kinds.shows_live PARTITION OF comment_kinds.shows FOR VALUES IN ('live');
      COMMENT ON COLUMN comment_kinds.shows_live.note IS 'Note on a live show';
      CREATE TABLE comment_kinds.shows_film PARTITION OF comment_kinds.shows FOR VALUES IN ('film');
      CREATE TABLE comment_kinds.shows_other (note text, kind text NOT NULL, id int NOT NULL);
      COMMENT ON COLUMN comment_kinds.shows_other.id IS 'Third column here, first in shows';
      ALTER TABLE comment_kinds.shows ATTACH PARTITION comment_kinds.shows_other DEFAULT;
      CREATE TABLE comment_kinds.parent_t (a int, b int);
      COMMENT ON COLUMN comment_kinds.parent_t.a IS 'Parent a';
      CREATE TABLE comment_kinds.child_t (c int) INHERITS (comment_kinds.parent_t);
      COMMENT ON COLUMN comment_kinds.child_t.b IS 'Child b';
      CREATE VIEW comment_kinds.parent_view AS SELECT a, b FROM comment_kinds.parent_t;
      CREATE VIEW comment_kinds.own_view AS SELECT a AS va, b AS vb FROM comment_kinds.parent_t;
      COMMENT ON COLUMN comment_kinds.own_view.vb IS 'View vb';
      CREATE FOREIGN TABLE comment_kinds.lines (line text, n int) SERVER fixture_files OPTIONS (filename '/dev/null');
      COMMENT ON COLUMN comment_kinds.lines.n IS 'Foreign n';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_kinds: all } });
      const relations = ['shows', 'shows_live', 'shows_film', 'shows_other', 'parent_t', 'child_t', 'parent_view', 'own_view', 'lines'];
      expect(Object.fromEntries(relations.map(rel => [rel, commentLines(schema, rel)]))).toEqual({
        shows: { id: [], kind: ['* Kind of show'], note: ['* Free note', '* over two lines'] },
        shows_live: { id: [], kind: [], note: ['* Note on a live show'] },
        shows_film: { id: [], kind: [], note: [] },
        shows_other: { id: ['* Third column here, first in shows'], kind: [], note: [] },
        parent_t: { a: ['* Parent a'], b: [] },
        child_t: { a: [], b: ['* Child b'], c: [] },
        parent_view: { a: [], b: [] },
        own_view: { va: [], vb: ['* View vb'] },
        lines: { line: [], n: ['* Foreign n'] },
      });
      expect(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_kinds CASCADE');
    }
  });

  it('escapes a comment holding */ on every kind of relation, a materialized view included', async () => {
    await t.pool.query(String.raw`
      CREATE SCHEMA comment_kinds_closer;
      CREATE TABLE comment_kinds_closer.t (x int);
      COMMENT ON COLUMN comment_kinds_closer.t.x IS E'Closes */\n/* reopens';
      CREATE VIEW comment_kinds_closer.v AS SELECT 1 AS x, 2 AS y, 3 AS z;
      COMMENT ON COLUMN comment_kinds_closer.v.x IS 'Ends */ early';
      COMMENT ON COLUMN comment_kinds_closer.v.y IS E'Closes */\n/* reopens';
      COMMENT ON COLUMN comment_kinds_closer.v.z IS 'Plain';
      CREATE FOREIGN TABLE comment_kinds_closer.f (x text, y text) SERVER fixture_files OPTIONS (filename '/dev/null');
      COMMENT ON COLUMN comment_kinds_closer.f.x IS 'Ends */ early';
      COMMENT ON COLUMN comment_kinds_closer.f.y IS 'Plain';
      CREATE TABLE comment_kinds_closer.p (x int, y int) PARTITION BY RANGE (x);
      COMMENT ON COLUMN comment_kinds_closer.p.x IS 'Ends */ early';
      COMMENT ON COLUMN comment_kinds_closer.p.y IS 'Plain';
      CREATE MATERIALIZED VIEW comment_kinds_closer.m AS SELECT 1 AS x, 2 AS y;
      COMMENT ON COLUMN comment_kinds_closer.m.x IS 'Ends */ early';
      COMMENT ON COLUMN comment_kinds_closer.m.y IS E'Closes */\n/* reopens';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_kinds_closer: all } });
      expect.soft(Object.fromEntries(['t', 'v', 'f', 'p', 'm'].map(rel => [rel, commentLines(schema, rel)]))).toEqual({
        t: { x: ['* Closes *\\/', '* /* reopens'] },
        v: { x: ['* Ends *\\/ early'], y: ['* Closes *\\/', '* /* reopens'], z: ['* Plain'] },
        f: { x: ['* Ends *\\/ early'], y: ['* Plain'] },
        p: { x: ['* Ends *\\/ early'], y: ['* Plain'] },
        m: { x: ['* Ends *\\/ early'], y: ['* Closes *\\/', '* /* reopens'] },
      });
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_kinds_closer CASCADE');
    }
  });

  describe('a comment holding a JSDoc tag', () => {
    /** Each column's JSDoc as TypeScript reads it, by interface: its text and its tags, as the editor's hover shows them. */
    const hovers = (schema: string, table: string) => {
      const
        // an inline `{@link name text}` as TypeScript writes it back
        text = (comment: string | ts.NodeArray<ts.JSDocComment> | undefined) => ts.getTextOfJSDocComment(comment) ?? '',
        source = ts.createSourceFile('schema.d.ts', schema, ts.ScriptTarget.Latest, true),
        found: Record<string, Record<string, { text: string, tags: string[] }>> = {},
        visit = (node: ts.Node): void => {
          if (ts.isPropertySignature(node) && ts.isInterfaceDeclaration(node.parent) &&
            ts.isModuleBlock(node.parent.parent) && node.parent.parent.parent.name.text === table) {
            const doc = node.getChildren().find(ts.isJSDoc)!;
            (found[node.parent.name.text] ??= {})[node.name.getText()] = {
              text: text(doc.comment),
              // `@see` reads its first word as a name, the rest as its text
              tags: (doc.tags ?? []).map(tag =>
                `@${tag.tagName.text} ${ts.isJSDocSeeTag(tag) && tag.name ? tag.name.getText() : ''}${text(tag.comment)}`.trimEnd()),
            };
          }
          ts.forEachChild(node, visit);
        };
      visit(source);
      return found;
    };

    // tsForConfig() reads through its own connection: the schema is committed, then dropped
    beforeAll(() => t.pool.query(String.raw`
      CREATE SCHEMA comment_tags;
      CREATE TABLE comment_tags.roles (
        dep int, first int, indented int, crlf int, two int, mid int, kept int, seen int, after int,
        email int, spaced int, ticked int, linked int, linkcode int, linkplain int, unclosed int,
        runs int, bare int, runtag int, asked int);
      COMMENT ON COLUMN comment_tags.roles.dep IS E'Billing order.\n@deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.first IS '@deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.indented IS E'Billing order.\n  @deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.crlf IS E'Billing order.\r\n@deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.two IS E'Billing order.\n@deprecated use lead\n@see lead';
      COMMENT ON COLUMN comment_tags.roles.mid IS E'Billing order.\nSince 2026 @deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.kept IS E'@deprecated use lead\nkept for old credits';
      COMMENT ON COLUMN comment_tags.roles.seen IS '{@see lead @casting}';
      COMMENT ON COLUMN comment_tags.roles.after IS '{@link lead} or @casting';
      COMMENT ON COLUMN comment_tags.roles.email IS 'Ask casting@example.com';
      COMMENT ON COLUMN comment_tags.roles.spaced IS 'Fee @ 5 a day';
      COMMENT ON COLUMN comment_tags.roles.ticked IS E'Billing order.\n\`@deprecated\` is not a tag';
      COMMENT ON COLUMN comment_tags.roles.linked IS '{@link lead see @casting}';
      COMMENT ON COLUMN comment_tags.roles.linkcode IS '{@linkcode lead see @casting}';
      COMMENT ON COLUMN comment_tags.roles.linkplain IS '{@linkplain lead see @casting}';
      COMMENT ON COLUMN comment_tags.roles.unclosed IS '{@link lead see @casting';
      COMMENT ON COLUMN comment_tags.roles.runs IS E'{@link lead\nsee @casting}';
      COMMENT ON COLUMN comment_tags.roles.bare IS E'{@link\nsee @casting}';
      COMMENT ON COLUMN comment_tags.roles.runtag IS E'{@link lead\n@deprecated use lead';
      COMMENT ON COLUMN comment_tags.roles.asked IS E'See {@link lead\nthe lead, ask @casting}';`));
    afterAll(() => t.pool.query('DROP SCHEMA comment_tags CASCADE'));

    it('keeps the type and nullability lines out of the tag, and keeps the tag', async () => {
      const
        { ts: schema } = await codegen({ schemas: { comment_tags: all } }),
        { Selectable, ...others } = hovers(schema, 'roles'),
        generated = '- `int4` in database\n- Nullable, no default';
      expect.soft(Selectable).toEqual({
        dep: { text: `**comment_tags.roles.dep**\n\nBilling order.\n${generated}`, tags: ['@deprecated use lead'] },
        // nothing before the tag: the name, then the generated lines, as for a column without a comment
        first: { text: `**comment_tags.roles.first**\n${generated}`, tags: ['@deprecated use lead'] },
        indented: { text: `**comment_tags.roles.indented**\n\nBilling order.\n${generated}`, tags: ['@deprecated use lead'] },
        crlf: { text: `**comment_tags.roles.crlf**\n\nBilling order.\n${generated}`, tags: ['@deprecated use lead'] },
        two: { text: `**comment_tags.roles.two**\n\nBilling order.\n${generated}`, tags: ['@deprecated use lead', '@see lead'] },
        // TypeScript also starts a tag at an @ after a space, in the middle of a line
        mid: { text: `**comment_tags.roles.mid**\n\nBilling order.\n${generated}\n\nSince 2026`, tags: ['@deprecated use lead'] },
        kept: { text: `**comment_tags.roles.kept**\n${generated}`, tags: ['@deprecated use lead\nkept for old credits'] },
        // {@see} is no inline link: the @ after its space starts a tag, as after an inline link's closing }
        seen: { text: `**comment_tags.roles.seen**\n${generated}\n\n{@see lead`, tags: ['@casting }'] },
        after: { text: `**comment_tags.roles.after**\n${generated}\n\n{@link lead} or`, tags: ['@casting'] },
        email: { text: `**comment_tags.roles.email**\n\nAsk casting@example.com\n${generated}`, tags: [] },
        spaced: { text: `**comment_tags.roles.spaced**\n\nFee @ 5 a day\n${generated}`, tags: [] },
        ticked: { text: `**comment_tags.roles.ticked**\n\nBilling order.\n\`@deprecated\` is not a tag\n${generated}`, tags: [] },
        // an @ inside an inline link, closed or not, is the link's text
        linked: { text: `**comment_tags.roles.linked**\n\n{@link lead see @casting}\n${generated}`, tags: [] },
        linkcode: { text: `**comment_tags.roles.linkcode**\n\n{@linkcode lead see @casting}\n${generated}`, tags: [] },
        linkplain: { text: `**comment_tags.roles.linkplain**\n\n{@linkplain lead see @casting}\n${generated}`, tags: [] },
        // unclosed, the link takes in the line break and the next line's *, which TypeScript reads as on master
        unclosed: { text: `**comment_tags.roles.unclosed**\n\n{@link lead see @casting}        * ${generated}`, tags: [] },
        // a link whose line ends on {@link or on its name runs on through the next line, * included
        runs: { text: `**comment_tags.roles.runs**\n\n{@link lead * see @casting}\n${generated}`, tags: [] },
        bare: { text: `**comment_tags.roles.bare**\n\n{@link  * see @casting}\n${generated}`, tags: [] },
        runtag: { text: `**comment_tags.roles.runtag**\n\n{@link lead * @deprecated use lead}        * ${generated}`, tags: [] },
        asked: { text: `**comment_tags.roles.asked**\n\nSee {@link lead * the lead, ask @casting}\n${generated}`, tags: [] },
      });
      // the same JSDoc on every interface that has the column
      expect.soft(Object.keys(others)).toEqual(['JSONSelectable', 'Whereable', 'Insertable', 'Updatable']);
      for (const columns of Object.values(others)) expect.soft(columns).toEqual(Selectable);
      expect.soft(syntaxErrors(schema)).toEqual([]);
    });

    it('writes the lines before the tag, the generated lines, a * line, then the tag lines', async () => {
      const { ts: schema } = await codegen({ schemas: { comment_tags: all } });
      expect.soft(schema).toContain([
        '* **comment_tags.roles.two**',
        '*',
        '* Billing order.',
        '* - `int4` in database',
        '* - Nullable, no default',
        '*',
        '* @deprecated use lead',
        '* @see lead',
        '*/',
      ].join('\n        '));
      // a comment without a tag keeps its JSDoc as it was: the comment's lines, then the generated ones
      expect.soft(commentLines(schema, 'roles').spaced).toEqual(['* Fee @ 5 a day']);
      expect.soft(commentLines(schema, 'roles').unclosed).toEqual(['* {@link lead see @casting']);
      expect.soft(commentLines(schema, 'roles').runs).toEqual(['* {@link lead', '* see @casting}']);
      expect.soft(commentLines(schema, 'roles').bare).toEqual(['* {@link', '* see @casting}']);
      expect.soft(commentLines(schema, 'roles').runtag).toEqual(['* {@link lead', '* @deprecated use lead']);
      expect.soft(commentLines(schema, 'roles').asked).toEqual(['* See {@link lead', '* the lead, ask @casting}']);
    });
  });
});

describe('quotes and */', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  beforeAll(() => t.pool.query(String.raw`
    CREATE SCHEMA quoting;
    CREATE TYPE quoting.marks AS ENUM ('back\slash', 'trail\', 'it''s');
    CREATE DOMAIN quoting."code*/" AS text;
    CREATE TABLE quoting.takes ("back\slash" int, "say ""cut""" int, m quoting.marks, code quoting."code*/");
    CREATE UNIQUE INDEX "idx\back" ON quoting.takes ("back\slash");
  `));
  afterAll(() => t.pool.query('DROP SCHEMA quoting CASCADE'));

  it('edge: writes */ as *\\/ in a column name, a DEFAULT and a comment', async () => {
    const { ts: schema } = await codegen({ schemas: { edge: all } });
    expect.soft(schema).toContain('* **edge.odd table.*\\/**');
    expect.soft(schema).toContain("* - Nullable, default: `'*\\/'::text`");
    expect.soft(schema).toContain('* Column comment with *\\/ inside');
    expect.soft(schema).not.toMatch(/\*\/\*\*|'\*\/'|with \*\/ inside/);
  });

  it('escapes the */ that the ** before a name makes with its leading /, prefixed or not', async () => {
    await t.pool.query(`
      CREATE SCHEMA "/lead";
      CREATE TABLE "/lead".films (id int);
      CREATE SCHEMA slash_reels;
      CREATE TABLE slash_reels."/reels" (id int);`);
    try {
      const { ts: schema } = await codegen({ schemas: { '/lead': all, slash_reels: all }, unprefixedSchema: 'slash_reels' });
      expect.soft(schema).toContain('* **\\/lead.films**\n');
      expect.soft(schema).toContain('* **\\/lead.films.id**\n');
      expect.soft(schema).toContain('* **\\/reels**\n');
      expect.soft(schema).toContain('* **\\/reels.id**\n');
      expect.soft(schema).not.toMatch(/\*\*\//);
      expect.soft(syntaxErrors(schema)).toEqual([]);  // its namespaces legalised: _lead, _reels
    } finally {
      await t.pool.query('DROP SCHEMA "/lead" CASCADE; DROP SCHEMA slash_reels CASCADE');
    }
  });

  it('escapes a quote and a backslash in a label, an index and a column name, and */ in a type name', async () => {
    const { ts: schema } = await codegen({ schemas: { quoting: all } });
    expect.soft(schema).toContain(`export type marks = 'back\\\\slash' | 'it\\'s' | 'trail\\\\';`);
    expect.soft(schema).toContain(`export type marks = ['back\\\\slash', 'it\\'s', 'trail\\\\'];`);
    expect.soft(schema).toContain('"back\\\\slash": number | null;');
    expect.soft(schema).toContain('"say \\"cut\\"": number | null;');
    expect.soft(schema).toContain(`export type UniqueIndex = 'idx\\\\back';`);
    expect.soft(schema).toContain('* - `code*\\/` (base type: `text`) in database');
    expect.soft(syntaxErrors(schema)).toEqual([]);
  });

  it('escapes a backslash before a digit in a label, which TypeScript reads as an octal escape', async () => {
    await t.pool.query(String.raw`
      CREATE SCHEMA octal;
      CREATE TYPE octal.reels AS ENUM ('a\1', 'b\8');
      CREATE TABLE octal.takes (r octal.reels);`);
    try {
      for (const typeEnumsAcrossSchemas of [false, true]) {
        const { ts: schema } = await codegen({ schemas: { octal: all }, typeEnumsAcrossSchemas });
        expect.soft(schema).toContain(`export type reels = 'a\\\\1' | 'b\\\\8';`);
        expect.soft(syntaxErrors(schema)).toEqual([]);
      }
    } finally {
      await t.pool.query('DROP SCHEMA octal CASCADE');
    }
  });
});

describe('awkward names', () => {
  // a schema of its own, committed to this file's database: no other test configures it
  beforeAll(() => t.pool.query(String.raw`
    CREATE SCHEMA "box-office";
    CREATE TYPE "box-office".string AS ENUM ('b', 'a');
    CREATE TABLE "box-office"."2nd take" (id int);
    CREATE TABLE "box-office".keyof (s "box-office".string, ss "box-office".string[]);
    CREATE TABLE "box-office"."it's\here" (id int);
  `));
  afterAll(() => t.pool.query('DROP SCHEMA "box-office" CASCADE'));

  it('edge: names a relation or an enum that TypeScript refuses with a legal identifier, its real name in strings', async () => {
    const { ts: schema } = await codegen({ schemas: { edge: all } });
    expect.soft(schema).toContain('export namespace odd_table {');
    expect.soft(schema).toContain('export namespace class_ {');
    expect.soft(schema).toContain(`export type traffic_light = 'amber\\'s' | 'green light' | 'red';`);
    expect.soft(schema).toContain(`export type traffic_light = ['amber\\'s', 'green light', 'red'];`);
    expect.soft(schema).toContain('light: traffic_light | null;');
    expect.soft(schema).toContain('export type Table = class_.Table | odd_table.Table;');
    expect.soft(schema).toContain(`export type Table = 'edge.odd table';`);
    expect.soft(schema).toContain('"edge.odd table": edge.odd_table.Selectable;');
    expect.soft(schema).toContain('"edge.class": edge.class_.Selectable;');
    expect.soft(syntaxErrors(schema)).toEqual([]);
  });

  it("legalises a schema name, a leading digit and a type operator, but keeps an enum named after a TypeScript type", async () => {
    const { ts: schema } = await codegen({ schemas: { 'box-office': all } });
    expect.soft(schema).toContain('export namespace box_office {');
    expect.soft(schema).toContain('export namespace _2nd_take {');
    expect.soft(schema).toContain('export namespace keyof_ {');
    expect.soft(schema).toContain('export namespace it_s_here {');
    expect.soft(schema).toContain(`export type string = 'a' | 'b';`);
    expect.soft(schema).toContain('s: string | null;');
    expect.soft(schema).toContain('ss: string[] | null;');
    expect.soft(schema).toContain(`export type Schema = 'box-office';`);
    expect.soft(schema).toContain('"box-office.keyof": box_office.keyof_.Selectable;');
    expect.soft(schema).toContain('export type AllBaseTables = [...box_office.AllBaseTables];');
    expect.soft(schema).toContain(`export type Table = 'box-office.it\\'s\\\\here';`);
    expect.soft(schema).toContain(`"box-office.it's\\\\here": box_office.it_s_here.Selectable;`);
    expect.soft(syntaxErrors(schema)).toEqual([]);
  });

  it('escapes */ in the header of a schema, whose namespace is legalised', async () => {
    await t.pool.query('CREATE SCHEMA "cut*/here"; CREATE TABLE "cut*/here".takes (id int);');
    try {
      const { ts: schema } = await codegen({ schemas: { 'cut*/here': all } });
      expect.soft(schema).toContain('/* === schema: cut*\\/here === */');
      expect.soft(schema).toContain('export namespace cut_here {');
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA "cut*/here" CASCADE');
    }
  });

  it('prefixes every line of a name holding a line break, in an unprefixed and a prefixed schema', async () => {
    /** Each JSDoc of the namespace `name` in `schema` and of its `Selectable`'s members, by member name: its lines, indentation trimmed. */
    const docsOf = (schema: string, name: string) => {
      const
        lines = (node: ts.Node) => (node as { jsDoc?: ts.JSDoc[] }).jsDoc![0].getText().split(/\r\n?|\n/).map(line => line.trimStart()),
        find = (node: ts.Node): ts.ModuleDeclaration | undefined =>
          ts.isModuleDeclaration(node) && node.name.text === name ? node : ts.forEachChild(node, find),
        namespace = find(ts.createSourceFile('schema.ts', schema, ts.ScriptTarget.Latest, true))!,
        selectable = (namespace.body as ts.ModuleBlock).statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'Selectable') as ts.InterfaceDeclaration;
      return { relation: lines(namespace), ...Object.fromEntries(selectable.members.map(m => [(m.name as ts.StringLiteral | ts.Identifier).text, lines(m)])) } as Record<string, string[]>;
    };
    const ddl = (schema: string) => `
      CREATE SCHEMA ${schema};
      CREATE DOMAIN ${schema}."dom${'\n'}name" AS text;
      CREATE TYPE ${schema}."enum${'\r\n'}name" AS ENUM ('x');
      CREATE TYPE ${schema}."comp${'\r'}name" AS (a int);
      CREATE TABLE ${schema}."two${'\n'}lines" ("col${'\r\n'}name" int, "col${'\r'}name" int, d ${schema}."dom${'\n'}name",
        e ${schema}."enum${'\r\n'}name", ea ${schema}."enum${'\r\n'}name"[], t ${schema}."comp${'\r'}name", "one line" int);
      CREATE MATERIALIZED VIEW ${schema}."view${'\n'}name" AS SELECT "col${'\r\n'}name" FROM ${schema}."two${'\n'}lines";`;
    // tsForConfig() reads through its own connection: the schemas are committed, then dropped
    await t.pool.query(ddl('line_names') + ddl(`"name${'\r\n'}lines"`));
    try {
      const { ts: schema } = await codegen({ schemas: { line_names: all, [`name${'\r\n'}lines`]: all }, unprefixedSchema: 'line_names' });
      const expected = (prefixed: boolean) => {
        // the title, its last line ending with `last`: an unprefixed schema names no schema in a JSDoc
        const
          title = (relation: string[], ...last: string[]) => {
            const lines = [...prefixed ? ['* **name', `* lines.${relation[0]}`] : [`* **${relation[0]}`], ...relation.slice(1).map(l => `* ${l}`)];
            return last.length ? [...lines.slice(0, -1), lines.at(-1) + '.' + last[0], ...last.slice(1).map(l => `* ${l}`)] : lines;
          },
          column = (last: string[], type: string[], rest = ['* - Nullable, no default']) =>
            ['/**', ...title(['two', 'lines'], ...last), ...type, ...rest, '*/'],
          int4 = ['* - `int4` in database'];
        return {
          relation: ['/**', ...title(['two', 'lines**']), '* - Table in database', '*/'],
          [`col${'\r\n'}name`]: column(['col', 'name**'], int4),
          [`col${'\r'}name`]: column(['col', 'name**'], int4),
          d: column(['d**'], ['* - `dom', '* name` (base type: `text`) in database']),
          e: column(['e**'], ['* - `enum', '* name` in database']),
          ea: column(['ea**'], ['* - `_enum', '* name` in database']),
          t: column(['t**'], ['* - `comp', '* name` in database']),
          // a name on one line: as under Zapatos 6.6.1, byte for byte
          'one line': column(['one line**'], int4),
        };
      };
      expect.soft(docsOf(schema, 'two_lines')).toEqual(expected(false));
      expect.soft(docsOf(schema.slice(schema.indexOf('export namespace name_lines {')), 'two_lines'))
        .toEqual(expected(true));
      // and a materialised view's column, whose JSDoc reads the name through another query
      expect.soft(docsOf(schema, 'view_name')[`col${'\r\n'}name`])
        .toEqual(['/**', '* **view', '* name.col', '* name**', '* - `int4` in database', '* - Materialized view column', '*/']);
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query(`DROP SCHEMA line_names, "name${'\r\n'}lines" CASCADE`);
    }
  });

  it('keeps the namespace indentation out of a name holding U+2028 or U+2029, in an unprefixed and a prefixed schema', async () => {
    // JavaScript's multiline ^ also matches after U+2028 and U+2029, which TypeScript reads inside a string or a JSDoc
    const [ls, ps] = ['\u2028', '\u2029'];
    /** Every string literal of `schema` holding a separator, as TypeScript reads it: a name, a key, a label. */
    const separated = (schema: string) => {
      const found = new Set<string>();
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) && /[\u2028\u2029]/.test(node.text)) found.add(node.text);
        ts.forEachChild(node, visit);
      };
      visit(ts.createSourceFile('schema.ts', schema, ts.ScriptTarget.Latest, true));
      return [...found].sort();
    };
    const ddl = (schema: string) => `
      CREATE SCHEMA ${schema};
      CREATE TYPE ${schema}.reels AS ENUM ('l${ls}m', '${ps}lead');
      CREATE DOMAIN ${schema}."d${ps}x" AS text;
      CREATE TABLE ${schema}."a${ls}rel" (id int, "c${ls}x" int, "c${ps} x" int, "c${ls}" int, r ${schema}.reels,
        d ${schema}."d${ps}x", noted int, dflt text DEFAULT 'a${ls}b', CONSTRAINT "i${ls}x" UNIQUE (id));
      COMMENT ON COLUMN ${schema}."a${ls}rel".noted IS 'one${ls}two';
      CREATE MATERIALIZED VIEW ${schema}."m${ps}x" AS SELECT "c${ls}x" FROM ${schema}."a${ls}rel";`;
    // tsForConfig() reads through its own connection: the schemas are committed, then dropped
    await t.pool.query(ddl('separator_names') + ddl(`"sep${ls}names"`));
    try {
      const { ts: schema } = await codegen({ schemas: { separator_names: all, [`sep${ls}names`]: all }, unprefixedSchema: 'separator_names' });
      // each is the database's name, byte for byte: Zapatos 6.6.1 and master wrote 2 spaces after the separator, 4 in a namespace
      expect.soft(separated(schema)).toEqual([
        'a\u2028rel', 'm\u2029x', 'sep\u2028names.a\u2028rel', 'sep\u2028names.m\u2029x',  // Table, and the lookups' keys
        'sep\u2028names',  // Schema and AllSchemas
        'c\u2028x', 'c\u2029 x', 'c\u2028', 'l\u2028m', '\u2029lead', 'i\u2028x',  // property names, enum labels, UniqueIndex
      ].sort());
      expect.soft(schema).toContain('"sep\u2028names.a\u2028rel": sep_names.a_rel.Selectable;');
      expect.soft(schema).toContain(`export type Table = 'sep\u2028names.a\u2028rel';`);
      // and in the JSDoc and the schema's header
      expect.soft(schema).toContain('/* === schema: sep\u2028names === */');
      expect.soft(schema).toContain('* **sep\u2028names.a\u2028rel.noted**');
      expect.soft(schema).toContain('* one\u2028two');
      expect.soft(schema).toContain("* - Nullable, default: `'a\u2028b'::text`");
      expect.soft(schema).toContain('* - `d\u2029x` (base type: `text`) in database');
      expect.soft(schema).not.toMatch(/[\u2028\u2029] {2}/);
      expect.soft(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query(`DROP SCHEMA separator_names, "sep${ls}names" CASCADE`);
    }
  });

  it('notes two names that become one identifier', async () => {
    await t.pool.query(`
      CREATE SCHEMA "two-names";
      CREATE SCHEMA two_names;
      CREATE TYPE two_names."traffic-light" AS ENUM ('red');
      CREATE TYPE two_names.traffic_light AS ENUM ('red');
      CREATE TABLE two_names."odd table" (id int);
      CREATE TABLE two_names.odd_table (id int);
      CREATE TABLE two_names."odd-table" (id int);`);
    try {
      expect(await warningsFor({ 'two-names': all, two_names: all })).toEqual([
        'Note: enums "two_names"."traffic-light" and "two_names"."traffic_light" are both named traffic_light ' +
        'in TypeScript, so their declarations clash. To type them apart, rename one of them in the database.',
        'Note: relations "two_names"."odd table", "two_names"."odd-table" and "two_names"."odd_table" are all named ' +
        'odd_table in TypeScript, so their declarations clash. To type them apart, rename one of them in the database.',
        'Note: schemas "two-names" and "two_names" are both named two_names in TypeScript, ' +
        'so their declarations clash. To type them apart, rename one of them in the database.',
      ]);
      expect(await warningsFor({ edge: all, 'box-office': all })).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA "two-names", two_names CASCADE');
    }
  });

  it("notes a relation of unprefixedSchema named like another schema's namespace, as both stand at the top", async () => {
    await t.pool.query(`
      CREATE SCHEMA top_level;
      CREATE TABLE top_level."box-office" (id int);
      CREATE TABLE top_level.takes (id int);
      CREATE SCHEMA box_office;
      CREATE TABLE box_office.takes (id int);`);
    try {
      expect.soft(await warningsFor({ top_level: all, box_office: all }, { unprefixedSchema: 'top_level' })).toEqual([
        'Note: relation "top_level"."box-office" and schema "box_office" are both named box_office in TypeScript, ' +
        'so their declarations clash. To type them apart, rename one of them in the database.',
      ]);
      // prefixed, the relation is in its schema's namespace
      expect.soft(await warningsFor({ top_level: all, box_office: all }, { unprefixedSchema: null })).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA top_level, box_office CASCADE');
    }
  });

  it('names a relation after a property of Object.prototype, with no note', async () => {
    await t.pool.query(`
      CREATE SCHEMA proto_names;
      CREATE TABLE proto_names."constructor" (id int);
      CREATE TABLE proto_names."toString" (id int);`);
    try {
      expect.soft(await warningsFor({ proto_names: all })).toEqual([]);
      expect.soft(await warningsFor({ proto_names: all }, { unprefixedSchema: 'proto_names' })).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA proto_names CASCADE');
    }
  });
});

describe('custom types that share a placeholder name', () => {
  // two schemas of their own, committed to this file's database: no other test configures them
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA collide_a;
    CREATE SCHEMA collide_b;
    CREATE DOMAIN collide_a.code AS text;
    CREATE DOMAIN collide_b.code AS integer;
    CREATE TYPE collide_a.pair AS (x int, y int);
    CREATE TYPE collide_b.pair AS (x text, y text);
    CREATE DOMAIN collide_a."code-x" AS text;
    CREATE DOMAIN collide_a.code_x AS text;
    CREATE TABLE collide_a.things (code collide_a.code, pair collide_a.pair, amount public.positive_int);
    CREATE TABLE collide_b.things (pair collide_b.pair, amount public.positive_int);
    CREATE MATERIALIZED VIEW collide_b.codes AS SELECT 1::collide_b.code AS code;
    CREATE MATERIALIZED VIEW collide_b.pairs AS SELECT NULL::collide_a.pair AS a, NULL::collide_b.pair AS b;
    CREATE MATERIALIZED VIEW collide_b.amounts AS SELECT 1::public.positive_int AS amount;
    CREATE TABLE collide_a.labels (dashed collide_a."code-x", underscored collide_a.code_x);
    CREATE DOMAIN collide_a."code x" AS text;
    CREATE TABLE collide_a.spaced (spaced collide_a."code x");
    CREATE DOMAIN collide_a."Code" AS text;
    CREATE DOMAIN collide_a."CODE" AS boolean;
    CREATE TABLE collide_a.cased (a collide_a."Code", b collide_a.code, d collide_a."CODE");
    CREATE TABLE collide_a.shouted (d collide_a."CODE");
    CREATE DOMAIN collide_a.index AS integer;
    CREATE DOMAIN collide_a."Index" AS integer;
    CREATE DOMAIN collide_b."INDEX" AS integer;
    CREATE TABLE collide_a.indexed (i collide_a.index);
    CREATE TABLE collide_a.indexed_title (i collide_a."Index");
    CREATE TABLE collide_b.indexed_upper (i collide_b."INDEX");
  `));
  afterAll(() => t.pool.query('DROP SCHEMA collide_a, collide_b CASCADE'));

  it('warns once per name that types of two schemas share, a table and a materialized view alike', async () => {
    expect(await warningsFor({ collide_a: only('things'), collide_b: only('things', 'codes') })).toEqual([
      'Note: custom types "collide_a"."code" and "collide_b"."code" are both named PgCode in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgCode.d.ts. ' +
      'To type them apart, rename one of them in the database.',
      'Note: custom types "collide_a"."pair" and "collide_b"."pair" are both named PgPair in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgPair.d.ts. ' +
      'To type them apart, rename one of them in the database.',
    ]);
  });

  it('names the schema of each type, not of the materialized view that selects it', async () => {
    expect(await warningsFor({ collide_b: only('pairs') })).toEqual([
      'Note: custom types "collide_a"."pair" and "collide_b"."pair" are both named PgPair in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgPair.d.ts. ' +
      'To type them apart, rename one of them in the database.',
    ]);
  });

  it("names the placeholder in pgcast/custom with moduleNames: 'pgcast'", async () => {
    expect(await warningsFor({ collide_b: only('pairs') }, { moduleNames: 'pgcast' })).toEqual([
      'Note: custom types "collide_a"."pair" and "collide_b"."pair" are both named PgPair in TypeScript, ' +
      'so they share one type and one placeholder file, src/pgcast/custom/PgPair.d.ts. ' +
      'To type them apart, rename one of them in the database.',
    ]);
  });

  it('warns when two names become one, and points at customTypesTransform', async () => {
    expect(await warningsFor({ collide_a: only('labels') })).toEqual([
      'Note: custom types "collide_a"."code-x" and "collide_a"."code_x" are both named PgCode_x in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgCode_x.d.ts. ' +
      'To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
    ]);
  });

  it('lists three types that share a name', async () => {
    expect(await warningsFor({ collide_a: only('labels', 'spaced') })).toEqual([
      'Note: custom types "collide_a"."code x", "collide_a"."code-x" and "collide_a"."code_x" are all named PgCode_x ' +
      'in TypeScript, so they share one type and one placeholder file, src/zapatos/custom/PgCode_x.d.ts. ' +
      'To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
    ]);
  });

  it('warns for names that differ only in case, whose placeholders are one file on macOS and Windows', async () => {
    // PgCode and PgCODE: the file written first declares only its own name; #42's note for PgCode follows
    expect(await warningsFor({ collide_a: only('cased') })).toEqual([
      'Note: custom types "collide_a"."CODE" (PgCODE), "collide_a"."Code" (PgCode) and "collide_a"."code" (PgCode) ' +
      'have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and ' +
      'Windows, PgCODE.d.ts and PgCode.d.ts are one placeholder file in src/zapatos/custom, which declares only one of ' +
      'those names. To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
      'Note: custom types "collide_a"."Code" and "collide_a"."code" are both named PgCode in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgCode.d.ts. ' +
      'To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
    ]);
  });

  it('keeps the note on a name that two schemas share when another name differs from it only in case', async () => {
    // a function gets "code" for both PgCode types, so it cannot type them apart: #42's note says so
    expect(await warningsFor({ collide_a: only('things', 'shouted'), collide_b: only('codes') })).toEqual([
      'Note: custom types "collide_a"."CODE" (PgCODE), "collide_a"."code" (PgCode) and "collide_b"."code" (PgCode) ' +
      'have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and ' +
      'Windows, PgCODE.d.ts and PgCode.d.ts are one placeholder file in src/zapatos/custom, which declares only one of ' +
      'those names. To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
      'Note: custom types "collide_a"."code" and "collide_b"."code" are both named PgCode in TypeScript, ' +
      'so they share one type and one placeholder file, src/zapatos/custom/PgCode.d.ts. ' +
      'To type them apart, rename one of them in the database.',
    ]);
  });

  it('warns for names that differ only in case under a customTypesTransform function', async () => {
    expect(await warningsFor({ collide_a: only('cased') }, { customTypesTransform: name => name, outExt: '.ts' })).toEqual([
      'Note: custom types "collide_a"."CODE" (CODE), "collide_a"."Code" (Code) and "collide_a"."code" (code) ' +
      'have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and ' +
      'Windows, CODE.ts, Code.ts and code.ts are one placeholder file in src/zapatos/custom, which declares only one of ' +
      'those names. To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
    ]);
  });

  it("warns for a placeholder named index, which the custom types' index file writes over", async () => {
    const note = (outDir: string, name: string) =>
      `Note: custom type "collide_a"."index" (${name}) has the placeholder file index.d.ts in ${outDir}/custom, ` +
      `the file of the custom types' index: the generator writes the index over it on every run, ` +
      `so ${name} is never declared. To declare it, rename it in the database, ` +
      `or give customTypesTransform a function that names it otherwise.`;
    expect.soft(await warningsFor({ collide_a: only('indexed') }, { customTypesTransform: 'my_type' }))
      .toEqual([note('src/zapatos', 'index')]);
    expect.soft(await warningsFor({ collide_a: only('indexed') }, { customTypesTransform: name => name }))
      .toEqual([note('src/zapatos', 'index')]);
    expect.soft(await warningsFor({ collide_a: only('indexed') }, { customTypesTransform: 'my_type', moduleNames: 'pgcast' }))
      .toEqual([note('src/pgcast', 'index')]);
    // the default transform gives PgIndex
    expect.soft(await warningsFor({ collide_a: only('indexed') })).toEqual([]);
  });

  it('warns for a placeholder named index but for its case, on a case-insensitive file system', async () => {
    expect(await warningsFor({ collide_a: only('indexed_title'), collide_b: only('indexed_upper') },
      { customTypesTransform: name => name, outExt: '.ts' })).toEqual([
      'Note: custom types "collide_a"."Index" (Index) and "collide_b"."INDEX" (INDEX) ' +
      'have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and ' +
      'Windows, INDEX.ts and Index.ts are one placeholder file in src/zapatos/custom, which declares only one of ' +
      'those names. To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
      'Note: custom types "collide_a"."Index" (Index) and "collide_b"."INDEX" (INDEX) have the placeholder files ' +
      'INDEX.ts and Index.ts in src/zapatos/custom, the file of the custom types\' index on a case-insensitive file ' +
      'system, the default on macOS and Windows: the generator writes the index over it on every run, ' +
      'so INDEX and Index are never declared there. To declare them, rename them in the database, ' +
      'or give customTypesTransform a function that names them otherwise.',
    ]);
  });

  it('names the case-insensitive file system for the placeholders of index that only it makes one', async () => {
    expect(await warningsFor({ collide_a: only('indexed', 'indexed_title') }, { customTypesTransform: 'my_type' })).toEqual([
      'Note: custom types "collide_a"."Index" (Index) and "collide_a"."index" (index) ' +
      'have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and ' +
      'Windows, Index.d.ts and index.d.ts are one placeholder file in src/zapatos/custom, which declares only one of ' +
      'those names. To type them apart, rename one of them in the database, ' +
      'or give customTypesTransform a function that keeps their names apart.',
      'Note: custom types "collide_a"."Index" (Index) and "collide_a"."index" (index) have the placeholder files ' +
      'Index.d.ts and index.d.ts in src/zapatos/custom, the file of the custom types\' index (Index.d.ts on a ' +
      'case-insensitive file system, the default on macOS and Windows): the generator writes the index over it ' +
      'on every run, so index is never declared, nor Index on such a file system. To declare them, ' +
      'rename them in the database, ' +
      'or give customTypesTransform a function that names them otherwise.',
    ]);
  });

  it('does not warn when no name is shared', async () => {
    // public.positive_int, in a table of each schema and a materialized view of collide_b, is one type
    expect(await warningsFor({ public: all, collide_b: only('things', 'amounts') })).toEqual([]);
    expect(await warningsFor(main.schemas!)).toEqual([]);
  });
});

describe('typeEnumsAcrossSchemas', () => {
  // schemas of their own, committed to this file's database: no other test configures them;
  // enum_y is never generated, and enum_x has an enum of the same name as one of enum_y
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA enum_x;
    CREATE SCHEMA enum_y;
    CREATE TYPE enum_x.st AS ENUM ('mine');
    CREATE TYPE enum_y.st AS ENUM ('yours', 'theirs');
    CREATE TYPE enum_y.solo AS ENUM ('only');
    CREATE DOMAIN enum_y.st_d AS enum_y.st;
    CREATE TABLE enum_x.t (a enum_y.st, b enum_y.st[], d enum_y.st_d, o enum_y.solo, own enum_x.st, n int);
    CREATE MATERIALIZED VIEW enum_x.mv AS SELECT NULL::enum_y.st AS a, NULL::extra.status AS s;
  `));
  afterAll(() => t.pool.query('DROP SCHEMA enum_x, enum_y CASCADE'));

  const enumX = { schemas: { enum_x: all }, schemaJSDoc: false };
  const notesFor = async (config: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => !w.startsWith('Note: this database has bigint') &&  // once per process
      !w.includes('enumOrder') &&  // § enumOrder
      !w.includes('uniqueIndexConstraintsOnly') &&  // § uniqueIndexConstraintsOnly
      !w.includes('domainsTypedByContext') &&  // § domainsTypedByContext
      !w.includes('enumArraysTypedAsText') &&  // § enumArraysTypedAsText
      !w.includes('intervalsTypedAsObjects'));  // § intervalsTypedAsObjects
  };

  it('is off by default: an enum of another schema is an `any` custom type', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen(main);
    expect(tableBlock(schema, 'products')).toContain('status: c.PgStatus;');  // extra.status
    expect(customTypeSourceFiles.PgStatus).toContain('export type PgStatus = any;');
    expect(customTypeSourceFiles.Pg_mood).toContain('export type Pg_mood = any;');  // public.mood[] in extra.type_zoo
  });

  it('is off by default: an enum of the same name in the relation\'s schema takes its place', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen(enumX);
    const block = tableBlock(schema, 't');
    expect(block).toContain('a: st | null;');  // enum_y.st, typed as enum_x.st: 'mine'
    expect(block).toContain('b: st[] | null;');
    expect(block).toContain('o: c.PgSolo | null;');
    // enum_x.st, as the columns are typed, imported since #184: 6.6.1's `st` failed with TS2304
    expect(customTypeSourceFiles.PgSt_d).toContain(
      `import type { enum_x } from 'zapatos/schema';\n  export type PgSt_d = enum_x.st;`);
    expect(tableBlock(schema, 'mv')).toContain('a: st | null;');
  });

  it('types an enum of another schema by its values, inlined', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen({ ...main, typeEnumsAcrossSchemas: true });
    expect(tableBlock(schema, 'products')).toContain(`status: ('archived' | 'draft' | 'published');`);
    expect(tableBlock(schema, 'type_zoo')).toContain(`c_enum_array: ('happy' | 'ok' | 'sad')[] | null;`);
    expect(Object.keys(customTypeSourceFiles)).not.toContain('PgStatus');
    expect(Object.keys(customTypeSourceFiles)).not.toContain('Pg_mood');
  });

  it('looks an enum up in the schema of its type, not by name in the relation\'s', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen({ ...enumX, typeEnumsAcrossSchemas: true });
    const block = tableBlock(schema, 't');
    expect(block).toContain(`a: ('theirs' | 'yours') | null;`);
    expect(block).toContain(`b: ('theirs' | 'yours')[] | null;`);
    expect(block).toContain(`d: c.PgSt_d | null;`);  // a domain stays a custom type...
    expect(customTypeSourceFiles.PgSt_d).toContain(`export type PgSt_d = ('theirs' | 'yours');`);  // ...typed by its enum
    expect(block).toContain(`o: 'only' | null;`);
    expect(block).toContain('own: st | null;');
    expect(block).toContain('n: number | null;');
    expect(Object.keys(customTypeSourceFiles)).toEqual(['PgSt_d']);
    expect(tableBlock(schema, 'mv')).toContain(`a: ('theirs' | 'yours') | null;`);
    expect(tableBlock(schema, 'mv')).toContain(`s: ('archived' | 'draft' | 'published') | null;`);
  });

  it('is off by default, with a note that names each column it would change, and its type', async () => {
    expect(await notesFor(enumX)).toEqual([
      'Note: enum_x.mv.a (enum_y.st), enum_x.mv.s (extra.status), enum_x.t.a (enum_y.st), enum_x.t.b (enum_y.st[]), ' +
      'enum_x.t.d (enum_y.st) and enum_x.t.o (enum_y.solo) have a type of another ' +  // d: the type under its domain
      'schema, which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, ' +
      'or the enum of the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; ' +
      'it will be the default in pgcast 7.0.',
    ]);
    expect(await notesFor({ schemas: { public: only('products') } })).toEqual([
      'Note: public.products.status (extra.status) has a type of another schema, which is looked up by name in the schema of ' +
      'its relation: an enum becomes an `any` custom type, or the enum of the same name there. ' +
      'Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0.',
    ]);
  });

  it('gives no note with the option on, or when no column would change', async () => {
    expect(await notesFor({ ...enumX, typeEnumsAcrossSchemas: true })).toEqual([]);
    expect(await notesFor({ ...main, typeEnumsAcrossSchemas: true })).toEqual([]);
    expect(await notesFor({ schemas: { public: only('users') } })).toEqual([]);  // public.mood, its own schema
  });

  it('reads the enums of each schema once per run, however many columns use them, option on or off', async () => {
    const enumQueriesFor = async (config: Config) => {
      const schemas: string[] = [];
      await tsForConfig(finaliseConfig({ ...config, ...quiet, db: db() }), s => {
        const values = s.startsWith('>>> query') && s.includes('pg_catalog.pg_enum') && s.match(/\n\+ (.*)\n$/);
        if (values) schemas.push(...JSON.parse(values[1]));
      });
      return schemas.sort();
    };
    for (const on of [false, true]) {
      // enum_y.st in t and mv, int4 in t (pg_catalog), extra.status in mv
      expect(await enumQueriesFor({ ...enumX, typeEnumsAcrossSchemas: on }))
        .toEqual(['enum_x', 'enum_y', 'extra', 'pg_catalog']);
      // ext.citext, as in extra.type_zoo; pg_catalog in nearly every table
      expect(await enumQueriesFor({ ...main, typeEnumsAcrossSchemas: on })).toEqual(['ext', 'extra', 'pg_catalog', 'public']);
    }
  });

  it('is optional in Config, read as false when absent', () => {
    expect(finaliseConfig({}).typeEnumsAcrossSchemas).toBeUndefined();
    const right: Config = { typeEnumsAcrossSchemas: true };
    void right;
    // @ts-expect-error a boolean
    const wrong: Config = { typeEnumsAcrossSchemas: 'yes' };
    void wrong;
  });
});

describe('enumOrder', () => {
  // schemas of their own, committed to this file's database: no other test configures them;
  // order_y is never generated, order_z declares its labels in alphabetical order, and order_w.take
  // has 42 labels added BEFORE 'cut', so that float4 sortorders close in on 2
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA order_x;
    CREATE SCHEMA order_y;
    CREATE SCHEMA order_z;
    CREATE SCHEMA order_w;
    CREATE TYPE order_x.reel AS ENUM ('trailer', 'feature');
    ALTER TYPE order_x.reel ADD VALUE 'credits' BEFORE 'feature';
    CREATE TYPE order_x.edit AS ENUM ('assembly', 'rough', 'final');  -- its first label in place
    CREATE TYPE order_y.st AS ENUM ('yours', 'theirs');
    CREATE DOMAIN order_y.st_d AS order_y.st;
    CREATE TABLE order_x.t (r order_x.reel, a order_y.st, b order_y.st[], d order_y.st_d);
    CREATE MATERIALIZED VIEW order_x.mv AS SELECT NULL::order_y.st AS a;
    CREATE TYPE order_z.pos AS ENUM ('a', 'b');
    CREATE TYPE order_w.take AS ENUM ('slate', 'cut');
    DO $$ BEGIN
      FOR i IN 1..42 LOOP EXECUTE format('ALTER TYPE order_w.take ADD VALUE %L BEFORE %L', 'take_' || i, 'cut'); END LOOP;
    END $$;
  `));
  afterAll(() => t.pool.query('DROP SCHEMA order_x, order_y, order_z, order_w CASCADE'));

  const orderX = { schemas: { order_x: all }, schemaJSDoc: false };
  const enumsOnly = { include: '*' as const, exclude: '*' as const };
  const notesFor = async (config: Config) => {
    const warnings: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db() }), noDebug);
    return warnings.filter(w => !w.startsWith('Note: this database has bigint') &&  // once per process
      !w.includes('typeEnumsAcrossSchemas') &&  // § typeEnumsAcrossSchemas
      !w.includes('uniqueIndexConstraintsOnly') &&  // § uniqueIndexConstraintsOnly
      !w.includes('domainsTypedByContext') &&  // § domainsTypedByContext
      !w.includes('enumArraysTypedAsText') &&  // § enumArraysTypedAsText
      !w.includes('intervalsTypedAsObjects'));  // § intervalsTypedAsObjects
  };

  it('is off by default: labels in alphabetical order, every.<enum> included', async () => {
    const { ts: schema } = await codegen(main);
    expect(schema).toContain(`export type mood = 'happy' | 'ok' | 'sad';`);  // declared: 'sad', 'ok', 'happy'
    expect(schema).toContain(`export type mood = ['happy', 'ok', 'sad'];`);
    expect(schema).toContain(`export type status = 'archived' | 'draft' | 'published';`);  // 'draft', 'published', 'archived'
    expect(schema).toContain(`export type status = ['archived', 'draft', 'published'];`);
  });

  it("keeps the declared order with enumOrder: 'declared', every.<enum> included", async () => {
    const { ts: schema } = await codegen({ ...main, enumOrder: 'declared' });
    expect(schema).toContain(`export type mood = 'sad' | 'ok' | 'happy';`);
    expect(schema).toContain(`export type mood = ['sad', 'ok', 'happy'];`);
    expect(schema).toContain(`export type status = 'draft' | 'published' | 'archived';`);
    expect(schema).toContain(`export type status = ['draft', 'published', 'archived'];`);
  });

  it('puts a value added BEFORE another where Postgres sorts it', async () => {
    // enumsortorder 1, 1.5 and 2
    const { rows: [{ labels }] } = await t.pool.query(`SELECT enum_range(NULL::order_x.reel)::text[] AS labels`);
    expect(labels).toEqual(['trailer', 'credits', 'feature']);
    const { ts: schema } = await codegen({ ...orderX, enumOrder: 'declared' });
    expect(schema).toContain(`export type reel = 'trailer' | 'credits' | 'feature';`);
    expect(schema).toContain(`export type reel = ['trailer', 'credits', 'feature'];`);
    expect((await codegen(orderX)).ts).toContain(`export type reel = ['credits', 'feature', 'trailer'];`);
  });

  it('keeps the order of enum_range() when the session prints sortorders rounded (extra_float_digits=0)', async () => {
    const options = '-c extra_float_digits=0';  // 6 significant digits, the default before Postgres 12
    const client = new pg.Client({ ...db(), options });
    await client.connect();
    const { rows: [{ labels, printed, distinct }] } = await client.query(`
      SELECT enum_range(NULL::order_w.take)::text[] AS labels, count(*)::int AS printed,
        count(DISTINCT enumsortorder::text)::int AS distinct
      FROM pg_catalog.pg_enum WHERE enumtypid = 'order_w.take'::regtype`);
    await client.end();
    expect(distinct).toBeLessThan(printed);  // control: two sortorders print alike
    expect(labels).toEqual(['slate', ...Array.from({ length: 42 }, (_, i) => `take_${i + 1}`), 'cut']);
    const { ts: schema } = await tsForConfig(finaliseConfig({
      schemas: { order_w: all }, enumOrder: 'declared', ...quiet, db: { ...db(), options },
    }), noDebug);
    expect(schema).toContain(`export type take = [${labels.map((l: string) => `'${l}'`).join(', ')}];`);
  });

  it('leaves enumDataForSchema() alphabetical; definitionForRelationInSchema() follows the config by default', async () => {
    const q = (query: pg.QueryConfig) => t.pool.query(query);
    const enums = await enumDataForSchema('public', q);
    expect(enums).toEqual({ mood: ['happy', 'ok', 'sad'] });  // as in Zapatos 6.6.1, whatever the config
    const products = (await relationsInSchema('public', q)).find(rel => rel.name === 'products')!;
    const orders = [
      [{ enumOrder: 'declared' }, `('draft' | 'published' | 'archived')`],
      [{}, `('archived' | 'draft' | 'published')`],
    ] as const;
    for (const [order, union] of orders) {
      const config = finaliseConfig({ ...quiet, typeEnumsAcrossSchemas: true, ...order });
      const def = await definitionForRelationInSchema(products, 'public', enums, {}, config, q);  // no enumsForSchema
      expect(def).toContain(`status: ${union};`);
    }
  });

  it('writes an enum of another schema in the same order, with typeEnumsAcrossSchemas', async () => {
    for (const [order, union] of [[{ enumOrder: 'declared' }, `('yours' | 'theirs')`], [{}, `('theirs' | 'yours')`]] as const) {
      const { ts: schema, customTypeSourceFiles } = await codegen({ ...orderX, typeEnumsAcrossSchemas: true, ...order });
      const block = tableBlock(schema, 't');
      expect(block).toContain(`r: reel | null;`);
      expect(block).toContain(`a: ${union} | null;`);
      expect(block).toContain(`b: ${union}[] | null;`);
      expect(block).toContain(`d: c.PgSt_d | null;`);
      expect(customTypeSourceFiles.PgSt_d).toContain(`export type PgSt_d = ${union};`);
      expect(tableBlock(schema, 'mv')).toContain(`a: ${union} | null;`);
    }
  });

  it('is off by default, with a note that names each enum whose declared order is not alphabetical', async () => {
    expect(await notesFor({ schemas: { public: only('users') } })).toEqual([
      'Note: every.mood lists the labels of enum public.mood in alphabetical order, not in their ' +
      'declared order, by which Postgres sorts and compares them. ' +
      "Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.",
    ]);
    // order_z.pos is in order; order_y.st is not generated, though order_x.t uses it
    expect(await notesFor({ schemas: { order_z: all, order_x: all, public: enumsOnly, extra: enumsOnly } })).toEqual([
      'Note: every.<name> lists the labels of enums extra.status, order_x.edit, order_x.reel and public.mood ' +
      'in alphabetical order, not in their declared order, by which Postgres sorts and compares them. ' +
      "Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.",
    ]);
  });

  it('gives no note with the option on, or when no enum is out of order', async () => {
    expect(await notesFor({ ...main, enumOrder: 'declared' })).toEqual([]);
    expect(await notesFor({ ...orderX, typeEnumsAcrossSchemas: true, enumOrder: 'declared' })).toEqual([]);
    expect(await notesFor({ schemas: { order_z: all } })).toEqual([]);
    expect(await notesFor({ schemas: { no_such_schema: all } })).toEqual([]);  // no enum at all
    expect(await notesFor({ schemas: { order_y: { include: [], exclude: [] } } })).toEqual([
      'Note: every.st lists the labels of enum order_y.st in alphabetical order, not in their ' +
      'declared order, by which Postgres sorts and compares them. ' +
      "Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.",
    ]);  // control: no relation, and still its enums
  });

  it("is optional in Config, read as 'alphabetical' when absent; another value rejects before any query", async () => {
    expect(finaliseConfig({}).enumOrder).toBeUndefined();
    const right: Config = { enumOrder: 'declared' };
    void right;
    // @ts-expect-error 'alphabetical' or 'declared'
    const wrong: Config = { enumOrder: 'declard' };
    void wrong;
    await expect(codegenWithoutQueries({ ...main, enumOrder: 'declard' as 'declared' })).rejects
      .toThrow(`enumOrder must be 'alphabetical' (the default) or 'declared', not 'declard'`);
  });
});

describe('include entries that match no relation', () => {
  const unmatched = (name: string, schema: string) =>
    `Note: the include entry "${name}" of schema "${schema}" matches no relation there, so it generates nothing. ` +
    `Check its spelling and case, that the relation is in schema "${schema}", and that the database role ` +
    `has a privilege on it: include names tables, views, materialised views and foreign tables.`;

  it('warns once per entry of a list that names no relation, in list order', async () => {
    expect(await warningsFor({ public: only('users', 'no_such_table', 'Users', 'orderlines') })).toEqual([
      unmatched('no_such_table', 'public'),
      unmatched('Users', 'public'),
      unmatched('orderlines', 'public'),
    ]);
  });

  it('names the schema of the rule, for a relation listed under another schema', async () => {
    expect(await warningsFor({ public: only('users', 'articles'), extra: only('users', 'articles') })).toEqual([
      unmatched('articles', 'public'),
      unmatched('users', 'extra'),
    ]);
  });

  it('warns about an entry exclude also names, but not about an existing relation it excludes', async () => {
    expect(await warningsFor({
      public: { include: ['users', 'products', 'no_such_table'], exclude: ['products', 'no_such_table'] },
    })).toEqual([unmatched('no_such_table', 'public')]);
  });

  it('does not warn when exclude is "*": the relations are not read', async () => {
    expect(await warningsFor({ public: { include: ['no_such_table'], exclude: '*' } })).toEqual([]);
  });

  it('warns about each entry of a schema that does not exist, and not about "*"', async () => {
    expect(await warningsFor({ no_such_schema: only('users', 'accounts') })).toEqual([
      unmatched('users', 'no_such_schema'),
      unmatched('accounts', 'no_such_schema'),
    ]);
    expect(await warningsFor({ no_such_schema: all })).toEqual([]);
  });

  it('does not warn when every entry matches, whatever the kind of relation', async () => {
    expect(await warningsFor({
      public: only('users', 'OrderLines', 'active_users', 'account_totals', 'events', 'events_2025'),
      extra: { include: ['articles', 'imported_lines', 'article_authors'], exclude: ['articles'] },
    })).toEqual([]);
    expect(await warningsFor({ public: all, extra: { include: '*', exclude: ['no_such_table'] } })).toEqual([]);
  });

  it('warns, of main and the snapshot variants, only about no_such_table of include-exclude-lists, and the enums, unique indexes, domains, enum arrays and intervals notes', async () => {
    const enumsNote = 'Note: extra.type_zoo.c_enum_array (public.mood[]) and public.products.status (extra.status) ' +
      'have a type of another schema, ' +
      'which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of ' +
      'the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0.';
    const orderNote = (every: string, list: string) => `Note: every.${every} lists the labels of ${list} ` +
      "in alphabetical order, not in their declared order, by which Postgres sorts and compares them. " +
      "Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.";
    const bothOrderNote = orderNote('<name>', 'enums extra.status and public.mood');
    const uniqueNote = (list: string, one = false) => `Note: UniqueIndex lists ${list}, ` +
      `${one ? 'a unique index' : 'unique indexes'} of no UNIQUE or PRIMARY KEY constraint, of a DEFERRABLE or ` +
      `WITHOUT OVERLAPS one, or not yet valid: db.constraint() takes ${one ? 'it' : 'them'}, and Postgres refuses ${one ? 'it' : 'them'} ` +
      'in ON CONFLICT ON CONSTRAINT ... DO UPDATE, and in ... DO NOTHING except a WITHOUT OVERLAPS key. ' +
      `Set uniqueIndexConstraintsOnly: true to leave ${one ? 'it' : 'them'} ` +
      'out; it will be the default in pgcast 7.0.';
    const articlesNote = uniqueNote('extra.articles.shared_name_idx', true);
    const productsNote = uniqueNote('public.products.products_status_sku_key and public.products.products_title_lower_key');
    const domainsNote = 'Note: extra.type_zoo.c_int8_domain (public.ticket_no) has a domain over a type typed by context, ' +
      'such as int8 or date: as generated, its placeholder types it in all five interfaces as pg returns it, though a ' +
      'write takes more and, except for money, the shortcuts\' JSON gives another type. Set domainsTypedByContext: true to type it ' +
      'by context while its placeholder holds what the generator wrote for it; it will be the default in pgcast 7.0.';
    const enumArraysNote = 'Note: extra.type_zoo.c_enum_array (public.mood[]) is an array of an enum, which pg returns ' +
      'as its text, such as \'{a,b}\', though Selectable types it as an array. Set enumArraysTypedAsText: true to type it ' +
      'as a string there, or false to keep the array if pg.types.setTypeParser parses it; true will be the default in pgcast 7.0.';
    const intervalsNote = 'Note: extra.type_zoo.c_interval (interval) is of interval or of a type that wraps it in arrays ' +
      'or domains: as generated, it is typed as its text, though pg\'s default type parser ' +
      'returns an interval from a query of your own as an object, a PostgresInterval. Set intervalsTypedAsObjects: true to ' +
      'type it as pg parses it; it will be the default in pgcast 7.0. Set it to false to keep the text, if a type parser of ' +
      'yours returns it.';
    const expected: Record<string, string[]> = {
      main: [enumsNote, bothOrderNote, uniqueNote('extra.articles.shared_name_idx, public.account_totals.account_totals_owner_key, ' +
        'public.products.products_status_sku_key and public.products.products_title_lower_key'), domainsNote, intervalsNote],
      'unprefixedSchema-null': [bothOrderNote, articlesNote],
      'schemaJSDoc-false': [orderNote('mood', 'enum public.mood')],
      'customTypesTransform-PgMy_type': [enumsNote, bothOrderNote, productsNote, domainsNote, intervalsNote],
      'customTypesTransform-my_type': [enumsNote, bothOrderNote, productsNote, domainsNote, intervalsNote],
      'customTypesTransform-PgMyType': [enumsNote, bothOrderNote, productsNote, domainsNote, intervalsNote],
      'customTypesTransform-function': [enumsNote, bothOrderNote, productsNote, domainsNote, intervalsNote],
      typeEnumsAcrossSchemas: [bothOrderNote, productsNote, domainsNote, enumArraysNote, intervalsNote],
      'enumOrder-declared': [productsNote, domainsNote, enumArraysNote, intervalsNote],
      'moduleNames-pgcast': [enumsNote, bothOrderNote, productsNote, domainsNote, intervalsNote],
      uniqueIndexConstraintsOnly: [enumsNote, bothOrderNote, domainsNote, intervalsNote],
      domainsTypedByContext: [enumsNote, bothOrderNote, productsNote, intervalsNote],
      enumArraysTypedAsText: [bothOrderNote, productsNote, domainsNote, intervalsNote],
      intervalsTypedAsObjects: [enumsNote, bothOrderNote, productsNote, domainsNote],
      columnOptions: [bothOrderNote, articlesNote],
      'include-exclude-lists': [unmatched('no_such_table', 'public'), bothOrderNote, articlesNote],
      'exclude-star': [bothOrderNote],  // exclude: '*' still generates the enums
      edge: [orderNote('traffic-light', 'enum edge.traffic-light')],
    };
    const warnings: Record<string, string[]> = {};
    for (const [name, config] of [['main', main] as const, ...variants]) warnings[name] = await warningsOf(config);
    expect(warnings).toEqual(expected);
  });
});

describe('schemas rules missing include or exclude', () => {
  // #301: the CLI's JSON and untyped JavaScript can leave a key out, or set it to null;
  // Zapatos 6.6.1 threw a TypeError when it came to read it
  const rule = (given: unknown) => given as Schemas[string];
  const note = (schema: string, missing: string, taken: string, them = false) =>
    `Note: the schemas rule of "${schema}" has no ${missing}, so it takes ${taken}, as the default rule does. ` +
    `Write ${them ? 'the keys' : 'the key'} in the rule to silence this note.`;

  it.each([
    ['{ include: "*" }', { include: '*' }, all],
    ['{ include: [...] }', { include: ['users', 'accounts'] }, only('users', 'accounts')],
    ['{ exclude: [...] }', { exclude: ['products'] }, { include: '*' as const, exclude: ['products'] }],
    ['{}', {}, all],
    ['null keys', { include: null, exclude: null }, all],
  ])('generates for %s what the rule with its keys written out generates', async (_, given, written) => {
    const expected = await codegen({ schemas: { public: written } });
    expect((await codegen({ schemas: { public: rule(given) } })).ts).toBe(expected.ts);
  });

  it('notes each rule missing a key through generate(), in rule order, naming its schema and the default it takes', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pgcast-schema-rules-'));
    try {
      const warnings: string[] = [];
      await generate({
        schemas: {
          public: rule({ include: ['users'] }),
          extra: rule({ exclude: '*' }),  // generated the enums in 6.6.1 too
          no_such_schema: rule({}),
          edge: { include: [], exclude: [] },
        },
        ...quiet, warningListener: s => warnings.push(s), db: db(), outDir,
      });
      expect(warnings.filter(w => w.startsWith('Note: the schemas rule'))).toEqual([
        note('public', 'exclude', '"exclude": []'),
        note('extra', 'include', '"include": "*"'),
        note('no_such_schema', 'include nor exclude', '"include": "*" and "exclude": []', true),
      ]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('keeps a complete rule as the same object, and a rule that is not an object as it is', () => {
    const complete = { include: ['users'], exclude: [] };
    const schemas = { public: complete, extra: rule(['articles']), edge: rule(null) };
    const finalSchemas = finaliseConfig({ schemas }).schemas;
    expect(finalSchemas).toEqual(schemas);
    expect(finalSchemas.public).toBe(complete);
    expect(finaliseConfig({}).schemas).toEqual({ public: all });
  });

  it('still requires both keys in Config', () => {
    // @ts-expect-error a rule without exclude fails to compile (TS2741)
    const wrong: Config = { schemas: { public: { include: '*' } } };
    void wrong;
  });
});

describe('schemas rules with a string other than "*"', () => {
  // #442: the CLI's JSON and untyped JavaScript can give include or exclude as one name; Zapatos 6.6.1 read it
  // with String.prototype.indexOf, so it matched each relation whose name is part of it too
  const rule = (given: unknown) => given as Schemas[string];
  const note = (schema: string, key: string, name: string) =>
    `Note: the schemas rule of "${schema}" gives ${key} as a string, "${name}", so it is read as the list ["${name}"]. ` +
    'Zapatos 6.6.1 also matched each relation whose name is part of the string. Write the list to silence this note.';

  it.each([
    ['include "active_users", not users too', { include: 'active_users', exclude: [] }, only('active_users')],
    ['exclude "events_2025", keeping events', { include: '*', exclude: 'events_2025' },
      { include: '*' as const, exclude: ['events_2025'] }],
    // kept: as in 6.6.1
    ['include "users", which no other relation is part of', { include: 'users', exclude: [] }, only('users')],
    ['include "users" with exclude "*"', { include: 'users', exclude: '*' }, { include: '*' as const, exclude: '*' as const }],
    ['include "users" with no exclude', { include: 'users' }, only('users')],
  ])('generates for %s what the one-name list generates', async (_, given, written) => {
    const expected = await codegen({ schemas: { public: written } });
    expect((await codegen({ schemas: { public: rule(given) } })).ts).toBe(expected.ts);
  });

  it('warns about a string that names no relation, as about a list entry', async () => {
    expect(await warningsFor({ public: rule({ include: 'no_such_table', exclude: [] }) })).toEqual([
      'Note: the include entry "no_such_table" of schema "public" matches no relation there, so it generates nothing. ' +
      'Check its spelling and case, that the relation is in schema "public", and that the database role ' +
      'has a privilege on it: include names tables, views, materialised views and foreign tables.',
    ]);
  });

  it('notes each string key through generate(), in rule order, after the note on a missing key', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'pgcast-schema-rules-'));
    try {
      const warnings: string[] = [];
      await generate({
        schemas: {
          public: rule({ include: 'active_users', exclude: 'events_2025' }),
          extra: rule({ include: 'articles' }),
          edge: { include: '*', exclude: '*' },
        },
        ...quiet, warningListener: s => warnings.push(s), db: db(), outDir,
      });
      expect(warnings.filter(w => w.startsWith('Note: the schemas rule'))).toEqual([
        note('public', 'include', 'active_users'),
        note('public', 'exclude', 'events_2025'),
        'Note: the schemas rule of "extra" has no exclude, so it takes "exclude": [], as the default rule does. ' +
        'Write the key in the rule to silence this note.',
        note('extra', 'include', 'articles'),
      ]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('gives finaliseConfig() the one-name lists, leaving the supplied rule as it is', () => {
    const given = { include: 'users', exclude: 'products' };
    expect(finaliseConfig({ schemas: { public: rule(given) } }).schemas.public).toEqual({
      include: ['users'], exclude: ['products'],
    });
    expect(given).toEqual({ include: 'users', exclude: 'products' });
  });

  it('still refuses the string in Config', () => {
    // @ts-expect-error a string other than '*' fails to compile (TS2322)
    const wrong: Config = { schemas: { public: { include: 'users', exclude: [] } } };
    void wrong;
  });
});

describe('names that Object.prototype also has', () => {
  // schemas of their own, committed to this file's database: no other test configures them.
  // Each name is an enum of a schema enum_<name>, a schema with a table, and a domain of proto_a and
  // proto_b, in a table films_<name> of each; proto_c has a domain __proto__ alone. proto_d has a table of
  // each name, its columns named like what the inherited value has, and films a column of each name;
  // proto_e has a table of each name but __proto__ with the columns caller and arguments, which a function
  // throws on (Object.prototype has no caller: a table __proto__ never threw).
  const names = ['toString', 'constructor', 'hasOwnProperty', '__proto__'];
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA proto_a;
    CREATE SCHEMA proto_b;
    CREATE SCHEMA proto_c;
    CREATE DOMAIN proto_c."__proto__" AS text;
    CREATE TABLE proto_c.films (title proto_c."__proto__");
    CREATE SCHEMA proto_d;
    CREATE TABLE proto_d."toString" (id int, name text, length int);
    CREATE TABLE proto_d."constructor" (id int, name text, length int, keys text, "values" text);
    CREATE TABLE proto_d."hasOwnProperty" (id int, name text, length int);
    CREATE TABLE proto_d."__proto__" (id int, name text, "toString" text, "hasOwnProperty" text);
    CREATE TABLE proto_d.films (id int, title text, "toString" text, "constructor" text, "hasOwnProperty" text, "__proto__" text);
    CREATE SCHEMA proto_e;
  ` + names.filter(name => name !== '__proto__').map(name => `
    CREATE TABLE proto_e."${name}" (id int, caller text, arguments text);
  `).join('') + names.map(name => `
    CREATE SCHEMA "enum_${name}";
    CREATE TYPE "enum_${name}"."${name}" AS ENUM ('b', 'a');
    CREATE SCHEMA "${name}";
    CREATE TABLE "${name}".films (id int);
    CREATE DOMAIN proto_a."${name}" AS text;
    CREATE DOMAIN proto_b."${name}" AS integer;
    CREATE TABLE proto_a."films_${name}" (d proto_a."${name}");
    CREATE TABLE proto_b."films_${name}" (d proto_b."${name}");
  `).join('')));
  afterAll(() => t.pool.query(`DROP SCHEMA proto_a, proto_b, proto_c, proto_d, proto_e, ` +
    `${names.map(name => `"enum_${name}", "${name}"`).join(', ')} CASCADE`));

  /** The properties a run adds to `Object`, `Object.prototype` or a method of it, removed once read. */
  const globalsAddedBy = async (run: () => Promise<unknown>) => {
    const
      targets: Record<string, any>[] = [...new Set([Object, Object.prototype, ...Object.getOwnPropertyNames(Object.prototype)
        .map(key => Object.getOwnPropertyDescriptor(Object.prototype, key)!.value)
        .filter(value => typeof value === 'function')])],
      before = targets.map(target => Object.getOwnPropertyNames(target));
    let added: string[] = [];
    try {
      await run();
    } finally {
      added = targets.flatMap((target, i) => Object.getOwnPropertyNames(target)
        .filter(key => !before[i].includes(key))
        .map(key => { delete target[key]; return key; }));
    }
    return added;
  };

  it.each(names)('generates an enum named %s, in either order', async name => {
    const schemas = { [`enum_${name}`]: all };
    expect((await codegen({ schemas })).ts).toContain(`export type ${name} = ['a', 'b'];`);
    expect((await codegen({ schemas, enumOrder: 'declared' })).ts).toContain(`export type ${name} = ['b', 'a'];`);
  });

  it.each(names)('gives enumDataForSchema() an enum named %s, in an object of Object.prototype as in Zapatos 6.6.1', async name => {
    const enums = await enumDataForSchema(`enum_${name}`, query => t.pool.query(query));
    expect(Object.getPrototypeOf(enums)).toBe(Object.prototype);
    expect(Object.entries(enums)).toEqual([[name, ['a', 'b']]]);
  });

  it.each(names)('generates a schema named %s', async name => {
    const { ts: schema } = await codegen({ schemas: { [name]: all } });
    expect(schema).toContain(`export namespace ${name} {`);
    expect(schema).toContain(`"${name}.films": ${name}.films.Selectable;`);
  });

  it('writes the placeholder of a custom type named __proto__, and imports it', async () => {
    let schema = '', customTypeSourceFiles: Record<string, string> = {};
    const added = await globalsAddedBy(async () => {
      ({ ts: schema, customTypeSourceFiles } = await codegen({ schemas: { proto_c: all }, customTypesTransform: 'my_type' }));
    });
    expect(Object.keys(customTypeSourceFiles)).toEqual(['__proto__']);
    expect(schema).toContain(`import type * as c from 'zapatos/custom';`);
    expect(schema).toContain('title: c.__proto__ | null;');
    // its origins went onto Object.prototype, where generate() took them for one more placeholder
    expect(added).toEqual([]);
  });

  describe('columnOptions (#405)', () => {
    const
      excluded = { insert: 'excluded', update: 'excluded' } as const,
      // Object.fromEntries: '__proto__' as a key, as JSON.parse() gives it
      excludedEverywhere = (...columns: string[]) => ({ '*': Object.fromEntries(columns.map(column => [column, excluded])) }),
      codegenOf = (schema: string, columnOptions: Config['columnOptions'] = {}, rule: Schemas[string] = all) =>
        codegen({ schemas: { [schema]: rule }, unprefixedSchema: schema, schemaJSDoc: false, columnOptions });

    /** The Insertable and Updatable interfaces of `table` in a schema generated with schemaJSDoc: false. */
    const writablesOf = (schema: string, table: string) => {
      const block = tableBlock(schema, table);
      return ['Insertable', 'Updatable'].map(name => {
        const start = block.indexOf(`export interface ${name} {`);
        return block.slice(start, block.indexOf('\n    }', start) + '\n    }'.length);
      });
    };

    /** The same, written out for nullable columns with no default, `[column, TS type]`, sorted by name. */
    const writables = (columns: [string, string][], updatable = columns) => {
      const writable = (type: string) => `${type} | db.Parameter<${type}> | null | db.DefaultType | db.SQLFragment`;
      return [
        ['export interface Insertable {', ...columns.map(([column, type]) => `      ${column}?: ${writable(type)};`), '    }'],
        ['export interface Updatable {', ...updatable.map(([column, type]) =>
          `      ${column}?: ${writable(type)} | db.SQLFragment<any, ${writable(type)}>;`), '    }'],
      ].map(lines => lines.join('\n'));
    };

    it.each(names)('applies the "*" entry to the columns of a table named %s', async name => {
      // name, length, keys and values: what the inherited Object.prototype.toString, Object… answered
      const { ts: schema } = await codegenOf('proto_d', excludedEverywhere('name', 'length', 'keys', 'values', ...names));
      expect(writablesOf(schema, name)).toEqual(writables([['id', 'number']]));
    });

    it.each(names)('applies the "*" entry to a column named %s of a table with an entry of its own', async name => {
      const
        { ts: schema } = await codegenOf('proto_d', {
          ...excludedEverywhere(name), films: { title: { update: 'excluded' } },
        }),
        columns: [string, string][] = [['__proto__', 'string'], ['constructor', 'string'], ['hasOwnProperty', 'string'],
          ['id', 'number'], ['title', 'string'], ['toString', 'string']].filter(([column]) => column !== name) as [string, string][];
      expect(writablesOf(schema, 'films')).toEqual(writables(columns, columns.filter(([column]) => column !== 'title')));
    });

    it('still lets a table entry win over the "*" entry, for a table named toString', async () => {
      const { ts: schema } = await codegenOf('proto_d', {
        ...excludedEverywhere('name', 'length'), toString: { name: { insert: 'auto', update: 'auto' } as const },
      });
      expect(writablesOf(schema, 'toString')).toEqual(writables([['id', 'number'], ['name', 'string']]));
    });

    it('still reads a __proto__ key of a JS literal, which sets the prototype, as the entry of a table __proto__', async () => {
      // as in Zapatos 6.6.1: columnOptions.__proto__ is that object
      const { ts: schema } = await codegenOf('proto_d', { __proto__: { name: excluded } });
      expect(writablesOf(schema, '__proto__')).toEqual(writables([['hasOwnProperty', 'string'], ['id', 'number'], ['toString', 'string']]));
    });

    it.each([false, 0, ''])('still lets a table entry %j hide the "*" entry, as in Zapatos 6.6.1', async entry => {
      // 6.6.1 read columnOptions.films && columnOptions.films.title, which gave back the entry itself, and ?? stopped there
      const
        { ts: schema } = await codegenOf('proto_d', { ...excludedEverywhere('title'), films: entry } as unknown as Config['columnOptions']),
        columns: [string, string][] = [['__proto__', 'string'], ['constructor', 'string'], ['hasOwnProperty', 'string'],
          ['id', 'number'], ['title', 'string'], ['toString', 'string']];
      expect(writablesOf(schema, 'films')).toEqual(writables(columns));
    });

    it.each([null, undefined])('still throws on columnOptions %s, as Zapatos 6.6.1 did', async columnOptions => {
      // as JSON's null and generate()'s undefined give it: either one replaces the default {}
      const config = { schemas: { proto_d: only('films') }, unprefixedSchema: 'proto_d', columnOptions } as unknown as Config;
      await expect(codegen(config)).rejects.toThrow(new TypeError(`Cannot read properties of ${columnOptions} (reading 'films')`));
    });

    const functionNames = names.filter(name => name !== '__proto__');

    it.each(functionNames)('generates a table named %s with columns caller and arguments', async name => {
      const { ts: schema } = await codegenOf('proto_e', {}, only(name));
      expect(writablesOf(schema, name)).toEqual(writables([['arguments', 'string'], ['caller', 'string'], ['id', 'number']]));
    });

    it.each(functionNames)('applies the "*" entry to the column caller of a table named %s', async name => {
      const { ts: schema } = await codegenOf('proto_e', excludedEverywhere('caller'), only(name));
      expect(writablesOf(schema, name)).toEqual(writables([['arguments', 'string'], ['id', 'number']]));
    });

    it('applies the columnOptions of the CLI to a table named toString', async () => {
      const
        dir = mkdtempSync(join(tmpdir(), 'pgcast-cli-')),
        json = JSON.stringify({
          schemas: { proto_d: all }, unprefixedSchema: 'proto_d', schemaJSDoc: false,
          columnOptions: { '*': { name: { insert: 'excluded' }, length: { insert: 'excluded' } } },
        });
      try {
        const { ts: schema } = await tsForConfig(finaliseConfig({ ...cliConfig(json, dir), ...quiet, db: db() }), noDebug);
        // Zapatos 6.6.1 kept name and length: the inherited toString.name and toString.length answered first
        expect(writablesOf(schema, 'toString')[0]).toBe(writables([['id', 'number']])[0]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it.each(names)('notes the custom types named %s of two schemas, and leaves Object as it was', async name => {
    let warnings: string[] = [];
    const schemas = { proto_a: only(`films_${name}`), proto_b: only(`films_${name}`) };
    expect(await globalsAddedBy(async () => {
      warnings = await warningsFor(schemas, { customTypesTransform: 'my_type' });
    })).toEqual([]);
    expect(warnings).toEqual([
      `Note: custom types "proto_a"."${name}" and "proto_b"."${name}" are both named ${name} in TypeScript, ` +
      `so they share one type and one placeholder file, src/zapatos/custom/${name}.d.ts. ` +
      'To type them apart, rename one of them in the database.',
    ]);
  });
});

describe('debugListener', () => {
  /** Each query a run prints, as `{ text, values, rows }`, its result paired by its number. */
  const printedQueries = async (config: Config) => {
    const printed: string[] = [];
    await tsForConfig(finaliseConfig({ ...config, ...quiet, db: db() }), s => printed.push(s));
    const
      results = new Map(printed.filter(s => s.startsWith('<<< result ')).map(s => {
        const [header, ...json] = s.split('\n');
        return [header.split(' ')[2], JSON.parse(json.join('\n')).rows];
      })),
      queries = printed.filter(s => s.startsWith('>>> query ')).map(s => {
        const
          lines = s.replace(/\n$/, '').split('\n'),
          header = lines[0],
          values = lines[lines.length - 1];
        expect(values.startsWith('+ ')).toBe(true);
        return {
          seq: header.split(' ')[2],
          text: lines.slice(1, -1).join('\n'),
          values: JSON.parse(values.slice(2)),
        };
      });
    return queries.map(q => ({ ...q, rows: results.get(q.seq) }));
  };

  it('prints a query with its blank lines and line breaks, less the margin of its source', async () => {
    const [relations] = await printedQueries({ schemas: { public: only('users') } });
    expect(relations.seq).toBe('0');
    expect(relations.text).toBe(`SELECT $1 as schema
, table_name AS name
, lower(table_name) AS lname  -- using a case-insensitive sort, but you can't order by a function in a UNION query
, CASE table_type WHEN 'VIEW' THEN 'view' WHEN 'FOREIGN' THEN 'fdw' ELSE 'table' END AS type
, CASE WHEN is_insertable_into = 'YES' THEN true ELSE false END AS insertable
FROM information_schema.tables
WHERE table_schema = $1 AND table_type != 'LOCAL TEMPORARY'

UNION ALL

SELECT $1 as schema
, matviewname AS name
, lower(matviewname) AS lname
, 'mview'::text AS type
, false AS insertable
FROM pg_catalog.pg_matviews
WHERE schemaname = $1

ORDER BY lname, name`);
    expect(relations.values).toEqual(['public']);
  });

  it('prints each query so that it runs as is, with its values, and gives the rows printed as its result', async () => {
    const queries = await printedQueries(main);
    // the relations and the enums of each schema, then the columns and the unique indexes of each relation
    expect(queries.some(q => q.text.includes('pg_catalog.pg_enum'))).toBe(true);
    expect(queries.some(q => q.text.includes('pg_catalog.pg_indexes'))).toBe(true);
    expect(queries.some(q => q.values.includes('account_totals') && q.text.includes('a.attname'))).toBe(true);
    for (const { text, values, rows } of queries) {
      const result = await t.client.query(text, values);
      expect(JSON.parse(JSON.stringify(result.rows))).toEqual(rows);
    }
  });
});

describe('generate()', () => {
  let outDir: string;
  beforeEach(() => { outDir = mkdtempSync(join(tmpdir(), 'pgcast-generate-')); });
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  const run = () => generate({ ...main, ...quiet, db: db(), outDir });
  const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8');
  const contents = (root: string) => Object.fromEntries(files(root).map(f => [f, read(root, f)]));

  it('writes zapatos/schema.d.ts, one placeholder per custom type and custom/index.d.ts, as in test/generated', async () => {
    await run();
    const written = files(outDir);
    expect(written.filter(f => !f.startsWith('zapatos/custom/Pg'))).toEqual([
      'zapatos/custom/index.d.ts',
      'zapatos/schema.d.ts',
    ]);
    for (const file of written) await expect(read(outDir, file)).toMatchFileSnapshot(join('../generated', file));
    expect(files(generatedDir).filter(f => f.startsWith('zapatos/'))).toEqual(written);  // no stale file
  });

  it('keeps an existing placeholder, but overwrites the schema and custom/index.d.ts', async () => {
    const edited = '// edited by the user\n';
    for (const file of ['zapatos/schema.d.ts', 'zapatos/custom/index.d.ts', 'zapatos/custom/PgEmail.d.ts']) {
      mkdirSync(dirname(join(outDir, file)), { recursive: true });
      writeFileSync(join(outDir, file), edited);
    }
    await run();
    expect(read(outDir, 'zapatos/custom/PgEmail.d.ts')).toBe(edited);
    expect(read(outDir, 'zapatos/schema.d.ts')).toBe(read(generatedDir, 'zapatos/schema.d.ts'));
    expect(read(outDir, 'zapatos/custom/index.d.ts')).toBe(read(generatedDir, 'zapatos/custom/index.d.ts'));
    expect(read(outDir, 'zapatos/custom/PgAddress.d.ts')).toBe(read(generatedDir, 'zapatos/custom/PgAddress.d.ts'));
  });

  it('writes the same files on a second run', async () => {
    await run();
    const first = contents(outDir);
    await run();
    expect(contents(outDir)).toEqual(first);
  });

  describe('that throws', () => {
    // a database of its own, dropped without FORCE: the drop fails while a connection of the run is open
    const server = () => inject('pgcastDb')!;
    let name: string;
    beforeEach(async () => {
      name = `${server().prefix}throws_${randomBytes(4).toString('hex')}`;
      await withAdminClient(server().url, c => createDatabase(c, name, server().template));
    });
    afterEach(() => withAdminClient(server().url, c => dropDatabase(c, name)));

    const failed = new Error('failed on purpose');
    const throwsThenDrops = async (config: Config, pool: pg.PoolConfig = {}, waitAfter = 0) => {
      const
        exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never),
        unhandled: unknown[] = [],
        onUnhandled = (e: unknown) => void unhandled.push(e);
      process.on('unhandledRejection', onUnhandled);
      try {
        await expect(generate({
          ...quiet, ...config, db: { ...pool, connectionString: urlForDatabase(server().url, name) }, outDir,
        })).rejects.toBe(failed);
        await withAdminClient(server().url, c => c.query(`DROP DATABASE "${name}"`));
        await new Promise(resolve => setTimeout(resolve, waitAfter));
        expect(exit).not.toHaveBeenCalled();
        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
        exit.mockRestore();
      }
    };

    // DROP DATABASE waits 5 s for the other sessions to end before it fails: give it time to say so
    const dropWait = 10_000;

    it('ends its pool when warningListener throws, after every query', () => throwsThenDrops({
      schemas: { public: only('users', 'no_such_table') },
      warningListener: () => { throw failed; },
    }), dropWait);

    it('ends its pool when a customTypesTransform function throws, while other queries run', () => throwsThenDrops({
      ...main, customTypesTransform: () => { throw failed; },
    }), dropWait);

    // a table's composite column calls customTypesTransform as soon as its columns are read, while the other
    // tables' queries still wait for one of the pool's 2 connections; the ended pool never serves them, and
    // each rejects once its connectionTimeoutMillis is past, long after generate() has rejected
    it('never exits the process when a query still queued in its pool fails after it has thrown', async () => {
      const tables = Array.from({ length: 8 }, (_, i) => `CREATE TABLE queued.t${i} (x queued.pair);`).join('\n');
      await withAdminClient(urlForDatabase(server().url, name), c =>
        c.query(`CREATE SCHEMA queued; CREATE TYPE queued.pair AS (a int, b int);\n${tables}`));
      const timeout = 1000;
      await throwsThenDrops({
        schemas: { queued: all }, customTypesTransform: () => { throw failed; },
      }, { max: 2, connectionTimeoutMillis: timeout }, timeout * 2);
    }, dropWait);

    describe('on a failed query', () => {
      // the relations query, the first of a run, sorts on lower(table_name): a lower(name) ahead of pg_catalog in
      // search_path takes the call, and raises
      beforeEach(() => withAdminClient(urlForDatabase(server().url, name), c => c.query(`
        CREATE SCHEMA query_trap;
        CREATE FUNCTION query_trap.lower(name) RETURNS text LANGUAGE plpgsql
          AS $$ BEGIN RAISE EXCEPTION 'introspection fails on purpose'; END $$;
      `)));

      const
        trapped = () => ({ connectionString: urlForDatabase(server().url, name), options: '-c search_path=query_trap,pg_catalog' }),
        failures = [
          ['a refused connection', () => unreachable, { code: 'ECONNREFUSED' }],
          ['a failing introspection query', trapped, { code: 'P0001', message: 'introspection fails on purpose' }],
        ] as const,
        exited = new Error('process.exit() called'),
        note = 'Note: a query failed, so generate() ends the process with process.exit(1), and its promise never ' +
          'settles (PGCAST_DEP006). Set rejectOnQueryError: true to reject with the error instead; it will be the ' +
          'default in pgcast 7.0.';

      /** A run of one schema on `db`, notes printed, process.exit mocked to throw: what it rejected with and did. */
      const failedRun = async (config: Config, db: pg.ClientConfig) => {
        const
          exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw exited; }) as () => never),
          log = vi.spyOn(console, 'log').mockImplementation(() => undefined),
          unhandled: unknown[] = [],
          onUnhandled = (e: unknown) => void unhandled.push(e);
        process.on('unhandledRejection', onUnhandled);
        try {
          const rejection = await generate({
            ...quiet, warningListener: true, schemas: { public: only('users') }, outDir, ...config, db,
          }).then(() => new Error('resolved'), (e: unknown) => e);
          await new Promise(resolve => setTimeout(resolve, 0));
          return { rejection, exits: exit.mock.calls, printed: log.mock.calls, unhandled, written: files(outDir) };
        } finally {
          process.off('unhandledRejection', onUnhandled);
          exit.mockRestore();
          log.mockRestore();
        }
      };

      it.each(failures)('rejects with the error of %s with rejectOnQueryError: no exit, no output, nothing written', async (_, db, error) => {
        // two schemas: the queries of the other are in flight when the first fails
        const run = await failedRun({ ...main, rejectOnQueryError: true }, db());
        expect(run.rejection).toMatchObject(error);
        expect(run).toMatchObject({ exits: [], printed: [], unhandled: [], written: [] });
        if (db === trapped) {
          expect(run.rejection).toBeInstanceOf(pg.DatabaseError);
          await withAdminClient(server().url, c => c.query(`DROP DATABASE "${name}"`));  // its pool has ended
        }
      });

      it.each(failures)('prints %s, notes rejectOnQueryError once, then exits with 1, as Zapatos 6.6.1 exits', async (_, db, error) => {
        const run = await failedRun({}, db());
        expect(run.rejection).toBe(exited);
        expect(run.exits).toEqual([[1]]);
        expect(run.printed).toEqual([['*** error 0 ***', expect.objectContaining(error)], [note]]);
        expect(run.written).toEqual([]);
      });

      it('exits with no note with rejectOnQueryError: false', async () => {
        const run = await failedRun({ rejectOnQueryError: false }, trapped());
        expect(run.exits).toEqual([[1]]);
        expect(run.printed).toEqual([['*** error 0 ***', expect.objectContaining(failures[1][2])]]);
      });

      it('notes rejectOnQueryError: null, from a JSON config, as when it is left out', async () => {
        const run = await failedRun(JSON.parse('{"rejectOnQueryError": null}') as Config, trapped());
        expect(run.exits).toEqual([[1]]);
        expect(run.printed).toEqual([['*** error 0 ***', expect.objectContaining(failures[1][2])], [note]]);
      });

      it('still exits when warningListener throws at the note', async () => {
        const run = await failedRun({ warningListener: () => { throw new Error('a listener that throws'); } }, trapped());
        expect(run.rejection).toBe(exited);
        expect(run.exits).toEqual([[1]]);
      });

      it("exits with no note from the CLI's config, even given rejectOnQueryError: true", async () => {
        const dir = mkdtempSync(join(tmpdir(), 'pgcast-cli-'));
        try {
          writeFileSync(join(dir, 'pgcastconfig.json'), '{"rejectOnQueryError": true}');
          const run = await failedRun(cliConfig('{"rejectOnQueryError": true}', dir), trapped());
          expect(run.exits).toEqual([[1]]);
          expect(run.printed).toEqual([['*** error 0 ***', expect.objectContaining(failures[1][2])]]);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      });

      it('is optional in Config, read as false when absent', () => {
        expect(finaliseConfig({}).rejectOnQueryError).toBeUndefined();
        const right: Config = { rejectOnQueryError: true };
        void right;
        // @ts-expect-error a boolean
        const wrong: Config = { rejectOnQueryError: 'yes' };
        void wrong;
      });
    });
  });
});

describe('moduleNames', () => {
  // a schema of its own, committed to this file's database: no other test configures it;
  // a jsonb domain, whose placeholder imports db
  beforeAll(() => t.pool.query(`
    CREATE SCHEMA module_names;
    CREATE DOMAIN module_names.scene_notes AS jsonb;
    CREATE TABLE module_names.scenes (id int PRIMARY KEY, notes module_names.scene_notes);
  `));
  afterAll(() => t.pool.query('DROP SCHEMA module_names CASCADE'));

  let outDir: string;
  beforeEach(() => { outDir = mkdtempSync(join(tmpdir(), 'pgcast-module-names-')); });
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8');
  const shim = `
// pgcast/db's declarations import 'zapatos/schema'
declare module 'zapatos/schema' {
  export * from 'pgcast/schema';
}
`;

  /** Every warning of a generate() run, the bigint note aside: it comes once per process. */
  const generateWarnings = async (config: Config) => {
    const warnings: string[] = [];
    await generate({ ...config, ...quiet, warningListener: s => warnings.push(s), db: db(), outDir });
    return warnings.filter(w => !w.startsWith('Note: this database has bigint')).map(w => w.split(outDir).join('<out>'));
  };
  const scenes = { schemas: { module_names: all } };
  const placeholder = (folder: string) => `Writing new custom type or domain placeholder file: <out>/${folder}/custom/PgScene_notes.d.ts`;
  const staleZapatos =  // in 'pgcast' mode
    `Note: <out>/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. ` +
    `It declares 'zapatos/schema', as <out>/pgcast/schema.d.ts does, and TypeScript merges the two: ` +
    `types can loosen, silently under skipLibCheck. ` +
    `Delete the folder <out>/zapatos, once any placeholder you edited there is moved to <out>/pgcast/custom.`;
  const stalePgcast =  // in 'zapatos' mode
    `Note: <out>/pgcast/schema.d.ts is here too, generated with moduleNames: 'pgcast'. ` +
    `Its import of 'pgcast/db' fails to compile without skipLibCheck. ` +
    `Delete the folder <out>/pgcast, once any placeholder you edited there is moved to <out>/zapatos/custom.`;

  it("writes pgcast/: the files of 'zapatos', but for the module names, the CLI and the zapatos/schema shim", async () => {
    await generate({ ...main, ...quiet, db: db(), outDir, moduleNames: 'pgcast' });
    const zapatosFiles = files(generatedDir).filter(f => f.startsWith('zapatos/'));
    expect(files(outDir)).toEqual(zapatosFiles.map(f => f.replace(/^zapatos\//, 'pgcast/')));
    for (const file of zapatosFiles) {
      const expected = read(generatedDir, file).split(`'zapatos/`).join(`'pgcast/`).replace('`npx zapatos`', '`npx pgcast`');
      expect(read(outDir, file.replace(/^zapatos\//, 'pgcast/'))).toBe(file === 'zapatos/schema.d.ts' ? expected + shim : expected);
    }
  });

  it("imports pgcast/db in the placeholder of a json or jsonb domain", async () => {
    await generate({ ...scenes, ...quiet, db: db(), outDir, moduleNames: 'pgcast' });
    expect(read(outDir, 'pgcast/custom/PgScene_notes.d.ts')).toBe(`/*
** Please edit this file as needed **
It's been generated by Zapatos as a custom type definition placeholder, and won't be overwritten
*/

declare module 'pgcast/custom' {
  import type * as db from 'pgcast/db';
  export type PgScene_notes = db.JSONValue;  // replace with your custom type or interface as desired
}
`);
    expect(read(outDir, 'pgcast/custom/index.d.ts')).toContain(`declare module 'pgcast/custom' { }`);
  });

  it('warns when the other mode wrote its schema in outDir, both ways, and only then', async () => {
    expect(await generateWarnings(scenes)).toEqual([placeholder('zapatos')]);
    expect(await generateWarnings(scenes)).toEqual([]);
    expect(await generateWarnings({ ...scenes, moduleNames: 'pgcast' })).toEqual([
      placeholder('pgcast'), staleZapatos,
    ]);
    expect(await generateWarnings({ ...scenes, moduleNames: 'pgcast' })).toEqual([staleZapatos]);
    expect(await generateWarnings(scenes)).toEqual([stalePgcast]);
    rmSync(join(outDir, 'zapatos'), { recursive: true });
    expect(await generateWarnings({ ...scenes, moduleNames: 'pgcast' })).toEqual([]);
    mkdirSync(join(outDir, 'zapatos/custom'), { recursive: true });  // a folder with no schema: no warning
    expect(await generateWarnings({ ...scenes, moduleNames: 'pgcast' })).toEqual([]);
  });

  it("is optional in Config, read as 'zapatos' when absent; another value rejects before any query", async () => {
    expect(finaliseConfig({}).moduleNames).toBeUndefined();
    const right: Config = { moduleNames: 'pgcast' };
    void right;
    // @ts-expect-error 'zapatos' or 'pgcast'
    const wrong: Config = { moduleNames: 'pgcats' };
    void wrong;
    await expect(codegenWithoutQueries({ ...scenes, moduleNames: 'pgcats' as 'pgcast' })).rejects
      .toThrow(`moduleNames must be 'zapatos' (the default) or 'pgcast', not 'pgcats'`);
  });
});

/** Files under `root`, relative, with / separators, sorted. */
function files(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => join(e.parentPath, e.name).slice(root.length + 1).split('\\').join('/'))
    .sort();
}

/** Syntax errors only: the text is parsed, not type-checked. */
function syntaxErrors(text: string): string[] {
  const { diagnostics = [] } = ts.transpileModule(text, { fileName: 'schema.ts', reportDiagnostics: true });
  return diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

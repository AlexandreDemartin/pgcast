// Copyright (C) 2026 Alexandre Demartin
//
// Characterization of the codegen output against the fixture: what Zapatos 6.6.1
// produces today, surprises included (they are fixed in chapter 2, not here).
//   * tsForConfig(): one frozen file per configuration, in test/__snapshots__/codegen/;
//   * generate(): the files written to disk for the main configuration, frozen in
//     test/generated/, which `npm run typecheck` compiles (test/generated/tsconfig.json).
// Update after an intended change: `npx vitest run -u test/integration/codegen.test.ts`.
// -u never deletes a file: a stale snapshot is removed by hand (the orphan test names it).
// tsForConfig() calls process.exit(1) on any SQL error: no test here may cause one.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { finaliseConfig, generate, tsForConfig, type Config } from '../../src/generate';
import { urlForDatabase } from '../helpers/databases';
import { useTestDatabase } from '../helpers/db';

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

/** The warnings of a run, but the bigint note, which comes once per process. */
const warningsOf = async (config: Config) => {
  const warnings: string[] = [];
  await tsForConfig(finaliseConfig({
    ...config, ...quiet, warningListener: s => warnings.push(s), db: db(), outDir: 'src',
  }), noDebug);
  return warnings.filter(w => !w.startsWith('Note: this database has bigint'));
};

/** The same, but the note on enums of another schema, which has its own tests (§ typeEnumsAcrossSchemas). */
const warningsFor = async (schemas: Schemas) =>
  (await warningsOf({ schemas })).filter(w => !w.includes('typeEnumsAcrossSchemas'));

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

describe('variant snapshots', () => {
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

  it.each(variants.filter(([name]) => name !== 'edge'))('%s compiles with its custom types', name => {
    const { config } = ts.readConfigFile(join(generatedDir, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, generatedDir);
    const custom = join(snapshotPath, `${name}.custom.d.ts`);
    const rootNames = [join(snapshotPath, `${name}.d.ts`), ...(withoutCustomTypes.includes(name) ? [] : [custom])];
    const program = ts.createProgram(rootNames, { ...options, paths: { 'zapatos/db': [join(declarationDir, 'db')] } });
    const errors = ts.getPreEmitDiagnostics(program).map(d =>
      `${d.file ? relative(snapshotPath, d.file.fileName) : ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(errors).toEqual([]);
  });

  it('typeEnumsAcrossSchemas: an enum of another schema takes its labels, and only them', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen({ ...main, typeEnumsAcrossSchemas: true });
    const dir = mkdtempSync(join(declarationDir, 'probe-'));
    const probe = `
      import type * as s from 'zapatos/schema';
      export const ok: s.products.Insertable = { sku: 'x', price_cents: 1, status: 'draft' };
      // @ts-expect-error not a label of extra.status
      export const ko: s.products.Insertable = { sku: 'x', price_cents: 1, status: 'nope' };
      export const moods: s.extra.type_zoo.Selectable['c_enum_array'] = ['happy', 'sad'];
      // @ts-expect-error not a label of public.mood
      export const meh: s.extra.type_zoo.Selectable['c_enum_array'] = ['meh'];
    `;
    writeFileSync(join(dir, 'schema.d.ts'), schema);
    writeFileSync(join(dir, 'custom.d.ts'), customFiles(customTypeSourceFiles));
    writeFileSync(join(dir, 'probe.ts'), probe);
    const { config } = ts.readConfigFile(join(generatedDir, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, generatedDir);
    const rootNames = ['schema.d.ts', 'custom.d.ts', 'probe.ts'].map(f => join(dir, f));
    const program = ts.createProgram(rootNames, { ...options, paths: { 'zapatos/db': [join(declarationDir, 'db')] } });
    const errors = ts.getPreEmitDiagnostics(program).map(d =>
      `${d.file ? relative(dir, d.file.fileName) : ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(errors).toEqual([]);
  });

  it('holds no orphan file', () => {
    const expected = variants.flatMap(([name]) =>
      withoutCustomTypes.includes(name) ? [`${name}.d.ts`] : [`${name}.custom.d.ts`, `${name}.d.ts`]);
    expect(readdirSync(snapshotPath).sort()).toEqual(expected.sort());
  });
});

describe('surprises, frozen as they are', () => {
  it('sorts enum values alphabetically, not in declaration order (enumsortorder)', async () => {
    const { ts: schema } = await codegen(main);
    expect(schema).toContain(`export type mood = 'happy' | 'ok' | 'sad';`);  // declared: 'sad', 'ok', 'happy'
    expect(schema).toContain(`export type status = 'archived' | 'draft' | 'published';`);  // 'draft', 'published', 'archived'
  });

  it('keeps column comments of tables and materialized views only', async () => {
    const { ts: schema } = await codegen(main);
    expect(schema).toContain('* Line manager.\n  Nullable: the top of the tree has none.');  // table: no * on the next lines
    expect(schema).toContain('Materialized view column comment');
    expect(schema).not.toContain('Partitioned table column comment');
    expect(schema).not.toContain('Foreign table column comment');
    expect(schema).not.toContain('View column comment');
  });

  it('drops COMMENT ON of tables, views, schemas and types', async () => {
    const { ts: schema } = await codegen(main);
    for (const comment of [
      'People who can sign in', 'Users not currently sad', 'Balances per owner, refreshed on demand',
      'Second application schema', 'How a user feels', 'Case-insensitive e-mail address',
    ]) expect(schema).not.toContain(comment);
  });

  it('edge: the output does not parse', async () => {
    const { ts: schema } = await codegen({ schemas: { edge: all } });
    // names that are not TS identifiers, a quote in an enum label
    expect(schema).toContain(`export type traffic-light = 'amber's' | 'green light' | 'red';`);
    expect(schema).toContain('export namespace odd table {');
    expect(schema).toContain('export namespace class {');
    // */ closes the JSDoc: in a column name, a DEFAULT, a COMMENT ON
    expect(schema).toContain('* **edge.odd table.*/**');
    expect(schema).toContain("* - Nullable, default: `'*/'::text`");
    expect(schema).toContain('* Column comment with */ inside');
    expect(syntaxErrors(schema)).not.toEqual([]);
    expect(syntaxErrors((await codegen(main)).ts)).toEqual([]);  // control: the same check passes without edge
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
    return warnings.filter(w => !w.startsWith('Note: this database has bigint'));  // once per process
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
    expect(customTypeSourceFiles.PgSt_d).toContain('export type PgSt_d = st;');
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

  it('warns, of main and the snapshot variants, only about no_such_table of include-exclude-lists, and the enums note', async () => {
    const enumsNote = 'Note: extra.type_zoo.c_enum_array (public.mood[]) and public.products.status (extra.status) ' +
      'have a type of another schema, ' +
      'which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of ' +
      'the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0.';
    const warnings: Record<string, string[]> = {};
    for (const [name, config] of [['main', main] as const, ...variants]) warnings[name] = await warningsOf(config);
    expect(warnings).toEqual(Object.fromEntries(Object.keys(warnings).map(name =>
      [name, name === 'include-exclude-lists' ? [unmatched('no_such_table', 'public')] :
        name === 'main' || name.startsWith('customTypesTransform-') ? [enumsNote] : []])));
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

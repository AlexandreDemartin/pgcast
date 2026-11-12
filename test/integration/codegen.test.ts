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
      public: { include: ['users', 'accounts', 'products', 'no_such_table'], exclude: ['products'] },  // exclude wins
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

/** Custom type placeholders, sorted by name: tsForConfig() inserts them in query completion order. */
const customFiles = (files: Record<string, string>) =>
  Object.keys(files).sort().map(name => `// ===== custom/${name}.d.ts =====\n${files[name]}`).join('\n');

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

  it('holds no orphan file', () => {
    const expected = variants.flatMap(([name]) =>
      withoutCustomTypes.includes(name) ? [`${name}.d.ts`] : [`${name}.custom.d.ts`, `${name}.d.ts`]);
    expect(readdirSync(snapshotPath).sort()).toEqual(expected.sort());
  });
});

describe('surprises, frozen as they are', () => {
  const tableBlock = (schema: string, table: string) => {
    const start = schema.indexOf(`export namespace ${table} {`);
    return schema.slice(start, schema.indexOf('\n  }\n', schema.indexOf('export type SQL = ', start)));
  };

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

  it('matches unique indexes by name across schemas', async () => {
    const { ts: schema } = await codegen(main);
    // shared_name_idx is unique on extra.articles, and a plain index on public.transfers
    expect(tableBlock(schema, 'transfers')).toContain(`export type UniqueIndex = 'shared_name_idx' | 'transfers_pkey';`);
  });

  it('types enums of another schema as custom types (`any` placeholder)', async () => {
    const { ts: schema, customTypeSourceFiles } = await codegen(main);
    expect(tableBlock(schema, 'products')).toContain('status: c.PgStatus;');  // extra.status
    expect(customTypeSourceFiles.PgStatus).toContain('export type PgStatus = any;');
    expect(customTypeSourceFiles.Pg_mood).toContain('export type Pg_mood = any;');  // public.mood[] in extra.type_zoo
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

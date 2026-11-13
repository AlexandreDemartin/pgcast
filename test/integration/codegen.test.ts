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
import * as pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  definitionForRelationInSchema, enumDataForSchema, finaliseConfig, generate, relationsInSchema, tsForConfig, type Config,
} from '../../src/generate';
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
  // the same, but the order of the labels
  ['enumOrder-declared', { schemas: customTypesSchemas, typeEnumsAcrossSchemas: true, enumOrder: 'declared' }],
  // pgcast/schema, pgcast/custom and pgcast/db, and the zapatos/schema that src/db's declarations import
  ['moduleNames-pgcast', { schemas: customTypesSchemas, moduleNames: 'pgcast' }],
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

/** The same, but the notes on enums, which have their own tests (§ typeEnumsAcrossSchemas, § enumOrder). */
const warningsFor = async (schemas: Schemas) =>
  (await warningsOf({ schemas })).filter(w => !w.includes('typeEnumsAcrossSchemas') && !w.includes('enumOrder'));

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

  /** `<moduleNames>/db`, and only it, as test/generated/tsconfig.json maps 'zapatos/db', to the declarations emitted here. */
  const dbPaths = (config: Config) => ({ [`${config.moduleNames ?? 'zapatos'}/db`]: [join(declarationDir, 'db')] });

  it.each(variants.filter(([name]) => name !== 'edge'))('%s compiles with its custom types', (name, variant) => {
    const { config } = ts.readConfigFile(join(generatedDir, 'tsconfig.json'), ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, generatedDir);
    const custom = join(snapshotPath, `${name}.custom.d.ts`);
    const rootNames = [join(snapshotPath, `${name}.d.ts`), ...(withoutCustomTypes.includes(name) ? [] : [custom])];
    const program = ts.createProgram(rootNames, { ...options, paths: dbPaths(variant) });
    const errors = ts.getPreEmitDiagnostics(program).map(d =>
      `${d.file ? relative(snapshotPath, d.file.fileName) : ''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    expect(errors).toEqual([]);
  });

  /** The type errors of `probe`, compiled against the schema and custom types that `config` generates. */
  const probeErrors = async (config: Config, probe: string, extraOptions: ts.CompilerOptions = {}) => {
    const { ts: schema, customTypeSourceFiles } = await codegen(config);
    const dir = mkdtempSync(join(declarationDir, 'probe-'));
    writeFileSync(join(dir, 'schema.d.ts'), schema);
    writeFileSync(join(dir, 'custom.d.ts'), customFiles(customTypeSourceFiles));
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
        // one line, as under Zapatos 6.6.1: TypeScript does not end a JSDoc line at U+2028 or U+2029,
        // but the indentation of the namespace (/^/gm) still comes after them
        ls: ['* Before\u2028    after'],
        ps: ['* Before\u2029    after'],
        n: ['* Count of notes', '* refreshed on demand'],
      });
      expect(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_lines CASCADE');
    }
  });

  it('writes a comment holding */ as Zapatos 6.6.1 does, so that one which parsed still parses (until #48)', async () => {
    // its */ ends the JSDoc, and the next line's /* opens a comment that the JSDoc's own */ closes:
    // a * before that line is code (TS1131)
    await t.pool.query(String.raw`
      CREATE SCHEMA comment_closer;
      CREATE TABLE comment_closer.notes (reopen int, later int, plain int);
      COMMENT ON COLUMN comment_closer.notes.reopen IS E'Closes here */\n/* and reopens';
      COMMENT ON COLUMN comment_closer.notes.later IS E'line one\nCloses */\n/* reopens';
      COMMENT ON COLUMN comment_closer.notes.plain IS E'First line\nsecond line';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_closer: all } });
      expect(commentLines(schema, 'notes')).toEqual({
        reopen: ['* Closes here */', '/* and reopens'],
        later: ['* line one', 'Closes */', '/* reopens'],  // its */ on a later line: no * on any line after the first
        plain: ['* First line', '* second line'],
      });
      expect(schema).toContain('* Closes here */\n    /* and reopens\n');  // the line after */ as master writes it
      expect(schema).toContain('* line one\n    Closes */\n    /* reopens\n');
      expect(syntaxErrors(schema)).toEqual([]);
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

  it('leaves out a comment holding */ on a view, foreign table or partitioned table (until #48)', async () => {
    // Zapatos 6.6.1 drops every comment of these: written as a table's is, 'ends */ early' would stop the file parsing
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
      COMMENT ON COLUMN comment_kinds_closer.p.y IS 'Plain';`);
    try {
      const { ts: schema } = await codegen({ schemas: { comment_kinds_closer: all } });
      expect(Object.fromEntries(['t', 'v', 'f', 'p'].map(rel => [rel, commentLines(schema, rel)]))).toEqual({
        t: { x: ['* Closes */', '/* reopens'] },  // a table's, written as master writes it
        v: { x: [], y: [], z: ['* Plain'] },
        f: { x: [], y: ['* Plain'] },
        p: { x: [], y: ['* Plain'] },
      });
      expect(syntaxErrors(schema)).toEqual([]);
    } finally {
      await t.pool.query('DROP SCHEMA comment_kinds_closer CASCADE');
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
    return warnings.filter(w => !w.startsWith('Note: this database has bigint') &&  // once per process
      !w.includes('enumOrder'));  // § enumOrder
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
      !w.includes('typeEnumsAcrossSchemas'));  // § typeEnumsAcrossSchemas
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

  it("is optional in Config, read as 'alphabetical' when absent; another value rejects", async () => {
    expect(finaliseConfig({}).enumOrder).toBeUndefined();
    const right: Config = { enumOrder: 'declared' };
    void right;
    // @ts-expect-error 'alphabetical' or 'declared'
    const wrong: Config = { enumOrder: 'declard' };
    void wrong;
    await expect(codegen({ ...main, enumOrder: 'declard' as 'declared' })).rejects
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

  it('warns, of main and the snapshot variants, only about no_such_table of include-exclude-lists, and the enums notes', async () => {
    const enumsNote = 'Note: extra.type_zoo.c_enum_array (public.mood[]) and public.products.status (extra.status) ' +
      'have a type of another schema, ' +
      'which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of ' +
      'the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0.';
    const orderNote = (every: string, list: string) => `Note: every.${every} lists the labels of ${list} ` +
      "in alphabetical order, not in their declared order, by which Postgres sorts and compares them. " +
      "Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0.";
    const bothOrderNote = orderNote('<name>', 'enums extra.status and public.mood');
    const expected: Record<string, string[]> = {
      main: [enumsNote, bothOrderNote],
      'unprefixedSchema-null': [bothOrderNote],
      'schemaJSDoc-false': [orderNote('mood', 'enum public.mood')],
      'customTypesTransform-PgMy_type': [enumsNote, bothOrderNote],
      'customTypesTransform-my_type': [enumsNote, bothOrderNote],
      'customTypesTransform-PgMyType': [enumsNote, bothOrderNote],
      'customTypesTransform-function': [enumsNote, bothOrderNote],
      typeEnumsAcrossSchemas: [bothOrderNote],
      'enumOrder-declared': [],
      'moduleNames-pgcast': [enumsNote, bothOrderNote],
      columnOptions: [bothOrderNote],
      'include-exclude-lists': [unmatched('no_such_table', 'public'), bothOrderNote],
      'exclude-star': [bothOrderNote],  // exclude: '*' still generates the enums
      edge: [orderNote('traffic-light', 'enum edge.traffic-light')],
    };
    const warnings: Record<string, string[]> = {};
    for (const [name, config] of [['main', main] as const, ...variants]) warnings[name] = await warningsOf(config);
    expect(warnings).toEqual(expected);
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

  it("is optional in Config, read as 'zapatos' when absent; another value rejects", async () => {
    expect(finaliseConfig({}).moduleNames).toBeUndefined();
    const right: Config = { moduleNames: 'pgcast' };
    void right;
    // @ts-expect-error 'zapatos' or 'pgcast'
    const wrong: Config = { moduleNames: 'pgcats' };
    void wrong;
    await expect(codegen({ ...scenes, moduleNames: 'pgcats' as 'pgcast' })).rejects
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

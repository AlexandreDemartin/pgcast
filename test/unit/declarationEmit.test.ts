// Copyright (C) 2026 Alexandre Demartin
//
// What a package built with `declaration: true` writes out of pgcast's wrapped values (#582): consumer files compiled
// against the declarations of src/db, as tsc emits them, and the fixture's generated schema, as test/types-opt-in is. A
// spread, a mapped type or a `keyof` of raw(), param(), cols(), vals() or parent() writes their members as Zapatos 6.6.1
// did, naming no brand. Two brands are left as they are, a documented limit: writing out the members of a
// `TsvectorColumn`, or of min() or max() typed by column, gives TS4023, and a `@ts-expect-error` does not cover it, hence
// the compiler's API. Here TypeScript writes a mapped type or a `keyof` out in full only through an inferred call, as
// TypeScript 4.1 does for any of them. No database.

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const
  root = path.join(__dirname, '../..'),
  { options } = ts.convertCompilerOptionsFromJson(
    ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config.compilerOptions, root),
  // nothing is written: the declarations and the consumer's files live in memory, under these paths
  virtual = path.join(root, 'node_modules/.cache/pgcast-declaration-emit'),
  consumer = path.join(virtual, 'consumer'),
  schema = path.join(root, 'test/generated/zapatos'),
  resolved = 'declare function resolved<X>(): X;\n';

const consumerFiles: Record<string, string> = {
  'variable.ts': `import * as db from 'zapatos/db';
export const rawSpread = { ...db.raw('x') };
export const paramSpread = { ...db.param(1) };
export const colsSpread = { ...db.cols(['id']) };
export const valsSpread = { ...db.vals(['x']) };
export const parentSpread = { ...db.parent('id') };
`,
  'function.ts': `import { param, raw } from 'zapatos/db';
export function rawOf() { return { ...raw('x') }; }
export const castOf = () => ({ ...param(1), cast: 'int4' });
`,
  'method.ts': `import * as db from 'zapatos/db';
export class Values { parent() { return { ...db.parent('id') }; } vals() { return { ...db.vals({ id: 1 }) }; } }
`,
  'mapped.ts': `import * as db from 'zapatos/db';
${resolved}export const paramMapped = resolved<{ [K in keyof db.Parameter<number>]: 1 }>();
export const rawMapped = resolved<{ [K in keyof db.DangerousRawString]?: db.DangerousRawString[K] }>();
export const colsMapped = resolved<{ [K in keyof db.ColumnNames<string[]>]: db.ColumnNames<string[]>[K] }>();
`,
  'keyof.ts': `import * as db from 'zapatos/db';
${resolved}export const paramKeys = { keys: resolved<keyof db.Parameter<number>>() };
export const parentKeys = { keys: resolved<keyof db.ParentColumn<'id'>>() };
`,
  'tsvector.ts': `import * as db from 'zapatos/db';
export const tsvectorSpread = { ...(null! as db.conditions.TsvectorColumn) };
`,
  'nestedResult.ts': `import * as db from 'zapatos/db';
export const minSpread = { ...db.min('users', db.all, { columns: ['display_name'] }) };
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
`,
};

const
  emitted = new Map<string, string>(),
  diagnostics = new Map<string, string[]>();

/** Compile with `host` reading `files` (absolute paths) first, and return what it emits and reports, by file. */
const compile = (roots: string[], compilerOptions: ts.CompilerOptions, files: Map<string, string>) => {
  const
    host = ts.createCompilerHost(compilerOptions),
    { fileExists, readFile, directoryExists } = host,
    out = new Map<string, string>();
  host.fileExists = f => files.has(f) || fileExists(f);
  host.readFile = f => files.get(f) ?? readFile(f);
  host.directoryExists = d => d.startsWith(virtual) || (directoryExists?.(d) ?? true);
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (f, v, ...rest) =>
    files.has(f) ? ts.createSourceFile(f, files.get(f)!, v) : getSourceFile(f, v, ...rest);
  host.writeFile = (f, text) => out.set(f, text);
  const
    program = ts.createProgram(roots, compilerOptions, host),
    reported = ts.getPreEmitDiagnostics(program);
  program.emit(undefined, undefined, undefined, true);
  return { out, reported };
};

beforeAll(() => {
  // src/db's declarations, as `npm run build` emits them
  const db = compile([path.join(root, 'src/db/index.ts')],
    { ...options, outDir: virtual, rootDir: path.join(root, 'src'), emitDeclarationOnly: true }, new Map());
  expect(db.reported.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);

  const
    files = new Map([...db.out, ...Object.entries(consumerFiles).map(([f, text]) => [path.join(consumer, f), text] as const)]),
    roots = [
      ...Object.keys(consumerFiles).map(f => path.join(consumer, f)),
      ...fs.readdirSync(schema, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.d.ts')).map(f => path.join(schema, f)),
    ],
    { out, reported } = compile(roots, {
      target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true, declaration: true, emitDeclarationOnly: true, outDir: path.join(virtual, 'out'), rootDir: virtual,
      types: ['node'], paths: { 'zapatos/db': [path.join(virtual, 'db')] },
    }, files);

  for (const [f, text] of out) emitted.set(path.basename(f, '.d.ts'), text);
  for (const d of reported) {
    const name = d.file ? path.basename(d.file.fileName, '.ts') : '(global)';
    diagnostics.set(name, [...diagnostics.get(name) ?? [], `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`]);
  }
}, 60_000);

describe('declarations a consumer emits for raw(), param(), cols(), vals() and parent()', () => {
  it('reports nothing but the documented limits', () => {
    expect([...diagnostics.keys()].sort()).toEqual(['nestedResult', 'tsvector']);
  });

  it('writes out a spread in a variable as Zapatos 6.6.1 did', () => {
    expect(emitted.get('variable')).toBe(`export declare const rawSpread: {
    value: string;
};
export declare const paramSpread: {
    value: number;
    cast?: string | boolean | undefined;
};
export declare const colsSpread: {
    value: string[];
};
export declare const valsSpread: {
    value: string[];
};
export declare const parentSpread: {
    value?: "id" | undefined;
};
`);
  });

  it('writes out a spread a function returns, named imports only', () => {
    expect(emitted.get('function')).toBe(`export declare function rawOf(): {
    value: string;
};
export declare const castOf: () => {
    cast: string;
    value: number;
};
`);
  });

  it('writes out a spread a method returns', () => {
    expect(emitted.get('method')).toBe(`export declare class Values {
    parent(): {
        value?: "id" | undefined;
    };
    vals(): {
        value: {
            id: number;
        };
    };
}
`);
  });

  it('writes out a mapped type of each class', () => {
    expect(emitted.get('mapped')).toBe(`export declare const paramMapped: {
    value: 1;
    cast?: 1 | undefined;
};
export declare const rawMapped: {
    value?: string | undefined;
};
export declare const colsMapped: {
    value: string[];
};
`);
  });

  it('writes out keyof as the public keys alone, never as symbol', () => {
    expect(emitted.get('keyof')).toBe(`import * as db from 'zapatos/db';
export declare const paramKeys: {
    keys: keyof db.Parameter<number>;
};
export declare const parentKeys: {
    keys: "value";
};
`);
  });
});

describe('the documented limits', () => {
  it('cannot write out the members of a TsvectorColumn', () => {
    expect(diagnostics.get('tsvector')).toEqual([expect.stringMatching(/^TS4023: Exported variable 'tsvectorSpread' has or is using name 'tsvector' from external module ".*" but cannot be named\.$/)]);
  });

  it('cannot write out the members of min() typed by column', () => {
    expect(diagnostics.get('nestedResult')).toEqual([expect.stringMatching(/^TS4023: Exported variable 'minSpread' has or is using name 'nestedResult' from external module ".*" but cannot be named\.$/)]);
  });
});

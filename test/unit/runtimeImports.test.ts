// Copyright (C) 2026 Alexandre Demartin
//
// What the published code loads at run time (#592): each module of src/db and src/generate, emitted as
// `npm run build` emits it, requires only Node's built-ins, its own files, `dependencies` and the peers
// that are not optional: typescript is optional, for the types alone. No database.

import * as fs from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const
  root = path.join(__dirname, '../..'),
  pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  { options } = ts.convertCompilerOptionsFromJson(
    ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile).config.compilerOptions, root),
  optional = (name: string) => pkg.peerDependenciesMeta?.[name]?.optional === true,
  allowed = new Set([
    ...builtinModules,
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter(name => !optional(name)),
  ]),
  modules = ['src/db', 'src/generate'].flatMap(dir =>
    fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.ts')).map(f => `${dir}/${f}`));

/** The specifiers that a module's emitted JavaScript passes to `require()`, a non-literal one as `null`. */
const requires = (file: string) => {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: options, fileName: file }).outputText;
  return [...js.matchAll(/\brequire\(([^)]*)\)/g)].map(m => /^\s*(['"])([^'"]+)\1\s*$/.exec(m[1])?.[2] ?? null);
};

/** The package a bare specifier names: `pg` for `pg/lib/x`, `@scope/name` for `@scope/name/x`, `fs` for `node:fs`. */
const packageOf = (specifier: string) =>
  specifier.replace(/^node:/, '').split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

describe('runtime imports', () => {
  it('reads the modules and what they require', () => {
    expect(modules).toEqual(expect.arrayContaining(['src/db/core.ts', 'src/generate/cli.ts']));
    expect(requires('src/db/index.ts')).toEqual(expect.arrayContaining(['./core', './shortcuts']));
    expect(requires('src/db/customJSON.ts')).toContain('json-custom-numbers');
  });

  it.each(modules)('%s requires only built-ins, its own files, dependencies and required peers', file => {
    const refused = requires(file).filter(s => s === null || !(s.startsWith('.') || allowed.has(packageOf(s))));
    expect(refused).toEqual([]);
  });

  it('keeps pg and @types/pg required peers, typescript an optional one', () => {
    expect(['pg', '@types/pg'].filter(name => !(name in pkg.peerDependencies) || optional(name))).toEqual([]);
    expect('typescript' in pkg.peerDependencies && optional('typescript')).toBe(true);
  });
});

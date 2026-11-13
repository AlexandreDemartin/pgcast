// Copyright (C) 2026 Alexandre Demartin
// What the playground's editor starts from and compiles against, read at build (decision 005): the tutorial's first
// query, and the same declarations as Twoslash's (twoslash.ts): `zapatos/db` as installed (the built library), the
// generated `zapatos/schema` and `zapatos/custom`, and `pg`'s types. Each is given to Monaco at its path under
// `file:///`, where TypeScript resolves `zapatos/db` and `pg` as it would in a project. Only the editor's chunk
// imports this, so only /playground loads it.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';

export interface Playground {
  code: string;
  libs: Record<string, string>;  // `file:///…` path → its `.d.ts`
}

declare const data: Playground;
export { data };

// The playground's own lines above the query: the example's, with a comment about the playground's pool.
const header = `import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;  // as you type, a pool that records each query; on Run, Postgres in this page

`;

const
  website = fileURLToPath(new URL('../', import.meta.url)),
  example = join(website, 'examples/first-query.ts'),
  zapatos = realpathSync(join(website, 'node_modules/zapatos')),  // `file:..`: the root, built
  // the folder Node would find a package in from `from` (pg-protocol's `exports` hides its package.json)
  packageDir = (name: string, from: string) => {
    const dir = createRequire(join(from, 'package.json')).resolve.paths(name)
      ?.map(path => join(path, name)).find(existsSync);
    if (!dir) throw new Error(`playground.data.ts: no ${name} from ${from}`);
    return dir;
  },
  typesPg = packageDir('@types/pg', zapatos),
  withoutComments = (code: string) => code.replace(/\s*\/\/.*$/gm, '').trim();

export default defineLoader({
  watch: ['../examples/first-query.ts', '../zapatos/**/*.d.ts'],
  load() {
    const [above, query] = readFileSync(example, 'utf8').split('// ---cut---\n');
    // the reader edits the example as the tutorial shows it, with nothing hidden: what is above its cut is the header's
    if (query === undefined || withoutComments(above!) !== withoutComments(header))
      throw new Error("playground.data.ts: examples/first-query.ts no longer starts as the playground's header");

    const
      libs: Record<string, string> = {},
      add = (dir: string, files: string[], at: string) => {
        for (const file of files) libs[`file:///${at}/${file}`] = readFileSync(join(dir, file), 'utf8');
      },
      dts = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(file => file.endsWith('.d.ts')) : [];

    add(zapatos, ['db.d.ts'], 'node_modules/zapatos');
    add(join(zapatos, 'dist/db'), dts(join(zapatos, 'dist/db')), 'node_modules/zapatos/dist/db');
    add(join(website, 'zapatos'), ['schema.d.ts'], 'zapatos');
    // custom/ exists only once the schema has a type the generator leaves to the user, as in twoslash.ts
    add(join(website, 'zapatos/custom'), dts(join(website, 'zapatos/custom')), 'zapatos/custom');
    // `pg`'s types, without @types/node's 2 MB: what they take from Node (`EventEmitter`, `tls`) is left unresolved
    add(typesPg, ['index.d.ts', 'lib/connection-parameters.d.ts', 'lib/type-overrides.d.ts'], 'node_modules/@types/pg');
    add(packageDir('pg-types', typesPg), ['index.d.ts'], 'node_modules/pg-types');
    add(packageDir('pg-protocol', typesPg), ['dist/messages.d.ts'], 'node_modules/pg-protocol');

    return { code: header + query, libs };
  },
});

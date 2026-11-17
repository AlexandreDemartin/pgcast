// Copyright (C) 2026 Alexandre Demartin
// Checks the declarations that `tsc -p test/types-opt-in` emits, as a library built with `declaration: true` does:
// each `import("…")` must name a module a consumer can import. Here `zapatos/db` resolves through `paths`, so tsc
// writes a type of an inner module as `import(".cache/pgcast/db/utils")`; in a consumer, whose `zapatos` exports
// only `./db` and `./generate`, the same type is TS2742. Run by `npm run test:types`, after that program.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const publicModules = new Set(['zapatos/db', 'zapatos/schema', 'zapatos/custom', 'pg']);

/** Every `import("…")` of these declarations that names no public module, as `file: module`; empty if none. */
export function checkDeclarations(files) {
  return Object.entries(files).flatMap(([file, text]) =>
    [...text.matchAll(/\bimport\("([^"]+)"\)/g)].map(([, module]) => module).filter(module => !publicModules.has(module))
      .map(module => `${file}: import("${module}")`));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const
    dir = 'node_modules/.cache/pgcast-types-opt-in',
    files = Object.fromEntries(readdirSync(dir, {recursive: true}).filter(f => f.endsWith('.d.ts'))
      .map(f => [f, readFileSync(join(dir, f), 'utf8')])),
    errors = checkDeclarations(files);
  console.log(errors.length ?
    errors.map(e => `✗ ${e}: a consumer's declarations cannot name it (TS2742); give the type inline, or export it from zapatos/db`).join('\n') :
    '✓ the emitted declarations name only public modules');
  process.exit(errors.length ? 1 : 0);
}

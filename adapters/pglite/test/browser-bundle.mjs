// Copyright (C) 2026 Alexandre Demartin
//
// The adapter in a page: dist/index.js and pg-types bundled for the browser, by the Vite the root's Vitest installs.
// Fails on any import of a Node built-in (a page has none); the global Buffer, which pg-types needs for a bytea as pg
// does, is the page's to give (decision 005 shims it).

import { builtinModules } from 'module';
import { build } from 'vite';

const builtins = new Set(builtinModules.flatMap(m => [m, 'node:' + m])), imported = new Set();

const output = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: { entry: new URL('../dist/index.js', import.meta.url).pathname, formats: ['es'], fileName: 'adapter' },
  },
  plugins: [{
    name: 'node-built-ins',
    enforce: 'pre',
    resolveId(source) {
      if (builtins.has(source) || builtins.has(source.split('/')[0])) imported.add(source);
      return null;
    },
  }],
});

const [{ output: [chunk] }] = [output].flat();
if (imported.size > 0) {
  console.error(`The adapter's bundle imports Node built-ins: ${[...imported].join(', ')}`);
  process.exit(1);
}
console.log(`The adapter bundles for a page with no Node built-in: ${chunk.code.length} bytes, ${(chunk.moduleIds ?? Object.keys(chunk.modules)).length} modules`);

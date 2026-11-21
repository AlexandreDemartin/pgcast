// Copyright (C) 2026 Alexandre Demartin
//
// The adapter in a page: dist/index.js and pg-types bundled for the browser, by the Vite the root's Vitest installs.
// Fails on any import of a Node built-in (a page has none); then loads the bundle in a bare context, given only the
// globals of a page it uses: TextEncoder, and the global Buffer, which pg-types reads at import for a bytea as pg does
// and which is the page's to give (decision 005 shims it). Any other Node global fails it, at import or in a query.
// Then the same for zapatos/db with the adapter, as the README's recipe sets it up: `pg` replaced by two empty classes
// (db.mjs imports it for `instanceof`), a Buffer global, a real PGlite, and no `process` nor `require` in the page.

import { builtinModules } from 'module';
import { runInNewContext } from 'vm';
import { build } from 'vite';
import { PGlite } from '@electric-sql/pglite';

const builtins = new Set(builtinModules.flatMap(m => [m, 'node:' + m])), imported = new Set();

const output = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: { entry: new URL('../dist/index.js', import.meta.url).pathname, formats: ['iife'], name: 'adapter', fileName: 'adapter' },
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

// a query with a value, through a PGlite that answers with a bytea, which pg-types parses into a Buffer
const page = { Buffer, TextEncoder };
runInNewContext(chunk.code, page);
const sent = [], pglite = {
  waitReady: Promise.resolve(), closed: false,
  runExclusive: fn => fn(),
  execProtocol: async bytes => {
    sent.push(bytes);
    return { messages: [{ name: 'rowDescription', fields: [{ name: 'b', dataTypeID: 17 }] }, { name: 'dataRow', fields: ['\\x0102'] }, { name: 'commandComplete', text: 'SELECT 1' }] };
  },
};
const { rows } = await page.adapter.asPool(pglite).query({ text: 'SELECT $1::bytea AS b', values: [new Date(0)] });
if (sent.length !== 1 || !Buffer.isBuffer(rows[0].b) || rows[0].b.toString('hex') !== '0102') {
  console.error(`The adapter's bundle ran a query wrongly: ${sent.length} messages sent, ${JSON.stringify(rows)}`);
  process.exit(1);
}
console.log(`The adapter bundles for a page with no Node built-in, and runs a query there: ${chunk.code.length} bytes, ${(chunk.moduleIds ?? Object.keys(chunk.modules)).length} modules`);

// the core and the adapter in a page, on a real PGlite
const root = new URL('../../../', import.meta.url).pathname, entry = 'page-entry', virtual = '\0' + entry;
imported.clear();
const coreOutput = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: { entry, formats: ['iife'], name: 'page', fileName: 'page' },
  },
  plugins: [{
    name: 'recipe',
    enforce: 'pre',
    resolveId(source) {
      if (source === entry || source.endsWith('/' + entry)) return virtual;
      if (source === 'pg') return '\0pg';  // the recipe's alias
      if (builtins.has(source) || builtins.has(source.split('/')[0])) imported.add(source);
      return null;
    },
    load(id) {
      if (id === '\0pg') return 'export class Pool {}\nexport class Client {}\nexport default { Pool, Client };';
      if (id === virtual) return `import * as db from ${JSON.stringify(root + 'db.mjs')};\nimport { asPool } from ${JSON.stringify(root + 'adapters/pglite/dist/index.js')};\nexport { db, asPool };`;
    },
  }],
});
const [{ output: [coreChunk] }] = [coreOutput].flat();
if (imported.size > 0) {
  console.error(`The core's bundle imports Node built-ins: ${[...imported].join(', ')}`);
  process.exit(1);
}

const corePage = { Buffer, TextEncoder, TextDecoder };
runInNewContext(coreChunk.code, corePage);
const realPglite = new PGlite();
await realPglite.exec('CREATE TABLE posters (id int PRIMARY KEY, image bytea)');
const { db, asPool } = corePage.page;
const read = await db.serializable(asPool(realPglite), async txn => {
  const [{ n }] = await db.sql`SELECT ${db.param(7)}::int AS n`.run(txn);
  await db.insert('posters', { id: 1, image: corePage.Buffer.from([1, 2]) }).run(txn);
  const [{ image }] = await db.sql`SELECT image FROM posters WHERE id = ${db.param(1)}`.run(txn);
  return { n, image: image.toString('hex') };
});
await realPglite.close();
if (read.n !== 7 || read.image !== '0102') {
  console.error(`The core's bundle ran a transaction wrongly: ${JSON.stringify(read)}`);
  process.exit(1);
}
console.log(`zapatos/db and the adapter bundle for a page with \`pg\` aliased, and run a transaction on a PGlite there: ${coreChunk.code.length} bytes`);

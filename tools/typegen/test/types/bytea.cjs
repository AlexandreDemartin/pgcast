// Copyright (C) 2026 Alexandre Demartin

const { execFileSync } = require('node:child_process');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');
const { writeQueries } = require('../../dist/write');

const floor = resolve('../../node_modules/.cache/pgcast-ts41/node_modules');
for (const [version, compiler, typeRoots] of [
  ['4.1.6', join(floor, 'typescript/bin/tsc'), join(floor, '@types')],
  ['5.9.3', require.resolve('typescript/bin/tsc'), resolve('../../node_modules/@types')],
]) {
  for (const [name, dataTypeID] of [['bytea', 17], ['bytea[]', 1001]]) {
    test(`${version} compiles a ${name}-only module with types: []`, async () => {
      const dir = await mkdtemp(join(tmpdir(), 'pgcast-bytea-'));
      try {
        const text = 'SELECT NULL::' + name + ' AS bytes', fields = [{ name: 'bytes', dataTypeID }];
        await writeQueries(join(dir, 'queries.ts'), 'zapatos/db', new Map([['bytes', { text, fields }]]));
        await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
          files: ['queries.ts'],
          compilerOptions: { target: 'ES2019', strict: true, noEmit: true, skipLibCheck: true, types: [], typeRoots: [typeRoots] },
        }));
        execFileSync(process.execPath, [compiler, '-p', dir], { stdio: 'inherit' });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}

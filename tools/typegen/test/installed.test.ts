// Copyright (C) 2026 Alexandre Demartin

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, inject, it } from 'vitest';
import { urlForDatabase } from '../../../test/helpers/databases';
import { useTestDatabase } from '../../../test/helpers/db';

const db = useTestDatabase();

it('generates importable rows with the installed bin for both module names', () => {
  const app = mkdtempSync(join(tmpdir(), 'pgcast-installed-'));
  const run = (cmd: string, args: string[], cwd = app) => execFileSync(cmd, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TYPEGEN_DB: urlForDatabase(inject('pgcastDb')!.url, db.name) },
  }).trim();
  try {
    const pack = (cwd: string) => join(app, run('npm', ['pack', '--silent', '--pack-destination', app], cwd).split('\n').pop()!);
    const core = pack(resolve(__dirname, '../../..')), tool = pack(resolve(__dirname, '..'));
    writeFileSync(join(app, 'package.json'), '{"private":true}');
    run('npm', ['install', '--no-audit', '--no-fund', core, tool,
      'pg@' + require('pg/package.json').version, 'typescript@' + require('typescript/package.json').version,
      '@types/pg@' + require('@types/pg/package.json').version]);
    writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2019', module: 'commonjs', strict: true }, include: ['users.ts', 'generated'],
    }));
    expect(readFileSync(join(app, 'node_modules/.bin/pgcast-typegen'), 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node');
    const source = readFileSync(resolve(__dirname, 'fixtures/application/users.ts.txt'), 'utf8');
    for (const name of ['zapatos', 'pgcast']) {
      symlinkSync('@pgcast/pgcast', join(app, 'node_modules', name), 'dir');
      writeFileSync(join(app, 'users.ts'), source.replace(/zapatos/g, name));
      writeFileSync(join(app, 'pgcastconfig.json'), JSON.stringify({
        db: { connectionString: '{{TYPEGEN_DB}}' }, outDir: 'generated', moduleNames: name === 'pgcast' ? name : undefined,
        schemas: { public: { include: ['users'] } },
      }));
      run('npx', ['--no-install', 'pgcast']);
      const result = run('npx', ['--no-install', 'pgcast-typegen']);
      expect(result).toContain('generated/' + name + '/queries.ts: 1 query');
      const rows = readFileSync(join(app, 'generated', name, 'queries.ts'), 'utf8');
      expect(rows).toContain(`import type { JSONValue } from "${name}/db"`);
      run('npx', ['--no-install', 'tsc', '--noEmit']);
      rmSync(join(app, 'node_modules', name));
      rmSync(join(app, 'generated'), { recursive: true });
    }
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}, 120_000);

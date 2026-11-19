// Copyright (C) 2026 Alexandre Demartin
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe.each(['website', 'website/fr'])('%s migration guide', dir => {
  const page = readFileSync(dir + '/switching.md', 'utf8');

  it.each(['npm install', 'pnpm add', 'yarn add', 'bun add'])(
    'keeps %s on the 6.x warning route', command => {
      const step = page.split('{#swap-the-package}')[1].split('\n## ')[0];
      expect(step.split('\n')).toContain(command + ' zapatos@npm:@pgcast/pgcast@^6');
    });

  it.each(['zapatos', 'pgcast'])('keeps the %s alias when upgrading to 7.x', alias => {
    const guide = page.split('{#from-7-0}')[1].split('\n## ')[0];
    expect(guide.split('\n')).toContain('npm install ' + alias + '@npm:@pgcast/pgcast@^7');
  });
});

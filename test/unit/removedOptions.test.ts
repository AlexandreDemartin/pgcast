// Copyright (C) 2026 Alexandre Demartin
//
// The generator options 8.0 removed (src/generate/removedOptions.ts, decision 019 § 4): each, set to anything but
// the value 8.0 keeps, `null` or `undefined`, throws a message naming its migration entry, which both migration
// guides hold and quote. No database: generate(), check(), tsForConfig() and the CLI are in integration/codegen.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finaliseConfig } from '../../src/generate/config';
import { refuseRemovedOptions } from '../../src/generate/removedOptions';

// [key, the value 8.0 keeps, how it is written in the message, values refused]
const removed: [string, unknown, string, unknown[]][] = [
  ['typeEnumsAcrossSchemas', true, 'true', [false, 0, 1, '', 'yes', 'true', {}]],
  ['enumOrder', 'declared', '"declared"', ['alphabetical', 'declard', '', false, true, 0]],
  ['uniqueIndexConstraintsOnly', true, 'true', [false, 0, 1, '', 'yes', 'true', {}]],
  ['domainsTypedByContext', true, 'true', [false, 0, 1, '', 'yes', 'true', {}]],
];

const messageOf = (key: string, kept: string) => `${key} was removed in 8.0, which always does what ${key}: ${kept} did; ` +
  `delete it from the generator's config: https://pgcast.dev/switching#from-8-0-${key}`;

describe.each(removed)('%s', (key, kept, written, refused) => {
  it.each(refused)('throws on %j, alone or beside a kept option', value => {
    expect(() => refuseRemovedOptions({ [key]: value })).toThrow(messageOf(key, written));
    expect(() => refuseRemovedOptions({ outDir: '.', [key]: value })).toThrow(messageOf(key, written));
    expect(() => finaliseConfig({ outDir: '.', [key]: value })).toThrow(messageOf(key, written));
  });

  it.each([kept, null, undefined])('lets %j through, and leaves it out of the finalised config', value => {
    expect(() => refuseRemovedOptions({ [key]: value })).not.toThrow();
    const config = finaliseConfig({ outDir: './src', [key]: value });
    expect(Object.prototype.hasOwnProperty.call(config, key)).toBe(false);
    expect(config.outDir).toBe('./src');
  });

  it('reads an inherited key too, a getter included, as 7.x\'s tsForConfig() did', () => {
    expect(() => refuseRemovedOptions(Object.create({ [key]: refused[0] }))).toThrow(messageOf(key, written));
    const getter = Object.create(Object.defineProperty({}, key, { get: () => refused[0] }));
    expect(() => finaliseConfig(getter)).toThrow(messageOf(key, written));
    expect(() => refuseRemovedOptions(Object.create({ [key]: kept }))).not.toThrow();
  });

  it.each(['website', 'website/fr'])('has its entry in %s/switching.md, which quotes the message', dir => {
    const page = readFileSync(dir + '/switching.md', 'utf8');
    expect(page.split('\n').filter(line => line.startsWith('### ') && line.endsWith(` {#from-8-0-${key}}`))).toHaveLength(1);
    expect(page).toContain(messageOf(key, written));
  });
});

it('lets a key that was never an option through', () => {
  expect(() => refuseRemovedOptions({ noSuchOption: false })).not.toThrow();
  expect(finaliseConfig(JSON.parse('{"noSuchOption":false}'))).toHaveProperty('noSuchOption', false);
});

it.each([undefined, null])('lets finaliseConfig(%j) give the defaults, as from JavaScript in 7.x', config => {
  expect(finaliseConfig(config as any)).toEqual(finaliseConfig({}));
  expect(() => refuseRemovedOptions(config as any)).not.toThrow();
});

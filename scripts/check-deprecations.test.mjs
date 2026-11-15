// Run by `npm run check:agents` (node:test, no dependency): checkDeprecations() on near misses planted in a small changelog.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {checkDeprecations, sourcesOfSrc} from './check-deprecations.mjs';

const changelog = `# Changelog

## [Unreleased]

### Deprecated
- A thing, until \`optionA: true\`.

### Fixed
- \`optionC\` named outside a Deprecated section.

## [6.7.0] - 2026-12-01

### Deprecated
- Another, until \`optionB\` is set.
`;
const say = (...options) => options.map(o => `warnOnce('X', 'Set ${o}: true to …');`).join('\n');

test('passes on the current tree', () => {
  assert.deepEqual(checkDeprecations(sourcesOfSrc(), readFileSync('CHANGELOG.md', 'utf8')), []);
});

test('passes when the lines sit under a release, [Unreleased] empty or without § Deprecated', () => {
  assert.deepEqual(checkDeprecations([say('optionA'), say('optionB')], changelog), []);
  const released = changelog.replace('### Deprecated\n- A thing, until `optionA: true`.\n\n', '')
    .replace('### Deprecated\n- Another', '### Deprecated\n- A thing, until `optionA: true`.\n- Another');
  assert.deepEqual(checkDeprecations([say('optionA'), say('optionB')], released), []);
  assert.deepEqual(checkDeprecations([say('optionB')], '# Changelog\n\n## [Unreleased]\n\n' + changelog.slice(changelog.indexOf('## [6.7.0]'))), []);
});

test('fails on a message with no line anywhere, or a second message for one line', () => {
  assert.equal(checkDeprecations([say('optionD')], changelog).length, 1);
  assert.equal(checkDeprecations([say('optionC')], changelog).length, 1);
  assert.equal(checkDeprecations([say('optionB', 'optionB')], changelog).length, 1);
});

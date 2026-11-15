// Run by `npm run check:agents` (node:test, no dependency): checkDeprecations() on near misses planted in a small changelog.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkDeprecations} from './check-deprecations.mjs';

const changelog = `# Changelog

## [Unreleased]

### Deprecated
- A thing, until \`optionA: true\`.
- Another, until \`optionB\` is set.

### Fixed
- \`optionC\` named outside Deprecated.

## [6.6.2] - 2026-11-12

### Deprecated
- \`optionC\` named under a release.
`;
const say = (...options) => options.map(o => `warnOnce('X', 'Set ${o}: true to …');`).join('\n');

test('passes when each message has its line', () => {
  assert.deepEqual(checkDeprecations([say('optionA'), say('optionB')], changelog), []);
});

test('fails on a second message for one line, and on a line outside [Unreleased] § Deprecated', () => {
  assert.equal(checkDeprecations([say('optionA', 'optionA')], changelog).length, 1);
  assert.equal(checkDeprecations([say('optionC')], changelog).length, 1);
});

test('fails without the section', () => {
  assert.deepEqual(checkDeprecations([], changelog.replace('### Deprecated\n- A', '### Removed\n- A')),
    ['CHANGELOG.md: no [Unreleased] § Deprecated']);
});

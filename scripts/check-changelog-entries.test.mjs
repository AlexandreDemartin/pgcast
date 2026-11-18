// Run by `npm run check:agents` (node:test, no dependency): checkChangelogEntries() on near misses planted in a small
// changelog.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {checkChangelogEntries} from './check-changelog-entries.mjs';

const long = '`db.all` as the value of a condition throws while compiling, so `.run()` rejects with a plain `Error` before any query';
const changelog = `# Changelog

- A line of the header, before any release.
- A line of the header, before any release.

## [Unreleased]

### Added
- ${long}, as \`Default\` does (#638).
  - Unchanged: the SQL of every call that compiled.

### Fixed
- Another entry (#640).
  - Unchanged: the SQL of every call that compiled.

## [6.10.0] - 2026-11-17

### Changed
- ${long}, as \`Default\` does (#638).
- Update dependencies.
`;

test('passes on the current tree', () => {
  assert.deepEqual(checkChangelogEntries(readFileSync('CHANGELOG.md', 'utf8')), []);
});

test('passes on one entry in two releases, a sub-bullet repeated, and the header', () => {
  assert.deepEqual(checkChangelogEntries(changelog), []);
});

test('fails on an entry written twice in one release, under two headings or one, its tail changed', () => {
  const twice = changelog.replace('- Another entry (#640).', `- ${long}, as \`self\` does there (#638).`);
  assert.deepEqual(checkChangelogEntries(twice),
    ['CHANGELOG.md:13: § [Unreleased] has this entry at line 9 already (an entry written twice)']);
  assert.equal(checkChangelogEntries(changelog + '- Update dependencies.\n').length, 1);
});

test('passes on two entries that differ within their first 120 characters', () => {
  const near = changelog.replace('- Another entry (#640).', `- ${long.replace('plain', 'bare')}, as \`Default\` does (#638).`);
  assert.ok(long.indexOf('plain') < 120);
  assert.deepEqual(checkChangelogEntries(near), []);
});

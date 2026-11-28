// Copyright (C) 2026 Alexandre Demartin
// Run by `npm run check:agents` (node:test, no dependency): wordsAboveFold() on small bodies, and the CLI on a file and
// on `PR_BODY`, as .github/workflows/pr-body.yml runs it.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {budget, wordsAboveFold} from './check-body.mjs';

const run = (args, env = {}) => spawnSync(process.execPath, ['scripts/check-body.mjs', ...args],
  {encoding: 'utf8', env: {PATH: process.env.PATH, ...env}});
const words = n => Array.from({length: n}, (_, i) => `word${i}`).join(' ');

test('counts words, punctuation as none', () => {
  assert.equal(wordsAboveFold('The owner reads this — in a minute, no more.'), 9);
  assert.equal(wordsAboveFold('- **Change**: one line.\n- **Proof** | met |'), 5);
});

test('counts a code span as one word', () => {
  assert.equal(wordsAboveFold('Run `npm run lint && npm run typecheck` first.'), 3);
});

test('stops at the first line that opens a <details>, not at one quoted in a sentence', () => {
  assert.equal(wordsAboveFold('One two.\n<details><summary>Evidence</summary>\n\nthree four\n</details>'), 2);
  assert.equal(wordsAboveFold('One two.\n  <DETAILS open>\nthree'), 2);
  assert.equal(wordsAboveFold('Fold it below a <details> tag.\nthree'), 7);
});

test('leaves out HTML comments, images, table separator rows, the Closes line and the Generated line', () => {
  const body = [
    'Closes #1001',
    'Part of #836',
    '<!-- a comment',
    'over two lines, with <details> in it -->',
    'One <!-- inline --> two.',
    '![Before, the page](https://example.com/a.png) <img src="b.png" alt="After, the page">',
    '| Before | After |',
    '|---|:---:|',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');
  assert.equal(wordsAboveFold(body), 4);
});

test('counts a link by its text, not its address', () => {
  assert.equal(wordsAboveFold('See [the review](https://github.com/o/r/pull/1#issuecomment-2).'), 3);
});

test('reads a body written with CRLF line ends', () => {
  assert.equal(wordsAboveFold('Closes #1\r\nOne two.\r\n<details>\r\nthree\r\n'), 2);
});

test('passes at exactly the budget and fails one word past it, on a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-body-'));
  writeFileSync(join(dir, 'at.md'), `Closes #1\n\n${words(budget)}\n\n<details>\n\n${words(500)}\n</details>\n`);
  writeFileSync(join(dir, 'past.md'), `${words(budget + 1)}\n`);
  const at = run([join(dir, 'at.md')]), past = run([join(dir, 'past.md')]);
  assert.equal(at.status, 0, at.stderr);
  assert.match(at.stdout, new RegExp(`✓ .*at\\.md: ${budget} words above the first <details>`));
  assert.equal(past.status, 1);
  assert.match(past.stderr, new RegExp(`✗ .*past\\.md: ${budget + 1} words above the first <details>, over the budget of ${budget}`));
});

test('reads PR_BODY from the environment, an empty body included, and needs a body', () => {
  const over = run([], {PR_BODY: words(budget + 1)}), empty = run([], {PR_BODY: ''}), none = run([]);
  assert.equal(over.status, 1);
  assert.match(over.stderr, /✗ PR_BODY: 201 words/);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /PR_BODY/);
});

test('passes on the templates of a PR and of an issue', () => {
  for (const file of ['.github/pull_request_template.md', '.github/ISSUE_TEMPLATE/task.md']) {
    const result = run([file]);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

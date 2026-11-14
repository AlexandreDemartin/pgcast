// Run by `npm run check:agents` (node:test, no dependency): checkReport() on near misses planted in a small report.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkReport} from './check-report.mjs';

const report = `# Characterisation report

## Summary

| Severity | Findings | Breaking | Non-breaking |
|---|---|---|---|
| Security | 2 | 1 | 1 |
| Docs | 2 | 1 | 1 |
| **Total** | **4** | **2** | **2** |

1 findings to fix (R3 decided), all fixed, 1 behind an opt-in, 1 to document and 1 to leave.

## Security

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R1 | \`core.ts\` | A finding. | none | non-breaking, except one form | **fixed**, PR #1 | Fix it |
| R2 | \`core.ts\` | A finding. | none | breaking | **opt-in**, PR #2 (\`option\`) | Make it opt-in |

## Docs

| # | Area | Finding | Test that pins it | Compat | Proposal | Title of the fix PR |
|---|---|---|---|---|---|---|
| R3 | \`core.ts\` | A finding. | none | breaking: a result changes | **documented**, PR #3 | — |
| R4 | \`core.ts\` | A finding. | none | non-breaking | leave: a niche case | — |
`;

const errorsWith = (from, to) => {
  assert.ok(report.includes(from), from);
  return checkReport(report.replace(from, to));
};

test('passes on a summary that matches its sections', () => {
  assert.deepEqual(checkReport(report), []);
});

test('fails when a Proposal cell changes class, and the summary does not', () => {
  for (const [from, to] of [
    ['**fixed**, PR #1', '**opt-in**, PR #1'],
    ['**documented**, PR #3', '**fixed**, PR #3'],
    ['leave: a niche case', 'document: a niche case'],
  ]) {
    assert.notDeepEqual(errorsWith(from, to), [], to);
  }
});

test('fails when one count of the summary changes', () => {
  for (const [from, to] of [
    ['| Security | 2 | 1 | 1 |', '| Security | 2 | 2 | 0 |'],
    ['| **Total** | **4** |', '| **Total** | **5** |'],
    ['1 findings to fix', '2 findings to fix'],
    ['1 behind an opt-in', '2 behind an opt-in'],
    ['1 to document', '0 to document'],
    ['1 to leave', '2 to leave'],
  ]) {
    assert.notDeepEqual(errorsWith(from, to), [], to);
  }
});

test('fails on a near miss of a Proposal or a Compat word: bold, plain, a capital, a plural', () => {
  for (const [from, to] of [
    ['**fixed**, PR #1', 'fixed, PR #1'],
    ['**fixed**, PR #1', '**Fixed**, PR #1'],
    ['**fixed**, PR #1', '**fix**, PR #1'],
    ['**fixed**, PR #1', 'Fix, PR #1'],
    ['**opt-in**, PR #2', '**Opt-in**, PR #2'],
    ['leave: a niche case', '**leave**: a niche case'],
    ['leave: a niche case', 'Leave: a niche case'],
    ['| breaking |', '| Breaking |'],
    ['| non-breaking |', '| nonbreaking |'],
  ]) {
    assert.notDeepEqual(errorsWith(from, to), [], to);
  }
});

test('counts a pending fix as one to fix, and refuses "all fixed" beside it', () => {
  assert.deepEqual(checkReport(report.replace(', all fixed', '').replace('**fixed**, PR #1', 'fix: a reason')), []);
  assert.notDeepEqual(errorsWith('**fixed**, PR #1', 'fix: a reason'), []);
});

test('fails on a finding row it cannot read, rather than skipping it', () => {
  for (const [from, to] of [
    ['| R4 |', '|R4 |'],
    ['| R4 |', '| **R4** |'],
    ['| R4 |', '| r4 |'],
    ['| R4 | `core.ts` |', '| R4 |'],
    ['| R4 |', '| R3 |'],
  ]) {
    assert.notDeepEqual(errorsWith(from, to), [], to);
  }
});

test('fails on a sentence of counts it cannot read, or on none', () => {
  for (const [from, to] of [
    ['1 findings to fix', '1 finding to fix'],
    ['1 behind an opt-in, ', '1 behind an opt-in and '],
    ['1 to leave.', '1 to leave'],
    ['1 findings to fix (R3 decided), all fixed, 1 behind an opt-in, 1 to document and 1 to leave.', ''],
  ]) {
    assert.notDeepEqual(errorsWith(from, to), [], to);
  }
});

test('fails when the table misses a section, or names one in the wrong order', () => {
  assert.notDeepEqual(errorsWith('| Docs | 2 | 1 | 1 |\n', ''), []);
  assert.notDeepEqual(errorsWith('| Security | 2 | 1 | 1 |\n| Docs | 2 | 1 | 1 |', '| Docs | 2 | 1 | 1 |\n| Security | 2 | 1 | 1 |'), []);
});

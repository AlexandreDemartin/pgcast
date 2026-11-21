// Run by `npm run check:agents` (node:test, no dependency): checkSkills() on skills planted in a scratch folder.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, sep} from 'node:path';
import {after, test} from 'node:test';
import {checkSkills} from './check-skills.mjs';

const root = mkdtempSync(join(tmpdir(), 'pgcast-check-skills-'));
after(() => rmSync(root, {recursive: true, force: true}));

let count = 0;
/** A folder of two skills, `alpha` and `beta`, whose files are `files` (`<skill>/<file>` to its text) over valid ones. */
function plant(files = {}) {
  const directory = join(root, String(count++));
  const valid = name => `---\nname: ${name}\ndescription: 'Does a thing. USE FOR: a thing.'\n---\n\n# ${name}\n`;
  for (const [path, text] of Object.entries({'alpha/SKILL.md': valid('alpha'), 'beta/SKILL.md': valid('beta'), ...files})) {
    mkdirSync(join(directory, path, '..'), {recursive: true});
    writeFileSync(join(directory, path), text);
  }
  return directory;
}
/** The errors of `checkSkills()` on `plant(files)`, each path relative to the planted folder. */
function errorsOf(files) {
  const directory = plant(files);
  return checkSkills(directory).errors.map(e => e.startsWith(directory + sep) ? e.slice(directory.length + 1) : e);
}

const ref = '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\nSee reference.md.\n';

test('passes on the current tree', () => {
  assert.deepEqual(checkSkills('.agents/skills').errors, []);
});

test('passes on skills that cite each other', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\nSee skill `beta`.\n'}), []);
});

test('fails on a SKILL.md that cites an unknown skill', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\nSee skill `gamma`.\n'}),
    ["alpha/SKILL.md: cites unknown skill 'gamma'"]);
});

test('fails on a SKILL.md over 150 lines or 1,800 words', () => {
  const head = '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\n';
  assert.deepEqual(errorsOf({'alpha/SKILL.md': head + 'line\n'.repeat(147)}), ['alpha/SKILL.md: 151 lines, max 150']);
  assert.deepEqual(errorsOf({'alpha/SKILL.md': head + 'word '.repeat(1793)}), ['alpha/SKILL.md: 1801 words, max 1800']);
});

test('passes on a SKILL.md and a reference.md of exactly 150 lines and 1,800 words', () => {
  const head = '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\n';
  assert.deepEqual(errorsOf({
    'alpha/SKILL.md': head + 'line\n'.repeat(145) + 'word '.repeat(1646) + 'reference.md\n',
    'alpha/reference.md': 'line\n'.repeat(149) + 'word '.repeat(1651) + '\n',
  }), []);
});

test('fails on a SKILL.md with no frontmatter for its size too', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': 'no frontmatter\n' + 'line\n'.repeat(160)}),
    ['alpha/SKILL.md: missing frontmatter', 'alpha/SKILL.md: 161 lines, max 150']);
});

test('fails on a reference.md that cites an unknown skill', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': ref, 'alpha/reference.md': '# Alpha: reference\n\nSee skill `beta`, then skill `gamma`.\n'}),
    ["alpha/reference.md: cites unknown skill 'gamma'"]);
});

test('fails on a reference.md over 150 lines', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': ref, 'alpha/reference.md': 'line\n'.repeat(151)}), ['alpha/reference.md: 151 lines, max 150']);
});

test('fails on a reference.md over 1,800 words', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': ref, 'alpha/reference.md': 'word '.repeat(1801)}), ['alpha/reference.md: 1801 words, max 1800']);
});

const head = '---\nname: alpha\ndescription: \'USE FOR: x\'\n---\n';

test('passes on a reference.md cited with a section that is one of its headings', () => {
  assert.deepEqual(errorsOf({
    'alpha/SKILL.md': head + 'Read [reference.md](reference.md) § Lookups.\n',
    'alpha/reference.md': '# Alpha\n\n## Lookups\n',
  }), []);
});

test('fails on a cited section that is no heading of reference.md', () => {
  assert.deepEqual(errorsOf({
    'alpha/SKILL.md': head + 'Read [reference.md](reference.md) § Lookup.\n',
    'alpha/reference.md': '# Alpha\n\n## Lookups\n',
  }), ["alpha/SKILL.md: cites section 'Lookup' that reference.md has no heading for"]);
});

test('fails on a link to a reference.md that does not exist', () => {
  assert.deepEqual(errorsOf({'alpha/SKILL.md': head + 'Read [reference.md](reference.md).\n'}),
    ['alpha/SKILL.md: links reference.md, which does not exist']);
});

test('fails on a reference.md that its SKILL.md does not cite', () => {
  assert.deepEqual(errorsOf({'alpha/reference.md': '# Alpha\n'}),
    ['alpha/reference.md: not cited by its SKILL.md']);
});

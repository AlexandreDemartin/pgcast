// Run by `npm run check:agents` (node:test, no dependency): checkSkills() on skills planted in a scratch folder.
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
const errorsOf = files => checkSkills(plant(files)).errors.map(e => e.replace(/^.*?\/\d+\//, ''));

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

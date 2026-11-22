#!/usr/bin/env node
// `npm run check:agents`: keeps the agent method (.agents/README.md) consistent, AGENTS.md § Architecture in step with
// src/ and CHANGELOG.md § Deprecated with its messages, finds a CHANGELOG.md entry written twice in a release,
// recounts the summary of the characterisation report, then runs the tests of the guard hook, of the release-folder
// resolver and of these checks.
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {checkArchitecture} from './check-architecture.mjs';
import {checkChangelogEntries} from './check-changelog-entries.mjs';
import {checkDeprecations, sourcesOfSrc} from './check-deprecations.mjs';
import {checkReport} from './check-report.mjs';
import {checkSkills, citationErrors, frontmatterOf, sizeErrors, sizeOf} from './check-skills.mjs';

const skillsDirectory = '.agents/skills';
const agentsDirectory = '.claude/agents';

const sizes = [];
const measured = path => {
  const text = readFileSync(path, 'utf8');
  sizes.push({path, ...sizeOf(text)});
  return text;
};

// Each skill's frontmatter, size, citations, checklist and repeated sentences (scripts/check-skills.mjs).
const {skills, files: skillFiles, errors} = checkSkills(skillsDirectory);
skillFiles.forEach(measured);

for (const file of readdirSync(agentsDirectory).filter(f => f.endsWith('.md'))) {
  const path = join(agentsDirectory, file), text = measured(path);
  const frontmatter = frontmatterOf(text);
  if (!frontmatter) errors.push(`${path}: missing frontmatter`);
  const {name, description} = frontmatter ?? {};
  if (name !== file.replace(/\.md$/, '')) errors.push(`${path}: name '${name}' differs from its file name`);
  if (!description) errors.push(`${path}: missing description`);
  errors.push(...sizeErrors(path, text));
}
for (const path of ['AGENTS.md', '.agents/README.md']) measured(path);

// Every "skill `x`" cited in the other method docs must exist.
const citingFiles = [
  'AGENTS.md',
  '.agents/README.md',
  'docs/WORKFLOW.md',
  ...readdirSync(agentsDirectory).filter(f => f.endsWith('.md')).map(f => join(agentsDirectory, f)),
].filter(existsSync);
for (const path of citingFiles) errors.push(...citationErrors(path, readFileSync(path, 'utf8'), skills));

// Each module of src/db and src/generate named in AGENTS.md § Architecture (scripts/check-architecture.mjs).
const modules = Object.fromEntries(['src/db/', 'src/generate/']
  .map(dir => [dir, readdirSync(dir).filter(f => f.endsWith('.ts'))]));
errors.push(...checkArchitecture(readFileSync('AGENTS.md', 'utf8'), modules));

// Each deprecation message of src/ with its CHANGELOG.md line (scripts/check-deprecations.mjs).
errors.push(...checkDeprecations(sourcesOfSrc(), readFileSync('CHANGELOG.md', 'utf8')));

// No CHANGELOG.md entry written twice in one release (scripts/check-changelog-entries.mjs).
errors.push(...checkChangelogEntries(readFileSync('CHANGELOG.md', 'utf8')));

// The summary of the characterisation report, recounted from its sections (scripts/check-report.mjs).
const reportPath = 'docs/CHARACTERISATION-REPORT.md';
errors.push(...checkReport(readFileSync(reportPath, 'utf8'), reportPath));

for (const {path, lines, words} of sizes) {
  console.log(`${String(lines).padStart(4)} lines ${String(words).padStart(5)} words  ${path}`);
}
if (errors.length > 0) {
  console.error(errors.map(e => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${skills.length} skills, ${readdirSync(agentsDirectory).filter(f => f.endsWith('.md')).length} agents, AGENTS.md § Architecture, CHANGELOG.md § Deprecated and entries, ${reportPath} summary`);

const tests = spawnSync(process.execPath, ['--test', '.claude/hooks/guard.test.mjs', 'scripts/check-architecture.test.mjs',
  'scripts/check-changelog-entries.test.mjs', 'scripts/check-deprecations.test.mjs', 'scripts/check-report.test.mjs',
  'scripts/check-skills.test.mjs', 'scripts/release-folder.test.mjs'],
  {stdio: 'inherit'});
process.exit(tests.status ?? 1);

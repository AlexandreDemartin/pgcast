#!/usr/bin/env node
// `npm run check:agents`: keeps the agent method (.agents/README.md) consistent, then runs the guard hook's tests.
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const skillsDirectory = '.agents/skills';
const agentsDirectory = '.claude/agents';
const userLevelSkills = new Set(['branch-review']);  // lives in the user's ~/.claude, not in this repository
const maxDescriptionLength = 350;
const maxSkillLines = 150;

const errors = [];

function frontmatterOf(path) {
  const match = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${path}: missing frontmatter`);
    return {};
  }
  return Object.fromEntries(match[1].split('\n').map(line => {
    const [key, ...rest] = line.split(':');
    return [key.trim(), rest.join(':').trim().replace(/^'(.*)'$/, '$1')];
  }));
}

const skills = readdirSync(skillsDirectory, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name);
for (const skill of skills) {
  const path = join(skillsDirectory, skill, 'SKILL.md');
  if (!existsSync(path)) {
    errors.push(`${path}: missing`);
    continue;
  }
  const {name, description = ''} = frontmatterOf(path);
  if (name !== skill) errors.push(`${path}: name '${name}' differs from its folder '${skill}'`);
  if (!description) errors.push(`${path}: missing description`);
  if (description.length > maxDescriptionLength) {
    errors.push(`${path}: description is ${description.length} characters, max ${maxDescriptionLength}`);
  }
  if (!/USE FOR:/.test(description)) errors.push(`${path}: description lacks USE FOR:`);
  const lines = readFileSync(path, 'utf8').split('\n').length;
  if (lines > maxSkillLines) errors.push(`${path}: ${lines} lines, max ${maxSkillLines}`);
}

for (const file of readdirSync(agentsDirectory).filter(f => f.endsWith('.md'))) {
  const path = join(agentsDirectory, file);
  const {name, description} = frontmatterOf(path);
  if (name !== file.replace(/\.md$/, '')) errors.push(`${path}: name '${name}' differs from its file name`);
  if (!description) errors.push(`${path}: missing description`);
}

// Every "skill `x`" cited in the method docs must exist.
const citingFiles = [
  'AGENTS.md',
  '.agents/README.md',
  ...skills.map(s => join(skillsDirectory, s, 'SKILL.md')),
  ...readdirSync(agentsDirectory).filter(f => f.endsWith('.md')).map(f => join(agentsDirectory, f)),
].filter(existsSync);
for (const path of citingFiles) {
  for (const [, cited] of readFileSync(path, 'utf8').matchAll(/skills? (?:utilisateur )?`([a-z0-9-]+)`/g)) {
    if (!skills.includes(cited) && !userLevelSkills.has(cited)) errors.push(`${path}: cites unknown skill '${cited}'`);
  }
}

if (errors.length > 0) {
  console.error(errors.map(e => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${skills.length} skills, ${readdirSync(agentsDirectory).filter(f => f.endsWith('.md')).length} agents`);

const guardTests = spawnSync(process.execPath, ['--test', '.claude/hooks/guard.test.mjs'], {stdio: 'inherit'});
process.exit(guardTests.status ?? 1);

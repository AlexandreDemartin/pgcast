// Copyright (C) 2026 Alexandre Demartin
// The checks of `npm run check:agents` on .agents/skills (.agents/README.md § Writing a skill): each SKILL.md's
// frontmatter, its size, and the skills it cites.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const maxDescriptionLength = 350;
const maxLines = 150;  // hard limits of a skill or an agent; the budget is ~100 lines
const maxWords = 1800;  // and ~1,200 words

/** Lines and words as `wc -l` and `wc -w` count them. */
export function sizeOf(text) {
  return {
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

/** One error per limit of a skill or an agent that `text` exceeds; empty if none. */
export function sizeErrors(path, text) {
  const {lines, words} = sizeOf(text), errors = [];
  if (lines > maxLines) errors.push(`${path}: ${lines} lines, max ${maxLines}`);
  if (words > maxWords) errors.push(`${path}: ${words} words, max ${maxWords}`);
  return errors;
}

/** One error per "skill `x`" of `text` that names none of `skills`; empty if none. */
export function citationErrors(path, text, skills) {
  return [...text.matchAll(/skills? `([a-z0-9-]+)`/g)]
    .filter(([, cited]) => !skills.includes(cited))
    .map(([, cited]) => `${path}: cites unknown skill '${cited}'`);
}

/** The frontmatter's keys, or `undefined` if it has none. */
export function frontmatterOf(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return undefined;
  return Object.fromEntries(match[1].split('\n').map(line => {
    const [key, ...rest] = line.split(':');
    return [key.trim(), rest.join(':').trim().replace(/^'(.*)'$/, '$1')];
  }));
}

/** The skills of `directory` (one folder each), the files checked, and one error per broken rule. */
export function checkSkills(directory) {
  const skills = readdirSync(directory, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name);
  const files = [], errors = [];
  for (const skill of skills) {
    const path = join(directory, skill, 'SKILL.md');
    if (!existsSync(path)) {
      errors.push(`${path}: missing`);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    files.push(path);
    const frontmatter = frontmatterOf(text);
    if (!frontmatter) {
      errors.push(`${path}: missing frontmatter`);
      continue;
    }
    const {name, description = ''} = frontmatter;
    if (name !== skill) errors.push(`${path}: name '${name}' differs from its folder '${skill}'`);
    if (!description) errors.push(`${path}: missing description`);
    if (description.length > maxDescriptionLength) {
      errors.push(`${path}: description is ${description.length} characters, max ${maxDescriptionLength}`);
    }
    if (!/USE FOR:/.test(description)) errors.push(`${path}: description lacks USE FOR:`);
    errors.push(...sizeErrors(path, text));
  }
  for (const path of files) errors.push(...citationErrors(path, readFileSync(path, 'utf8'), skills));
  return {skills, files, errors};
}

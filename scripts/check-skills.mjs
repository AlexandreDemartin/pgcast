// Copyright (C) 2026 Alexandre Demartin
// The checks of `npm run check:agents` on .agents/skills (.agents/README.md § Writing a skill): each SKILL.md's
// frontmatter, and the size and citations of each SKILL.md and of the reference.md beside it, read in full when its
// core names a case, so under the same limits; neither holds a checklist, and the two hold no sentence of eight words
// or more twice, in one file or both.
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {basename, join} from 'node:path';

const maxDescriptionLength = 350;
const maxLines = 150;  // hard limits of a skill, its reference or an agent; the budget is ~100 lines
const maxWords = 1800;  // and ~1,200 words

/** Lines and words as `wc -l` and `wc -w` count them. */
export function sizeOf(text) {
  return {
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

/** One error per limit of a skill, its reference or an agent that `text` exceeds; empty if none. */
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

/**
 * One error per section cited after a `reference.md` of a SKILL.md that is no heading of `reference`, its text; empty if
 * none. The citation is `reference.md` or `./reference.md`, as a link (`#anchor` allowed) whatever its text, a code
 * span or plain text, then `§` and a heading, read as the longest one the text starts with and that ends at a
 * punctuation mark or a backtick, an "and", an "or", a "then" or the end of the line; a bare `§` joined to it by a
 * comma, "and", "or" or "then" is read as a section too. Left unchecked: any other path to a `reference.md`, such as
 * another skill's (`skills/x/reference.md`, `../x/reference.md`).
 */
export function sectionErrors(path, text, reference) {
  const headings = [...reference.matchAll(/^#+ (.+?)\s*$/gm)].map(([, heading]) => heading).sort((a, b) => b.length - a.length);
  const errors = [], citation = /(?:\]\((?:\.\/)?reference\.md(?:#[^)]*)?\)|`(?:\.\/)?reference\.md`|(?<![\w/.])(?:\.\/)?reference\.md) § /g;
  const end = /^(?:$|\s*[\p{P}`]|\s+(?:and|or|then)\b)/u, join = /^(?:[,;])? ?(?:(?:then|and|or) )?§ /;
  for (const line of text.split('\n')) {
    for (const {index, 0: cited} of line.matchAll(citation)) {
      let rest = line.slice(index + cited.length);
      for (;;) {
        const heading = headings.find(h => rest.startsWith(h) && end.test(rest.slice(h.length)));
        if (!heading) {
          errors.push(`${path}: cites section '${rest.match(/^[^.;:,)\]]*/)[0]}' that reference.md has no heading for`);
          break;
        }
        rest = rest.slice(heading.length);
        const joined = rest.match(join);
        if (!joined) break;
        rest = rest.slice(joined[0].length);
      }
    }
  }
  return errors;
}

/**
 * One error if `text` has a checklist, which repeats rules its sections state: a heading of level 2 or more that starts
 * with the word "checklist" in any case, or a task item (`- [ ]`, `* [x]`) under any heading; empty if none.
 */
export function checklistErrors(path, text) {
  const checklist = /^#{2,}\s*checklist\b|^\s*[-*] \[[ x]\] /im;
  return checklist.test(text) ? [`${path}: has a ## Checklist; each rule goes in its section, once`] : [];
}

/**
 * One error per sentence of eight words or more that a skill's files, `texts` (path, text), hold twice, naming the
 * first by its file and line: a copy, where a core gives a summary and a link. A sentence ends at `.`, `;` or `:`
 * before a space, and is compared in lower case, its bullet's marker and every character but letters, digits, `_`,
 * backticks and spaces dropped.
 */
export function duplicateErrors(texts) {
  const seen = new Map(), errors = [];
  for (const [path, text] of texts) {
    text.split('\n').forEach((line, index) => {
      for (const sentence of line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').split(/(?<=[.;:])\s+/)) {
        const words = sentence.toLowerCase().replace(/[^\p{L}\p{N}_` ]/gu, '').split(/\s+/).filter(Boolean);
        if (words.length < 8) continue;
        const key = words.join(' ');
        if (seen.has(key)) errors.push(`${path}:${index + 1}: repeats ${seen.get(key)} ('${words.slice(0, 6).join(' ')} …'); `
          + 'keep it once, a summary and a link in its other place');
        else seen.set(key, `${basename(path)}:${index + 1}`);
      }
    });
  }
  return errors;
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
    const text = readFileSync(path, 'utf8'), texts = [[path, text]];
    files.push(path);
    const reference = join(directory, skill, 'reference.md');
    if (existsSync(reference)) {
      const referenceText = readFileSync(reference, 'utf8');
      files.push(reference);
      texts.push([reference, referenceText]);
      errors.push(...sizeErrors(reference, referenceText), ...sectionErrors(path, text, referenceText));
      if (!/reference\.md/.test(text)) errors.push(`${reference}: not cited by its SKILL.md`);
    } else if (/reference\.md/.test(text)) {
      errors.push(`${path}: links reference.md, which does not exist`);
    }
    for (const [file, fileText] of texts) errors.push(...checklistErrors(file, fileText));
    errors.push(...duplicateErrors(texts));
    const frontmatter = frontmatterOf(text);
    if (!frontmatter) {
      errors.push(`${path}: missing frontmatter`, ...sizeErrors(path, text));
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

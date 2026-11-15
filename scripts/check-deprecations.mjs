// Copyright (C) 2026 Alexandre Demartin
// Checks that each deprecation message of src/ ("Set <option>: …") has its own line under CHANGELOG.md's
// [Unreleased] § Deprecated, for `npm run check:agents` and the docs job (a change to CHANGELOG.md alone).
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

/** Every option whose messages outnumber its `### Deprecated` lines; empty if none. */
export function checkDeprecations(sources, changelog) {
  const
    messages = {},
    deprecated = changelog.split(/^## /m).find(part => part.startsWith('[Unreleased]'))
      ?.split(/^### /m).find(part => part.startsWith('Deprecated\n'));
  if (!deprecated) return ['CHANGELOG.md: no [Unreleased] § Deprecated'];
  for (const source of sources) {
    for (const [, option] of source.matchAll(/\bSet (\w+): /g)) messages[option] = (messages[option] ?? 0) + 1;
  }
  return Object.entries(messages).flatMap(([option, count]) => {
    const lines = deprecated.split('\n').filter(line => line.startsWith('- ') && line.includes(`\`${option}`)).length;
    return lines >= count ? [] :
      [`CHANGELOG.md [Unreleased] § Deprecated: ${count} message(s) of src/ say "Set ${option}:", ${lines} line(s) name it`];
  });
}

/** The sources of the `.ts` files of src/, as git lists them. */
export const sourcesOfSrc = () =>
  execFileSync('git', ['ls-files', 'src/*.ts'], {encoding: 'utf8'}).split('\n').filter(Boolean)
    .map(path => readFileSync(path, 'utf8'));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = checkDeprecations(sourcesOfSrc(), readFileSync('CHANGELOG.md', 'utf8'));
  console.log(errors.length ? errors.map(e => `✗ ${e}`).join('\n') : '✓ each deprecation message has its CHANGELOG line');
  process.exit(errors.length ? 1 : 0);
}

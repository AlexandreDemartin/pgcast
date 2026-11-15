// Copyright (C) 2026 Alexandre Demartin
// Checks that each deprecation message of src/ ("Set <option>: …") has its own line under a `### Deprecated` of
// CHANGELOG.md, in any release or [Unreleased]: a deprecation stays recorded once released, until 7.0 removes its
// message. Run by `npm run check:agents` and by the docs job (a change to CHANGELOG.md alone).
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

/** Every option whose messages outnumber the `### Deprecated` lines naming it, all sections together; empty if none. */
export function checkDeprecations(sources, changelog) {
  const
    messages = {},
    deprecated = changelog.split(/^### /m).filter(part => part.startsWith('Deprecated\n'))
      .flatMap(part => part.split(/^## /m)[0].split('\n').filter(line => line.startsWith('- ')));
  for (const source of sources) {
    for (const [, option] of source.matchAll(/\bSet (\w+): /g)) messages[option] = (messages[option] ?? 0) + 1;
  }
  return Object.entries(messages).flatMap(([option, count]) => {
    const lines = deprecated.filter(line => line.includes(`\`${option}`)).length;
    return lines >= count ? [] :
      [`CHANGELOG.md § Deprecated: ${count} message(s) of src/ say "Set ${option}:", ${lines} line(s) name it`];
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

// Copyright (C) 2026 Alexandre Demartin
// Checks that no entry of CHANGELOG.md is written twice in one release: two top-level bullets of one `## ` section
// whose first 120 characters are the same. A merge of master, or a squash of a branch made before another PR rewrote
// the entry, can bring its old text back beside the new one with no conflict (#645, #647, #662). Run by
// `npm run check:agents` and by the docs job (a change to CHANGELOG.md alone).
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const compared = 120;

/** One error per entry that starts as an earlier entry of its section does; empty if none. */
export function checkChangelogEntries(changelog) {
  const errors = [];
  let section, seen;
  changelog.split('\n').forEach((line, index) => {
    if (line.startsWith('## ')) {
      section = line.slice(3);
      seen = new Map();
    } else if (section !== undefined && line.startsWith('- ')) {
      const start = line.slice(2, 2 + compared), first = seen.get(start);
      if (first === undefined) seen.set(start, index + 1);
      else errors.push(`CHANGELOG.md:${index + 1}: § ${section} has this entry at line ${first} already (an entry written twice)`);
    }
  });
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = checkChangelogEntries(readFileSync('CHANGELOG.md', 'utf8'));
  console.log(errors.length ? errors.map(e => `✗ ${e}`).join('\n') : '✓ no CHANGELOG.md entry written twice in a release');
  process.exit(errors.length ? 1 : 0);
}

// Copyright (C) 2026 Alexandre Demartin
// Checks that AGENTS.md § Architecture names each module of src/db and src/generate, and nothing that is gone, for
// `npm run check:agents`. A module of its own, which reads no file, so that its test can plant near misses in it.

/**
 * Every way § Architecture differs from the modules on disk; empty if none.
 * @param {string} text AGENTS.md
 * @param {Record<string, string[]>} modules the `.ts` files of each directory, by its path (`src/db/`)
 */
export function checkArchitecture(text, modules) {
  const
    errors = [],
    named = Object.fromEntries(Object.keys(modules).map(dir => [dir, new Set()])),
    section = text.split(/^## /m).find(part => part.startsWith('Architecture\n'));
  if (!section) return ['AGENTS.md: no § Architecture'];
  let dir;
  for (const line of section.split('\n')) {
    const top = line.match(/^- `([^`]+\/)`/);
    if (top) dir = named[top[1]] ? top[1] : undefined;
    else if (!/^\s+- /.test(line)) dir = undefined;  // a line outside the directory's bullets ends them
    if (!dir) continue;
    for (const [, name] of line.matchAll(/`([\w.-]+\.ts)`/g)) named[dir].add(name);
  }
  for (const [dir, files] of Object.entries(modules)) {
    for (const file of files) {
      if (file !== 'index.ts' && !named[dir].has(file)) errors.push(`AGENTS.md § Architecture: ${dir}${file} is not named`);
    }
    for (const name of named[dir]) {
      if (!files.includes(name)) errors.push(`AGENTS.md § Architecture: names ${dir}${name}, which does not exist`);
    }
  }
  return errors;
}

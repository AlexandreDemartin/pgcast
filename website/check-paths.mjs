// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when a built file holds an absolute path of a machine: this checkout's, or one that starts
// `/home/`, `/Users/`, `/runner/` or a drive letter (`C:\`, `C:/`). TypeScript's hover gives a module by its file's
// path (`typeof import("/home/runner/…/node_modules/@types/pg/index")`, see `moduleNames` in .vitepress/twoslash.ts),
// and a hover type is in the page's JavaScript, not its HTML: every text file of `.vitepress/dist` is read. A path that a package's own JSDoc gives as
// an example goes in `allowed`. Run by `npm run docs:build`, after VitePress.
import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const
  dist = fileURLToPath(new URL('.vitepress/dist/', import.meta.url)),
  checkout = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, ''),
  absolute = /(?<![\w/.])(?:\/(?:home|Users|runner)\/|[A-Za-z]:[\\/])[^\s"'`<>()]*/g,
  // @types/node's example of `process.env`, in the hover of `process.env`
  allowed = new Set(['/Users/maciej']),
  text = new Set(['.html', '.js', '.css', '.json', '.txt', '.xml', '.svg']),
  files = readdirSync(dist, { recursive: true }).filter(file => text.has(extname(file))),
  problems = [];

for (const file of files) {
  const content = readFileSync(dist + file, 'utf8');
  const found = new Set([...content.matchAll(absolute)].map(([path]) => path).filter(path => !allowed.has(path)));
  if (checkout.length > 1 && content.includes(checkout) && ![...found].some(path => path.includes(checkout)))
    found.add(checkout);
  for (const path of found) problems.push(`${file}: ${path}`);
}

if (problems.length > 0) {
  console.error(`The paths check failed: a built file holds a machine's path (README.md § Examples):\n  ${
    problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`No machine's path in the ${files.length} built text files.`);
}

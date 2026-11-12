// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when an export of zapatos/db, or an option of its `Config` or of the generator's, has neither an
// entry in a Reference page nor a line in reference-pending.json (README.md § The reference). The names are read with
// TypeScript from the built library's declarations, as a user's project resolves them. Run by `npm run docs:build`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { outline } from './.vitepress/outline.ts';

const
  pendingFile = 'reference-pending.json',
  options = { module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] },
  [dbFile, generateFile] = ['zapatos/db', 'zapatos/generate'].map(name => {
    const { resolvedModule } = ts.resolveModuleName(name, fileURLToPath(import.meta.url), options, ts.sys);
    if (!resolvedModule) throw new Error(`Cannot resolve ${name}: run \`npm ci && npm run build\` at the root first`);
    return resolvedModule.resolvedFileName;
  }),
  program = ts.createProgram([dbFile, generateFile], options),
  checker = program.getTypeChecker(),
  target = symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
  exportsOf = file => checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))),
  declaredIn = symbol => target(symbol).declarations[0].getSourceFile().fileName,
  names = new Map();  // name → what declares it, so that a missing name is sent to the page of its neighbours

for (const symbol of exportsOf(dbFile)) {
  names.set(symbol.name, declaredIn(symbol));
  if (target(symbol).flags & ts.SymbolFlags.Module) {  // `export * as conditions`: each member is an entry too
    for (const member of checker.getExportsOfModule(target(symbol))) {
      names.set(`${symbol.name}.${member.name}`, declaredIn(member));
    }
  }
}
for (const [prefix, file] of [['Config', dbFile], ['generate', generateFile]]) {
  const config = exportsOf(file).find(symbol => symbol.name === 'Config');
  if (!config) throw new Error(`${file} exports no Config any more: update check-reference.mjs`);
  for (const option of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target(config)))) {
    names.set(`${prefix}.${option.name}`, `${prefix}.*`);
  }
}

// An entry is a heading of a Reference page that ends in `{#name}`, other attributes allowed (`{#name .since}`),
// outside fenced code and HTML comments.
const
  referencePages = outline.find(group => group.link === '/reference').items.map(({ link }) => `${link.slice(1)}.md`),
  entries = new Map(),  // name → page
  problems = [];

for (const page of referencePages.filter(page => existsSync(new URL(page, import.meta.url)))) {
  let fence = null, comment = false;  // VitePress renders no heading in either
  for (const line of readFileSync(new URL(page, import.meta.url), 'utf8').split('\n')) {
    const marker = !comment && line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && fence === null) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    else if (fence === null && (comment || /^\s*<!--/.test(line))) {
      comment = !line.replace(/^\s*<!--/, '').includes('-->');
      continue;
    }
    const anchor = fence === null && line.match(/^#{1,6}\s.*\{(?:[^}]*\s)?#([^\s}]+)[^}]*\}\s*$/)?.[1];
    if (anchor && names.has(anchor) && entries.has(anchor) && entries.get(anchor) !== page) {
      problems.push(`${anchor}: has an entry in ${entries.get(anchor)} and in ${page}; keep one`);
    } else if (anchor) entries.set(anchor, page);
  }
}

const pending = new Map();  // name → page

for (const [page, list] of Object.entries(JSON.parse(readFileSync(new URL(pendingFile, import.meta.url), 'utf8')))) {
  if (!referencePages.includes(page)) {
    problems.push(`${page}, in ${pendingFile}: not a page of the Reference group (.vitepress/outline.ts)`);
  }
  for (const name of list) {
    const problem =
      pending.has(name) ? 'listed twice in' :
      !names.has(name) ? 'no such export or option any more; remove it from' :
      entries.has(name) ? `has its entry in ${entries.get(name)}; remove it from` :
      null;
    if (problem) problems.push(`${name}: ${problem} ${pendingFile}`);
    pending.set(name, page);
  }
}

// A missing name goes to the page of the names declared next to it, before and after, in the same file or Config.
const
  order = [...names.keys()],
  pageOf = name => entries.get(name) ?? pending.get(name),
  nearest = (index, step) => {
    for (let i = index + step; i >= 0 && i < order.length; i += step) {
      if (names.get(order[i]) === names.get(order[index]) && pageOf(order[i])) return pageOf(order[i]);
    }
  };

order.forEach((name, index) => {
  if (pageOf(name)) return;
  const pages = [...new Set([nearest(index, -1), nearest(index, 1)].filter(Boolean))].join(' or ');
  problems.push(`${name}: no entry; add a heading ending in {#${name}} to ${pages || 'a Reference page'}, ` +
    `or list it under that page in ${pendingFile}`);
});

if (problems.length > 0) {
  console.error(`The reference check failed (README.md § The reference):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The reference covers ${names.size} names: ` +
    `${names.size - pending.size} with an entry, ${pending.size} pending.`);
}

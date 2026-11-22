// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when the built zapatos/db, which the playground bundles, calls a static method of `Buffer` that
// the playground's stand-in (.vitepress/playground/globals.ts) lacks: `docs:examples` runs in Node, with the real
// `Buffer`, so such a gap shows only on a Run in the browser (#898). TypeScript parses each file of `dist/db`, so that
// `ArrayBuffer.isView`, a comment and a string are no call; only the stand-in's own statics count, as those it inherits
// from `Uint8Array` (`from`, `of`) do not do what Node's do. Run by `npm run docs:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const
  dist = fileURLToPath(new URL('../dist/db/', import.meta.url)),
  nodeBuffer = globalThis.Buffer;

if (!existsSync(dist)) throw new Error('No `dist/db`: run `npm ci && npm run build` at the root first');
await import('./.vitepress/playground/globals.ts');
const standIn = globalThis.Buffer;
globalThis.Buffer = nodeBuffer;

const calls = new Map();  // name → the `file:line` of each call
for (const file of readdirSync(dist).filter(file => file.endsWith('.js'))) {
  const source = ts.createSourceFile(file, readFileSync(dist + file, 'utf8'), ts.ScriptTarget.Latest);
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Buffer') {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      calls.set(node.name.text, [...calls.get(node.name.text) ?? [], `dist/db/${file}:${line + 1}`]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const missing = [...calls].filter(([name]) => !Object.hasOwn(standIn, name));
if (missing.length > 0) {
  console.error(`The Buffer check failed: the playground's stand-in (.vitepress/playground/globals.ts) lacks a static ` +
    `method that zapatos/db calls:\n  ${missing.map(([name, where]) => `Buffer.${name}, called in ${where.join(', ')}`)
      .join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The playground's Buffer has the ${calls.size} static methods zapatos/db calls (${
    [...calls.keys()].sort().join(', ')}).`);
}

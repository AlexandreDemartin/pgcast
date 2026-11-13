// Copyright (C) 2026 Alexandre Demartin
// What the playground (decision 005) needs of the site's build, so that no other page pays for it.
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';

/**
 * Monaco's modules each import their own CSS, which VitePress (`cssCodeSplit: false`) would merge into every page's
 * stylesheet: they are emptied, and the editor puts in Monaco's own bundled stylesheet instead, as text
 * (theme/PlaygroundEditor.vue). VitePress links the build's first CSS file on every page as the site's: a second one
 * would take its place, so the build fails on it.
 */
const monacoCss: Plugin = {
  name: 'pgcast:monaco-css',
  enforce: 'pre',
  load: id => /\/node_modules\/monaco-editor\/esm\/.*\.css$/.test(id) ? '' : undefined,
  writeBundle(_, bundle) {  // once every asset is in it
    const css = Object.keys(bundle).filter(file => file.endsWith('.css'));
    if (css.length > 1) this.error(`the site's CSS is one file, not ${css.length}: ${css.join(', ')}`);
  },
};

/** `pg` in the runner's worker only: a stub (pg.ts). */
const pgStub: Plugin = {
  name: 'pgcast:pg-stub',
  enforce: 'pre',
  resolveId: id => id === 'pg' ? fileURLToPath(new URL('./pg.ts', import.meta.url)) : undefined,
};

export const playgroundVite = {
  plugins: [monacoCss],
  // PGlite finds its .wasm and .data files next to its own module, which Vite's pre-bundling would move (its docs)
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  // module workers: the runner imports the reader's code with `import()`
  worker: { format: 'es', plugins: () => [pgStub] },
} satisfies UserConfig;

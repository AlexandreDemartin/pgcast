// Copyright (C) 2026 Alexandre Demartin
// The line under each page on its group's landing page (theme/GroupPages.vue): its lede, cut as its description
// (`fromLede()`, meta.ts), at build, in each language. A "Coming" page, with no file of its own, has none.
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineLoader } from 'vitepress';
import { readPage } from './llms.ts';
import { fromLede } from './meta.ts';
import { outlineIn } from './outline.ts';
import { langs } from './words.ts';

declare const data: Record<string, string>;  // by the page's link: `/select`, `/fr/select`
export { data };

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineLoader({
  watch: ['../*.md', '../fr/*.md'],
  load(files) {
    const fileOf = Object.fromEntries(files.map(file => [`/${relative(root, file).replace(/\.md$/, '')}`, file]));
    return Object.fromEntries(langs.flatMap(lang => outlineIn(lang)).flatMap(group => group.items).flatMap(({ link }) => {
      const lede = fileOf[link] === undefined ? undefined : readPage(fileOf[link])?.lede;
      return lede === undefined ? [] : [[link, fromLede(lede)]];
    }));
  },
});

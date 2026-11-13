// Copyright (C) 2026 Alexandre Demartin
// The line under each page on its group's landing page (theme/GroupPages.vue): its lede, cut as its description
// (`fromLede()`, meta.ts), at build. A "Coming" page, with no file of its own, has none.
import { basename } from 'node:path';
import { defineLoader } from 'vitepress';
import { readPage } from './llms.ts';
import { fromLede } from './meta.ts';
import { outline } from './outline.ts';

declare const data: Record<string, string>;  // by the page's link
export { data };

export default defineLoader({
  watch: ['../*.md'],
  load(files) {
    const fileOf = Object.fromEntries(files.map(file => [`/${basename(file, '.md')}`, file]));
    return Object.fromEntries(outline.flatMap(group => group.items).flatMap(({ link }) => {
      const lede = fileOf[link] === undefined ? undefined : readPage(fileOf[link])?.lede;
      return lede === undefined ? [] : [[link, fromLede(lede)]];
    }));
  },
});

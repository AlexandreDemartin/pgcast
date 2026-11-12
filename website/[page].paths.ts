// Copyright (C) 2026 Alexandre Demartin
// A "Coming" page for each outline entry that has no page of its own yet, so that the sidebar never leads to a 404.
// A new page needs no change here: once `<link>.md` exists, its entry stops being generated.
import { existsSync } from 'node:fs';
import { outline } from './.vitepress/outline.ts';

const markdownOf = (html: string) => html.replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/\s*<small.*?<\/small>/g, '');

export default {
  paths() {
    return outline
      .flatMap(group => group.items)
      .filter(({ link }) => !existsSync(new URL(`.${link}.md`, import.meta.url)))
      .map(({ text, link }) => ({
        params: { page: link.slice(1) },
        content: `# ${markdownOf(text)}

::: info Coming
This page isn't written yet. Until it is, George MacKerron's [Zapatos docs](https://jawj.github.io/zapatos/) cover what 6.6.1 does, and the [changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md) what pgcast changes.
:::
`,
      }));
  },
};

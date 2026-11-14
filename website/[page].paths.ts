// Copyright (C) 2026 Alexandre Demartin
// A "Coming" page for each outline entry that has no page of its own yet, so that the sidebar never leads to a 404.
// A new page needs no change here: once `<link>.md` exists, its entry stops being generated. `fr/[page].paths.ts`
// gives the French site's, under `/fr/`, from `comingPages('fr')`.
import { existsSync } from 'node:fs';
import { outlineIn } from './.vitepress/outline.ts';
import { prefixOf, words, type Lang } from './.vitepress/words.ts';

const markdownOf = (html: string) => html.replace(/<code>(.*?)<\/code>/g, '`$1`').replace(/\s*<small.*?<\/small>/g, '');

/** The "Coming" pages of `lang`: each entry of its outline without a `<link>.md`, its `[page]` param the page's name. */
export function comingPages(lang: Lang) {
  const prefix = prefixOf(lang);
  return outlineIn(lang)
    .flatMap(group => group.items)
    .filter(({ link }) => !existsSync(new URL(`.${link}.md`, import.meta.url)))
    .map(({ text, link }) => ({
      params: { page: link.slice(prefix.length + 1) },
      content: `# ${markdownOf(text)}\n\n${words[lang].coming(`${prefix}/changelog`)}\n`,
    }));
}

export default { paths: () => comingPages('en') };

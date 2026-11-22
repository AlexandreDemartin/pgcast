// Copyright (C) 2026 Alexandre Demartin
// The Markdown copy of each page (`/<page>.md`, written by llms.ts) and the link its page's head gives it (meta.ts):
// which pages have one, and the check that the links and the copies the built site holds are the same.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outlineIn } from './outline.ts';
import { langOf, langs, prefixOf, type Lang } from './words.ts';

/** A page's file in the site's source, by its link: `/select` is `select.md`, `/fr/` is `fr/index.md`. */
export const fileOf = (link: string) => link.endsWith('/') ? `${link.slice(1)}index.md` : `${link.slice(1)}.md`;

/** The links of the pages that have a copy, in `lang`: the home and the outline's, written or not yet ("Coming"). */
const copyLinks = (lang: Lang) => {
  const prefix = prefixOf(lang);
  return [`${prefix}/`, ...outlineIn(lang).flatMap(group => [group.link, ...group.items.map(item => item.link)])];
};

/**
 * Whether a page (`select.md`, `fr/index.md`) is served as its own Markdown copy, `/select.md`: it has a file of its own,
 * and the outline lists it. The changelog and the playground, in each language, have none (README.md § For assistants).
 * Each such page's head links it (meta.ts), and `checkAlternates()` reads those links back.
 */
export const hasCopy = (page: string, srcDir: string) =>
  existsSync(join(srcDir, page)) && langs.some(lang => copyLinks(lang).some(link => fileOf(link) === page));

/**
 * The copies written to the site and the links to them in its built pages must be the same: a page's link to a copy that
 * is not served, and a copy served by a page with no link, fail the build. Reads `outDir`, so it runs after the pages.
 */
export function checkAlternates(outDir: string, root: string) {
  const
    served = new Set(readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.md'))),
    problems: string[] = [],
    linked = new Set<string>();
  for (const file of readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.html'))) {
    const links = [...readFileSync(join(outDir, file), 'utf8').matchAll(/<link\b[^>]*\btype="text\/markdown"[^>]*>/g)]
      .map(([tag]) => /\bhref="([^"]*)"/.exec(tag!)?.[1]);
    for (const href of links) {
      const copy = href === undefined ? undefined : decodeURI(href).replace(root, '');
      if (copy === undefined || !served.has(copy)) problems.push(`${file} links ${href}, which the site does not serve`);
      else linked.add(copy);
    }
    if (links.length > 1) problems.push(`${file} links ${links.length} Markdown copies`);
  }
  for (const copy of served) if (!linked.has(copy)) problems.push(`${copy} is served, and no page links it`);
  if (problems.length > 0) throw new Error(`alternates.ts: the Markdown copies and their links differ (README.md § For assistants):\n  ${problems.join('\n  ')}`);
  const count = (lang: Lang) => [...linked].filter(copy => langOf(copy) === lang).length;
  console.log(`Markdown copies: ${count('en')} English and ${count('fr')} French pages link their copy, as served.`);
}

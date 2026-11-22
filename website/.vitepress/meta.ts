// Copyright (C) 2026 Alexandre Demartin
// Each page's metadata, for search engines and link previews: its description, cut from its `{.lede}` unless its front
// matter sets one; its canonical URL, its page in the other language (`hreflang`, sitemap.xml's too), Open Graph and
// Twitter card, with its language's social image; its Markdown copy (llms.ts), when it has one; as JSON-LD, on each home the project, on the English home the site, on each outline page its breadcrumb. The favicons and
// `theme-color`, the same on every page, are in config.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeadConfig, PageData, TransformContext, TransformPageContext, UserConfig } from 'vitepress';
import { hasCopy } from './alternates.ts';
import { host, plainText, readPage } from './llms.ts';
import { outlineIn } from './outline.ts';
import { langOf, langs, prefixOf, words } from './words.ts';

export const repo = 'https://github.com/AlexandreDemartin/pgcast';

/** About what search results show of a description (README.md § For search engines). */
const descriptionMax = 160;

/**
 * Set a page's description (`transformPageData`): its front matter's `description`, or its lede cut by `fromLede()`.
 * A "Coming" page, which has no file nor lede, takes its language's (words.ts). The build fails on one over 160
 * characters, with what to shorten.
 */
export function describePage(pageData: PageData, { siteConfig }: TransformPageContext) {
  const
    lede = readPage(join(siteConfig.srcDir, pageData.relativePath))?.lede,
    own = pageData.frontmatter.description as string | undefined;
  if (own === undefined && lede !== undefined) pageData.description = fromLede(lede);
  const
    description = own ?? (pageData.description || words[langOf(pageData.relativePath)].description),
    fix = own !== undefined ? 'shorten its front matter\'s `description`'
      : lede !== undefined ? 'its lede opens on a longer sentence: give it a `description` in its front matter, ' +
        'one or two whole sentences'
      : 'shorten its language\'s `description` in words.ts';
  if (description.length > descriptionMax)
    throw new Error(`meta.ts: ${pageData.relativePath}'s description is ${description.length} characters, over ` +
      `${descriptionMax}; ${fix} (README.md § For search engines)`);
}

/**
 * A lede as plain text, cut after the last whole sentence within 160 characters, the first kept whatever its length,
 * as search results show about that much: a page's description, and its line on its group's landing page
 * (groups.data.ts).
 */
export function fromLede(lede: string) {
  const [first, ...rest] = plainText(lede).split(/(?<=[.!?])\s+/);
  let description = first!;
  for (const sentence of rest) {
    if (description.length + 1 + sentence.length > descriptionMax) break;
    description += ' ' + sentence;
  }
  return description;
}

/**
 * A page's canonical URL, the same page in each language, its Markdown copy if it has one (`hasCopy()`), Open Graph and Twitter card (`transformHead`), with the
 * `<title>` and description VitePress gives it; as schema.org JSON-LD (`structuredData()`). Every
 * page has its translation (check-translations.mjs), so each names both, by the codes sitemap.xml gives
 * (`sitemapAlternates()`). The 404 page gets none.
 */
export function pageHead({ page, pageData, siteConfig, title, description }: TransformContext): HeadConfig[] {
  if (pageData.isNotFound) return [];
  const
    root = host + siteConfig.site.base,
    lang = langOf(page),
    w = words[lang],
    path = page.replace(/^fr\//, ''),  // `select.md`, in either language
    urlOf = (page: string) => root + page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''),  // as sitemap.xml
    url = urlOf(page),
    alternate = (hreflang: string, page: string): HeadConfig => ['link', { rel: 'alternate', hreflang, href: urlOf(page) }],
    og = (property: string, content: string): HeadConfig => ['meta', { property, content }];
  return [
    ['link', { rel: 'canonical', href: url }],
    ...langs.map(other => alternate(other, other === 'en' ? path : `${other}/${path}`)),
    alternate('x-default', path),
    ...hasCopy(page, siteConfig.srcDir) ? [['link', { rel: 'alternate', type: 'text/markdown', href: root + page }] satisfies HeadConfig] : [],
    og('og:type', 'website'),
    og('og:site_name', siteConfig.site.title),
    og('og:title', title),
    og('og:description', description),
    og('og:url', url),
    og('og:image', root + w.socialCard),  // public/social-card*.svg, rendered by render-images.mjs
    og('og:image:width', '1200'),
    og('og:image:height', '630'),
    og('og:image:alt', w.socialAlt),
    og('og:locale', w.ogLocale),
    ...langs.filter(other => other !== lang).map(other => og('og:locale:alternate', words[other].ogLocale)),
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],  // its title, text and image: Open Graph's
    ...structuredData(page, url, root, siteConfig.site.title).map(data => ['script', { type: 'application/ld+json' }, JSON.stringify(data)] satisfies HeadConfig),
  ];
}

type Data = Record<string, unknown>;

/**
 * A page's JSON-LD (schema.org), one object per type, each at most once per page:
 * - each home, the project as a `SoftwareSourceCode`;
 * - the English home only, the site as a `WebSite` for Google's site names, which read the domain's home (the French home,
 *   under `/fr/`, is not the domain's);
 * - each outline page, its `BreadcrumbList`: its group, then the page, absolute URLs and the names in the page's language.
 *   Google wants two items, the last without `item` at most: the group's landing page is its URL. A group's landing
 *   page has one item, so none; neither do the homes, the 404, the changelog and the playground, which the outline
 *   does not list.
 */
export function structuredData(page: string, url: string, root: string, title: string): Data[] {
  const
    lang = langOf(page),
    w = words[lang],
    context = 'https://schema.org',
    path = page.replace(/^fr\//, ''),
    link = `${prefixOf(lang)}/${path.replace(/\.md$/, '')}`,  // `/fr/select`, as outline.ts
    text = (html: string) => html.replace(/<small\b.*?<\/small>/g, ''),  // the version: `Cursors<small class="since">6.12</small>`
    group = outlineIn(lang).find(({ items }) => items.some(item => item.link === link)),
    entry = (name: string, link: string, position: number) =>
      ({ '@type': 'ListItem', position, name: text(name), item: root + link.slice(1) });
  return [
    ...path === 'index.md' ? [{
      '@context': context,
      '@type': 'SoftwareSourceCode',
      name: title,
      description: w.description,
      url,
      inLanguage: w.lang,
      codeRepository: repo,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js',
      license: 'https://spdx.org/licenses/MIT.html',
    }] : [],
    ...page === 'index.md' ? [{ '@context': context, '@type': 'WebSite', name: title, url }] : [],
    ...group === undefined ? [] : [{
      '@context': context,
      '@type': 'BreadcrumbList',
      itemListElement: [
        entry(group.text, group.link, 1),
        entry(group.items.find(item => item.link === link)!.text, link, 2),
      ],
    }],
  ];
}

/**
 * The JSON-LD of the built pages must parse, name its type and hold each type once per page, and a `BreadcrumbList`
 * must have two items, each with its name and absolute URL. Reads `outDir`, so it runs after the pages.
 */
export function checkStructuredData(outDir: string, root: string) {
  const problems: string[] = [];
  let blocks = 0;
  for (const file of readdirSync(outDir, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.html'))) {
    const types = new Set<string>();
    for (const [, json] of readFileSync(join(outDir, file), 'utf8')
      .matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      blocks++;
      let data: Data;
      try { data = JSON.parse(json!); } catch { problems.push(`${file} has JSON-LD that does not parse`); continue; }
      const type = data['@type'];
      if (typeof type !== 'string') problems.push(`${file} has JSON-LD with no \`@type\``);
      else if (types.has(type)) problems.push(`${file} has two ${type}`);
      else types.add(type);
      if (type === 'BreadcrumbList') {
        const items = data.itemListElement as Data[] | undefined;
        if (!Array.isArray(items) || items.length < 2 || items.some((item, i) => item.position !== i + 1 ||
          typeof item.name !== 'string' || !String(item.item).startsWith(root)))
          problems.push(`${file}'s BreadcrumbList needs two or more items, each with its position, name and absolute \`item\``);
      }
    }
  }
  if (problems.length > 0) throw new Error(`meta.ts: the JSON-LD of the built pages is wrong (README.md § For search engines):\n  ${problems.join('\n  ')}`);
  console.log(`JSON-LD: ${blocks} blocks parse, one of each type per page.`);
}

type SitemapItem = Parameters<NonNullable<NonNullable<UserConfig['sitemap']>['transformItems']>>[0][number];

/**
 * sitemap.xml's alternates by the codes each page's `<head>` gives (`pageHead()`): `en`, `fr`, and `x-default` for
 * the English page. VitePress names them by each locale's `lang`, `en-GB` and `fr-FR`, with no `x-default`.
 */
export function sitemapAlternates(items: SitemapItem[]): SitemapItem[] {
  return items.map(item => item.links === undefined ? item : {
    ...item,
    links: [
      ...item.links.map(({ url }) => ({ lang: langOf(url), url })),  // `fr/select`, `fr/` for the French home
      { lang: 'x-default', url: item.links.find(({ url }) => langOf(url) === 'en')!.url },
    ],
  });
}

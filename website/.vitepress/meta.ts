// Copyright (C) 2026 Alexandre Demartin
// Each page's metadata, for search engines and link previews: its description, cut from its `{.lede}` unless its front
// matter sets one; its canonical URL, its page in the other language (`hreflang`, sitemap.xml's too), Open Graph and
// Twitter card, with its language's social image; on each home, the project as JSON-LD. The favicons and
// `theme-color`, the same on every page, are in config.ts.
import { join } from 'node:path';
import type { HeadConfig, PageData, TransformContext, TransformPageContext, UserConfig } from 'vitepress';
import { host, plainText, readPage } from './llms.ts';
import { langOf, langs, words } from './words.ts';

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
 * A page's canonical URL, the same page in each language, Open Graph and Twitter card (`transformHead`), with the
 * `<title>` and description VitePress gives it; on each home, the project as a schema.org `SoftwareSourceCode`. Every
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
    ...path === 'index.md' ? [['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: siteConfig.site.title,
      description: w.description,
      url,
      inLanguage: w.lang,
      codeRepository: repo,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js',
      license: 'https://spdx.org/licenses/MIT.html',
    })] satisfies HeadConfig] : [],
  ];
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

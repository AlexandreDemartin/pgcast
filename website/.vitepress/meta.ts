// Copyright (C) 2026 Alexandre Demartin
// Each page's metadata, for search engines and link previews: its description, cut from its `{.lede}` unless its front
// matter sets one; its canonical URL, Open Graph and Twitter card, with the one social image; on the home, the project
// as JSON-LD. The favicons and `theme-color`, the same on every page, are in config.ts.
import { join } from 'node:path';
import type { HeadConfig, PageData, TransformContext, TransformPageContext } from 'vitepress';
import { host, plainText, readPage } from './llms.ts';

export const repo = 'https://github.com/AlexandreDemartin/pgcast';

/**
 * Set a page's description (`transformPageData`): its front matter's `description`, or its lede as plain text, cut
 * after the last whole sentence within 160 characters, the first kept whatever its length, as search results show
 * about that much. A "Coming" page, which has no file nor lede, takes the site's.
 */
export function describePage(pageData: PageData, { siteConfig }: TransformPageContext) {
  const lede = readPage(join(siteConfig.srcDir, pageData.relativePath))?.lede;
  if (pageData.frontmatter.description !== undefined || lede === undefined) return;
  const [first, ...rest] = plainText(lede).split(/(?<=[.!?])\s+/);
  let description = first!;
  for (const sentence of rest) {
    if (description.length + 1 + sentence.length > 160) break;
    description += ' ' + sentence;
  }
  pageData.description = description;
}

/**
 * A page's canonical URL, Open Graph and Twitter card (`transformHead`), with the `<title>` and description VitePress
 * gives it; on the home, the project as a schema.org `SoftwareSourceCode`. The 404 page gets none.
 */
export function pageHead({ page, pageData, siteConfig, title, description }: TransformContext): HeadConfig[] {
  if (pageData.isNotFound) return [];
  const
    root = host + siteConfig.site.base,
    url = root + page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''),  // as sitemap.xml
    og = (property: string, content: string): HeadConfig => ['meta', { property, content }];
  return [
    ['link', { rel: 'canonical', href: url }],
    og('og:type', 'website'),
    og('og:site_name', siteConfig.site.title),
    og('og:title', title),
    og('og:description', description),
    og('og:url', url),
    og('og:image', `${root}social-card.png`),  // public/social-card.svg, rendered by render-images.mjs
    og('og:image:width', '1200'),
    og('og:image:height', '630'),
    og('og:image:alt', 'pg::cast. Your types, cast from your database.'),
    og('og:locale', 'en_GB'),
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],  // its title, text and image: Open Graph's
    ...page === 'index.md' ? [['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: siteConfig.site.title,
      description: siteConfig.site.description,
      url,
      codeRepository: repo,
      programmingLanguage: 'TypeScript',
      runtimePlatform: 'Node.js',
      license: 'https://spdx.org/licenses/MIT.html',
    })] satisfies HeadConfig] : [],
  ];
}

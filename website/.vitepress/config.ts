// Copyright (C) 2026 Alexandre Demartin
// The docs site (decision 004), on VitePress's default theme; its look is docs/design/art-direction.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformerTwoslash } from '@shikijs/vitepress-twoslash';
import { defineConfig } from 'vitepress';
import { checkLinks, keepLinkHashes } from './anchors.ts';
import { writeLlmsFiles } from './llms.ts';
import { describePage, pageHead, repo } from './meta.ts';
import { outline } from './outline.ts';
import { sqlParameters, syntax } from './syntax.ts';
import { focusableHovers, twoslashOptions } from './twoslash.ts';

const
  { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')),
  fonts = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;700;800' +
    '&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap';

export default defineConfig({
  title: 'pgcast',
  description: 'Zero-abstraction Postgres for TypeScript: types cast from your database schema. A maintained fork of Zapatos.',
  lang: 'en-GB',
  base: '/',  // GitHub Pages, at the domain's root: https://pgcast.dev/
  cleanUrls: true,
  sitemap: { hostname: 'https://pgcast.dev' },  // sitemap.xml, named by public/robots.txt
  transformPageData: describePage,  // meta.ts
  transformHead: pageHead,
  srcExclude: ['README.md', 'templates/**'],  // for whoever writes the site, not pages of it
  buildEnd: async config => {
    await writeLlmsFiles(config);  // llms.txt and llms-full.txt, for assistants
    checkLinks(config);  // a link to a page or an anchor that does not exist fails the build
  },
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: fonts }],
  ],
  markdown: {
    theme: syntax,
    // a hover's JSDoc can hold these (`process.env`, from @types/node), and Shiki loads only the languages a page names
    languages: ['js', 'bash'],
    // an unexpected type error in a `ts twoslash` block fails the build; a block meant to fail says so with `// @errors`
    codeTransformers: [transformerTwoslash({ twoslashOptions }), focusableHovers, sqlParameters],
    config: keepLinkHashes,  // `[Config.upsertRequiresSameKeys](/runtime-config#Config.upsertRequiresSameKeys)`
  },
  vite: {
    define: { __PGCAST_VERSION__: JSON.stringify(version) },
    resolve: {
      // VitePress's light / dark switch becomes system / light / dark (its "overriding internal components").
      alias: [{
        find: /^.*\/VPSwitchAppearance\.vue$/,
        replacement: fileURLToPath(new URL('./theme/AppearanceSwitch.vue', import.meta.url)),
      }],
    },
  },
  themeConfig: {
    siteTitle: 'pg<b>::</b>cast',
    nav: [
      // a group with a `nav` text is current on its landing page and on each of its pages; Explanation has none: a
      // fourth link would push the theme button into VitePress's ⋯ menu at most widths from 768 to 1050px
      ...outline.flatMap(({ nav, link, items }) => nav === undefined ? [] : [{
        text: nav,
        link,
        activeMatch: `^(${[link, ...items.map(item => item.link)].join('|')})$`,
      }]),
      // no ↗ after the external links, as the prototype
      { text: 'Changelog', link: `${repo}/blob/master/CHANGELOG.md`, noIcon: true },
      { text: 'GitHub', link: repo, noIcon: true },
    ],
    sidebar: outline,  // each group's heading links its landing page
    search: {
      provider: 'local',
      options: { translations: { button: { buttonText: 'Search the docs', buttonAriaLabel: 'Search the docs' } } },
    },
    editLink: { pattern: `${repo}/edit/master/website/:path`, text: 'Edit this page on GitHub' },
    docFooter: { prev: 'Previous', next: 'Next' },
    outline: { level: 2, label: 'On this page' },
    darkModeSwitchLabel: 'Colour theme',
  },
});

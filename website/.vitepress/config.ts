// Copyright (C) 2026 Alexandre Demartin
// The docs site (decision 004), on VitePress's default theme; its look is docs/design/art-direction.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultHoverInfoProcessor, transformerTwoslash } from '@shikijs/vitepress-twoslash';
import { defineConfig, type HeadConfig } from 'vitepress';
import { checkLinks, keepLinkHashes } from './anchors.ts';
import { calloutIcons } from './callouts.ts';
import { codeGroupLogos } from './codeGroups.ts';
import { changelogPage, dateChangelog, writeChangelogFeed } from './changelog.ts';
import { host, writeLlmsFiles } from './llms.ts';
import { describePage, pageHead, repo } from './meta.ts';
import { outline } from './outline.ts';
import { playgroundVite } from './playground/build.ts';
import { checkPlaygroundLinks, linkCastPanels } from './playgroundLinks.ts';
import { lineIndents, sqlParameters, syntax } from './syntax.ts';
import { labelTableCells } from './tables.ts';
import { svg } from './theme/icons.ts';
import { focusableHovers, moduleNames, twoslashOptions } from './twoslash.ts';

const
  { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')),
  font = (face: string): HeadConfig =>
    ['link', { rel: 'preload', href: `/fonts/${face}-latin.woff2`, as: 'font', type: 'font/woff2', crossorigin: '' }];

export default defineConfig({
  title: 'pgcast',
  description: 'Zero-abstraction Postgres for TypeScript: types cast from your database schema.',
  lang: 'en-GB',
  base: '/',  // GitHub Pages, at the domain's root: https://pgcast.dev/
  cleanUrls: true,
  sitemap: { hostname: 'https://pgcast.dev' },  // sitemap.xml, named by public/robots.txt
  lastUpdated: true,  // from git, so docs.yml and ci.yml check out the whole history; sitemap.xml's `lastmod` too
  transformPageData: (pageData, context) => {
    describePage(pageData, context);  // meta.ts
    dateChangelog(pageData);
  },
  transformHead: pageHead,
  srcExclude: ['README.md', 'templates/**'],  // for whoever writes the site, not pages of it
  buildEnd: async config => {
    await writeLlmsFiles(config);  // llms.txt and llms-full.txt, for assistants
    await writeChangelogFeed(config);  // changelog.xml
    checkLinks(config);  // a link to a page or an anchor that does not exist fails the build
    await checkPlaygroundLinks(config);  // so does a cast panel that does not open its example in the playground
  },
  head: [
    // public/fonts/, declared in theme/fonts.css: every page's first screen sets all three faces (the wordmark is mono)
    font('schibsted-grotesk'), font('inter'), font('jetbrains-mono'),
    // public/: favicon.svg follows the system's theme; favicon.ico and apple-touch-icon.png are rendered by
    // render-images.mjs
    ['link', { rel: 'icon', href: '/favicon.ico', sizes: '32x32' }],
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'alternate', type: 'application/atom+xml', href: '/changelog.xml', title: 'pgcast changelog' }],
    // the top bar's `--surface`; `media` first, as VitePress keeps one `<meta>` per first attribute other than `content`
    ['meta', { media: '(prefers-color-scheme: light)', name: 'theme-color', content: '#ffffff' }],
    ['meta', { media: '(prefers-color-scheme: dark)', name: 'theme-color', content: '#121a21' }],
  ],
  markdown: {
    theme: syntax,
    // a hover's JSDoc can hold these (`process.env`, from @types/node), and Shiki loads only the languages a page names
    languages: ['js', 'bash'],
    // an unexpected type error in a `ts twoslash` block fails the build; a block meant to fail says so with `// @errors`
    codeTransformers: [
      transformerTwoslash({ twoslashOptions, processHoverInfo: type => defaultHoverInfoProcessor(moduleNames(type)) }),
      focusableHovers, sqlParameters, lineIndents,
    ],
    config: md => {
      keepLinkHashes(md);  // `[Config.upsertRequiresSameKeys](/runtime-config#Config.upsertRequiresSameKeys)`
      changelogPage(md);  // CHANGELOG.md in changelog.md
      labelTableCells(md);  // `<td data-label="…">`, for a table that stacks on a phone
      linkCastPanels(md);  // "Open in playground" on a docs page's cast panel
      calloutIcons(md);  // a note's chip opens on its kind's icon
      codeGroupLogos(md);  // a package manager's tab opens on its mark
    },
  },
  vite: {
    ...playgroundVite,  // Monaco and the runner's worker, on /playground only
    define: {
      __PGCAST_VERSION__: JSON.stringify(version),
      __PGCAST_SITE__: JSON.stringify(`${host}/`),  // the site's URL, which the page actions' prompts name (PageActions.vue)
    },
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
      { text: 'Playground', link: '/playground' },  // the changelog is in the footer (SiteFooter.vue)
      // no ↗ after the external link: the bar's links look alike, wherever they lead
      { text: 'GitHub', link: repo, noIcon: true },
    ],
    sidebar: outline,  // each group's heading links its landing page, its chevron folds it
    search: {
      provider: 'local',
      options: { translations: { button: { buttonText: 'Search', buttonAriaLabel: 'Search the docs' } } },
    },
    editLink: { pattern: `${repo}/edit/master/website/:path`, text: 'Edit this page on GitHub' },
    // VitePress writes these with `v-html`: each with the arrow of its way
    docFooter: { prev: `${svg('arrowLeft')}Previous`, next: `Next${svg('arrowRight')}` },
    lastUpdated: { text: 'Last updated', formatOptions: { dateStyle: 'long', forceLocale: true } },  // 13 November 2026
    outline: { level: 2, label: 'On this page' },
    darkModeSwitchLabel: 'Colour theme',
  },
});

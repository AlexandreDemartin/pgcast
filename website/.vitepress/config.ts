// Copyright (C) 2026 Alexandre Demartin
// The docs site (decision 004), on VitePress's default theme; its look is docs/design/art-direction.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultHoverInfoProcessor, transformerTwoslash } from '@shikijs/vitepress-twoslash';
import { defineConfig, type DefaultTheme, type HeadConfig, type LocaleConfig } from 'vitepress';
import { checkLinks, keepLinkHashes, labelPermalinks } from './anchors.ts';
import { calloutIcons } from './callouts.ts';
import { codeGroupLogos } from './codeGroups.ts';
import { changelogPage, dateChangelog, writeChangelogFeed } from './changelog.ts';
import { host, writeLlmsFiles } from './llms.ts';
import { describePage, pageHead, repo } from './meta.ts';
import { outlineIn } from './outline.ts';
import { playgroundVite } from './playground/build.ts';
import { checkPlaygroundLinks, linkCastPanels } from './playgroundLinks.ts';
import { markSteps } from './steps.ts';
import { lineIndents, sqlParameters, syntax } from './syntax.ts';
import { labelTableCells } from './tables.ts';
import { svg } from './theme/icons.ts';
import { focusableHovers, moduleNames, twoslashOptions } from './twoslash.ts';
import { languageKey, langs, prefixOf, words, type Lang } from './words.ts';

const
  { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')),
  font = (file: string): HeadConfig =>
    ['link', { rel: 'preload', href: `/fonts/${file}.woff2`, as: 'font', type: 'font/woff2', crossorigin: '' }],
  // the home in the reader's language, before the first paint (README.md § Languages): `/` alone, never another page,
  // so a link opens what it names. The language picked in the switcher first, else the browser's first that the site has;
  // English otherwise, and for a crawler, whose browser asks for English. Without storage, the browser's
  languageHome = `try {
  if (location.pathname === '/' || location.pathname === '/index.html') {
    var langs = ${JSON.stringify(langs)}, picked = null;
    try { picked = localStorage.getItem('${languageKey}'); } catch {}
    var wanted = langs.indexOf(picked) >= 0 ? picked : (navigator.languages || [navigator.language])
      .map(function (lang) { return String(lang).toLowerCase().split('-')[0]; })
      .filter(function (lang) { return langs.indexOf(lang) >= 0; })[0];
    if (wanted && wanted !== 'en') location.replace('/' + wanted + '/' + location.search + location.hash);
  }
} catch {}`,
  // the wordmark's entrance (Wordmark.vue, style.css), set before the first paint: on the home only, in either
  // language, the first time it loads in a session, and never with reduced motion; without storage, none. A client-side
  // navigation runs no script here, so arriving on the home from another page plays nothing either: the wordmark is
  // already on screen
  wordmarkEntrance = `try {
  if (['/', '/index.html', '/fr/', '/fr/index.html'].includes(location.pathname) && !sessionStorage.getItem('pgcast-wordmark') &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sessionStorage.setItem('pgcast-wordmark', '1');
    document.documentElement.dataset.wordmark = '';
  }
} catch {}`;

/**
 * A language's part of the config (README.md § Languages): its words, and its nav and sidebar from the outline in that
 * language. VitePress's switcher, in the nav, goes to the same page in the other language, its hash kept.
 */
function locale(lang: Lang): LocaleConfig<DefaultTheme.Config>[string] {
  const w = words[lang], prefix = prefixOf(lang), outline = outlineIn(lang);
  return {
    label: w.label,
    lang: w.lang,
    ...lang === 'en' ? {} : { link: `${prefix}/` },
    description: w.description,
    markdown: { codeCopyButton: { tooltipText: w.copyCode, copiedText: w.copied } },  // each code block's button
    themeConfig: {
      nav: [
        // a group with a `nav` text is current on its landing page and on each of its pages; Explanation has none: a
        // fourth link would push the theme button into VitePress's ⋯ menu at most widths from 768 to 1050px
        ...outline.flatMap(({ nav, link, items }) => nav === undefined ? [] : [{
          text: nav,
          link,
          activeMatch: `^(${[link, ...items.map(item => item.link)].join('|')})$`,
        }]),
        { text: w.playground, link: `${prefix}/playground` },  // the changelog is in the footer (SiteFooter.vue)
        // no ↗ after the external link: the bar's links look alike, wherever they lead
        { text: 'GitHub', link: repo, noIcon: true },
      ],
      sidebar: outline,  // each group's heading links its landing page, its chevron folds it
      editLink: { pattern: `${repo}/edit/master/website/:path`, text: w.editLink },
      // VitePress writes these with `v-html`: each with the arrow of its way
      docFooter: { prev: `${svg('arrowLeft')}${w.previous}`, next: `${w.next}${svg('arrowRight')}` },
      // 13 November 2026, 13 novembre 2026
      lastUpdated: { text: w.lastUpdated, formatOptions: { dateStyle: 'long', forceLocale: true } },
      outline: { level: 2, label: w.onThisPage },
      darkModeSwitchLabel: w.colourTheme,
      langMenuLabel: w.changeLanguage,
      returnToTopLabel: w.returnToTop,
      sidebarMenuLabel: w.menu,
      skipToContentLabel: w.skipToContent,
    },
  };
}

export default defineConfig({
  title: 'pgcast',
  description: words.en.description,
  lang: words.en.lang,
  locales: { root: locale('en'), fr: locale('fr') },  // English at the root, French under /fr/ (words.ts)
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
    // public/fonts/, declared in theme/fonts.css: every page's first screen sets all three faces, and the wordmark's
    // six capitals of Saira. Those first: 1.3 KB, set `font-display: block`, they then arrive before the first paint
    // (400ms on a throttled 1.6 Mb/s, 150ms link, against 1.2s unpreloaded and 1.5s preloaded behind the three faces)
    font('saira-wordmark'), font('schibsted-grotesk-latin'), font('inter-latin'), font('jetbrains-mono-latin'),
    ['script', {}, languageHome],  // first: on its way to /fr/, the page sets nothing
    ['script', {}, wordmarkEntrance],
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
      labelPermalinks(md);  // a heading's `#` named in its page's language
      changelogPage(md);  // CHANGELOG.md in changelog.md
      labelTableCells(md);  // `<td data-label="…">`, for a table that stacks on a phone
      linkCastPanels(md);  // "Open in playground" on a docs page's cast panel
      calloutIcons(md);  // a note's chip opens on its kind's icon
      codeGroupLogos(md);  // a package manager's tab opens on its mark
      markSteps(md);  // a step's number in a round marker: `## 1. Set up the project`
    },
  },
  vite: {
    ...playgroundVite,  // Monaco and the runner's worker, on /playground only
    define: {
      __PGCAST_VERSION__: JSON.stringify(version),
      __PGCAST_SITE__: JSON.stringify(`${host}/`),  // the site's URL, which the page actions' prompts name (PageActions.vue)
    },
    resolve: {
      // VitePress's light / dark switch becomes system / light / dark, and its language switcher ours (its "overriding
      // internal components")
      alias: [{
        find: /^.*\/VPSwitchAppearance\.vue$/,
        replacement: fileURLToPath(new URL('./theme/AppearanceSwitch.vue', import.meta.url)),
      }, {
        find: /^.*\/VPNavTranslations\.vue$/,
        replacement: fileURLToPath(new URL('./theme/LanguageSwitch.vue', import.meta.url)),
      }],
    },
  },
  themeConfig: {
    siteTitle: false,  // the wordmark is Wordmark.vue, in Layout.vue
    search: {
      provider: 'local',
      options: {
        // each result with three lines of its text, the match underlined (style.css); the list button still hides them
        detailedView: true,
        // every word of the query, each allowed one typo in ten letters (`trasaction`): MiniSearch's default, any word
        // and two typos in ten, filled the results with noise
        miniSearch: { searchOptions: { combineWith: 'AND', fuzzy: 0.1 } },
        // each language searches its own pages
        translations: { button: { buttonText: words.en.search, buttonAriaLabel: words.en.searchDocs } },
        locales: {
          fr: {
            translations: {
              button: { buttonText: words.fr.search, buttonAriaLabel: words.fr.searchDocs },
              modal: {
                displayDetails: 'Afficher la liste détaillée',
                resetButtonTitle: 'Effacer la recherche',
                backButtonTitle: 'Fermer la recherche',
                noResultsText: 'Aucun résultat pour',
                footer: {
                  selectText: 'choisir', selectKeyAriaLabel: 'Entrée',
                  navigateText: 'naviguer', navigateUpKeyAriaLabel: 'Flèche haut', navigateDownKeyAriaLabel: 'Flèche bas',
                  closeText: 'fermer', closeKeyAriaLabel: 'Échap',
                },
              },
            },
          },
        },
      },
    },
  },
});

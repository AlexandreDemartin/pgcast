// Copyright (C) 2026 Alexandre Demartin
// The changelog on the site, from the repository's CHANGELOG.md at build, its one source: the page `/changelog`
// (changelog.md, a title and a lede above `<!-- @changelog -->`), in English on the French site too (fr/changelog.md),
// and its Atom feed `/changelog.xml`, one entry per released version.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer, type MarkdownRenderer, type PageData, type SiteConfig } from 'vitepress';
import { host } from './llms.ts';
import { repo } from './meta.ts';

const
  file = fileURLToPath(new URL('../../CHANGELOG.md', import.meta.url)),
  page = 'changelog.md',
  pages = new Set([page, 'fr/changelog.md']),
  marker = '<!-- @changelog -->',
  longDate = (date: string) =>  // 12 November 2026
    new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date)),
  entities: Record<string, string> = { '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' },
  xml = (text: string) => text.replace(/[&<>"]/g, c => `&${entities[c]};`);

/**
 * CHANGELOG.md's intro, then its versions, newest first: `## [Unreleased]`, with no date, and each
 * `## [x.y.z] - yyyy-mm-dd`, its anchor (`unreleased`, `6.6.2`) and its notes, a link relative to the repository made
 * its page on GitHub. Any other `## ` heading fails the build.
 */
export function readChangelog() {
  const
    source = readFileSync(file, 'utf8')
      .replace(/\r\n?/g, '\n')
      .replace(/\]\((?![a-z][\w+.-]*:|[/#])([^)\s]+)\)/gi, `](${repo}/blob/master/$1)`),  // `](docs/decisions/…)`
    [intro, ...sections] = source.replace(/^# .*\n/, '').split(/^(?=## )/m),
    versions = sections.map(section => {
      const
        heading = section.slice(0, section.indexOf('\n')),
        [, name, date] = /^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?$/.exec(heading) ?? [];
      if (!name || (name === 'Unreleased') !== (date === undefined))
        throw new Error(`changelog.ts: CHANGELOG.md's \`${heading}\` is neither \`## [Unreleased]\` nor \`## [x.y.z] - yyyy-mm-dd\``);
      return { name, date, anchor: name.toLowerCase(), notes: section.slice(heading.length).trim() };
    });
  return { intro: intro!.trim(), versions };
}

/**
 * Put CHANGELOG.md in changelog.md, in place of `<!-- @changelog -->`, before markdown-it parses the page: so its
 * outline and the search index have it too, and `docs:dev` watches CHANGELOG.md. Each version is a `##` heading, its
 * date beside it; each of its sections (`### Fixed`) is anchored after it (`#6.6.2-fixed`), as a link to it should not
 * move when a version is added.
 */
export function changelogPage(md: MarkdownRenderer) {
  md.core.ruler.after('normalize', 'changelog', state => {
    const env = state.env as { relativePath?: string; includes?: string[] };  // VitePress's
    if (!pages.has(env.relativePath ?? '') || !state.src.includes(marker)) return;
    const { intro, versions } = readChangelog();
    state.src = state.src.replace(marker, () => [intro, ...versions.map(({ name, date, anchor, notes }) => [
      `## ${name}${date ? ` <small class="ignore-header">${longDate(date)}</small>` : ''} {#${anchor}}`,
      notes.replace(/^### (.+)$/gm, (_, title: string) => `### ${title} {#${anchor}-${title.toLowerCase().replace(/\W+/g, '-')}}`),
    ].join('\n\n'))].join('\n\n'));
    env.includes?.push(file);
  });
}

/** Date changelog.md by CHANGELOG.md's last commit, not its own (`transformPageData`): its "Last updated", and its `lastmod`. */
export function dateChangelog(pageData: PageData) {
  if (!pages.has(pageData.relativePath)) return;
  const seconds = execFileSync('git', ['log', '-1', '--format=%ct', '--', file], { encoding: 'utf8' }).trim();
  if (seconds) pageData.lastUpdated = 1000 * Number(seconds);
}

/**
 * Write `changelog.xml` (`buildEnd`), the Atom feed of the released versions, newest first: each its date, its notes as
 * HTML, its anchor on the page; the feed's date is the newest one's, so a build that releases nothing leaves it as it is.
 */
export async function writeChangelogFeed(config: SiteConfig) {
  const
    root = host + config.site.base,
    url = `${root}changelog`,
    md = await createMarkdownRenderer(config.srcDir, config.markdown, config.site.base, config.logger),
    env = { path: join(config.srcDir, page), relativePath: page, cleanUrls: config.cleanUrls },
    // without the page's heading anchors and ids, each link absolute
    html = async (notes: string) => (await md.renderAsync(notes, { ...env }))
      .replace(/\s*<a class="header-anchor"[^>]*>[\s\S]*?<\/a>/g, '')
      .replace(/ (?:id="[^"]*"|tabindex="-1")/g, '')
      .replace(/(href|src)="\/(?!\/)/g, `$1="${root}`)
      .replace(/href="#/g, `href="${url}#`),
    released = readChangelog().versions.filter(version => version.date !== undefined),
    entries = await Promise.all(released.map(async ({ name, date, anchor, notes }) => `  <entry>
    <title>${xml(`${config.site.title} ${name}`)}</title>
    <link rel="alternate" type="text/html" href="${url}#${anchor}"/>
    <id>${url}#${anchor}</id>
    <updated>${date}T00:00:00Z</updated>
    <content type="html">${xml(await html(notes))}</content>
  </entry>`));

  writeFileSync(join(config.outDir, 'changelog.xml'), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${config.site.lang}">
  <title>${xml(config.site.title)} changelog</title>
  <subtitle>${xml(config.site.description)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${root}changelog.xml"/>
  <link rel="alternate" type="text/html" href="${url}"/>
  <id>${url}</id>
  <updated>${released[0]!.date}T00:00:00Z</updated>
  <author><name>${xml(config.site.title)}</name><uri>${repo}</uri></author>
${entries.join('\n')}
</feed>
`);
}

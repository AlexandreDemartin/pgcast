// Copyright (C) 2026 Alexandre Demartin
// Links (README.md § Conventions, Links): a link keeps its hash as written, and the build fails on a link to a page or
// an anchor that does not exist, or outside the site's base, read from the built HTML, so a raw `<a href>` counts too;
// and on such a site URL in a fenced block, read from the page's Markdown, since a block renders no link.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkdownRenderer, SiteConfig } from 'vitepress';
import { host } from './llms.ts';

/**
 * Keep each link's hash as written. VitePress slugifies it (`#Config.upsertRequiresSameKeys` becomes
 * `#config-upsertrequiressamekeys`), while a reference entry's `{#name}` keeps its case and dots.
 */
export function keepLinkHashes(md: MarkdownRenderer) {
  const linkOpen = md.renderer.rules.link_open!;
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!, href = () => String(token.attrGet('href') ?? ''), hash = /#.*$/.exec(href())?.[0];
    linkOpen(tokens, idx, options, env, self);  // VitePress's page, base and clean URL, and its dead-link list
    if (hash) token.attrSet('href', href().replace(/#.*$|$/, () => hash));  // a function: `$&` in the hash stays
    return self.renderToken(tokens, idx, options);
  };
}

const
  entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" },
  unescape = (html: string) => html.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => entities[name]!),
  anchorOf = (hash: string) => {  // `#name:~:text=…`: the name; null for a stray `%`, which a raw `<a href>` keeps
    try {
      return decodeURIComponent(hash.slice(1)).split(':~:')[0]!;
    } catch (error) {
      if (error instanceof URIError) return null;
      throw error;
    }
  },
  // `[line, url]` of each URL of the site in a fenced block (```` ``` ```` or `~~~`, indented in a list too), without
  // a full stop or comma after it. A ```` ``` ```` line with a backtick after it opens no fence: it is inline code, as
  // in CommonMark. A fence closes on its marker alone, as long or longer, with nothing after it.
  fencedSiteUrls = (markdown: string) => {
    const urls: [number, string][] = [];
    let fence: string | null = null;
    markdown.split(/\r?\n/).forEach((line, i) => {  // a CRLF checkout too
      const [, marker, rest] = /^\s*(`{3,}|~{3,})(.*)$/.exec(line) ?? [];
      if (fence === null) fence = marker?.[0] === '`' && rest!.includes('`') ? null : marker ?? null;
      else if (marker?.[0] === fence[0] && marker.length >= fence.length && rest!.trim() === '') fence = null;
      else urls.push(...[...line.matchAll(/https?:\/\/[^\s"'<>`()[\]]+/g)]
        .filter(([url]) => url.startsWith(`${host}/`))
        .map(([url]): [number, string] => [i + 1, url.replace(/[.,;:!?]+$/, '')]));
    });
    return urls;
  };

/**
 * Fail the build on a link outside the site's base, to a page or a file that the build did not write, or to an anchor
 * that its page does not define, a link written with the site's host included; a URL of the site in a fenced block
 * too (the rules file of `ai-assistant.md`, copied into projects), with its line. A name still in `reference-pending.json` counts as an anchor of its page: a link to it
 * lands once its entry is written, and writing it removes the name. Run once every file is written (`llms.txt` too).
 */
export function checkLinks(config: SiteConfig) {
  const
    { base } = config.site,
    pending: Record<string, string[]> = JSON.parse(readFileSync(join(config.srcDir, 'reference-pending.json'), 'utf8')),
    files = new Set(readdirSync(config.outDir, { recursive: true, encoding: 'utf8' })),
    pages = new Map([...files]
      .filter(file => file.endsWith('.html'))
      .map(file => [file, readFileSync(join(config.outDir, file), 'utf8')])),
    anchors = new Map([...pages].map(([file, html]) => [file, new Set([
      ...[...html.matchAll(/\sid="([^"]*)"/g)].map(([, id]) => unescape(id!)),
      ...pending[file.replace(/\.html$/, '.md')] ?? [],
    ])])),
    problems = new Set<string>(),  // a link written twice on a page is reported once
    atHome = (url: URL) => {  // the home written without its slash, which GitHub Pages redirects, is the home
      if (url.pathname === base.slice(0, -1)) url.pathname = base;
      return url;
    },
    problemOf = (url: URL) => {  // reads its path and its hash only
      const
        path = url.pathname.slice(base.length),
        target = /\.(?!html$)[^./]+$/.test(path) ? path :  // a file, `llms.txt`
          `${path.replace(/\.html$/, '').replace(/(^|\/)$/, '$1index')}.html`,
        anchor = anchorOf(url.hash);
      return (
        !url.pathname.startsWith(base) ? `not under the site's base, ${base}` :
        !files.has(target) ? 'no such page' :
        anchor === null ? 'its hash is not valid percent-encoding' :
        anchor !== '' && !anchors.get(target)?.has(anchor) ? 'no such anchor on that page' :
        null);
    };

  for (const [file, html] of pages) {
    const page = file.replace(/\.html$/, '.md'), markdown = join(config.srcDir, page);
    for (const [, href] of html.matchAll(/<a\s(?:[^>]*?\s)?href="([^"]*)"/g)) {
      const
        written = unescape(href!),
        url = new URL(written, `http://site${base}${file.replace(/(^|\/)index\.html$|\.html$/, '$1')}`),
        absolute = url.origin === host;  // a link to the site with its host, against the convention: checked too
      if (!absolute && url.host !== 'site') continue;  // another site, or `mailto:`
      const
        link = absolute ? written :
          url.pathname.slice(url.pathname.startsWith(base) ? base.length - 1 : 0) + url.hash,  // as written: `/select`
        problem = problemOf(absolute ? atHome(url) : url);
      if (problem) problems.add(`${page}: ${link}, ${problem}`);
    }
    if (!existsSync(markdown)) continue;  // a "Coming" page, from `[page].md`
    for (const [line, written] of fencedSiteUrls(readFileSync(markdown, 'utf8'))) {
      const problem = problemOf(atHome(new URL(written)));
      if (problem) problems.add(`${page}:${line}: ${written}, ${problem}`);
    }
  }
  if (problems.size > 0) {
    throw new Error(`The link check failed (README.md § Conventions, Links):\n  ${[...problems].join('\n  ')}`);
  }
}

// Copyright (C) 2026 Alexandre Demartin
// Links (README.md § Conventions, Links): a link keeps its hash as written, and the build fails on a link to a page or
// an anchor that does not exist, or outside the site's base, read from the built HTML, so a raw `<a href>` counts too.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkdownRenderer, SiteConfig } from 'vitepress';

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
  };

/**
 * Fail the build on a link outside the site's base, to a page or a file that the build did not write, or to an anchor
 * that its page does not define. A name still in `reference-pending.json` counts as an anchor of its page: a link to it
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
    problems = new Set<string>();  // a link written twice on a page is reported once

  for (const [file, html] of pages) {
    for (const [, href] of html.matchAll(/<a\s(?:[^>]*?\s)?href="([^"]*)"/g)) {
      const url = new URL(unescape(href!), `http://site${base}${file.replace(/(^|\/)index\.html$|\.html$/, '$1')}`);
      if (url.host !== 'site') continue;  // another site, or `mailto:`
      const
        inBase = url.pathname.startsWith(base),
        link = url.pathname.slice(inBase ? base.length - 1 : 0),  // as written: `/select`
        path = url.pathname.slice(base.length),
        target = /\.(?!html$)[^./]+$/.test(path) ? path :  // a file, `llms.txt`
          `${path.replace(/\.html$/, '').replace(/(^|\/)$/, '$1index')}.html`,
        anchor = anchorOf(url.hash),
        problem =
          !inBase ? `not under the site's base, ${base}` :
          !files.has(target) ? 'no such page' :
          anchor === null ? 'its hash is not valid percent-encoding' :
          anchor !== '' && !anchors.get(target)?.has(anchor) ? 'no such anchor on that page' :
          null;
      if (problem) problems.add(`${file.replace(/\.html$/, '.md')}: ${link}${url.hash}, ${problem}`);
    }
  }
  if (problems.size > 0) {
    throw new Error(`The link check failed (README.md § Conventions, Links):\n  ${[...problems].join('\n  ')}`);
  }
}

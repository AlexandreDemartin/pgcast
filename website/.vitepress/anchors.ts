// Copyright (C) 2026 Alexandre Demartin
// Links to anchors (README.md § Conventions, Links): a link keeps its hash as written, and the build fails on a link
// to an anchor that its page does not define, read from the built HTML, so a raw `<a href>` counts too.
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
    if (hash) token.attrSet('href', href().replace(/#.*$|$/, hash));
    return self.renderToken(tokens, idx, options);
  };
}

const
  entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" },
  unescape = (html: string) => html.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => entities[name]!);

/**
 * Fail the build on a link to an anchor that its page does not define. A name still in `reference-pending.json` counts
 * as an anchor of its page: a link to it lands once its entry is written, and writing it removes the name.
 */
export function checkLinkAnchors(config: SiteConfig) {
  const
    { base } = config.site,
    pending: Record<string, string[]> = JSON.parse(readFileSync(join(config.srcDir, 'reference-pending.json'), 'utf8')),
    pages = new Map(readdirSync(config.outDir, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.html'))
      .map(file => [file, readFileSync(join(config.outDir, file), 'utf8')])),
    anchors = new Map([...pages].map(([file, html]) => [file, new Set([
      ...[...html.matchAll(/\sid="([^"]*)"/g)].map(([, id]) => unescape(id!)),
      ...pending[file.replace(/\.html$/, '.md')] ?? [],
    ])])),
    problems = new Set<string>();  // a link written twice on a page is reported once

  for (const [file, html] of pages) {
    for (const [, href] of html.matchAll(/\shref="([^"]*#[^"]*)"/g)) {
      const url = new URL(unescape(href!), `http://site${base}${file.replace(/(^|\/)index\.html$|\.html$/, '$1')}`);
      if (url.host !== 'site' || url.hash.length < 2) continue;  // another site, or a bare `#`
      const
        inBase = url.pathname.startsWith(base),
        link = url.pathname.slice(inBase ? base.length - 1 : 0),  // as written: `/select`
        target = `${url.pathname.slice(base.length).replace(/\.html$/, '').replace(/(^|\/)$/, '$1index')}.html`,
        anchor = decodeURIComponent(url.hash.slice(1)),
        problem =
          !inBase ? `not under the site's base, ${base}` :
          !anchors.has(target) ? 'no such page' :
          !anchors.get(target)!.has(anchor) ? 'no such anchor on that page' :
          null;
      if (problem) problems.add(`${file.replace(/\.html$/, '.md')}: ${link}#${anchor}, ${problem}`);
    }
  }
  if (problems.size > 0) {
    throw new Error(`The link check failed (README.md § Conventions, Links):\n  ${[...problems].join('\n  ')}`);
  }
}

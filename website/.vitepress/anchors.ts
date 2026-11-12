// Copyright (C) 2026 Alexandre Demartin
// Links to anchors (README.md § Conventions, Links): the build fails on a link to an anchor that its page does not
// define, read from the built HTML, so a raw `<a href>` counts too.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SiteConfig } from 'vitepress';

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
    problems: string[] = [];

  for (const [file, html] of pages) {
    for (const [, href] of html.matchAll(/\shref="([^"]*#[^"]*)"/g)) {
      const url = new URL(unescape(href!), `http://site${base}${file.replace(/(^|\/)index\.html$|\.html$/, '$1')}`);
      if (url.host !== 'site' || !url.pathname.startsWith(base) || url.hash.length < 2) continue;
      const
        target = (url.pathname.slice(base.length).replace(/\.html$/, '').replace(/(^|\/)$/, '$1index')) + '.html',
        anchor = decodeURIComponent(url.hash.slice(1));
      if (!anchors.get(target)?.has(anchor)) {
        problems.push(`${file.replace(/\.html$/, '.md')}: ${url.pathname.slice(base.length - 1)}#${anchor}, ` +
          (anchors.has(target) ? 'no such anchor on that page' : 'no such page'));
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`The link check failed (README.md § Conventions, Links):\n  ${[...new Set(problems)].join('\n  ')}`);
  }
}

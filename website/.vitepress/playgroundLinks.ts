// Copyright (C) 2026 Alexandre Demartin
// "Open in playground" on the cast panels of the docs pages (decision 005): a link to /playground whose `#code/…`
// (playground/share.ts) holds the panel's example, deflated here at build, so no JavaScript makes it. The build then
// reads each link back from the built pages, decoded as the playground decodes it (`checkPlaygroundLinks`).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import type { MarkdownRenderer, SiteConfig } from 'vitepress';
import { typedConst } from './panel.ts';
import { codeOf } from './playground/share.ts';

/** The pages whose cast panels have no link: the home, which stays as it is (#313), and the playground's own. */
export const unlinked = new Set(['index.md', 'playground.md']);

const
  cut = '// ---cut---\n',
  pool = 'declare const pool: pg.Pool;',
  firstConst = /^const (\w+) =/m,  // the `const` a panel gives the type of (cast.data.ts)
  examples = new URL('../examples/', import.meta.url);

/**
 * The code the playground opens for an example (examples/<name>.ts): all of it, nothing hidden, with a blank line
 * where its `// ---cut---` was and the playground's comment on its pool: for the tutorial's first query, the code
 * the playground starts from (playground.data.ts).
 */
export function playgroundCode(source: string) {
  const [above, below] = source.split(cut);
  if (below === undefined || !above!.split('\n').some(line => line.startsWith(pool)))
    throw new Error(`playgroundLinks.ts: an example needs \`${pool}\` above its \`${cut.trim()}\``);
  const comment = '// as you type, a pool that records each query; on Run, Postgres in this page';
  return above!.split('\n').map(line => line.startsWith(pool) ? `${pool}  ${comment}` : line).join('\n') + '\n' + below;
}

/**
 * Whether the playground shows an example as its panel does: it gives the type of its code's first `const`, and an
 * example that runs a query above its cut (a page of rows to start from) has another `const` first, unless it names
 * the next one (`typedConst`).
 */
export function opensAsShown(source: string) {
  return typedConst(playgroundCode(source)) === firstConst.exec(source.split(cut)[1] ?? '')?.[1];
}

/**
 * The link that opens an example in the playground, `/playground#code/…`, its code deflated by zlib and
 * base64url-encoded as share.ts's `fragmentOf` does in the browser; `undefined` if the playground would not show it
 * as its panel does.
 */
export function playgroundLink(source: string) {
  if (!opensAsShown(source)) return undefined;
  return `/playground#code/${deflateRawSync(playgroundCode(source)).toString('base64url')}`;
}

/**
 * Give each cast panel of a docs page its link (`playground`) and the name of its section (`section`), which the
 * link's accessible name gives: the heading above it, after its parent's when another heading has the same text
 * (`upsert(), Options`), numbered when the section has several panels (`Arrays, example 2`).
 */
export function linkCastPanels(md: MarkdownRenderer) {
  md.core.ruler.push('cast_panel_links', state => {
    if (unlinked.has(state.env.relativePath as string)) return;
    const
      path: string[] = [],  // the text of each heading above, by level
      panels: { token: (typeof state.tokens)[number]; example: string; heading: number; path: string[] }[] = [],
      headings = new Map<number, string>();
    let heading = -1;
    state.tokens.forEach((token, i) => {
      if (token.type === 'heading_open') {
        const text = state.tokens[i + 1]!.children!
          .filter(child => child.type === 'text' || child.type === 'code_inline').map(child => child.content).join('')
          .replace(/\s*\{#[^}]*\}\s*$/, '').trim();  // `Lists {#lists}`: its text
        path.splice(Number(token.tag.slice(1)) - 1, Infinity, text);
        headings.set(heading = i, text);
      }
      const example =
        token.type === 'html_block' ? /^<CastPanel example="([\w-]+)">/.exec(token.content)?.[1] : undefined;
      if (example) panels.push({ token, example, heading, path: path.slice(1).filter(Boolean) });  // the h1 aside
    });
    for (const { token, example, heading, path } of panels) {
      const
        link = playgroundLink(readFileSync(new URL(`${example}.ts`, examples), 'utf8')),
        text = headings.get(heading) ?? '',
        shared = [...headings].some(([other, otherText]) => other !== heading && otherText === text),
        section = panels.filter(panel => panel.heading === heading),
        name = (shared ? path.slice(-2).join(', ') : text) +
          (section.length === 1 ? '' : `, example ${section.findIndex(panel => panel.token === token) + 1}`),
        attribute = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      if (link) token.content = token.content.replace(/>/, () => ` playground="${link}" section="${attribute}">`);
    }
  });
}

/**
 * Fail the build on a cast panel of a docs page whose link is missing, or opens other code than its example's in the
 * playground; and on a link on the home or the playground's page, or on a panel the playground would not show as it
 * is. Each link is decoded by `codeOf`, the playground's own decoder; its name must say which example it opens.
 */
export async function checkPlaygroundLinks(config: SiteConfig) {
  const
    problems: string[] = [],
    without: string[] = [],
    pages = config.pages.filter(page => existsSync(join(config.srcDir, page)));  // not a "Coming" page, `[page].md`'s
  let linked = 0;

  for (const page of pages) {
    const
      names = new Set<string>(),
      html = readFileSync(join(config.outDir, page.replace(/\.md$/, '.html')), 'utf8'),
      panels = [...readFileSync(join(config.srcDir, page), 'utf8').matchAll(/^<CastPanel example="([\w-]+)">/gm)]
        .map(([, example]) => example!),
      frames = html.split('<div class="CastPanel-frame"').slice(1);

    if (frames.length !== panels.length)
      problems.push(`${page}: ${panels.length} cast panels written, ${frames.length} built`);
    for (const [i, example] of panels.entries()) {
      const
        source = readFileSync(new URL(`${example}.ts`, examples), 'utf8'),
        tag = /<a class="CastPanel-open"[^>]*>/.exec(frames[i] ?? '')?.[0],
        [href, name] = ['href', 'aria-label']
          .map(attribute => tag && new RegExp(` ${attribute}="([^"]*)"`).exec(tag)?.[1]),
        where = `${page}, the panel of examples/${example}.ts`;

      if (unlinked.has(page) || !opensAsShown(source)) {
        if (href !== undefined) problems.push(`${where}: a link, though ${unlinked.has(page) ? 'its page has none' :
          'the playground would give the type of another `const`'}`);
        else if (!unlinked.has(page)) without.push(`${page}: ${example}`);
        continue;
      }
      if (href === undefined) {
        problems.push(`${where}: no "Open in playground" link`);
        continue;
      }
      if (!href.startsWith('/playground#') || await codeOf(href.slice('/playground'.length)) !== playgroundCode(source))
        problems.push(`${where}: its link does not open the example's code`);
      if (!/^Open in playground: \S/.test(name ?? '') || names.has(name!))
        problems.push(`${where}: its link's name, "${name}", does not name the example, or another link's has it`);
      names.add(name!);
      linked++;
    }
  }

  // A self-check: a link of the example's code with one character changed does not open it.
  const
    source = readFileSync(new URL('first-query.ts', examples), 'utf8'),
    damaged = playgroundLink(source)!.replace(/#code\/./, start => `#code/${start.endsWith('A') ? 'B' : 'A'}`);
  if (await codeOf(damaged.slice('/playground'.length)) === playgroundCode(source))
    throw new Error('playgroundLinks.ts: a damaged link opened its code: check `checkPlaygroundLinks`');

  if (problems.length > 0)
    throw new Error(`The playground links check failed (decision 005):\n  ${problems.join('\n  ')}`);
  console.log(`${linked} cast panels open their example in the playground; none on ${[...unlinked].join(' and ')};` +
    ` none where the playground would type another \`const\`: ${without.join(', ') || 'no panel'}.`);
}

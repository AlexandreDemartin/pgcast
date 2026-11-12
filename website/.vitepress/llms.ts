// Copyright (C) 2026 Alexandre Demartin
// llms.txt and llms-full.txt (https://llmstxt.org/), written to the site's root at build (`buildEnd`, config.ts), for
// assistants: an index of the written pages, then all of them as plain Markdown, in the order of the outline. An
// entry with no `<link>.md` of its own is a "Coming" page ([page].paths.ts), left out of both.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTwoslasher } from 'twoslash';
import type { SiteConfig } from 'vitepress';
import { castOf } from './cast.data.ts';
import { outline } from './outline.ts';
import { twoslashOptions } from './twoslash.ts';

const host = 'https://alexandredemartin.github.io';  // GitHub Pages, under the config's `base`

export async function writeLlmsFiles(config: SiteConfig) {
  const
    url = (link: string) => host + config.site.base + link.slice(1),
    // a page's links as absolute URLs: root-relative (`/select#select`), and in-page (`#options`) too, since
    // llms-full.txt puts every page in one file
    linksOf = (page: string) => (link: string) => url(link.startsWith('#') ? page + link : link),
    read = (link: string) => {
      const file = join(config.srcDir, link === '/' ? 'index.md' : `${link.slice(1)}.md`);
      if (!existsSync(file)) return;
      const
        source = readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, ''),  // front matter
        [, h1, html] = /^# (.+)$|<h1>(.*?)<\/h1>/m.exec(source) ?? [],
        title = (h1 ?? html)?.replace(/\s*<small.*?<\/small>/g, ''),
        lede = /^(.+)\n\{\.lede\}$/m.exec(source)?.[1];
      if (!title || !lede)
        throw new Error(`llms.ts: ${file} needs a title (\`# \` or \`<h1>\`) and a \`{.lede}\` paragraph, for llms.txt`);
      return { link, source, title: inline(title, linksOf(link)), lede: inline(lede, linksOf(link)) };
    },
    home = read('/')!,
    groups = outline.map(group => ({
      text: group.text,
      pages: [group.link, ...group.items.map(item => item.link)].map(read).filter(page => page !== undefined),
    })),
    twoslasher = createTwoslasher(twoslashOptions),
    full: string[] = [];

  writeFileSync(join(config.outDir, 'llms.txt'), [
    `# ${config.site.title}`,
    `> ${config.site.description} ${home.lede}`,
    ...groups.map(({ text, pages }) =>
      `## ${text}\n\n` + pages.map(({ link, title, lede }) => `- [${title}](${url(link)}): ${lede}`).join('\n')),
  ].join('\n\n') + '\n');

  for (const { link, source } of [home, ...groups.flatMap(group => group.pages)]) {
    const casts: Record<string, string> = {};
    for (const [, name] of source.matchAll(/<CastPanel example="([\w-]+)">/g)) {
      const { sql, values, type } = await castOf(join(config.srcDir, 'examples', `${name}.ts`), twoslasher);
      casts[name!] = `Postgres runs:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nValues: \`${values}\`\n\n` +
        `TypeScript knows:\n\n\`\`\`ts\n${type}\n\`\`\``;
    }
    full.push(plain(source, casts, config.srcDir, linksOf(link)).replace(/^# .*$/m, `$&\n\nSource: ${url(link)}`));
  }
  writeFileSync(join(config.outDir, 'llms-full.txt'), full.join('\n\n---\n\n') + '\n');
}

/**
 * A page's Markdown as plain Markdown: VitePress's containers as quotes (a code group unwrapped), each Twoslash block
 * as the page shows it, each cast panel as its example followed by `casts[example]`, HTML and attributes dropped.
 */
function plain(source: string, casts: Record<string, string>, srcDir: string, url: (link: string) => string) {
  const
    lines: string[] = [],
    quotes: string[] = [],  // for each open container: the prefix of its lines
    expanded = source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<CastPanel example="([\w-]+)">([\s\S]*?)<\/CastPanel>/g, (_, name, example) => {
        if (casts[name] === undefined) throw new Error(`llms.ts: no cast for the panel of examples/${name}.ts`);
        return `You write:\n${example.replace(/<template[\s\S]*?<\/template>/g, '')}\n${casts[name]}\n`;
      })
      .replace(/^<<< (\S+?)(?:#([\w.-]+))?(?:\{(.*?)\})?( \[.+\])?$/gm, (_, path, region, info = '', label = '') =>
        '```' + info + label + '\n' + snippet(join(srcDir, path), region) + '\n```')
      .replace(/<InstallLine command="([^"]*)" \/>/g, '```sh\n$1\n```'),
    missed = /<\/?CastPanel\b.*/.exec(expanded)?.[0];

  // a panel written another way (`example='…'`, a second attribute) would drop silently out of llms-full.txt
  if (missed) throw new Error(`llms.ts: write \`${missed}\` as \`<CastPanel example="<name>">\`, for llms-full.txt`);

  let fence: { info: string; code: string[] } | undefined;
  for (const line of expanded.split('\n')) {
    const prefix = quotes.join('');
    if (fence) {
      if (!/^\s*```\s*$/.test(line)) { fence.code.push(line); continue; }
      const
        twoslash = /\btwoslash\b/.test(fence.info),
        code = twoslash ? shown(fence.code.join('\n')) : fence.code.join('\n'),
        info = fence.info.replace(/\s*\btwoslash\b/, '').replace(/\{.*?\}/, '').trim();
      lines.push(...['```' + info, ...code.split('\n'), '```'].map(l => prefix + l));
      fence = undefined;
      continue;
    }
    const
      open = /^\s*```(.*)$/.exec(line),
      container = /^::: ?([\w-]+)\s*(.*)$/.exec(line);
    if (open) fence = { info: open[1]!, code: [] };
    else if (/^:::\s*$/.test(line)) quotes.pop();
    else if (container?.[1] === 'code-group') quotes.push('');
    else if (container) {
      lines.push(`${prefix}> **${container[2] || container[1]}**`, `${prefix}>`);
      quotes.push('> ');
    }
    else if (!/^\{[.#][^}]*\}$/.test(line)) lines.push((prefix + inline(line, url)).trimEnd());
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A file as `<<< file` shows it; with a region, `<<< file#name`, its lines between `// #region name` and
 * `// #endregion name`.
 */
function snippet(file: string, region?: string) {
  const
    lines = readFileSync(file, 'utf8').trimEnd().split('\n'),
    start = region ? lines.findIndex(line => line.trim() === `// #region ${region}`) : -1,
    end = region ? lines.findIndex(line => line.trim() === `// #endregion ${region}`) : lines.length;
  if (region && (start < 0 || end < start)) throw new Error(`llms.ts: no region ${region} in ${file}`);
  return lines.slice(start + 1, end).join('\n');
}

/** The code a Twoslash block shows: what follows `// ---cut---`, without Twoslash's own `// @` and `// ^` lines. */
const shown = (code: string) => code.split('// ---cut---').pop()!.trim().split('\n')
  .filter(line => !/^\s*\/\/\s*[@^]/.test(line)).join('\n');

/**
 * One line of a page as plain Markdown: HTML and Markdown attributes dropped, links to the site and within the page made
 * absolute (`url`).
 */
const inline = (line: string, url: (link: string) => string) => line
  .replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`')
  .replace(/(\]\([^)]*\))\{[^}]*\}/g, '$1')  // `[Get started](/install){.btn}`
  .replace(/\s*\{[.#][^}]*\}$/, '')  // `## Options {#options}`
  // inline code, between two runs of as many backticks (`` sql`now()` ``), is kept as it is: split, it is every part
  // 1 (mod 3), then its run of backticks, dropped
  .split(/((?<!`)(`+)(?!`).*?[^`]\2(?!`))/)
  .map((part, i) => i % 3 === 1 ? part : i % 3 === 2 ? '' : part
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/g, (_, level, text) => '#'.repeat(level) + ' ' + text)
    .replace(/<small[^>]*>(.*?)<\/small>/g, ': $1')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\]\(([/#][^)\s]*)\)/g, (_, link) => `](${url(link)})`))
  .join('');

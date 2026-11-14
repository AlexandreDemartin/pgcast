// Copyright (C) 2026 Alexandre Demartin
// llms.txt and llms-full.txt (https://llmstxt.org/), written to the site's root at build (`buildEnd`, config.ts), for
// assistants: an index of the written pages, then all of them as plain Markdown, in the order of the outline. An
// entry with no `<link>.md` of its own is a "Coming" page ([page].paths.ts), left out of both. On the way, it checks
// each example's copy of a block of its page (`checkCopy()`). Each page's part of llms-full.txt is also its own file,
// `/<page>.md` (`/index.md` for the home), which its page actions copy and link (theme/PageActions.vue). The French
// site has its own, under `/fr/`: `/fr/llms.txt`, `/fr/llms-full.txt`, `/fr/<page>.md`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTwoslasher } from 'twoslash';
import type { SiteConfig } from 'vitepress';
import { castOf } from './cast.data.ts';
import { earlyCloser, fenceClosed, fenceOpened } from './fences.ts';
import { outlineIn } from './outline.ts';
import { twoslashOptions } from './twoslash.ts';
import { langs, prefixOf, words, type Lang, type Words } from './words.ts';

type Twoslasher = ReturnType<typeof createTwoslasher>;

export const host = 'https://pgcast.dev';  // GitHub Pages, under the config's `base`

export async function writeLlmsFiles(config: SiteConfig) {
  const twoslasher = createTwoslasher(twoslashOptions);
  checkFences(twoslasher);
  for (const lang of langs) await writeLlmsFilesIn(lang, config, twoslasher);
}

/**
 * A self-check, before the pages: a note after a ```` ```md ```` block that shows a ```` ```ts ```` line is a note, a
 * block of four backticks ends on its own fence, not on the ```` ``` ```` line it holds, and a block meant to fail,
 * nested in a list, keeps its indent and marks the line it fails on.
 */
function checkFences(twoslasher: Twoslasher) {
  const
    page = `${earlyCloser}::: tip Read\n\`\`\`\`md\n\`\`\`ts\nconst n = 1;\n\`\`\`\n\`\`\`\`\n:::\n\n- A list:\n\n` +
      "  ```ts twoslash\n  // @errors: 2322\n  const n: number = '';\n  ```",
    expected = `${earlyCloser}> **Read**\n>\n> \`\`\`\`md\n> \`\`\`ts\n> const n = 1;\n> \`\`\`\n> \`\`\`\`\n\n- A list:\n\n` +
      "  ```ts\n  const n: number = '';  // error TS2322\n  ```",
    got = plain(page, {}, '.', link => link, twoslasher, words.en);
  if (got !== expected)
    throw new Error(`llms.ts: the self-check's page came out as\n${got}\n\nnot\n${expected}\n\ncheck fences.ts and shown()`);
}

/** A page's file in the site's source, by its link: `/select` is `select.md`, `/fr/` is `fr/index.md`. */
const fileOf = (link: string) => link.endsWith('/') ? `${link.slice(1)}index.md` : `${link.slice(1)}.md`;

async function writeLlmsFilesIn(lang: Lang, config: SiteConfig, twoslasher: Twoslasher) {
  const
    w = words[lang],
    prefix = prefixOf(lang),
    dir = join(config.outDir, prefix),
    url = (link: string) => host + config.site.base + link.slice(1),
    // a page's links as absolute URLs: root-relative (`/select#select`), and in-page (`#options`) too, since
    // llms-full.txt puts every page in one file
    linksOf = (page: string) => (link: string) => url(link.startsWith('#') ? page + link : link),
    read = (link: string) => {
      const page = readPage(join(config.srcDir, fileOf(link)));
      if (!page) return;
      const { source, title, lede } = page;
      return { link, source, title: inline(title, linksOf(link)), lede: inline(lede, linksOf(link)) };
    },
    home = read(`${prefix}/`)!,
    changelog = read(`${prefix}/changelog`)!,  // not in the outline: under llms.txt's "Optional", and not in llms-full.txt
    groups = outlineIn(lang).map(group => ({
      text: group.text,
      pages: [group.link, ...group.items.map(item => item.link)].map(read).filter(page => page !== undefined),
    })),
    full: string[] = [];

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'llms.txt'), [
    `# ${config.site.title}`,
    `> ${w.description} ${home.lede}`,
    ...groups.map(({ text, pages }) =>
      `## ${text}\n\n` + pages.map(({ link, title, lede }) => `- [${title}](${url(link)}): ${lede}`).join('\n')),
    `## Optional\n\n- [${changelog.title}](${url(changelog.link)}): ${changelog.lede}`,
  ].join('\n\n') + '\n');

  for (const { link, source } of [home, ...groups.flatMap(group => group.pages)]) {
    const casts: Record<string, string> = {};
    for (const [, name] of source.matchAll(/<CastPanel example="([\w-]+)">/g)) {
      const { sql, values, type } = await castOf(join(config.srcDir, 'examples', `${name}.ts`), twoslasher);
      casts[name!] = `${w.runs}\n\n\`\`\`sql\n${sql}\n\`\`\`\n\n${w.valuesLine} \`${values}\`\n\n` +
        `${w.knows}\n\n\`\`\`ts\n${type}\n\`\`\``;
    }
    const markdown = plain(source, casts, join(config.srcDir, dirname(fileOf(link))), linksOf(link), twoslasher, w)
      .replace(/^# .*$/m, `$&\n\n${w.source}: ${url(link)}`);
    full.push(markdown);
    writeFileSync(join(config.outDir, fileOf(link)), markdown + '\n');
  }
  writeFileSync(join(dir, 'llms-full.txt'), full.join('\n\n---\n\n') + '\n');
}

/**
 * A page's Markdown without its front matter, and its title (`# ` or `<h1>`) and `{.lede}` paragraph as written: what
 * llms.txt lists, and what each page's description is cut from (meta.ts). Undefined for a page with no file of its own,
 * a "Coming" page ([page].paths.ts); a written page without both fails the build.
 */
export function readPage(file: string) {
  if (!existsSync(file)) return;
  const
    source = readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, ''),  // front matter
    text = source.replace(/<!--[\s\S]*?-->/g, ''),  // a comment, such as a mark of check-prose.mjs, is not read
    [, h1, html] = /^# (.+)$|<h1>(.*?)<\/h1>/m.exec(text) ?? [],
    title = (h1 ?? html)?.replace(/\s*<small.*?<\/small>/g, ''),
    lede = /^(.+)\n\{\.lede\}$/m.exec(text)?.[1];
  if (!title || !lede)
    throw new Error(`llms.ts: ${file} needs a title (\`# \` or \`<h1>\`) and a \`{.lede}\` paragraph, for llms.txt and its description`);
  return { source, title, lede };
}

/**
 * One line of a page as plain text, for a `<meta>`: as `inline()` leaves it, then each link reduced to its text and
 * the marks of inline code and emphasis dropped (`[\`lateral\`](/select#lateral)` reads lateral).
 */
export const plainText = (line: string) => inline(line, link => link)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
  .replace(/(?<![\w*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\w*])/g, '$2')  // `*n*`, not `release_year`'s underscore
  .replace(/(`+) ?(.+?) ?\1(?!`)/g, '$2')  // `` sql`now()` `` keeps its inner backticks
  .replace(/\s+/g, ' ')
  .trim();

/**
 * A page's Markdown as plain Markdown: VitePress's containers as quotes (a code group unwrapped), each Twoslash block
 * as the page shows it (`shown()`), each cast panel as its example followed by `casts[example]`, At a glance as its
 * label and its list, HTML and attributes dropped. An include (`<<< ./examples/…`) is read from `pageDir`, its page's.
 */
function plain(
  source: string, casts: Record<string, string>, pageDir: string, url: (link: string) => string, twoslasher: Twoslasher,
  w: Words,
) {
  const
    lines: string[] = [],
    quotes: string[] = [],  // for each open container: the prefix of its lines
    expanded = source
      .replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*\n/gm, '')  // a line that holds only a comment, so a mark leaves no line
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<CastPanel example="([\w-]+)">([\s\S]*?)<\/CastPanel>/g, (_, name, example) => {
        if (casts[name] === undefined) throw new Error(`llms.ts: no cast for the panel of examples/${name}.ts`);
        return `${w.write}\n${example.replace(/<template[\s\S]*?<\/template>/g, '')}\n${casts[name]}\n`;
      })
      .replace(/^<<< (\S+?)(?:#([\w.-]+))?(?:\{(.*?)\})?( \[.+\])?$/gm, (_, path, region, info = '', label = '') => {
        checkCopy(join(pageDir, path), source);
        return '```' + info + label + '\n' + snippet(join(pageDir, path), region) + '\n```';
      })
      .replace(/<InstallLine :commands="\[(.*)\]" \/>/g, (_, commands: string) =>  // each, as a code group's tab
        [...commands.matchAll(/'([^']*)'/g)]
          .map(([, command]) => '```sh [' + command!.split(' ')[0] + ']\n' + command + '\n```').join('\n\n'))
      .replace(/^<AtAGlance>$/gm, `**${w.atAGlance}**`),  // its label; a diagram drops out, as its page says it all
    missed = /<\/?CastPanel\b.*/.exec(expanded)?.[0],
    missedInstall = /<InstallLine\b.*/.exec(expanded)?.[0];

  // a panel written another way (`example='…'`, a second attribute) would drop silently out of llms-full.txt
  if (missed) throw new Error(`llms.ts: write \`${missed}\` as \`<CastPanel example="<name>">\`, for llms-full.txt`);
  if (missedInstall) throw new Error(
    `llms.ts: write \`${missedInstall}\` as \`<InstallLine :commands="['…', …]" />\`, for llms-full.txt`);

  // a block nested in a list is indented as its opening fence: its lines lose that indent before Twoslash's are
  // dropped, then every line, the fences too, gets it back; a fence opens and closes as in the other checks (fences.ts)
  let fence: { indent: string; marker: string; info: string; code: string[] } | undefined;
  for (const line of expanded.split('\n')) {
    const prefix = quotes.join('');
    if (fence) {
      const { indent, marker } = fence;
      if (!fenceClosed(marker, line)) {
        fence.code.push(line.slice(Math.min(indent.length, /^\s*/.exec(line)![0].length)));
        continue;
      }
      const
        twoslash = /\btwoslash\b/.test(fence.info),
        code = twoslash ? shown(fence.code.join('\n'), twoslasher) : fence.code.join('\n'),
        info = fence.info.replace(/\s*\btwoslash\b/, '').replace(/\{.*?\}/, '').trim();
      lines.push(...[marker + info, ...code.split('\n'), marker].map(l => prefix + (l === '' ? '' : indent) + l));
      fence = undefined;
      continue;
    }
    const
      open = fenceOpened(line),
      container = /^::: ?([\w-]+)\s*(.*)$/.exec(line);
    if (open) fence = { indent: /^\s*/.exec(line)![0], ...open, code: [] };
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

/**
 * An example's hidden lines between `// #region copy` and `// #endregion copy` repeat a block the page shows (a function
 * the example calls): they must stay the code that block shows, after its `// ---cut---` if any, blank lines aside, or
 * the two drift apart silently.
 */
function checkCopy(file: string, page: string) {
  if (!readFileSync(file, 'utf8').includes('// #region copy')) return;
  const
    lines = (code: string) => code.split('\n').map(line => line.trimEnd()).filter(line => line !== '').join('\n'),
    copy = lines(snippet(file, 'copy')),
    blocks = blocksOf(page).map(code => lines(code.split('// ---cut---').pop()!));
  if (!blocks.includes(copy)) throw new Error(`llms.ts: the copy region of ${file} is no longer a block of its page`);
}

/** The code of each fenced block of a page, its fences read as in the other checks (fences.ts). */
function blocksOf(page: string) {
  const blocks: string[][] = [];
  let marker: string | undefined;
  for (const line of page.split('\n')) {
    if (marker === undefined) {
      marker = fenceOpened(line)?.marker;
      if (marker !== undefined) blocks.push([]);
    } else if (fenceClosed(marker, line)) marker = undefined;
    else blocks.at(-1)!.push(line);
  }
  return blocks.map(block => block.join('\n'));
}

/**
 * The code a Twoslash block shows: what follows `// ---cut---`, without Twoslash's own `// @` and `// ^` lines. A block
 * meant to fail (`// @errors: 2741`) also marks each line the page underlines (`// error TS2741`): without its
 * `// @errors`, it would read as code that compiles.
 */
function shown(code: string, twoslasher: Twoslasher) {
  if (/^\s*\/\/\s*@errors\b/m.test(code)) {
    const
      { code: compiled, errors } = twoslasher(code, 'ts'),  // the code after its cut, as the page shows it
      lines = compiled.split('\n');
    for (const line of new Set(errors.map(error => error.line)))
      lines[line] += '  // error ' + [...new Set(errors.filter(error => error.line === line).map(error => error.code))]
        .map(code => `TS${code}`).join(', ');
    code = lines.join('\n');
  }
  return code.split('// ---cut---').pop()!.trim().split('\n').filter(line => !/^\s*\/\/\s*[@^]/.test(line)).join('\n');
}

/**
 * One line of a page as plain Markdown: HTML and Markdown attributes dropped, links to the site and within the page
 * made absolute (`url`).
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

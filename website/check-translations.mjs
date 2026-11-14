// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when the French site (fr/) is not the English site's translation, page for page (README.md
// § Languages): so a docs change is made in both languages, in the same PR. Each `fr/<page>.md` names, in its front
// matter, the English page it translates by a hash of it (`english: 3f2a9c1b7d4e`); an English page that changes
// fails here until its French page is updated and marked again:
//
//   npm run docs:translated -- select install     # fr/select.md and fr/install.md now translate select.md, install.md
//                                                 # (and their prose gets French spacing: `typeset()`)
//   node check-translations.mjs --anchors select  # the anchors of select.md's headings, which fr/select.md keeps
//
// It also fails on a written page with no translation; on a French page whose structure is not its English page's:
// its headings' anchors (so a link, or the language switcher, keeps its `#…`), its code blocks and includes, its
// components and cast panels, its marks (`<!-- probe: … -->`, `<!-- message -->`, `<!-- joined: … -->`); on a French
// link to a page of the English site; and on French prose without the non-breaking space French puts before `:`,
// `;`, `?` and `!`. Run by `npm run docs:build`, before VitePress.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';
import { earlyCloser, fenceClosed, fenceOpened } from './.vitepress/fences.ts';

const
  root = fileURLToPath(new URL('.', import.meta.url)),
  read = file => readFileSync(root + file, 'utf8').replace(/\r\n?/g, '\n'),
  pagesIn = dir => readdirSync(root + dir).filter(file => file.endsWith('.md') && !['README.md', '[page].md'].includes(file)),
  hashOf = file => createHash('sha256').update(read(file)).digest('hex').slice(0, 12),
  frontMatter = /^---\n([\s\S]*?)\n---\n/,
  recorded = source => /^english: ([0-9a-f]{12})\s*$/m.exec(frontMatter.exec(source)?.[1] ?? '')?.[1],
  // a regular space, or none, where French puts a non-breaking one (U+00A0, or the narrow U+202F)
  // inline code in HTML, `<code v-pre>…</code>`, and a quote in English, `<span lang="en">…</span>`: as they are
  verbatim = /<code\b[^>]*>.*?<\/code>|<(\w+)\b[^>]*\blang="en"[^>]*>.*?<\/\1>/g,
  spaced = /(?<=[^\s\u00a0\u202f:;?!])[:;?!](?=\s|$)| [:;?!](?=\s|$)|«(?![\u00a0\u202f])|(?<![\u00a0\u202f])»/;

/**
 * A French page with French spacing in its prose: a non-breaking space before `:`, `;`, `?` and `!`, and inside « ».
 * Code, `<script>` and `<style>` blocks, comments, tags, link URLs, a quoted pgcast message and front matter other than
 * `title`, `titleTemplate` and `description` are left as they are. Idempotent.
 */
function typeset(source) {
  const
    kept = /"[^"\n]*"(?=<!--\s*message\s*-->)|<code\b[^>]*>.*?<\/code>|<(\w+)\b[^>]*\blang="en"[^>]*>.*?<\/\1>|(`+)[\s\S]*?\2|<!--[\s\S]*?-->|<[^>]+>|\]\([^)]*\)|https?:\/\/[^\s)]+|\{[.#][^}]*\}/g,
    text = t => t
      .replace(/(?<![:;?!])[ \u202f]([:;?!])(?=\s|$)/g, '\u00a0$1')
      .replace(/(?<=[^\s\u00a0\u202f:;?!])([:;?!])(?=\s|$)/g, '\u00a0$1')
      .replace(/«[ \u202f]?(?!\u00a0)/g, '«\u00a0')
      .replace(/(?<!\u00a0)[ \u202f]?»/g, '\u00a0»'),
    prose = line => {
      let out = '', last = 0;
      for (const match of line.matchAll(kept)) {
        out += text(line.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
      }
      return out + text(line.slice(last));
    },
    [, front = '', body] = /^(---\n[\s\S]*?\n---\n)?([\s\S]*)$/.exec(source);
  let fence = null;
  return front.replace(/^(\s*(?:title|titleTemplate|description): *)(.+)$/gm, (_, key, value) => key + prose(value)) +
    body.split('\n').map(line => {
      if (fence !== null) {
        if (fence === '<script' ? /^<\/(script|style)>/.test(line) : fenceClosed(fence, line)) fence = null;
        return line;
      }
      fence = /^<(script|style)\b/.test(line) ? '<script' : fenceOpened(line)?.marker ?? null;
      if (fence !== null || /^<<< /.test(line)) return line;
      const [, container = ''] = /^(:::\s*[\w-]*)/.exec(line) ?? [];
      return container + prose(line.slice(container.length));
    }).join('\n');
}

// `--mark <page>…`: record that each fr/<page>.md translates <page>.md as it is now, its prose typeset.
if (process.argv[2] === '--mark') {
  const names = process.argv.slice(3).map(name => name.replace(/^fr\//, '').replace(/\.md$/, ''));
  if (names.length === 0) throw new Error('check-translations.mjs: name the pages, `npm run docs:translated -- select`');
  for (const name of names) {
    const file = `fr/${name}.md`, source = typeset(read(file)), line = `english: ${hashOf(`${name}.md`)}`;
    writeFileSync(root + file, frontMatter.test(source)
      ? source.replace(frontMatter, (_, body) => `---\n${/^english: .*$/m.test(body)
        ? body.replace(/^english: .*$/m, line) : `${line}\n${body}`}\n---\n`)
      : `---\n${line}\n---\n\n${source}`);
    console.log(`${file} translates ${name}.md as it is now`);
  }
  process.exit(0);
}

const
  md = await createMarkdownRenderer(root),
  english = pagesIn('.'),
  french = pagesIn('fr/'),
  problems = [];

// `--anchors <page>`: each heading of <page>.md with its anchor, as its French heading writes it.
if (process.argv[2] === '--anchors') {
  const page = `${process.argv[3]?.replace(/\.md$/, '')}.md`, tokens = md.parse(read(page), { path: root + page, relativePath: page });
  tokens.forEach((token, i) => {
    if (token.type === 'heading_open' && token.tag !== 'h1')
      console.log(`${'#'.repeat(Number(token.tag.slice(1)))} ${tokens[i + 1].content.replace(/\s*\{[^}]*\}$/, '')} {#${token.attrGet('id')}}`);
  });
  process.exit(0);
}

/** What a page and its translation share, read by VitePress's own parser, each part a list of strings in page order. */
function structureOf(file) {
  const
    source = read(file),
    tokens = md.parse(source, { path: root + file, relativePath: file }),
    html = tokens.filter(token => token.type === 'html_block').map(token => token.content).join('\n') +
      tokens.flatMap(token => token.children ?? []).filter(token => token.type === 'html_inline')
        .map(token => token.content).join('\n');
  return {
    // h1 aside, the title: its anchor is its words'
    anchors: tokens.filter(token => token.type === 'heading_open' && token.tag !== 'h1')
      .map(token => `${token.tag}#${token.attrGet('id')}`),
    code: tokens.filter(token => token.type === 'fence').map(({ info, content, meta }) =>
      meta?.src ? `<<< ${relative(root, meta.src)}${meta.region ? `#${meta.region}` : ''} {${info}}` : `${info}\n${content}`),
    components: [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([A-Z]\w*)\b[^>]*>/g)]
      .map(([tag, name]) => name === 'CastPanel' ? tag : name),
    marks: [...source.matchAll(/<!--\s*(probe:[\s\S]*?|message|joined:[\s\S]*?)\s*-->/g)].map(([, mark]) => mark),
    links: [
      ...tokens.flatMap(token => token.children ?? []).filter(token => token.type === 'link_open')
        .map(token => token.attrGet('href')),
      ...[...html.matchAll(/\shref="([^"]*)"/g)].map(([, href]) => href),
    ],
  };
}

/**
 * Each line of French prose, by its number: outside front matter, fences, `<script>` and `<style>` blocks and comments,
 * code spans and quoted messages as `x`.
 */
function proseOf(source) {
  const lines = [];
  let fence = null;
  source.replace(frontMatter, match => '\n'.repeat(match.split('\n').length - 1))
    .replace(/"[^"\n]*"(?=<!--\s*message\s*-->)/g, 'x')  // a pgcast message, quoted in English as it is written
    .replace(verbatim, 'x')  // inline code in HTML, and a quote in English
    .replace(/<!--[\s\S]*?-->/g, match => '\n'.repeat(match.split('\n').length - 1))
    .split('\n').forEach((line, i) => {
      if (fence !== null) {
        if (fence === '<script' ? /^<\/(script|style)>/.test(line) : fenceClosed(fence, line)) fence = null;
        return;
      }
      fence = /^<(script|style)\b/.test(line) ? '<script' : fenceOpened(line)?.marker ?? null;
      if (fence !== null || /^<<< /.test(line)) return;
      lines.push([i + 1, line
        .replace(/^:::\s*[\w-]*/, '')  // a container's kind; its chip is prose
        .replace(/(`+)[\s\S]*?\1/g, 'x')  // a code span
        .replace(/\]\([^)]*\)/g, ']')  // a link's URL
        .replace(/<[^>]*>/g, '')  // a tag; its text is prose
        .replace(/\s*\{[.#][^}]*\}\s*$/, '')  // `{#anchor}`, `{.lede}`
        .replace(/https?:\/\/\S+/g, 'x')]);
    });
  return lines;
}

// A self-check: prose after a ```md block that shows a ```ts line is read.
if (proseOf(`${earlyCloser}Voici :`).length !== 1 || !spaced.test('Voici :') || spaced.test('Voici\u00a0:'))
  throw new Error('check-translations.mjs: French prose after a ```md block went unread: check fences.ts');

for (const page of english.filter(page => !french.includes(page)))
  problems.push(`${page}: no French page; translate it as fr/${page}, then \`npm run docs:translated -- ${page.slice(0, -3)}\``);
for (const page of french.filter(page => !english.includes(page)))
  problems.push(`fr/${page}: no English page ${page}; a page is written in English first`);

for (const page of french.filter(page => english.includes(page))) {
  const
    file = `fr/${page}`,
    source = read(file),
    hash = recorded(source),
    name = page.slice(0, -3),
    [en, fr] = [structureOf(page), structureOf(file)];
  if (hash === undefined)
    problems.push(`${file}: no \`english:\` in its front matter; once it translates ${page}, \`npm run docs:translated -- ${name}\``);
  else if (hash !== hashOf(page))
    problems.push(`${file}: ${page} changed since it was translated (git diff it); update ${file}, then ` +
      `\`npm run docs:translated -- ${name}\``);
  for (const part of ['anchors', 'code', 'components', 'marks']) {
    const i = [...Array(Math.max(en[part].length, fr[part].length)).keys()].find(i => en[part][i] !== fr[part][i]);
    if (i !== undefined) problems.push(`${file}: its ${part} differ from ${page}'s, from #${i + 1}: ` +
      `${JSON.stringify(en[part][i] ?? 'none')} in English, ${JSON.stringify(fr[part][i] ?? 'none')} in French` +
      (part === 'anchors' ? '; a French heading keeps the English anchor, `## Les options {#options}`' : ''));
  }
  // a link to a page of the English site: a root link with no file extension, outside /fr/
  for (const href of fr.links.filter(href => /^\/(?!fr(\/|$))[^.#?]*(?:[#?].*)?$/.test(href ?? '')))
    problems.push(`${file}: ${href} is a page of the English site: link \`/fr${href === '/' ? '/' : href}\``);
  for (const [line, text] of proseOf(source))
    if (spaced.test(text)) problems.push(`${file}:${line}: a non-breaking space (U+00A0) goes before \`:\`, \`;\`, ` +
      `\`?\` and \`!\`, and inside « », in French: ${JSON.stringify(text.trim())}`);
}

if (problems.length > 0) {
  console.error(`The translation check failed (README.md § Languages):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`The French site translates the English one: ${french.length} pages, each up to date.`);

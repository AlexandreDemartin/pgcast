// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when SQL that a page writes in its prose, its tables or a `sql` block is not what pgcast
// compiles, or when a pgcast message that it quotes is not one the library writes (README.md § Conventions): copied
// by hand, both drift. Each is marked by an HTML comment glued after the code span (or quote) it checks:
// `<!-- probe: … -->` after SQL, or on the line above a `sql` block, and `<!-- message -->` after a message. A probe
// is a cast panel's example (`examples/<name>.ts`), or a JavaScript expression with `db` and a recording `pool` in
// scope. It sends no query to Postgres, so the site still builds without a database. Run by `npm run docs:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import * as db from 'zapatos/db';

process.noDeprecation = true;  // a probe may show what pgcast warns about (PGCAST_DEP001): the warning is not news here

const
  pages = readdirSync(new URL('.', import.meta.url)).filter(file => file.endsWith('.md') && file !== 'README.md'),
  sent = [],
  // Records each query and gives no rows; a probe may open a transaction on it.
  query = async query => { sent.push(typeof query === 'string' ? query : query.text); return { rows: [] }; },
  pool = { query, connect: async () => ({ query, release: () => {} }) },
  probes = new Map(),  // probe → its SQL, or the error it gives
  problems = [];

/**
 * The SQL of `probe`, every query it sends on its own line: an example's query, as its panel shows it; an expression's
 * `.compile().text` (or the `text` it compiled itself), or the queries it sends to `pool`. An error once a query is
 * recorded is expected, as in `cast.data.ts` (a shortcut that wants a row gets none). The configuration goes back to
 * what it was after each.
 */
async function sqlOf(probe) {
  const config = db.getConfig();
  config.transactionRetryDelay = { ...config.transactionRetryDelay };
  sent.length = 0;
  try {
    if (probe.startsWith('examples/')) {
      if (!/^examples\/[\w-]+\.ts$/.test(probe) || !existsSync(new URL(probe, import.meta.url)))
        throw new Error('names no cast panel\'s example (examples/<name>.ts)');
      globalThis.pool = pool;
      await import(new URL(probe, import.meta.url).href).catch(error => { if (sent.length === 0) throw error; });
    } else {
      const value = new Function('db', 'pool', `'use strict'; return (${probe});`)(db, pool);
      if (typeof value?.compile === 'function') sent.push(value.compile().text);
      else if (typeof value?.text === 'string') sent.push(value.text);  // compiled by the probe, for a `self` column
      else if (typeof value?.then === 'function') await value.catch(error => { if (sent.length === 0) throw error; });
      else throw new Error('gives no sql fragment, compiled query or promise');
    }
  } finally {
    db.setConfig({ ...Object.fromEntries(Object.keys(db.getConfig()).map(key => [key, undefined])), ...config });
  }
  if (sent.length === 0) throw new Error('sends no query');
  return sent.map(text => text.replace(/\s+/g, ' ').trim()).join('\n');
}

/** `promise`, or an error once `ms` have passed: Node would otherwise exit on a probe that never settles. */
function settles(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`does not settle in ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A regex for `quote`, `…` standing for any text, whitespace made uniform. A word at either end must be whole, so
 * `LIMIT $1` is not found in `LIMIT $10`; a quote that starts with `(` and ends with `)` must show every pair around
 * it, so `("a")` is not found in `(("a"))` (the drift #120 found). Not any other quote: a condition entry shows its own
 * pair, without the Whereable's.
 */
function pattern(quote) {
  const
    text = quote.replace(/\s+/g, ' ').trim(),
    body = (/^\w/.test(text) ? '(?<!\\w)' : '') + text.split('…').map(escape).join('.*?') +
      (/\w$/.test(text) ? '(?!\\w)' : '');
  return new RegExp(/^\(.*\)$/.test(text) ? `(?:(?<!\\()${body}|${body}(?!\\)))` : `(?:${body})`);
}

/**
 * Each string or template literal of the built `zapatos/db` that can be a message, with 20 characters or more of its
 * own; a value it interpolates written `…`. `templates`: the source of each such template literal, between its
 * backticks, `${…}` as written.
 */
const messages = [], templates = [];
const dist = new URL('dist/db/', import.meta.resolve('zapatos/db'));
if (!existsSync(dist)) throw new Error('check-prose.mjs: no zapatos/dist/db: `npm ci && npm run build` at the root');
for (const file of readdirSync(dist).filter(file => file.endsWith('.js'))) {
  const visit = node => {
    const literal =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text :
      ts.isTemplateExpression(node) ? [node.head, ...node.templateSpans.map(span => span.literal)].map(part => part.text)
        .join('…') :
      undefined;
    if (literal !== undefined && literal.replaceAll('…', '').length >= 20) {
      messages.push(literal);
      if (ts.isTemplateExpression(node)) templates.push(node.getText(source).slice(1, -1).replace(/\s+/g, ' '));
    }
    ts.forEachChild(node, visit);
  };
  const source = ts.createSourceFile(file, readFileSync(new URL(file, dist), 'utf8'), ts.ScriptTarget.Latest);
  visit(source);
}

/**
 * Whether `quote` is a message of the library: the whole of a literal, `…` for a value or for text left out, or the
 * literal with a value in place of each `…`, one word (`1ms`, not `1 ms`). A quote that shows a `${…}` is the source
 * of a template literal, between backticks or not, each `${…}` as written.
 */
function isMessage(quote) {
  const text = quote.replace(/^`(.*)`$/, '$1'), quoted = new RegExp(`^${pattern(text).source}$`);
  if (text.includes('${')) return templates.some(template => quoted.test(template));
  return messages.some(literal =>
    quoted.test(literal) || new RegExp(`^${literal.split('…').map(escape).join('\\S+?')}$`).test(text));
}

/**
 * The code spans of `line`, as CommonMark reads them: `[end, content]`, `end` just after the closing backticks. The
 * marks are blanked first: a probe may hold backticks, and VitePress reads a comment before any code span in it.
 */
function codeSpans(line) {
  const spans = [], text = line.replace(/<!--[\s\S]*?-->/g, comment => ' '.repeat(comment.length));
  for (let i = 0; i < text.length;) {
    const open = text.slice(i).match(/^`+/)?.[0];
    if (!open) { i += text[i] === '\\' ? 2 : 1; continue; }
    const close = new RegExp(`(?<!\`)${open}(?!\`)`, 'g');
    close.lastIndex = i + open.length;
    const end = close.exec(text)?.index;
    if (end === undefined) { i += open.length; continue; }
    const content = text.slice(i + open.length, end).replace(/^ (.*[^ ].*) $/, '$1');
    spans.push([end + open.length, content.replace(/\\\|/g, '|')]);  // `\|` is a `|` in a table cell
    i = end + open.length;
  }
  return spans;
}

let checked = 0;

for (const page of pages) {
  const lines = readFileSync(new URL(page, import.meta.url), 'utf8').split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const
      line = lines[i],
      where = `${page}:${i + 1}`,
      marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && fence === null) { fence = marker; continue; }
    if (marker && marker[0] === fence[0] && marker.length >= fence.length) { fence = null; continue; }
    if (fence !== null) continue;  // a page may show a mark as code

    // A mark follows what it checks, glued to it: at the start of a line, VitePress would read it as an HTML block.
    // Any comment that starts like a mark is one, so a near miss (`<!--- probe:`, `<!-- probes:`, `<!-- messages -->`,
    // a comment over two lines) fails.
    for (const { index } of line.matchAll(/<!--[\s-]*(probe|message)/gi)) {
      checked++;
      const
        end = line.indexOf('-->', index),
        mark = line.slice(index, end + 3),
        [, probe] = mark.match(/^<!-- probe: (\S.*?) -->$/) ?? [],
        span = codeSpans(line).find(([spanEnd]) => spanEnd === index)?.[1],
        quote = span ?? (mark === '<!-- message -->' ? line.slice(0, index).match(/"([^"]+)"$/)?.[1] : undefined),
        block = probe && line.trim() === mark && /^\s*```sql\s*$/.test(lines[i + 1] ?? '');

      if (end === -1 || (probe === undefined && mark !== '<!-- message -->')) {
        problems.push(`${where}: write the mark \`<!-- probe: … -->\` or \`<!-- message -->\`, on one line, not ` +
          `\`${end === -1 ? line.slice(index) : mark}\``);
        continue;
      }
      if (/^\s*\|/.test(line) && mark.includes('|')) {  // markdown-it would end the table cell there
        problems.push(`${where}: a mark in a table holds no \`|\` (write '\\x7c'): ${mark}`);
        continue;
      }
      if (quote === undefined && !block) {
        problems.push(`${where}: ${mark} has no ${probe ? 'code span right before it, nor a `sql` block below' :
          'code span or "quote" right before it'}`);
        continue;
      }
      if (!probe) {
        if (!isMessage(quote)) problems.push(`${where}: "${quote}" is no message of zapatos/db: quote it as it is, ` +
          '`…` for a value or for text left out');
        continue;
      }

      if (!probes.has(probe)) probes.set(probe, await settles(sqlOf(probe), 5000).catch(error => error));
      const sql = probes.get(probe);
      if (sql instanceof Error) {
        problems.push(`${where}: its probe ${sql.message}: ${probe}`);
        continue;
      }
      if (!block) {
        if (!pattern(quote).test(sql.replace(/\n/g, ' '))) problems.push(`${where}: \`${quote}\` is not in ${sql}`);
        continue;
      }
      // A block: its lines, `--` comments aside, are the queries the probe sends, all of them, whole and in this order.
      const queries = [];
      for (i += 2; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++)
        if (lines[i].trim() !== '' && !/^\s*--/.test(lines[i])) queries.push(lines[i]);
      if (!new RegExp(`^${queries.map(query => pattern(query).source).join('\\n')}$`).test(sql))
        problems.push(`${where}: the block's queries are not all those its probe sends, in order:\n    ` +
          sql.replace(/\n/g, '\n    '));
    }
  }
}

if (problems.length > 0) {
  console.error(`The prose check failed (README.md § Conventions):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`The SQL and the messages the pages quote match pgcast: ${checked} marks.`);

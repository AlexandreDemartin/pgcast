// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when a TypeScript snippet of the root CHANGELOG.md that is marked to compile does not
// type-check (README.md § The changelog): a migration it gives a user is otherwise never compiled (#200). A snippet is
// a code span with a mark glued after it: `<!-- tsc -->` if it is a module's code, or `<!-- tsc: … -->` with the code
// around it, `…` standing for the span (`db.upsert('films', [], 'id', { updateValues: … })`). Any other HTML comment
// outside a code span fails, so that a near miss does not turn the check off. Each is checked in memory, as its own
// file, `db` (`zapatos/db`) and a `pool` in scope, with the options of tsconfig.json but `skipLibCheck`, against the
// built `zapatos/db` and the docs schema, as check-joined.mjs checks a page. Types only: a value Postgres refuses at
// run time passes. Run by `npm run docs:build`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const
  root = fileURLToPath(new URL('.', import.meta.url)),
  { config } = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile),
  parsed = ts.parseJsonConfigFileContent({ ...config, include: ['zapatos'] }, ts.sys, root),
  options = { ...parsed.options, skipLibCheck: true },  // the `tsc` before it in `docs:build` checks the declarations
  prelude = 'import * as db from \'zapatos/db\';\ndeclare const pool: db.Queryable;\n',
  problems = [];

/**
 * The HTML comments of `line` outside its code spans, as CommonMark reads them, each with the code span it is glued
 * after, if any: `{ index, mark, span }`, `mark` up to the end of the line if it is not closed there.
 */
function marksOf(line) {
  const marks = [];
  let span;
  for (let i = 0; i < line.length;) {
    if (line.startsWith('<!--', i)) {
      const end = line.indexOf('-->', i + 4), mark = end === -1 ? line.slice(i) : line.slice(i, end + 3);
      marks.push({ index: i, mark, span: span?.end === i ? span.content : undefined });
      i += mark.length;
      continue;
    }
    const open = line.slice(i).match(/^`+/)?.[0];
    if (!open) { i += line[i] === '\\' ? 2 : 1; continue; }
    const close = new RegExp(`(?<!\`)${open}(?!\`)`, 'g');
    close.lastIndex = i + open.length;
    const end = close.exec(line)?.index;
    if (end === undefined) { i += open.length; continue; }
    span = { end: end + open.length, content: line.slice(i + open.length, end).replace(/^ (.*[^ ].*) $/, '$1') };
    i = span.end;
  }
  return marks;
}

/** The snippets of `source`, each `{ at, code }`; a comment that is not a mark glued after a span goes to `problems`. */
function snippetsOf(name, source, problems) {
  const snippets = [];
  source.split('\n').forEach((line, i) => {
    for (const { index, mark, span } of marksOf(line)) {
      const
        at = `${name}:${i + 1}:${index + 1}`,
        read = mark.match(/^<!-- tsc(?:: ((?:(?!--).)+?))? -->$/),
        around = read?.[1];
      if (!read) problems.push(`${at}: an HTML comment here is a mark, \`<!-- tsc -->\` or \`<!-- tsc: … -->\`, ` +
        `on one line, with no \`--\` in it: ${mark}`);
      else if (span === undefined) problems.push(`${at}: ${mark} has no code span right before it`);
      else if (around !== undefined && around.split('…').length !== 2) problems.push(`${at}: ${mark} has no \`…\`, ` +
        'or more than one, for the span');
      else snippets.push({ at, code: around === undefined ? span : around.replace('…', () => span) });
    }
  });
  return snippets;
}

// A self-check: a mark shown in a code span is not one; a span holding a comment, then a near miss, is read and fails.
const missed = [];
snippetsOf('the self-check', '`<!-- tsc -->` ``a `<!-- b -->` c``<!-- tsc:-->', missed);
if (missed.length !== 1) throw new Error('check-changelog.mjs: the code spans are misread: check marksOf()');

// One file name, never written, for each snippet in turn: the other files are read once, for the programs to share.
const
  snippets = snippetsOf('CHANGELOG.md', readFileSync(`${root}../CHANGELOG.md`, 'utf8'), problems),
  name = `${root}changelog-snippet.ts`,
  host = ts.createCompilerHost(options),
  { getSourceFile, fileExists } = host,
  read = new Map();
let program, snippet;
host.getSourceFile = (fileName, ...rest) => fileName === name
  ? ts.createSourceFile(fileName, prelude + snippet, rest[0])
  : read.get(fileName) ?? read.set(fileName, getSourceFile.call(host, fileName, ...rest)).get(fileName);
host.fileExists = fileName => fileName === name || fileExists.call(host, fileName);
for (const { at, code } of snippets) {
  snippet = code;
  program = ts.createProgram([name, ...parsed.fileNames], options, host, program);
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    const { file } = diagnostic, where = file && file.fileName !== name ? ` (in ${file.fileName})` : '';
    problems.push(`${at}${where}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
    }: ${code}`);
  }
}

if (problems.length > 0) {
  console.error(`The changelog snippets check failed (README.md § The changelog):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The changelog snippets type-check: ${snippets.length}.`);
}

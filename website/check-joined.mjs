// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when the examples a page says to keep in one file do not type-check joined, in page order, as
// the reader assembles that file (README.md § Examples): as separate modules, a repeated `const` or a missing import
// passes. A page opts in with a line `<!-- joined: src/films.ts -->` under its last step (any other line holding
// `<!-- joined` fails, so that a near miss does not turn the check off): each `ts twoslash` block and
// `<<< ./examples/….ts{ts twoslash}` above it, up to the previous such line, adds its code below `// ---cut---` (all
// of it if it has none), but a block that shows an error (`// @errors:`), which the reader does not keep: its code is
// checked below the steps above it, in a `{ … }` of its own, and must give exactly the errors it lists, as Twoslash
// checks it only against its own setup. If the first `ts twoslash` block under the line is titled with the file
// (`ts twoslash [src/films.ts]`), it shows the whole file: it must be the join, imports in any order and blank lines
// aside. The join is checked in memory, with the options of tsconfig.json but `skipLibCheck`, against the built
// `zapatos/db` and the docs schema. Run by `npm run docs:build`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { earlyCloser, fenceClosed, fenceOpened } from './.vitepress/fences.ts';

const
  root = fileURLToPath(new URL('.', import.meta.url)),
  { config } = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile),
  parsed = ts.parseJsonConfigFileContent({ ...config, include: ['zapatos'] }, ts.sys, root),
  options = { ...parsed.options, skipLibCheck: true },  // the `tsc` before it in `docs:build` checks the declarations
  schemaFiles = parsed.fileNames,
  problems = [],
  checked = [];

/** What the reader writes of a block: the lines below `// ---cut---`, the rest being its setup. */
const belowCut = lines => lines.slice(lines.findIndex(({ text }) => text.trim() === '// ---cut---') + 1);

/** The lines of code, to compare a whole file with its steps: blank lines left out, the imports first and sorted. */
function comparable(lines) {
  const
    code = lines.filter(({ text }) => text.trim() !== '').map(({ text, at }) => ({ text: text.trimEnd(), at })),
    isImport = ({ text }) => /^import\b/.test(text);
  return [...code.filter(isImport).sort((a, b) => a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
    ...code.filter(line => !isImport(line))];
}

/**
 * The blocks of `page`, its text `source`, each `{ text, at }[]`, joined at each `<!-- joined: <file> -->` line, those
 * that show an error, each with the codes it lists and the number of blocks above it, and the whole file if the page
 * shows it. A marker it cannot read goes to `problems`.
 */
function joinsOf(page, source, problems) {
  const joins = [];
  let pieces = [], shown = [], fence, block, title, last;
  const add = (lines, title) => {
    const listed = lines.map(({ text }) => text.match(/^\/\/ @errors:(.*)$/)?.[1]).find(codes => codes !== undefined);
    if (last && title === last.file) last.whole = lines;  // the first block under the marker, titled with the file
    else if (listed === undefined) pieces.push(lines);
    else shown.push({ lines, codes: listed.split(/[\s,]+/).filter(Boolean).map(Number), above: pieces.length });
    last = undefined;
  };
  if (!/<!--\s*joined/i.test(source)) return joins;
  source.split('\n').forEach((line, i) => {
    const at = `${page}:${i + 1}`;
    if (fence) {  // inside a fenced block, until its closing marker
      if (fenceClosed(fence, line)) {
        if (block) add(block, title);
        fence = block = undefined;
      } else block?.push({ text: line, at });
      return;
    }
    const
      open = fenceOpened(line),
      include = line.match(/^<<< \.\/(examples\/[\w/-]+\.ts)\{ts twoslash\}$/)?.[1],
      joined = line.match(/^\s*<!--\s*joined:\s*(\S+)\s*-->\s*$/)?.[1];
    if (open) {
      fence = open.marker;
      block = /^ts twoslash\b/.test(open.info) ? [] : undefined;
      title = open.info.match(/\[(.+?)\]/)?.[1];
    } else if (include) {
      add(readFileSync(root + include, 'utf8').split('\n')
        .map((text, j) => ({ text, at: `${at}: ${include}:${j + 1}` })));
    } else if (/^\s*<<< /.test(line)) {  // a region or an indented include, which the line above misses
      problems.push(`${at}: a joined page includes only \`<<< ./examples/<name>.ts{ts twoslash}\`, unindented: ${
        line}`);
    } else if (joined) {
      joins.push(last = { file: joined, at, pieces, shown });
      pieces = [];
      shown = [];
    } else if (/<!--\s*joined/i.test(line.replace(/`[^`]*`/g, ''))) {  // a marker the line above misses would pass
      problems.push(`${at}: a marker is \`<!-- joined: <file> -->\`, alone on its line: ${line}`);
    }
  });
  return joins;
}

/** The errors of `lines` type-checked as `name`, which is never written, each with its line in `lines` if it is one. */
function errorsOf(name, lines) {
  const
    text = lines.map(line => line.text).join('\n'),
    host = ts.createCompilerHost(options),
    { getSourceFile, fileExists } = host;
  host.getSourceFile = (fileName, ...rest) => fileName === name
    ? ts.createSourceFile(fileName, text, rest[0])
    : getSourceFile.call(host, fileName, ...rest);
  host.fileExists = fileName => fileName === name || fileExists.call(host, fileName);
  return ts.getPreEmitDiagnostics(ts.createProgram([name, ...schemaFiles], options, host)).map(diagnostic => {
    const { file: source, start } = diagnostic, line = source?.getLineAndCharacterOfPosition(start).line;
    return {
      line: source?.fileName === name ? line : undefined,
      where: source && source.fileName !== name ? `${source.fileName}:${line + 1}` : undefined,
      text: `TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
      code: diagnostic.code,
    };
  });
}

/**
 * Type-check `pieces` joined as `file`, then the code of each block in `shown` below the pieces above it, which must
 * give exactly the errors it lists, and compare the join with `whole`: each error names the line of the page it is on.
 */
function check({ file, at, pieces, shown, whole }) {
  const lines = pieces.flatMap(belowCut), name = root + file;
  if (lines.length === 0) return problems.push(`${at}: nothing above it to join as ${file}`);
  for (const { line, where, text } of errorsOf(name, lines)) {
    problems.push(`${line !== undefined ? lines[line].at : where ?? at} (joined as ${file}): ${text}`);
  }
  for (const { lines: block, codes, above } of shown) {
    const
      { at: shownAt } = block.find(({ text }) => text.startsWith('// @errors:')),
      steps = pieces.slice(0, above).flatMap(belowCut),
      probe = [...steps, { text: '{', at: shownAt }, ...belowCut(block), { text: '}', at: shownAt }],
      errors = errorsOf(name, probe).filter(({ line }) => line >= steps.length),  // those above are reported above
      same = (a, b) => [...new Set(a)].sort().join() === [...new Set(b)].sort().join();
    if (!same(errors.map(({ code }) => code), codes)) problems.push(`${shownAt} (joined as ${file}): it shows TS${
      codes.join(', TS')}, but below the steps above it the code gives ${
      errors.map(({ line, text }) => `${probe[line].at}: ${text}`).join('; ') || 'no error'}`);
  }
  if (whole) {
    const
      steps = comparable(lines),
      shows = comparable(belowCut(whole)),
      i = Array.from({ length: Math.max(steps.length, shows.length) }, (_, j) => j)
        .find(j => steps[j]?.text !== shows[j]?.text),
      quoted = line => line ? `\`${line.text.trim()}\`` : 'nothing more';
    if (i !== undefined) problems.push(`${shows[i]?.at ?? whole.at(-1)?.at ?? at} (the whole ${file}): it shows ${
      quoted(shows[i])}, but the steps above give ${quoted(steps[i])}${steps[i] ? ` (${steps[i].at})` : ''}`);
  }
  checked.push(`${file} (${at.split(':')[0]}, ${pieces.length} blocks, ${shown.length} that show an error${
    whole ? ', the whole file' : ''})`);
}

// A self-check: a marker after a ```md block that shows a ```ts line must be read, and this one fails.
const missed = [];
joinsOf('the self-check', `${earlyCloser}<!-- joined -->`, missed);
if (missed.length !== 1) throw new Error('check-joined.mjs: a marker after a ```md block went unread: check fences.ts');

for (const page of readdirSync(root).filter(file => file.endsWith('.md')))
  joinsOf(page, readFileSync(root + page, 'utf8'), problems).forEach(check);

if (problems.length > 0) {
  console.error(`The joined examples check failed (README.md § Examples):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The joined examples type-check: ${checked.join(', ') || 'none'}.`);
}

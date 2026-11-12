// Copyright (C) 2026 Alexandre Demartin
// Fails the docs build when the examples a page says to keep in one file do not type-check joined, in page order, as
// the reader assembles that file (README.md § Examples): as separate modules, a repeated `const` or a missing import
// passes. A page opts in with a line `<!-- joined: src/films.ts -->` under its last step: each `ts twoslash` block and
// `<<< ./examples/….ts{ts twoslash}` above it, up to the previous such line, adds its code below `// ---cut---` (all
// of it if it has none), but a block that shows an error (`// @errors:`), which the reader does not keep. The join is
// checked in memory, with the options of tsconfig.json, against the built `zapatos/db` and the docs schema. Run by
// `npm run docs:build`.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const
  root = fileURLToPath(new URL('.', import.meta.url)),
  { config } = ts.readConfigFile(`${root}tsconfig.json`, ts.sys.readFile),
  { options, fileNames: schemaFiles } = ts.parseJsonConfigFileContent({ ...config, include: ['zapatos'] }, ts.sys, root),
  problems = [],
  checked = [];

/** A block's lines, each with where the page shows it: what a block that shows an error holds is left out. */
const kept = lines => lines.some(({ text }) => /^\/\/ @errors:/.test(text)) ? [] : [lines];

/** What the reader writes of a block: the lines below `// ---cut---`, the rest being its setup. */
const belowCut = lines => lines.slice(lines.findIndex(({ text }) => text.trim() === '// ---cut---') + 1);

/** The blocks of `page`, each `{ text, at }[]`, joined at each `<!-- joined: <file> -->` line. */
function joinsOf(page) {
  const joins = [], source = readFileSync(root + page, 'utf8');
  let pieces = [], fence, block;
  if (!source.includes('<!-- joined: ')) return joins;
  source.split('\n').forEach((line, i) => {
    const at = `${page}:${i + 1}`, trimmed = line.trim();
    if (fence) {  // inside a fenced block, until a line of at least as many of its backticks or tildes
      if (trimmed.length >= fence.length && [...trimmed].every(char => char === fence[0])) {
        if (block) pieces.push(...kept(block));
        fence = block = undefined;
      } else block?.push({ text: line, at });
      return;
    }
    const
      open = line.match(/^\s*(`{3,}|~{3,})(.*)$/),
      include = line.match(/^<<< \.\/(examples\/[\w/-]+\.ts)\{ts twoslash\}$/)?.[1],
      joined = line.match(/^<!-- joined: (\S+) -->$/)?.[1];
    if (open) {
      fence = open[1];
      block = /^ts twoslash\b/.test(open[2].trim()) ? [] : undefined;
    } else if (include) {
      pieces.push(...kept(readFileSync(root + include, 'utf8').split('\n')
        .map((text, j) => ({ text, at: `${at}: ${include}:${j + 1}` }))));
    } else if (line.startsWith('<<< ')) {
      problems.push(`${at}: a joined page includes only \`<<< ./examples/<name>.ts{ts twoslash}\`: ${line}`);
    } else if (joined) {
      joins.push({ file: joined, at, pieces });
      pieces = [];
    }
  });
  return joins;
}

/** Type-check `pieces` joined as `file`, which is never written: each error names the line of the page it is on. */
function check({ file, at, pieces }) {
  const
    lines = pieces.flatMap(belowCut),
    name = root + file,
    text = lines.map(line => line.text).join('\n'),
    host = ts.createCompilerHost(options),
    { getSourceFile, fileExists } = host;
  if (lines.length === 0) return problems.push(`${at}: nothing above it to join as ${file}`);
  host.getSourceFile = (fileName, languageVersion, ...rest) => fileName === name
    ? ts.createSourceFile(fileName, text, languageVersion)
    : getSourceFile.call(host, fileName, languageVersion, ...rest);
  host.fileExists = fileName => fileName === name || fileExists.call(host, fileName);
  for (const diagnostic of ts.getPreEmitDiagnostics(ts.createProgram([name, ...schemaFiles], options, host))) {
    const
      { file: source, start } = diagnostic,
      line = source && source.getLineAndCharacterOfPosition(start).line,
      where = !source ? at : source.fileName === name ? lines[line].at : `${source.fileName}:${line + 1}`;
    problems.push(`${where} (joined as ${file}): TS${diagnostic.code} ${
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  checked.push(`${file} (${at.split(':')[0]}, ${pieces.length} blocks)`);
}

for (const page of readdirSync(root).filter(file => file.endsWith('.md'))) joinsOf(page).forEach(check);

if (problems.length > 0) {
  console.error(`The joined examples check failed (README.md § Examples):\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`The joined examples type-check: ${checked.join(', ') || 'none'}.`);
}

// Copyright (C) 2026 Alexandre Demartin

import { dirname, extname, resolve, sep } from 'node:path';
import type * as TS from 'typescript';
import { bindings } from './bindings';

interface Location { file: string; line: number; column: number }
interface Diagnostic extends Location { message: string }
interface Query { name: string; text: string; locations: Location[] }

function location(file: string, source?: TS.SourceFile, offset = 0): Location {
  const position = source?.getLineAndCharacterOfPosition(offset);
  return { file, line: (position?.line ?? 0) + 1, column: (position?.character ?? 0) + 1 };
}

const at = ({ file, line, column }: Location) => `${file}:${line}:${column}`;

function rowNames(ts: typeof TS, template: TS.TaggedTemplateExpression) {
  const names = new Set<string>();
  function visit(node: TS.Node) {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === 'Row' &&
        node.typeArguments?.length === 1) {
      const arg = node.typeArguments[0];
      if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) names.add(arg.literal.text);
    }
    ts.forEachChild(node, visit);
  }
  template.typeArguments?.forEach(visit);
  return [...names];
}

// Tagged literals suppress escape diagnostics. Scan the token as an ordinary literal to recover them.
function invalidEscape(ts: typeof TS, raw: string) {
  if (!raw.includes('\\')) return false;
  // 4.1 does not report decimal escapes. Consume escaped backslashes in pairs.
  if (/\\(?:[1-9]|0\d)/.test(raw.replace(/\\\\/g, ' '))) return true;
  let invalid = false;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, raw, () => { invalid = true; });
  scanner.scan();
  // Newer scanners defer errors until they know the template is untagged.
  scanner.reScanTemplateHeadOrNoSubstitutionTemplate();
  return invalid;
}

function firstSyntaxError(ts: typeof TS, source: TS.SourceFile) {
  // SourceFile exposes no public parse diagnostics. Give the program just this AST, including on 4.1
  // where .mts and .cts are unavailable as root extensions. Never resolve application imports here.
  const options = { noLib: true, noResolve: true, types: [], allowJs: true }, host = ts.createCompilerHost(options);
  host.getSourceFile = name => name === 'input.ts' ? source : undefined;
  host.resolveModuleNames = names => names.map(() => undefined);
  return ts.createProgram(['input.ts'], options, host).getSyntacticDiagnostics(source)[0];
}

/** Find static Row templates using the application's compiler and its project's source files. */
export function scan(ts: typeof TS, project: string, rowsFile: string) {
  const files = new Map<string, TS.CompilerOptions>(), projects = new Set<string>(), diagnostics: Diagnostic[] = [],
    queries = new Map<string, Query>(), conflicts = new Set<string>();
  const key = (path: string) => ts.sys.useCaseSensitiveFileNames ? resolve(path) : resolve(path).toLowerCase();
  const rows = key(rowsFile), host = {
    ...ts.sys,
    fileExists: (path: string) => key(path) === rows || ts.sys.fileExists(path),
    directoryExists: (path: string) => rows.startsWith(key(path) + sep) || ts.sys.directoryExists(path),
  };

  function report(error: TS.Diagnostic, file: string) {
    diagnostics.push({ ...location(file, error.file, error.start), message: ts.flattenDiagnosticMessageText(error.messageText, '\n') });
  }
  // Compilers can throw on malformed configuration entries or excessively nested source.
  function parse<T>(file: string, read: () => T) {
    try { return read(); } catch (error) {
      diagnostics.push({ ...location(file), message: error instanceof Error ? error.message : String(error) });
    }
  }
  function readProject(file: string) {
    const id = key(ts.sys.realpath?.(file) ?? file);
    if (projects.has(id)) return;
    projects.add(id);
    const config = parse(file, () => ts.readConfigFile(file, ts.sys.readFile));
    if (!config) return;
    if (config.error) {
      if (!config.error.file) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
      report(config.error, file);
      return;
    }
    const parsed = parse(file, () => ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(file), undefined, file));
    if (!parsed) return;
    for (const error of parsed.errors) report(error, error.file?.fileName ?? file);
    for (const path of parsed.fileNames) if (!files.has(path)) files.set(path, parsed.options);
    for (const ref of parsed.projectReferences ?? []) readProject(ts.resolveProjectReferencePath(ref));
  }

  function readFile(file: string, options: TS.CompilerOptions) {
    const kinds: Record<string, TS.ScriptKind> = { '.ts': ts.ScriptKind.TS, '.mts': ts.ScriptKind.TS, '.cts': ts.ScriptKind.TS,
      '.tsx': ts.ScriptKind.TSX, '.js': ts.ScriptKind.JS, '.mjs': ts.ScriptKind.JS, '.cjs': ts.ScriptKind.JS, '.jsx': ts.ScriptKind.JSX };
    const kind = kinds[extname(file).toLowerCase()];
    if (kind === undefined || /\.d\.[cm]?ts$/i.test(file)) return;
    const content = ts.sys.readFile(file) ?? (key(file) === rows ? '' : undefined);
    if (content === undefined) {
      diagnostics.push({ ...location(file), message: 'Cannot read source file.' });
      return;
    }
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind), error = firstSyntaxError(ts, source);
    if (error) { report(error, file); return; }
    const bound = bindings(ts, source), row = bound.imported('Row');
    if (!row || !ts.isImportSpecifier(row.node) || row.node.propertyName || !/^\.{1,2}(?:\/|$)/.test(row.module)) return;
    // 4.1 does not resolve an explicit .ts suffix. The exact output is present on the first run too.
    const resolveRow = (specifier: string) => ts.resolveModuleName(specifier, file, options, host).resolvedModule;
    const exact = row.module.endsWith('.ts') && key(resolve(dirname(file), row.module)) === rows;
    const resolved = resolveRow(row.module) ?? (exact ? resolveRow(row.module.slice(0, -3)) : undefined);
    if (!resolved || key(resolved.resolvedFileName) !== rows) return;
    function template(node: TS.TaggedTemplateExpression) {
      const tag = node.tag;
      if (!(ts.isIdentifier(tag) && tag.text === 'sql') && !(ts.isPropertyAccessExpression(tag) && tag.name.text === 'sql')) return;
      const names = rowNames(ts, node);
      if (!names.length) return;
      const [name] = names, label = JSON.stringify(name), pos = location(file, source, tag.getStart(source)),
        refuse = (message: string) => diagnostics.push({ ...pos, message });
      if (names.length > 1) return refuse('Multiple query names: ' + names.map(n => JSON.stringify(n)).join(', '));
      if (!bound.matches(tag, 'sql')) return refuse(`Query ${label} has an unsupported tag: ${tag.getText(source)}.`);
      const literal = node.template;
      if (ts.isTemplateExpression(literal)) {
        const start = literal.head.end - 2, end = literal.templateSpans[0].literal.getStart(source) + 1;
        return refuse(`Query ${label}: only static templates are supported yet. Found ${source.text.slice(start, end)} at ${at(location(file, source, start))}.`);
      }
      if (invalidEscape(ts, literal.getText(source))) return refuse(`Query ${label} contains an invalid template escape.`);
      const previous = queries.get(name);
      if (!previous) queries.set(name, { name, text: literal.text, locations: [pos] });
      else if (previous.text === literal.text) previous.locations.push(pos);
      else {
        conflicts.add(name);
        refuse(`Query ${label} has different SQL at ${at(previous.locations[0])} and ${at(pos)}.`);
      }
    }
    function visit(node: TS.Node) {
      if (ts.isTaggedTemplateExpression(node)) template(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  readProject(resolve(project));
  const seen = new Set<string>();
  for (const file of [...files.keys()].sort()) {
    const id = key(ts.sys.realpath?.(file) ?? file);
    if (!seen.has(id)) parse(file, () => readFile(file, files.get(file)!));
    seen.add(id);
  }
  diagnostics.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column);
  return { queries: [...queries.values()].filter(q => !conflicts.has(q.name)), diagnostics };
}

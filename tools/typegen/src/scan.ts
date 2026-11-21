// Copyright (C) 2026 Alexandre Demartin

import { dirname, resolve, sep } from 'node:path';
import type * as TS from 'typescript';
import { bindings } from './bindings';
import { neutralise } from './neutralise';

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
  const result = template.typeArguments?.[1];
  if (result) visit(result);
  return [...names];
}

interface Template {
  pos: Location;
  name: string;
  text?: string;
  error?: string;
  ambiguous?: boolean;
}

/** Find named Row templates using the application's compiler and its project's source files. */
export function scan(ts: typeof TS, project: string, rowsFile: string) {
  const projects = new Set<string>(), diagnostics: Diagnostic[] = [], templates = new Map<string, Template>();
  const key = (path: string) => ts.sys.useCaseSensitiveFileNames ? resolve(path) : resolve(path).toLowerCase();
  const rows = key(rowsFile), root = resolve(project), host = {
    ...ts.sys,
    fileExists: (path: string) => key(path) === rows || ts.sys.fileExists(path),
    directoryExists: (path: string) => rows.startsWith(key(path) + sep) || ts.sys.directoryExists(path),
    readFile: (path: string) => ts.sys.readFile(path) ?? (key(path) === rows ? '' : undefined),
  };

  function report(error: TS.Diagnostic, file: string, prefix = '') {
    diagnostics.push({ ...location(file, error.file, error.start), message: prefix + ts.flattenDiagnosticMessageText(error.messageText, '\n') });
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
      if (file === root && !config.error.file) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
      report(config.error, file);
      return;
    }
    const parsed = parse(file, () => ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(file), undefined, file));
    if (!parsed) return;
    for (const error of parsed.errors) report(error, error.file?.fileName ?? file);
    const options = parsed.options, compilerHost = ts.createCompilerHost(options, true), getSourceFile = compilerHost.getSourceFile;
    Object.assign(compilerHost, { fileExists: host.fileExists, directoryExists: host.directoryExists, readFile: host.readFile });
    compilerHost.getSourceFile = (...args) => {
      const [path, target] = args;
      try { return getSourceFile(...args); } catch (error) {
        diagnostics.push({ ...location(path), message: error instanceof Error ? error.message : String(error) });
        return ts.createSourceFile(path, '', target);
      }
    };
    const program = parse(file, () => ts.createProgram({ rootNames: parsed.fileNames, options, host: compilerHost,
      projectReferences: parsed.projectReferences ?? [] }));
    if (!program) return;
    for (const error of program.getOptionsDiagnostics()) report(error, file);
    for (const source of program.getSourceFiles()) {
      if (!source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source)) parse(source.fileName, () => readFile(source, program, file));
    }
    for (const ref of program.getResolvedProjectReferences() ?? []) if (ref) readProject(ref.sourceFile.fileName);
  }

  function readFile(source: TS.SourceFile, program: TS.Program, projectFile: string) {
    const file = source.fileName, options = program.getCompilerOptions(), syntax = program.getSyntacticDiagnostics(source)[0];
    const bound = bindings(ts, source, options, host), row = bound.imported('Row');
    // On 4.1 an explicit relative .ts suffix needs a second resolution without the suffix.
    const spec = row?.module, exact = spec && /^\.{1,2}\//.test(spec) && spec.endsWith('.ts') && key(resolve(dirname(file), spec)) === rows;
    const resolved = row?.resolve() ?? (exact ? row.resolve(spec.slice(0, -3)) : undefined);
    const generated = row && ts.isImportSpecifier(row.node) && !row.node.propertyName && resolved && key(resolved.resolvedFileName) === rows;
    let syntaxQuery = '';
    function template(node: TS.TaggedTemplateExpression) {
      const tag = node.tag;
      if (!(ts.isIdentifier(tag) && tag.text === 'sql') && !(ts.isPropertyAccessExpression(tag) && tag.name.text === 'sql')) return;
      const names = rowNames(ts, node);
      if (!names.length) return;
      const [name] = names, label = JSON.stringify(name), start = tag.getStart(source), pos = location(file, source, start);
      if (syntax) {
        if (generated && syntax.start !== undefined && start <= syntax.start && syntax.start < node.end) syntaxQuery = `Query ${label}: `;
        return;
      }
      const current: Template = { pos, name };
      if (generated) {
        const module = bound.matches(tag, 'sql');
        if (names.length > 1) current.error = 'Multiple query names: ' + names.map(n => JSON.stringify(n)).join(', ');
        else if (!module) current.error = `Query ${label} has an unsupported tag: ${tag.getText(source)}.`;
        else {
          try {
            current.text = neutralise(ts, source, node.template, projectFile, module, callee => bound.matches(callee, 'param'));
          } catch (error) { current.error = `Query ${label}: ${(error as Error).message}`; }
        }
      }
      const id = key(ts.sys.realpath?.(file) ?? file) + ':' + start, previous = templates.get(id);
      if (!previous) templates.set(id, current);
      else if (previous.text !== current.text || previous.error !== current.error) previous.ambiguous = true;
    }
    function visit(node: TS.Node) {
      if (ts.isTaggedTemplateExpression(node)) template(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (syntax) report(syntax, file, syntaxQuery);
  }

  readProject(root);
  const order = (a: Location, b: Location) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.column - b.column;
  const queries = new Map<string, Query>(), conflicts = new Set<string>();
  for (const { pos, name, text, error, ambiguous } of [...templates.values()].sort((a, b) => order(a.pos, b.pos))) {
    const label = JSON.stringify(name);
    if (ambiguous) diagnostics.push({ ...pos, message: `Query ${label} resolves differently between projects.` });
    else if (error) diagnostics.push({ ...pos, message: error });
    else if (text !== undefined) {
      const previous = queries.get(name);
      if (!previous) queries.set(name, { name, text, locations: [pos] });
      else if (previous.text === text) previous.locations.push(pos);
      else {
        conflicts.add(name);
        diagnostics.push({ ...pos, message: `Query ${label} has different SQL at ${at(previous.locations[0])} and ${at(pos)}.` });
      }
    }
  }
  diagnostics.sort((a, b) => order(a, b) || a.message.localeCompare(b.message));
  return { queries: [...queries.values()].filter(q => !conflicts.has(q.name)),
    diagnostics: diagnostics.filter((d, i) => !i || order(d, diagnostics[i - 1]) || d.message !== diagnostics[i - 1].message) };
}

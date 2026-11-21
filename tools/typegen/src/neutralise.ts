// Copyright (C) 2026 Alexandre Demartin

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type * as TS from 'typescript';

// Describe the public compiler calls without requiring an application schema to build the tool.
interface Db {
  sql(chunks: TemplateStringsArray, ...slots: unknown[]): { compile(): { text: string } };
  param(value: undefined, cast: string | false): unknown;
}
type Require = ReturnType<typeof createRequire>;
const scoped = '@pgcast/pgcast/db';
const version = (entry: string): string => require(join(dirname(entry), 'package.json')).version;

function checkedEntry(from: Require, name: string) {
  let path: string;
  try { path = from.resolve(name); } catch { throw new Error(`Cannot resolve ${name} from the application`); }
  const installed = version(path), peerVersion = version(require.resolve(scoped));
  if (installed !== peerVersion) {
    throw new Error(`${name} version ${installed} differs from the generator's @pgcast/pgcast version ${peerVersion}`);
  }
  return path;
}

// Tagged templates suppress escape diagnostics. Scan each raw chunk as an ordinary template.
function invalidEscape(ts: typeof TS, raw: string) {
  if (!raw.includes('\\')) return false;
  // 4.1 does not report decimal escapes. Consume escaped backslashes in pairs.
  if (/\\(?:[1-9]|0\d)/.test(raw.replace(/\\\\/g, ' '))) return true;
  let invalid = false;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, '`' + raw + '`', () => { invalid = true; });
  scanner.scan();
  scanner.reScanTemplateHeadOrNoSubstitutionTemplate();
  return invalid;
}

/** Compile the cooked chunks with inert parameters, without evaluating any source expression. */
export function neutralise(ts: typeof TS, source: TS.SourceFile, literal: TS.TemplateLiteral, projectFile: string,
  tagModule: string, paramModule: (callee: TS.Expression) => string | undefined) {
  const chunks: string[] = [], raw: string[] = [], slots: unknown[] = [], sites: string[] = [];
  function chunk(token: TS.TemplateLiteralLikeNode) {
    const followedBySlot = token.kind === ts.SyntaxKind.TemplateHead || token.kind === ts.SyntaxKind.TemplateMiddle;
    const spelling = token.getText(source).slice(1, followedBySlot ? -2 : -1);
    if (invalidEscape(ts, spelling)) throw new Error('Invalid template escape.');
    chunks.push(token.text);
    raw.push(spelling);
  }
  if (ts.isNoSubstitutionTemplateLiteral(literal)) {
    chunk(literal);
    return literal.text;
  }
  const project = createRequire(projectFile), fromSource = createRequire(source.fileName), tagEntry = checkedEntry(fromSource, tagModule);
  const db: Db = project(checkedEntry(project, scoped));
  chunk(literal.head);
  let start = literal.head.end - 2;
  for (const { expression, literal: tail } of literal.templateSpans) {
    const { line, character } = source.getLineAndCharacterOfPosition(start);
    const site = `placeholder ${source.text.slice(start, tail.getStart(source) + 1)} at ${source.fileName}:${line + 1}:${character + 1}`;
    sites.push(site);
    if (ts.isStringLiteralLike(expression)) slots.push(expression.text);
    else {
      const call = ts.isCallExpression(expression) && !expression.questionDotToken ? expression : undefined;
      const module = call && paramModule(call.expression);
      if (!call || !module || !call.arguments.length || ts.isSpreadElement(call.arguments[0])) throw new Error(`Unsupported ${site}.`);
      const args = call.arguments, cast = args[1];
      if (args.length === 1 || (args.length === 2 && cast.kind === ts.SyntaxKind.TrueKeyword)) {
        throw new Error(`Unsupported ${site}. Support for this param() comes in a later release.`);
      }
      if (args.length !== 2 || !(ts.isStringLiteralLike(cast) || cast.kind === ts.SyntaxKind.FalseKeyword)) throw new Error(`Unsupported ${site}.`);
      if (module !== tagModule) {
        try {
          // Each installed copy has its own Parameter class.
          if (checkedEntry(fromSource, module) !== tagEntry) throw new Error('Import sql and param from the same db installation');
        } catch (error) { throw new Error(`${site}: ${(error as Error).message}`); }
      }
      slots.push(db.param(undefined, ts.isStringLiteralLike(cast) ? cast.text : false));
    }
    chunk(tail);
    start = tail.end - 2;
  }
  try { return db.sql(Object.assign(chunks, { raw }), ...slots).compile().text; }
  catch (error) {
    // Locate a rejected cast with the same compiler that rejected the complete template.
    for (const [i, slot] of slots.entries()) {
      try { db.sql`${slot}`.compile(); } catch (cause) { throw new Error(`${sites[i]}: ${(cause as Error).message}`); }
    }
    throw error;
  }
}

// Copyright (C) 2026 Alexandre Demartin

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type * as TS from 'typescript';

// Describe the public compiler calls without requiring an application schema to build the tool.
interface Db {
  sql(chunks: TemplateStringsArray, ...slots: unknown[]): { compile(): { text: string } };
  param(value: unknown, cast: string | boolean): unknown;
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

export interface CandidateTexts {
  text: string;
  variants?: { texts: string[]; sites: string[] };
}

/** Compile the cooked chunks with inert parameters, without evaluating any source expression. */
export function neutralise(ts: typeof TS, source: TS.SourceFile, literal: TS.TemplateLiteral, projectFile: string,
  tagModule: string, paramModule: (callee: TS.Expression) => string | undefined): CandidateTexts {
  const chunks: string[] = [], raw: string[] = [], slots: unknown[] = [], sites: string[] = [];
  const ambiguous: number[] = [];
  function chunk(token: TS.TemplateLiteralLikeNode) {
    const followedBySlot = token.kind === ts.SyntaxKind.TemplateHead || token.kind === ts.SyntaxKind.TemplateMiddle;
    const spelling = token.getText(source).slice(1, followedBySlot ? -2 : -1);
    if (invalidEscape(ts, spelling)) throw new Error('Invalid template escape.');
    chunks.push(token.text);
    raw.push(spelling);
  }
  if (ts.isNoSubstitutionTemplateLiteral(literal)) {
    chunk(literal);
    return { text: literal.text };
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
      const variable = args.length === 1 || (args.length === 2 && cast.kind === ts.SyntaxKind.TrueKeyword);
      if (!variable && !(args.length === 2 && (ts.isStringLiteralLike(cast) || cast.kind === ts.SyntaxKind.FalseKeyword))) {
        throw new Error(`Unsupported ${site}.`);
      }
      if (module !== tagModule) {
        try {
          // Each installed copy has its own Parameter class.
          if (checkedEntry(fromSource, module) !== tagEntry) throw new Error('Import sql and param from the same db installation');
        } catch (error) { throw new Error(`${site}: ${(error as Error).message}`); }
      }
      if (variable) ambiguous.push(slots.length);
      slots.push(db.param(undefined, cast && ts.isStringLiteralLike(cast) ? cast.text : variable));
    }
    chunk(tail);
    start = tail.end - 2;
  }
  const variableSites = ambiguous.map(i => sites[i]);
  if (ambiguous.length > 4) throw new Error(`More than four ambiguous parameters. Give each a cast or false: ${variableSites.join(', ')}.`);
  const template = Object.assign(chunks, { raw });
  try {
    const text = db.sql(template, ...slots).compile().text;
    if (!ambiguous.length) return { text };
    const texts: string[] = [];
    for (let mask = 1; mask < 2 ** ambiguous.length; mask++) {
      const combination = slots.slice();
      for (const [bit, index] of ambiguous.entries()) {
        if (mask & (1 << bit)) combination[index] = db.param([], true);
      }
      texts.push(db.sql(template, ...combination).compile().text);
    }
    return { text, variants: { texts, sites: variableSites } };
  } catch (error) {
    // Locate a rejected cast with the same compiler that rejected the complete template.
    for (const [i, slot] of slots.entries()) {
      try { db.sql`${slot}`.compile(); } catch (cause) { throw new Error(`${sites[i]}: ${(cause as Error).message}`); }
    }
    throw error;
  }
}

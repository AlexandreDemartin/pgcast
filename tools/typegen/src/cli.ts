#!/usr/bin/env node
// Copyright (C) 2026 Alexandre Demartin

import './peers';
import { writeSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { CompleteConfig } from '@pgcast/pgcast/generate';
import { Client } from 'pg';
import type * as TS from 'typescript';
import { readConfig } from './config';
import { describeQuery, RejectedParse } from './describe';
import { fileKey, scan } from './scan';
import { textTypes } from './values';
import type { StoredQuery } from './write';
import { watch } from './watch';
import { aliases, buildQueries, header, literal, typedQueries, writeQueries } from './write';

const usage = 'Usage: pgcast-typegen [--check | --watch] [--project <tsconfig>]';

function projectCompiler(project: string): typeof TS {
  let ts: typeof TS;
  try { ts = createRequire(project)('typescript'); } catch { throw new Error('Cannot load typescript from the project'); }
  // TypeScript 7 is a native compiler: its package has no createSourceFile, so say which one the tsconfig resolved.
  if (typeof ts.createSourceFile !== 'function') {
    throw new Error(`typescript ${ts.version} from ${project} has no JavaScript API; point --project at a tsconfig that resolves typescript 4.1 to 6`);
  }
  return ts;
}

type Query = ReturnType<typeof scan>['queries'][number];
type Fields = Awaited<ReturnType<typeof describeQuery>>['fields'];

function differingField(a: Fields, b: Fields) {
  if (a === null || b === null) return a === b ? undefined : (a ?? b)?.[0]?.name ?? '(row)';
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (!x || !y || x.name !== y.name || x.dataTypeID !== y.dataTypeID ||
        !!x.notNull !== !!y.notNull || !isDeepStrictEqual(x.enumLabels, y.enumLabels)) return (x ?? y).name;
  }
}

async function describeCandidates(client: Client, query: Query, schemas: CompleteConfig['schemas']) {
  let first: { text: string; fields: Fields } | undefined, firstError: Error | undefined, difference: string | undefined;
  for (const text of [query.text, ...(query.variants?.texts ?? [])]) {
    try {
      const { fields } = await describeQuery(client, text, schemas, !!query.variants);
      if (!first) first = { text, fields };
      else difference ??= differingField(first.fields, fields);
    } catch (error) {
      if (!(error instanceof RejectedParse)) {
        if (query.variants) context += `SQL (${text}): `;
        throw error;
      }
      firstError ??= error.serverError;
    }
  }
  if (!first) throw firstError;
  if (difference !== undefined) {
    throw new Error(`Field ${JSON.stringify(difference)} differs between forms of ${query.variants!.sites.join(', ')}. Give each a cast or false.`);
  }
  return first;
}

function site(query: Query) {
  const { file, line, column } = query.locations[0];
  return `${file}:${line}:${column} Query ${JSON.stringify(query.name)}:`;
}

function message(error: unknown) {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object' || !('message' in error) || typeof error.message !== 'string') return 'Unknown error';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? `${code}: ${error.message}` : error.message;
}

const secrets: unknown[] = [process.env.PGPASSWORD];
let context = '', client: Client | undefined;

function redact(line: string) {
  const strings = [...secrets, client?.password].filter((s): s is string => typeof s === 'string' && s.length > 0);
  const spellings = strings.flatMap(s => [s, JSON.stringify(s).slice(1, -1), literal(s).slice(1, -1)]);
  for (const secret of spellings.sort((a, b) => b.length - a.length)) line = line.split(secret).join('[redacted]');
  return line.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function fail(error: unknown): never {
  writeSync(2, redact(context + message(error)) + '\n');
  process.exit(1);
}

const fieldTypes = new Set(Object.values(textTypes));

function storedType(ts: typeof TS, node: TS.TypeNode) {
  const type = node.getText();
  if (fieldTypes.has(type.replace(/ \| null$/, ''))) return type;
  const members = ts.isUnionTypeNode(node) ? node.types : [node], labels: string[] = [];
  for (const member of members) {
    if (!ts.isLiteralTypeNode(member)) return;
    if (ts.isStringLiteral(member.literal)) labels.push(literal(member.literal.text));
    else if (labels.length && member === members[members.length - 1] && member.literal.kind === ts.SyntaxKind.NullKeyword) labels.push('null');
    else return;
  }
  return labels.join(' | ');
}

/** Read only the generated declarations. The committed module is never loaded as JavaScript. */
function storedQueries(ts: typeof TS, path: string, content: string, dbModule: string) {
  const file = ts.createSourceFile(path, content.replace(/\r\n/g, '\n'), ts.ScriptTarget.Latest, true);
  if ((file as TS.SourceFile & { parseDiagnostics: readonly TS.Diagnostic[] }).parseDiagnostics.length) return 'invalid syntax';
  const queries = file.statements.find(ts.isInterfaceDeclaration), invalid = 'invalid generated module';
  if (!queries || queries.name.text !== 'Queries' || queries.modifiers?.length !== 1 ||
      queries.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword || queries.typeParameters || queries.heritageClauses ||
      !file.text.startsWith(header) || file.text.slice(queries.end).trim() !== aliases) return invalid;
  const preamble = file.text.slice(header.length, queries.getStart(file)).trim()
    .replace(/^\/\/\/ <reference types="node" \/>/, '').trim();
  if (preamble && !['JSONValue', 'PostgresInterval', 'JSONValue, PostgresInterval'].some(names =>
    preamble === `import type { ${names} } from "${dbModule}";`)) return invalid;

  const property = (node: TS.TypeElement): node is TS.PropertySignature & { type: TS.TypeNode } =>
    ts.isPropertySignature(node) && !node.modifiers?.length && !node.questionToken && !('initializer' in node && node.initializer) && !!node.type;
  const stored = new Map<string, StoredQuery>();
  for (const entry of queries.members) {
    if (!property(entry) || !ts.isStringLiteral(entry.name)) return invalid;
    const label = `Query ${literal(entry.name.text)}: `;
    if (stored.has(entry.name.text)) return label + 'duplicate name';
    if (!ts.isTypeLiteralNode(entry.type)) return label + invalid;
    const [text, row] = entry.type.members;
    if (!text || !property(text) || !ts.isIdentifier(text.name) || text.name.text !== 'text' || entry.type.members.length > 2) return label + invalid;
    if (!ts.isLiteralTypeNode(text.type) || !ts.isStringLiteral(text.type.literal)) return label + 'nonliteral text';
    let fields: StoredQuery['fields'] = null;
    if (row) {
      if (!property(row) || !ts.isIdentifier(row.name) || row.name.text !== 'row' || !ts.isTypeLiteralNode(row.type)) return label + invalid;
      const names = new Set<string>();
      fields = [];
      for (const field of row.type.members) {
        if (!property(field) || !ts.isStringLiteral(field.name) || names.has(field.name.text) || field.name.text === '__proto__') return label + invalid;
        const type = storedType(ts, field.type);
        if (!type) return label + invalid;
        names.add(field.name.text);
        fields.push({ name: field.name.text, type });
      }
    }
    stored.set(entry.name.text, { text: text.type.literal.text, fields });
  }
  return stored;
}

async function checkQueries(ts: typeof TS, path: string, dbModule: 'zapatos/db' | 'pgcast/db', queries: Query[], fresh?: Map<string, StoredQuery>) {
  const scanned = new Map(queries.map(query => [query.name, query])), names = [...scanned.keys()].sort().map(literal).join(', ');
  const differences: string[] = [], expected = fresh && buildQueries(dbModule, fresh);
  const bytes = await readFile(path).catch((error: Error & { code?: string }) => {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  });
  if (!bytes) differences.push(`Missing: ${path}` + (names ? ' - ' + names : ''));
  else if (expected === undefined || !bytes.equals(Buffer.from(expected))) {
    const stored = storedQueries(ts, path, bytes.toString('utf8'), dbModule);
    const prefix = `Out of date: ${path} - `;
    if (typeof stored === 'string') differences.push(prefix + stored);
    else {
      for (const name of [...new Set([...scanned.keys(), ...stored.keys()])].sort()) {
        const before = stored.get(name), query = scanned.get(name), after = fresh?.get(name);
        const label = prefix + `Query ${literal(name)}: `;
        if (!before) differences.push(label + 'new query');
        else if (!query) differences.push(label + 'stale entry (no source query)');
        else {
          const texts = after ? [after.text] : [query.text, ...(query.variants?.texts ?? [])];
          if (!texts.includes(before.text)) differences.push(label + 'changed text');
          if (after && !isDeepStrictEqual(before.fields, after.fields)) differences.push(label + 'changed row');
        }
      }
      if (!differences.length && (fresh || !bytes.equals(Buffer.from(buildQueries(dbModule, stored))))) {
        differences.push(prefix + 'changed module bytes' + (names ? ` (${names})` : ''));
      }
    }
  }
  if (differences.length) {
    for (const line of [...differences, 'Run the generator without --check to write it.']) console.log(redact(line));
    process.exitCode = 1;
  } else {
    const offline = expected === undefined ? ' Rows were not checked against a database (no db in the config).' : '';
    console.log(redact(`The generated files in ${dirname(path)} are up to date.` + offline));
  }
}

/** Describe and write rows as edits arrive, over one connection, until a signal ends the session. */
async function watchProject(ts: typeof TS, client: Client, project: string, path: string, dbModule: 'zapatos/db' | 'pgcast/db', schemas: CompleteConfig['schemas']) {
  let stopping = false;
  context = `${path}:1:1 `;
  client.on('error', fail);
  client.on('end', () => { if (!stopping) fail(new Error('Connection closed')); });
  await client.connect();
  const watcher = watch(ts, project, path, {
    describe: async query => {
      context = site(query) + ' ';
      try { return await describeCandidates(client, query, schemas); } catch (error) { throw new Error(context + message(error)); } finally { context = `${path}:1:1 `; }
    },
    async write(rows) {
      const content = buildQueries(dbModule, typedQueries(rows)), stored = await readFile(path).catch(() => undefined);
      if (stored?.equals(Buffer.from(content))) return false;
      await mkdir(dirname(path), { recursive: true });
      await writeQueries(path, dbModule, rows);
      return true;
    },
    log: line => console.log(redact(line)),
    error: line => console.error(redact(line)),
    end: () => { process.exitCode = 1; stop(); },
  });
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void watcher.close().then(() => client.end());
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function run(args: string[]) {
  if (args.length === 1 && args[0] === '--help') return console.log(redact(usage));
  const check = args[0] === '--check' || args[args.length - 1] === '--check';
  if (check) args = args[0] === '--check' ? args.slice(1) : args.slice(0, -1);
  const watching = args[0] === '--watch' || args[args.length - 1] === '--watch';
  if (watching) args = args[0] === '--watch' ? args.slice(1) : args.slice(0, -1);
  if (check && watching) throw new Error(usage);
  if (args.length && !(args.length === 2 && args[0] === '--project' && args[1] && !args[1].startsWith('-'))) {
    throw new Error(usage);
  }
  const project = resolve(args[1] ?? './tsconfig.json'), { config, problem, note } = readConfig('.');
  const db = config.db, moduleNames = config.moduleNames ?? 'zapatos';
  const offline = check && !('db' in config);
  if ((check && !offline && (!db || Array.isArray(db))) || (db != null && typeof db !== 'object')) {
    throw new Error(problem ?? 'db must be a Postgres connection config');
  }
  const uri = db?.connectionString;
  secrets.push(uri, db?.password);
  if (typeof uri === 'string') {
    // Keep the original spelling as well as pg's decoded password, including for socket URIs.
    secrets.push(uri.match(/^[^:]+:\/\/[^/@?#:]*:([^/@?#]*)@/)?.[1], uri.match(/[?&]password=([^&#]*)/)?.[1]);
  }
  if (!offline) {
    try { client = new Client(db); } catch { throw new Error(problem ?? 'Invalid Postgres connection settings'); }
  }
  if (problem) throw new Error(problem);
  if (note && !check) console.error(redact(note));
  if (moduleNames !== 'zapatos' && moduleNames !== 'pgcast') throw new Error("moduleNames must be 'zapatos' or 'pgcast'");
  if (typeof config.outDir !== 'string') throw new Error('outDir must be a directory name');
  const path = resolve(config.outDir, moduleNames, 'queries.ts');
  if (client) {
    const { connectionParameters } = client as Client & { connectionParameters: { query_timeout: number | false } };
    if ((db && 'query_timeout' in db) || connectionParameters.query_timeout) throw new Error('Remove query_timeout from db before describing statements');
  }

  context = `${project}:1:1 `;
  if (watching) return watchProject(projectCompiler(project), client!, project, path, `${moduleNames}/db`, config.schemas);
  const ts = projectCompiler(project), result = scan(ts, project, path), queries = result.queries;
  // The output file is ours to rewrite: a conflict or a syntax error in it is not a reason to stop, and --check reports it with the advice.
  const key = fileKey(ts), diagnostics = result.diagnostics.filter(d => key(d.file) !== key(path));
  if (diagnostics.length) {
    for (const d of diagnostics) console.error(redact(`${d.file}:${d.line}:${d.column} ${d.message}`));
    process.exitCode = 1;
    return;
  }
  if (!client) {
    context = `${path}:1:1 `;
    return checkQueries(ts, path, `${moduleNames}/db`, queries);
  }
  if (queries.length) context = site(queries[0]) + ' ';
  let connectionError: Error | undefined;
  client.on('error', (error: Error) => { connectionError ??= error; });
  // pg's end() can wait indefinitely when connect() rejects before opening a socket.
  await client.connect();
  const rows = new Map<string, { text: string; fields: Fields }>();
  try {
    for (const query of queries) {
      context = site(query) + ' ';
      if (connectionError) throw connectionError;
      try {
        rows.set(query.name, await describeCandidates(client, query, config.schemas));
      } catch (error) {
        console.error(redact(context + message(connectionError ?? error)));
        process.exitCode = 1;
        if (connectionError) return;
      }
    }
  } finally {
    await client.end();
  }
  if (connectionError) throw connectionError;
  if (process.exitCode) return;
  context = `${path}:1:1 `;
  if (check) return checkQueries(ts, path, `${moduleNames}/db`, queries, typedQueries(rows));
  await mkdir(dirname(path), { recursive: true });
  await writeQueries(path, `${moduleNames}/db`, rows);
  console.log(redact(`${path}: ${rows.size} ${rows.size === 1 ? 'query' : 'queries'}`));
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
void run(process.argv.slice(2)).catch(fail);

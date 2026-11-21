#!/usr/bin/env node
// Copyright (C) 2026 Alexandre Demartin

import { writeSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import type * as TS from 'typescript';
import { readConfig } from './config';
import { describeQuery } from './describe';
import { scan } from './scan';
import { writeQueries } from './write';

const usage = 'Usage: pgcast-typegen [--project <tsconfig>]';

function scanProject(project: string, path: string) {
  let ts: typeof TS;
  try { ts = createRequire(project)('typescript'); } catch { throw new Error('Cannot load typescript from the project'); }
  return scan(ts, project, path);
}

function site(query: ReturnType<typeof scan>['queries'][number]) {
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
  for (const secret of strings.sort((a, b) => b.length - a.length)) line = line.split(secret).join('[redacted]');
  return line;
}

function fail(error: unknown): never {
  writeSync(2, redact(context + message(error)) + '\n');
  process.exit(1);
}

async function run(args: string[]) {
  if (args.length === 1 && args[0] === '--help') return console.log(redact(usage));
  if (args.length && !(args.length === 2 && args[0] === '--project' && args[1] && !args[1].startsWith('-'))) {
    throw new Error(usage);
  }
  const project = resolve(args[1] ?? './tsconfig.json'), { config, problem, note } = readConfig('.');
  const db = config.db, moduleNames = config.moduleNames ?? 'zapatos';
  if (db != null && typeof db !== 'object') throw new Error(problem ?? 'db must be a Postgres connection config');
  const uri = db?.connectionString;
  secrets.push(uri, db?.password);
  if (typeof uri === 'string') {
    // Keep the original spelling as well as pg's decoded password, including for socket URIs.
    secrets.push(uri.match(/^[^:]+:\/\/[^/@?#:]*:([^/@?#]*)@/)?.[1], uri.match(/[?&]password=([^&#]*)/)?.[1]);
  }
  try { client = new Client(db); } catch { throw new Error(problem ?? 'Invalid Postgres connection settings'); }
  if (problem) throw new Error(problem);
  if (note) console.error(redact(note));
  if (moduleNames !== 'zapatos' && moduleNames !== 'pgcast') throw new Error("moduleNames must be 'zapatos' or 'pgcast'");
  if (typeof config.outDir !== 'string') throw new Error('outDir must be a directory name');
  const path = resolve(config.outDir, moduleNames, 'queries.ts');
  const { connectionParameters } = client as Client & { connectionParameters: { query_timeout: number | false } };
  if ((db && 'query_timeout' in db) || connectionParameters.query_timeout) throw new Error('Remove query_timeout from db before describing statements');

  context = `${project}:1:1 `;
  const { queries, diagnostics } = scanProject(project, path);
  if (diagnostics.length) {
    for (const d of diagnostics) console.error(redact(`${d.file}:${d.line}:${d.column} ${d.message}`));
    process.exitCode = 1;
    return;
  }
  if (queries.length) context = site(queries[0]) + ' ';
  let connectionError: Error | undefined;
  client.on('error', (error: Error) => { connectionError ??= error; });
  // pg's end() can wait indefinitely when connect() rejects before opening a socket.
  await client.connect();
  const rows = new Map<string, { text: string; fields: Awaited<ReturnType<typeof describeQuery>>['fields'] }>();
  try {
    for (const query of queries) {
      context = site(query) + ' ';
      if (connectionError) throw connectionError;
      try {
        const { fields } = await describeQuery(client, query.text);
        rows.set(query.name, { text: query.text, fields });
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
  await mkdir(dirname(path), { recursive: true });
  await writeQueries(path, `${moduleNames}/db`, rows);
  console.log(redact(`${path}: ${rows.size} ${rows.size === 1 ? 'query' : 'queries'}`));
}

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
void run(process.argv.slice(2)).catch(fail);

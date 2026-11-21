#!/usr/bin/env node
// Copyright (C) 2026 Alexandre Demartin

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
  if (!(error instanceof Error)) return 'Unknown error';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? `${code}: ${error.message}` : error.message;
}

async function run(args: string[]) {
  if (args.length === 1 && args[0] === '--help') return console.log(usage);
  if (args.length && !(args.length === 2 && args[0] === '--project' && args[1] && !args[1].startsWith('-'))) {
    throw new Error(usage);
  }
  const project = resolve(args[1] ?? './tsconfig.json'), config = readConfig('.');
  const db = config.db, moduleNames = config.moduleNames ?? 'zapatos';
  if (moduleNames !== 'zapatos' && moduleNames !== 'pgcast') throw new Error("moduleNames must be 'zapatos' or 'pgcast'");
  if (typeof config.outDir !== 'string') throw new Error('outDir must be a directory name');
  const path = resolve(config.outDir, moduleNames, 'queries.ts');
  if (db != null && typeof db !== 'object') throw new Error('db must be a Postgres connection config');
  const url = db?.connectionString && URL.canParse(db.connectionString) ? new URL(db.connectionString) : undefined;
  if ((db && 'query_timeout' in db) || url?.searchParams.has('query_timeout')) throw new Error('Remove query_timeout from db before describing statements');
  let client: Client;
  try { client = new Client(db); } catch { throw new Error('Invalid Postgres connection settings'); }
  const safe = (line: string) => {
    for (const secret of [db?.connectionString, url?.password, db?.password, client.password, process.env.PGPASSWORD]) {
      if (typeof secret === 'string' && secret.length) line = line.split(secret).join('[redacted]');
    }
    return line;
  };
  let context = `${project}:1:1`, connectionError: Error | undefined;
  client.on('error', (error: Error) => { connectionError = error; });
  try {
    const rows = new Map<string, { text: string; fields: Awaited<ReturnType<typeof describeQuery>>['fields'] }>();
    try {
      const { queries, diagnostics } = scanProject(project, path);
      if (diagnostics.length) {
        for (const d of diagnostics) console.error(safe(`${d.file}:${d.line}:${d.column} ${d.message}`));
        process.exitCode = 1;
        return;
      }
      if (queries.length) context = site(queries[0]);
      await client.connect();
      for (const query of queries) {
        context = site(query);
        if (connectionError) throw connectionError;
        try {
          const { fields } = await describeQuery(client, query.text);
          rows.set(query.name, { text: query.text, fields });
        } catch (error) {
          console.error(safe(`${context} ${message(error)}`));
          process.exitCode = 1;
          if (connectionError) return;
        }
      }
    } finally {
      await client.end();
    }
    if (connectionError) throw connectionError;
    if (process.exitCode) return;
    context = `${path}:1:1`;
    await mkdir(dirname(path), { recursive: true });
    await writeQueries(path, `${moduleNames}/db`, rows);
    console.log(safe(`${path}: ${rows.size} ${rows.size === 1 ? 'query' : 'queries'}`));
  } catch (error) {
    throw new Error(safe(`${context} ${message(error)}`));
  }
}

void run(process.argv.slice(2)).catch(error => {
  console.error(message(error));
  process.exitCode = 1;
});

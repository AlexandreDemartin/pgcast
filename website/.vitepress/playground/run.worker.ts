// Copyright (C) 2026 Alexandre Demartin
// The playground's runner (decision 005): a module worker, started afresh for each run, that imports the reader's
// code as the TypeScript worker emits it. `zapatos/db` is pgcast's runtime, bundled in. As you type, `pool` only
// records each query and gives no rows back, as cast.data.ts's at build; on a Run, it is Postgres, PGlite on the docs
// schema (pglite.ts), imported then only. A worker has no DOM and no access to the page.
import { warnings } from './globals.ts';  // first: zapatos/db reads them as it loads
import * as db from 'zapatos/db';
import { layOut, normalised, valuesShown } from '../panel.ts';
import type { QueryConfig } from './pglite.ts';

export interface Query {
  sql: string;
  values: string;
  // on Postgres: `2 rows` and the rows as JSON (the first of them), or `COMMIT`; or the error, with its SQLSTATE
  answer?: string;
  rows?: string;
  rejects?: { code?: string; message: string };
}

export interface Run {
  queries: Query[];
  warnings: string[];
  error?: string;
}

/** What the page sends: the code, and whether it runs on Postgres. */
export interface Code { js: string; postgres: boolean }

/** What the worker sends back: `started` once Postgres is up (the time limit starts then), then the run. */
export type Message = { started: true } | Run;

const
  queries: Query[] = [],
  shownRows = 50,
  message = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  module = (code: string) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
  // a `bytea` as Postgres writes it, a `bigint` as digits: JSON has neither
  json = (value: unknown) => JSON.stringify(value, (_, item) => item instanceof Uint8Array ?
    '\\x' + Array.from(item, byte => byte.toString(16).padStart(2, '0')).join('') :
    typeof item === 'bigint' ? String(item) : item, 2),
  /** The query as its panel shows it, kept with the others. */
  record = ({ text, values = [] }: QueryConfig) => {
    const sql = layOut(text);
    const query = { sql: normalised(sql) === normalised(text) ? sql : text, values: valuesShown(values) };
    queries.push(query);
    return query;
  },
  recorded = async (config: QueryConfig) => (record(config), { rows: [], rowCount: 0 }),
  // a transaction checks out a client (`connect()`) and gives it back (`release()`); `_connected`: pglite.ts's `poolOf`
  recording = { query: recorded, connect: async () => ({ query: recorded, release() {}, _connected: true }) };

/** Postgres on the docs schema, as a pool whose every query is recorded with Postgres's answer. */
async function postgres() {
  const
    [{ open, poolOf }, { default: schema }] =
      await Promise.all([import('./pglite.ts'), import('../../schema.sql?raw')]),
    pglite = await open(schema);

  return poolOf(async config => {
    const query: Query = record(config);
    try {
      const result = await pglite.query(config.text, config.values);
      const { rows, fields, command, rowCount } = result, more = rows.length - shownRows;
      // a command without rows: its name, and the count of rows it touched (`INSERT 1`, `COMMIT`)
      query.answer = fields.length ? `${rows.length} row${rows.length === 1 ? '' : 's'}` :
        `${command}${rowCount === undefined ? '' : ` ${rowCount}`}`;
      if (fields.length) query.rows = json(rows.slice(0, shownRows)) + (more > 0 ? `\n// and ${more} more` : '');
      return result;
    } catch (error) {
      query.rejects = { code: (error as { code?: string }).code, message: (error as Error).message };
      throw error;
    }
  });
}

let error: string | undefined;
addEventListener('unhandledrejection', event => { event.preventDefault(); error ??= message(event.reason); });

onmessage = async ({ data: { js, postgres: onPostgres } }: MessageEvent<Code>) => {
  // `zapatos/db` in the reader's code becomes a module of this worker's own `db`: a worker cannot import a bare name
  const
    names = Object.keys(db).filter(name => name !== 'default'),
    shim = module(`const db = globalThis.pgcastDb;\nexport const { ${names.join(', ')} } = db;\n` +
      'export default db.default;'),
    // the quote it had: a string that holds `from 'zapatos/db'` keeps its own quotes closed (a blob: URL has none)
    code = js.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])zapatos\/db\2/g,
      (_, before, quote) => before + quote + shim + quote);

  try {
    Object.assign(globalThis, { pgcastDb: db, pool: onPostgres ? await postgres() : recording });
  } catch (thrown) {  // PGlite's files did not load
    postMessage({ queries, warnings, error: `Postgres did not start: ${message(thrown)}` } satisfies Run);
    return;
  }
  if (onPostgres) postMessage({ started: true } satisfies Message);
  try {
    await import(/* @vite-ignore */ module(code));
  } catch (thrown) {
    error ??= message(thrown);
  }
  await new Promise(resolve => setTimeout(resolve));  // a query the code does not await is still recorded
  postMessage({ queries, warnings, error } satisfies Run);
};

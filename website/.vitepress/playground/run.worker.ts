// Copyright (C) 2026 Alexandre Demartin
// The playground's runner (decision 005): a module worker, started afresh for each run, that imports the reader's
// code as the TypeScript worker emits it. `zapatos/db` is pgcast's runtime, bundled in; `pool` only records each query
// and gives no rows back, as cast.data.ts's at build. A worker has no DOM and no access to the page.
import { warnings } from './globals.ts';  // first: zapatos/db reads them as it loads
import * as db from 'zapatos/db';
import { layOut, normalised, valuesShown } from '../panel.ts';

export interface Run {
  queries: { sql: string; values: string }[];
  warnings: string[];
  error?: string;
}

const
  queries: Run['queries'] = [],
  query = async ({ text, values }: { text: string; values: unknown[] }) => {
    const sql = layOut(text);
    queries.push({ sql: normalised(sql) === normalised(text) ? sql : text, values: valuesShown(values) });
    return { rows: [], rowCount: 0 };
  },
  // a transaction checks out a client (`connect()`) and gives it back (`release()`)
  pool = { query, connect: async () => ({ query, release() {} }) },
  message = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  module = (code: string) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));

let error: string | undefined;
addEventListener('unhandledrejection', event => { event.preventDefault(); error ??= message(event.reason); });

onmessage = async ({ data: js }: MessageEvent<string>) => {
  // `zapatos/db` in the reader's code becomes a module of this worker's own `db`: a worker cannot import a bare name
  const
    names = Object.keys(db).filter(name => name !== 'default'),
    shim = module(`const db = globalThis.pgcastDb;\nexport const { ${names.join(', ')} } = db;\n` +
      'export default db.default;'),
    // the quote it had: a string that holds `from 'zapatos/db'` keeps its own quotes closed (a blob: URL has none)
    code = js.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])zapatos\/db\2/g,
      (_, before, quote) => before + quote + shim + quote);

  Object.assign(globalThis, { pgcastDb: db, pool });
  try {
    await import(/* @vite-ignore */ module(code));
  } catch (thrown) {
    error ??= message(thrown);
  }
  await new Promise(resolve => setTimeout(resolve));  // a query the code does not await is still recorded
  postMessage({ queries, warnings, error } satisfies Run);
};

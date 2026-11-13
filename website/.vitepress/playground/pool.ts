// Copyright (C) 2026 Alexandre Demartin
// The playground's pools (decision 005), which take a query as `pg`'s do: Postgres on a Run (pglite.ts) and, as you
// type, run.worker.ts's recording pool. Apart from pglite.ts, which the worker imports on a Run only.
import type { Results } from '@electric-sql/pglite';

/** A query as `zapatos/db` gives it to `pg`. */
export interface QueryConfig { text: string; values?: unknown[] }

/** A query as `pg.Pool` and `pg.Client` take it, `query(text, values)` or `query({ text, values })`, as a config. */
export const configOf = (query: string | QueryConfig, values?: unknown[]): QueryConfig =>
  typeof query === 'string' ? { text: query, values } : values ? { ...query, values } : query;

/**
 * A `pg.Pool` of one connection, as `new pg.Pool({ max: 1 })`: PGlite "only has a single exclusive connection".
 * `connect()` waits for the client before it to be released, and a query on the pool for the client in use; every
 * query goes to `send`. The client has `_connected`, as a `pg.Client`: zapatos/db tells a client from a pool by it
 * (pg.ts), and would check a client out of it. `end()` does nothing: each Run's Postgres goes with its worker.
 */
export function poolOf(send: (query: QueryConfig) => Promise<Results>) {
  let free = Promise.resolve();
  const take = async () => {
    const previous = free;
    let release!: () => void;
    free = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  };
  return {
    async query(query: string | QueryConfig, values?: unknown[]) {
      const release = await take();
      try {
        return await send(configOf(query, values));
      } finally {
        release();
      }
    },
    async connect() {
      const query = (query: string | QueryConfig, values?: unknown[]) => send(configOf(query, values));
      return { query, release: await take(), _connected: true };
    },
    async end() {},
  };
}

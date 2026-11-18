/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

/* === types === */

// structural, so that neither pgcast nor postgres.js is imported: a postgres.js `Sql` of 3.4 or 4.x fits them

interface Unsafe {
  unsafe(query: string, parameters: any[], options: { prepare?: boolean; simple?: boolean }): { raw(): PromiseLike<RawResult> };
}

/** The `sql` of postgres.js (3.4 or 4.x), as `asPool()` uses it. */
export interface PostgresJsSql extends Unsafe {
  reserve(): PromiseLike<Unsafe & { release(): void }>;
  typed(value: string, oid: number): unknown;
  options?: { transform?: { column?: { from?: unknown }; row?: { from?: unknown } } };
}

type RawResult = ArrayLike<(Uint8Array | null)[]> & { command?: string | null; columns?: { name: string; type: number }[] };

/** The query object pgcast's `run()` passes: `pg`'s. */
export type PostgresJsQuery = { text: string; values: any[]; name?: string };
/** What a query resolves to: the rows, as `pg` parses them, and the command tag, as `pg` gives it. */
export type PostgresJsResult = { rows: any[]; command: string };

/** A connection reserved by `connect()`, until `release()`. */
export interface PostgresJsClient {
  query: (query: PostgresJsQuery) => Promise<PostgresJsResult>;
  release: () => void;
}

/** The pool `asPool()` gives, which `run()` and `transaction()` take. */
export interface PostgresJsPool {
  query: (query: PostgresJsQuery) => Promise<PostgresJsResult>;
  connect: () => Promise<PostgresJsClient>;
}

/* === asPool === */

const queryOn = (target: Unsafe) => async ({ text, values }: PostgresJsQuery): Promise<PostgresJsResult> => {
  const result = await target.unsafe(text, values, {}) as unknown as any[] & { command: string };
  return { rows: [...result], command: result.command };
};

/**
 * Give pgcast's `run()` and `transaction()` a postgres.js `sql`.
 * @param sql The `sql` that `postgres()` returns: the adapter never configures nor ends it
 */
export function asPool(sql: PostgresJsSql): PostgresJsPool {
  return {
    query: queryOn(sql),
    connect: async () => {
      const reserved = await sql.reserve();
      return { query: queryOn(reserved), release: () => reserved.release() };
    },
  };
}

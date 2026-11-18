// Copyright (C) 2026 Alexandre Demartin
//
// usePostgresJs(): the database of useTestDatabase() (the root's test helpers), and a postgres.js `sql` on it,
// given to asPool(). shape(): a value as a comparable tree, which tells a Date from its string, a number from
// a numeric string, and names a class.

import postgres from 'postgres';
import { afterAll, beforeAll, inject } from 'vitest';
import { useTestDatabase } from '../../../test/helpers/db';
import { urlForDatabase } from '../../../test/helpers/databases';
import { asPool, type PostgresJsPool } from '../src';

export function usePostgresJs() {
  const t = useTestDatabase();
  let sql: ReturnType<typeof postgres> | undefined, pool: PostgresJsPool | undefined;

  beforeAll(() => {
    sql = postgres(urlForDatabase(inject('pgcastDb')!.url, t.name), { max: 3, onnotice: () => { } });
    pool = asPool(sql);
  });
  afterAll(async () => { await sql?.end({ timeout: 1 }); });  // before the database is dropped: hooks run as a stack

  return {
    t,
    get sql() { return sql!; },
    get pool() { return pool!; },
  };
}

export function shape(v: unknown): unknown {
  if (v === null) return null;
  if (v === undefined) return 'undefined';
  if (v instanceof Date) return { Date: isNaN(v.getTime()) ? 'Invalid' : v.toISOString() };
  if (Buffer.isBuffer(v)) return { Buffer: v.toString('hex') };
  if (Array.isArray(v)) return v.map(shape);
  if (typeof v === 'object') {
    const o: Record<string, unknown> = {}, name = v.constructor?.name;
    for (const k of Object.keys(v)) o[k] = shape((v as Record<string, unknown>)[k]);
    return name && name !== 'Object' ? { [name]: o } : o;
  }
  if (typeof v === 'number') return { number: Object.is(v, -0) ? '-0' : String(v) };
  if (typeof v === 'bigint') return { bigint: String(v) };
  return v;
}

/** The SQLSTATE or name of an error, to compare refusals. */
export const refusal = (e: any) => ({ refused: e?.code ?? e?.name });

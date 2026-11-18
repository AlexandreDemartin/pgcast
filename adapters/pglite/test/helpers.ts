// Copyright (C) 2026 Alexandre Demartin
//
// usePGlite(): the database of useTestDatabase() (the root's test helpers), read through pg, and PGlites in memory
// with the same fixture, given to asPool(). Their TimeZone is the pg session's, so that the two give the same text.
// The 'own' PGlite has parsers and serializers of its own, then refreshArrayTypes(): none may reach the adapter. shape(): a value as a comparable tree, which tells a Date from its string, a number from a numeric
// string, a Buffer from a Uint8Array, and names a class.

import { readFileSync } from 'fs';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { file_fdw } from '@electric-sql/pglite/contrib/file_fdw';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { afterAll, beforeAll } from 'vitest';
import { useTestDatabase } from '../../../test/helpers/db';
import { asPool, type PGlitePool } from '../src';

export const fixture = readFileSync(new URL('../../../test/fixtures/schema.sql', import.meta.url), 'utf8');
const extensions = { citext, file_fdw, pg_trgm, unaccent };

// parsers and serializers a user may give PGlite, each unlike pg's
const own = {
  parsers: { 20: (x: string) => BigInt(x), 25: (x: string) => 'P:' + x, 1082: () => 'P', 1184: () => 'P', 17: () => 'P', 114: () => 'P', 3802: () => 'P' },
  serializers: { 25: () => 'SER', 114: () => '"ser"', 3802: () => '"ser"', 1082: () => '1999-01-01', 1114: () => '1999-01-01', 16: () => 'f', 20: () => '7' },
};

/** A PGlite in memory with the fixture, its TimeZone set as given. */
export async function fixturePGlite(timeZone: string, options: { own?: boolean } = {}) {
  const pglite = await PGlite.create({ extensions, ...(options.own ? own : {}) });
  await pglite.exec(fixture);
  if (options.own) await pglite.refreshArrayTypes();
  await pglite.exec(`SET TimeZone = '${timeZone}'`);
  return pglite;
}

export type Kind = 'plain' | 'own';

/** The test database, and a PGlite of each kind given, the plain one by default, created once for the file. */
export function usePGlite(kinds: Kind[] = ['plain']) {
  const t = useTestDatabase(), made: Partial<Record<Kind, { pglite: PGlite; pool: PGlitePool }>> = {};

  beforeAll(async () => {
    const { rows: [{ tz }] } = await t.pool.query<{ tz: string }>(`SELECT current_setting('TimeZone') AS tz`);
    for (const kind of kinds) {
      const pglite = await fixturePGlite(tz, { own: kind === 'own' });
      made[kind] = { pglite, pool: asPool(pglite) };
    }
  });
  afterAll(async () => { for (const kind of kinds) await made[kind]?.pglite.close(); });

  return {
    t,
    pglite: (kind: Kind = 'plain') => made[kind]!.pglite,
    pool: (kind: Kind = 'plain') => made[kind]!.pool,
  };
}

export function shape(v: unknown): unknown {
  if (v === null) return null;
  if (v === undefined) return 'undefined';
  if (v instanceof Date) return { Date: isNaN(v.getTime()) ? 'Invalid' : v.toISOString() };
  if (Buffer.isBuffer(v)) return { Buffer: v.toString('hex') };
  if (v instanceof Uint8Array) return { Uint8Array: Buffer.from(v).toString('hex') };
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

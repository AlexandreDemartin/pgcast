/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import { types as utilTypes } from 'util';
import { getTypeParser } from 'pg-types';

/* === types === */

// structural, so that neither pgcast nor postgres.js is imported: a postgres.js `Sql` of 3.4 or 4.x fits them

interface Unsafe {
  unsafe(query: string, parameters: any[], options: { prepare?: boolean; simple?: boolean }): { raw(): PromiseLike<RawResult> };
}

/** The `sql` of postgres.js (3.4 or 4.x), as `asPool()` uses it. */
export interface PostgresJsSql extends Unsafe {
  reserve(): PromiseLike<Unsafe & { release(): void }>;
  typed(value: string | null, oid: number): unknown;
  options?: { transform?: { column?: { from?: unknown }; row?: { from?: unknown } } };
}

type RawResult = ArrayLike<(Buffer | null)[]> & { command?: string | null; columns?: { name: string; type: number }[] };

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

/* === values, as pg writes them === */

// prepareValue() and the functions it calls are node-postgres's, from lib/utils.js of pg 8.23.1
// (https://github.com/brianc/node-postgres/blob/pg%408.23.1/packages/pg/lib/utils.js), MIT licence,
// Copyright (c) 2010 - 2021 Brian Carlson: see LICENCE file. Left out: pg.defaults.parseInputDatesAsUTC, false by default,
// and the deprecation notice for an invalid Date, which is sent as pg sends it.

function escapeElement(elementRepresentation: string) {
  const escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '"' + escaped + '"';
}

// a JS array as a Postgres array literal, with a comma, which a type such as box doesn't take as separator
function arrayString(val: any[]): string {
  let result = '{';
  for (let i = 0; i < val.length; i++) {
    if (i > 0) result += ',';
    let item = val[i];
    if (item == null) {
      result += 'NULL';
    } else if (Array.isArray(item)) {
      result += arrayString(item);
    } else if (ArrayBuffer.isView(item)) {
      if (!(item instanceof Buffer)) item = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
      result += '\\\\x' + item.toString('hex');
    } else {
      result += escapeElement(prepareValue(item) as string);
    }
  }
  return result + '}';
}

function prepareValue(val: any, seen?: unknown[]): string | Buffer | null {
  if (val == null) return null;  // null and undefined are both null for Postgres
  if (typeof val === 'object') {
    if (val instanceof Buffer) return val;
    if (ArrayBuffer.isView(val)) return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
    if (utilTypes.isDate(val)) return dateToString(val);
    if (Array.isArray(val)) return arrayString(val);
    return prepareObject(val, seen);
  }
  return val.toString();
}

function prepareObject(val: any, seen?: unknown[]): string | Buffer | null {
  if (val && typeof val.toPostgres === 'function') {
    seen = seen || [];
    if (seen.indexOf(val) !== -1) throw new Error('circular reference detected while preparing "' + val + '" for query');
    seen.push(val);
    return prepareValue(val.toPostgres(prepareValue), seen);
  }
  return JSON.stringify(val);
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function dateToString(date: Date) {
  let offset = -date.getTimezoneOffset(), year = date.getFullYear();
  const isBCYear = year < 1;
  if (isBCYear) year = Math.abs(year) + 1;  // negative years are 1 off their BC representation

  let ret = pad(year, 4) + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2) + 'T' + pad(date.getHours(), 2) +
    ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3);

  if (offset < 0) {
    ret += '-';
    offset *= -1;
  } else {
    ret += '+';
  }
  ret += pad(Math.floor(offset / 60), 2) + ':' + pad(offset % 60, 2);
  if (isBCYear) ret += ' BC';
  return ret;
}

/* === asPool === */

// the type `unknown`, a NULL's too: Postgres infers the parameter's type from the query, as for pg's untyped
// parameters (see https://www.postgresql.org/docs/current/sql-prepare.html), and postgres.js sends the text as it is,
// having no serializer for it; a Buffer goes as the hex text of bytea, pg sending it in binary. One untyped parameter,
// and postgres.js 4 asks Postgres for the types, then serializes each value for its type: JSON text twice
const UNKNOWN = 705;

// no statement is named, as pg names none for a query with no name: postgres.js 4 runs a named statement that Postgres
// no longer has (26000, after a DEALLOCATE ALL) again, with each value serialized for the type Postgres then gives
const unnamed = { prepare: false }, unnamedExtended = { prepare: false, simple: false };

// pg keeps the tag's first word (`START` for `START TRANSACTION`), with this pattern of its lib/result.js
// (an empty query has none: null, as pg gives it, though pg types it string)
const commandOf = (tag: string | null | undefined) => tag == null ? null as unknown as string : /^([A-Za-z]+)/.exec(tag)?.[1] ?? tag;

// raw rows skip postgres.js's parsers, and its `types` option: each column is parsed by pg's own, by type oid
function resultOf(raw: RawResult): PostgresJsResult {
  const
    columns = raw.columns ?? [],
    parsers = columns.map(c => getTypeParser(c.type, 'text')),
    rows = Array.from(raw, values => {
      const row: Record<string, unknown> = {};
      columns.forEach((c, i) => { const v = values[i]; row[c.name] = v == null ? null : parsers[i](v.toString('utf8')); });
      return row;
    });
  return { rows, command: commandOf(raw.command) };
}

/**
 * Give pgcast's `run()` and `transaction()` a postgres.js `sql`, whose values are read and written as `pg` reads and
 * writes them, with `pg`'s parsers: `transaction()` runs its queries on a connection of `sql.reserve()`.
 * `.prepared(name)` runs the query unprepared, as every query.
 * @param sql The `sql` that `postgres()` returns, with no column or row transform: the adapter never configures nor
 * ends it
 */
export function asPool(sql: PostgresJsSql): PostgresJsPool {
  const transform = sql.options?.transform;
  if (transform?.column?.from || transform?.row?.from) throw new Error('asPool() needs a postgres.js sql with no column or row transform: pgcast reads the columns under the names Postgres gives them. Give it a postgres() of its own, without `transform`');

  const queryOn = (target: Unsafe) => async ({ text, values = [], name }: PostgresJsQuery): Promise<PostgresJsResult> => {
    const
      parameters = values.map(v => {
        const value = prepareValue(v);
        return sql.typed(value === null ? null : Buffer.isBuffer(value) ? '\\x' + value.toString('hex') : value, UNKNOWN);
      }),
      raw = await target.unsafe(text, parameters, name == null ? unnamed : unnamedExtended).raw();

    // several statements with no value give an array of results, as with pg
    const results = raw as unknown as RawResult[];
    return raw.command === undefined && raw.length > 0 && results[0]?.command !== undefined ?
      results.map(resultOf) as unknown as PostgresJsResult :
      resultOf(raw);
  };

  return {
    query: queryOn(sql),
    connect: async () => {
      const reserved = await sql.reserve();
      return { query: queryOn(reserved), release: () => reserved.release() };
    },
  };
}

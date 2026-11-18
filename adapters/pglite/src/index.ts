/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import { getTypeParser } from 'pg-types';

/* === types === */

// structural, so that neither pgcast nor PGlite is imported: a PGlite of 0.5.x, or its PGliteWorker, fits them

/** A message PGlite reads from Postgres's reply, as `execProtocol()` gives it. */
interface Message { name: string }

/** The `PGlite` (0.5.x), as `asPool()` uses it. */
export interface PGliteLike {
  readonly waitReady: Promise<void>;
  readonly closed: boolean;
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  execProtocol(message: Uint8Array): Promise<{ messages: Message[] }>;
}

/** The query object pgcast's `run()` passes: `pg`'s. */
export type PGliteQuery = { text: string; values: any[]; name?: string };
/** What a query resolves to: the rows, as `pg` parses them, and the command tag, as `pg` gives it. */
export type PGliteResult = { rows: any[]; command: string };

/** The PGlite's one connection, held by `connect()` until `release()`. */
export interface PGliteClient {
  query: (query: PGliteQuery) => Promise<PGliteResult>;
  release: () => void;
}

/** What `asPool()` gives, which `run()` and `transaction()` take: a pool of one connection. */
export interface PGlitePool {
  query: (query: PGliteQuery) => Promise<PGliteResult>;
  connect: () => Promise<PGliteClient>;
}

/* === values, as pg writes them === */

// prepareValue() and the functions it calls are node-postgres's, from lib/utils.js of pg 8.23.1
// (https://github.com/brianc/node-postgres/blob/pg%408.23.1/packages/pg/lib/utils.js), MIT licence,
// Copyright (c) 2010 - 2021 Brian Carlson: see LICENCE file. Left out: pg.defaults.parseInputDatesAsUTC, false by default,
// and the deprecation notice for an invalid Date, which is sent as pg sends it. Node's built-ins are left out too, so
// that it runs in a page: util.types.isDate() is the tag check below, a Buffer an ArrayBuffer view, sent as its bytes.

const
  isDate = (v: unknown) => Object.prototype.toString.call(v) === '[object Date]',
  bytesOf = (v: ArrayBufferView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
  hexOf = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function escapeElement(elementRepresentation: string) {
  const escaped = elementRepresentation.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return '"' + escaped + '"';
}

// a JS array as a Postgres array literal, with a comma, which a type such as box doesn't take as separator
function arrayString(val: any[]): string {
  let result = '{';
  for (let i = 0; i < val.length; i++) {
    if (i > 0) result += ',';
    const item = val[i];
    if (item == null) {
      result += 'NULL';
    } else if (Array.isArray(item)) {
      result += arrayString(item);
    } else if (ArrayBuffer.isView(item)) {
      result += '\\\\x' + hexOf(bytesOf(item));
    } else {
      result += escapeElement(prepareValue(item) as string);
    }
  }
  return result + '}';
}

function prepareValue(val: any, seen?: unknown[]): string | Uint8Array | null {
  if (val == null) return null;  // null and undefined are both null for Postgres
  if (typeof val === 'object') {
    if (ArrayBuffer.isView(val)) return bytesOf(val);
    if (isDate(val)) return dateToString(val);
    if (Array.isArray(val)) return arrayString(val);
    return prepareObject(val, seen);
  }
  return val.toString();
}

function prepareObject(val: any, seen?: unknown[]): string | Uint8Array | null {
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

/* === messages, as pg sends them === */

// the frontend messages pg sends, in the wire protocol of Postgres
// (https://www.postgresql.org/docs/current/protocol-message-formats.html): a type byte, then the length of the rest.
// PGlite exports its own serializer, but only from its whole module: a CommonJS adapter would load PGlite's
// CommonJS build (522 KB) beside the ES module the user imports

const encoder = new TextEncoder();

const
  int16 = (n: number) => new Uint8Array([n >> 8 & 0xff, n & 0xff]),
  int32 = (n: number) => new Uint8Array([n >> 24 & 0xff, n >> 16 & 0xff, n >> 8 & 0xff, n & 0xff]),
  cstring = (s: string) => encoder.encode(s + '\0');

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

const message = (type: string, ...parts: Uint8Array[]) => {
  const body = concat(parts);
  return concat([new Uint8Array([type.charCodeAt(0)]), int32(body.length + 4), body]);
};

const
  queryMessage = (text: string) => message('Q', cstring(text)),
  parseMessage = (name: string, text: string) => message('P', cstring(name), cstring(text), int16(0)),  // types left to Postgres
  describePortal = message('D', new Uint8Array([0x50]), cstring('')),
  executePortal = message('E', cstring(''), int32(0)),
  sync = message('S');

// each value in text, or in binary for its bytes, as pg's Bind sends them; the columns all in text
function bindMessage(name: string, values: (string | Uint8Array | null)[]) {
  const formats: Uint8Array[] = [], parameters: Uint8Array[] = [];
  for (const value of values) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    formats.push(int16(value instanceof Uint8Array ? 1 : 0));
    parameters.push(...bytes === null ? [int32(-1)] : [int32(bytes.length), bytes]);
  }
  return message('B', cstring(''), cstring(name), int16(values.length), ...formats, int16(values.length), ...parameters, int16(0));
}

/* === results, as pg reads them === */

type RowDescription = Message & { fields: { name: string; dataTypeID: number }[] };
type DataRow = Message & { fields: (string | null)[] };
type CommandComplete = Message & { text: string };

// pg keeps the tag's first word (`START` for `START TRANSACTION`), with this pattern of its lib/result.js
// (an empty query has none: null, as pg gives it, though pg types it string)
const commandOf = (tag: string | null) => tag == null ? null as unknown as string : /^([A-Za-z]+)/.exec(tag)?.[1] ?? tag;

// the text of each column, parsed by pg's own parsers, by type oid: PGlite's never see it
function resultsOf(messages: Message[]) {
  const results: PGliteResult[] = [];
  let columns: RowDescription['fields'] = [], parsers: ((text: string) => unknown)[] = [], rows: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (m.name === 'rowDescription') {
      columns = (m as RowDescription).fields;
      parsers = columns.map(c => getTypeParser(c.dataTypeID, 'text'));
    } else if (m.name === 'dataRow') {
      const row: Record<string, unknown> = {};
      (m as DataRow).fields.forEach((v, i) => { row[columns[i].name] = v === null ? null : parsers[i](v); });
      rows.push(row);
    } else if (m.name === 'commandComplete' || m.name === 'emptyQuery') {
      results.push({ rows, command: commandOf(m.name === 'emptyQuery' ? null : (m as CommandComplete).text) });
      columns = []; parsers = []; rows = [];
    }
  }
  return results;
}

/* === asPool === */

// what the adapter keeps for each PGlite, whichever asPool() gave its pool: the statements prepared under a name,
// and the end of the queue for its one connection
type State = { prepared: Map<string, string>; tail: Promise<void> };
const states = new WeakMap<PGliteLike, State>();

function stateOf(pglite: PGliteLike) {
  let state = states.get(pglite);
  if (!state) states.set(pglite, state = { prepared: new Map(), tail: Promise.resolve() });
  return state;
}

// the connection, once each holder before has released it: in turn, as a pg.Pool with max: 1 gives it
function acquire(state: State) {
  let release!: () => void;
  const turn = state.tail;
  state.tail = new Promise<void>(resolve => { release = resolve; });
  return turn.then(() => release);
}

/**
 * Give pgcast's `run()` and `transaction()` a `PGlite`, whose values are read and written as `pg` reads and writes
 * them, with `pg`'s parsers: each query goes to Postgres as `pg` sends it, through `execProtocol()`. The pool has
 * the PGlite's one connection: `connect()` waits for the `release()` before, and a query on the pool waits too.
 * `.prepared(name)` prepares the query once on that PGlite, as `pg` does on a connection.
 * @param pglite The `PGlite`, or its `PGliteWorker`: the adapter never configures nor closes it
 */
export function asPool(pglite: PGliteLike): PGlitePool {
  if (typeof pglite?.execProtocol !== 'function' || typeof pglite.runExclusive !== 'function') throw new Error('asPool() needs a PGlite with execProtocol() and runExclusive(), to send each query as pg sends it on its one connection: give it the PGlite that PGlite.create() or new PGlite() returns, not a transaction\'s');
  const state = stateOf(pglite);

  const run = async ({ text, values = [], name }: PGliteQuery): Promise<PGliteResult> => {
    // PGlite's own query() says so, where execProtocol() of a closed PGlite throws a TypeError, or blocks on 0.5.5
    if (pglite.closed) throw new Error('PGlite is closed');
    await pglite.waitReady;

    // pg sends a query with no value and no name as a simple Query, which may hold several statements
    if (values.length === 0 && name == null) return resultOf(await send(queryMessage(text)));

    const parameters = values.map(v => prepareValue(v));
    return pglite.runExclusive(async () => {
      // read here, so that a query sent at the same moment under the same name sees the parse of the first
      const previous = name == null ? undefined : state.prepared.get(name);
      if (previous !== undefined && previous !== text) throw new Error(`Prepared statements must be unique - '${name}' was used for a different statement`);
      if (name != null && previous === undefined) {
        // prepared once, as pg prepares it once a parse completes, even if the query then fails
        await pglite.execProtocol(concat([parseMessage(name, text), sync]));
        state.prepared.set(name, text);
      }
      const parse = name == null ? [parseMessage('', text)] : [];
      return resultOf((await pglite.execProtocol(concat([...parse, bindMessage(name ?? '', parameters), describePortal, executePortal, sync]))).messages);
    });
  };

  const send = async (bytes: Uint8Array) => (await pglite.runExclusive(() => pglite.execProtocol(bytes))).messages;

  // several statements give an array of results, as with pg
  const resultOf = (messages: Message[]) => {
    const results = resultsOf(messages);
    return results.length === 1 ? results[0] : results as unknown as PGliteResult;
  };

  return {
    query: async query => {
      const release = await acquire(state);
      try { return await run(query); } finally { release(); }
    },
    connect: async () => {
      const release = await acquire(state);
      let released = false;
      return {
        query: query => released ? Promise.reject(new Error('query() on a client after its release(): connect() again')) : run(query),
        release: () => {
          if (released) throw new Error('Release called on client which has already been released to the pool.');  // pg-pool's
          released = true;
          release();
        },
      };
    },
  };
}

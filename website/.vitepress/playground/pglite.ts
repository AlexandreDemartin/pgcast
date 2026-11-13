// Copyright (C) 2026 Alexandre Demartin
// Postgres in the playground's worker (decision 005): PGlite, with `pg`'s parsers, as a `pg.Pool` of one connection.
// run.worker.ts imports it on a Run only, so that a reader who only edits never downloads Postgres; run-examples.mjs
// checks in Node that it parses the docs schema's types as `pg` does.
import { PGlite, types, type ParserOptions, type Results } from '@electric-sql/pglite';

const
  // `pg`'s `Buffer` from PGlite's bytes: in the playground, globals.ts's stand-in, a `Uint8Array` too
  buffer = (text: string) => Object.setPrototypeOf(types.parsers[types.BYTEA]!(text), Buffer.prototype),
  // `infinity` and `-infinity` as `pg` gives them, numbers, where PGlite 0.5.13 makes an invalid `Date`
  infinite = (parse: (text: string) => unknown) => (text: string) =>
    text === 'infinity' ? Infinity : text === '-infinity' ? -Infinity : parse(text),
  // midnight where the code runs, as `pg` makes a `date`, where PGlite makes it in UTC
  date = (text: string) => {
    const [, year, month, day, bc] = /^(\d+)-(\d\d)-(\d\d)( BC)?$/.exec(text) ?? [];
    if (year === undefined) return text;
    const parsed = new Date(+year, +month! - 1, +day!);
    parsed.setFullYear(bc ? 1 - +year : +year);  // the year 50 is not 1950
    return parsed;
  },
  point = (text: string) => {
    const [x, y] = text.slice(1, -1).split(',');
    return { x: parseFloat(x!), y: parseFloat(y!) };
  };

/**
 * `pg`'s parsers, for the types PGlite parses otherwise: an `int8` is a string in `pg` (a number or a `bigint` in
 * PGlite), a `bytea` a `Buffer`, a `date` local, a `point` `{ x, y }`, an infinite date or timestamp a number. PGlite
 * parses an array of each with its element's parser. `interval` and `circle`, which the docs schema does not use, stay
 * text here.
 */
export const parsers: ParserOptions = {
  20: text => text, 17: buffer, 600: point, 1082: infinite(date),
  1114: infinite(types.parsers[types.TIMESTAMP]!), 1184: infinite(types.parsers[types.TIMESTAMPTZ]!),
};

/** Postgres in memory, with `pg`'s parsers, on `schema`. */
export async function open(schema: string) {
  const pglite = await PGlite.create({ parsers });
  // a `numeric[]` holds numbers in `pg`, though its `numeric` is a string: set once PGlite has set each array's own
  pglite.parsers[1231] = text => types.arrayParser(text, parseFloat, 1231);
  await pglite.exec(schema);
  return pglite;
}

/** A query as `zapatos/db` gives it to `pg`. */
export interface QueryConfig { text: string; values?: unknown[] }

/**
 * A `pg.Pool` of one connection, as `new pg.Pool({ max: 1 })`: PGlite "only has a single exclusive connection".
 * `connect()` waits for the client before it to be released, and a query on the pool for the client in use; every
 * query goes to `send`.
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
    async query(query: QueryConfig) {
      const release = await take();
      try {
        return await send(query);
      } finally {
        release();
      }
    },
    async connect() {
      return { query: send, release: await take() };
    },
  };
}

# @pgcast/adapter-pglite

Run [pgcast](https://pgcast.dev/)'s queries and transactions on a [PGlite](https://pglite.dev/) 0.5.x, the Postgres that runs in Node or in a page. Values are read and written as `pg` reads and writes them, so the types pgcast generates from your schema hold: a `timestamptz` is a `Date`, a `bigint` a string, an `interval` an object.

Version 0.1.0. MIT licence.

## Install

```sh
npm install @pgcast/adapter-pglite @electric-sql/pglite
```

pgcast is installed as usual (`@pgcast/pgcast`, or `zapatos@npm:@pgcast/pgcast`), and generates its types from a Postgres that has your schema. The adapter imports neither pgcast nor PGlite: its types are structural, so it works with `zapatos/*` and `pgcast/*` module names alike.

## Use

```ts
import { PGlite } from '@electric-sql/pglite';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import { asPool } from '@pgcast/adapter-pglite';

const pglite = await PGlite.create();  // in memory; or a directory, or 'idb://cinema' in a page
await pglite.exec(schema);             // the schema pgcast generated its types from
const pool = asPool(pglite);

const titles = await db.select('films', { release_year: 1999 }, { columns: ['title'] }).run(pool);
// SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "title") AS result
// FROM "films" WHERE ("release_year" = $2)) AS "sq_films"   -- values: ['title', 1999]

const screenings = await db.sql<s.screenings.SQL, s.screenings.Selectable[]>`
  SELECT * FROM ${'screenings'} WHERE ${{ film_id: 7 }}`.run(pool);
// screenings[0].starts_at is a Date, as with pg

await db.serializable(pool, async txn => {
  const taken = await db.count('seat_bookings', { screening_id: 12, seat: 'F12' }).run(txn);
  if (taken === 0) await db.insert('seat_bookings', { screening_id: 12, seat: 'F12', customer: 'Ada' }).run(txn);
});
```

- `asPool(pglite)` never creates, configures nor closes the PGlite: you do, as with a `pg.Pool`, which Zapatos "doesn't manage" for you either. It takes the PGlite that `PGlite.create()` or `new PGlite()` returns, and throws on the `tx` of `pglite.transaction()`, which has no `execProtocol()`.
- `run(pool)` sends each query as `pg` sends it, through `execProtocol()`: with no value and no name, a simple `Query`, which may hold several statements; otherwise `Parse`, `Bind`, `Describe`, `Execute` and `Sync`. `.prepared(name)` parses the query once on that PGlite, as `pg` does once on a connection, whichever `asPool()` gave the pool; an empty name is no name, as in `pg`.
- The pool has the PGlite's one connection. `transaction()` and its shortcuts (`serializable()`…) take it with `connect()`, in turn, run `START TRANSACTION`, the callback and `COMMIT` on it, retry on a 40001 or a 40P01, and `release()` it at the end. Meanwhile a query on the pool waits, as with a `pg.Pool` with `max: 1`.
- In a page, the adapter imports no Node built-in, but `pg`'s parser for a `bytea` reads a global `Buffer` as it loads: set `globalThis.Buffer` (the `buffer` package's) in a module imported before the adapter.

## What it reads

Each column is parsed by its type with `pg`'s own parsers ([pg-types](https://github.com/brianc/node-pg-types) 2, which `pg` 8 uses), from the text that `execProtocol()` returns. PGlite's parsers never see it: neither its `parsers` option nor `refreshArrayTypes()` reaches pgcast's rows. Where PGlite's own `query()` parses otherwise:

| Type | `pg`, and the adapter | PGlite's `query()` and `exec()` |
|---|---|---|
| `int8`, a domain over it, `int8[]` | a string | a number up to 2^53, a `bigint` beyond |
| `numeric[]` | numbers, as `pg` parses them | strings |
| `bytea`, `bytea[]` | a Buffer | a Uint8Array |
| `date`, `date[]` | local midnight; BC; the year 99 | UTC midnight; an invalid `Date` for BC |
| `timestamp`, `timestamp[]` | a `Date` in local time; `±Infinity`; BC; the year 99 | the same `Date`, but an invalid `Date` for `infinity` (up to 0.5.13) and BC, 1999 for the year 99 |
| `timestamptz`, `timestamptz[]` | a `Date`; `±Infinity`; BC; an offset in seconds (1900 in Paris) | an invalid `Date` for `infinity` (up to 0.5.13), BC and an offset in seconds |
| `interval`, `interval[]` | an object (`db.PostgresInterval`) | its text |
| `point`, `circle`, `point[]` | `{ x, y }`, `{ x, y, radius }` | their text |
| `box[]`, `circle[]`, `tstzrange[]` | the array's text | an array of texts |
| an array of an enum, after `refreshArrayTypes()` | its text, `'{writer,editor}'` (see `enumArraysTypedAsText`) | an array |

The others (`int2`, `int4`, `float8`, `numeric` as a string, `bool`, `json`, `jsonb`, `uuid`, `time`, ranges, enums, domains, composites, `text[]`, `jsonb[]`…) are the same in both. Its tests read each of these, and each column of a table of every type, through `pg` and through the adapter.

## What it writes

Each value is prepared as `pg` prepares it (its `prepareValue()`: a `Date` in local time with its offset, an array as an array literal, an object as JSON, `toPostgres()`, `undefined` as `NULL`), then sent in text, a Buffer or a Uint8Array in binary, as `pg` sends them; Postgres infers each type from the query. PGlite's `query()` serializes each value for the type Postgres asks for instead, so:

| Value | `pg`, and the adapter | PGlite's `query()` |
|---|---|---|
| a `Date` for a `timestamp`, a `date` or a `text` | local time, local day | UTC time, UTC day |
| an object, `toPostgres()`, for a `text` | its JSON; its value | `[object Object]` |
| an array for a `jsonb` | 22P02, an array literal | its JSON |
| an object for a domain over `jsonb`; an array for an enum's array or a domain over `text[]` | stored | 22P02 |
| `'\x…'` for a `bytea`; `'tr'` for a `bool` | those bytes; `true` | an error with no SQLSTATE |
| a Buffer for a `text`; for a `jsonb` | its bytes; XX000, as binary `jsonb` | its UTF-8 text; `{"type":"Buffer",…}` |
| a Uint8Array for a `text` | its bytes, `hi` | `104,105` |
| `Infinity` for a `timestamp`; an invalid `Date` | `infinity`; 22007 | a `RangeError` (`Infinity`: up to 0.5.13) |

## How it differs from pg

- **PGlite's own `query()` and `exec()`** share the one connection without waiting for the pool: inside a `transaction()` of the adapter, they run in it, see its rows before `COMMIT`, and are rolled back with it. Run a transaction's queries on its client only.
- **PGlite's own `transaction()`** sends its `BEGIN` and `COMMIT` on that connection too, so one transaction ends the other. Inside a `transaction()` of the adapter, its `COMMIT` commits the adapter's writes, and the adapter's `ROLLBACK` then finds no transaction. Inside an open PGlite `transaction()`, `run(pool)` runs in it and sees its rows; a `transaction()` of the adapter runs in it and its `COMMIT` commits it, or, at another isolation level once it ran a query, rejects with 25001 and its `ROLLBACK` ends it. Never open one inside the other.
- **`run(pool)` inside a `transaction()`** waits forever for the connection that transaction holds, as with a `pg.Pool` with `max: 1`: run it on the transaction's client.
- **A 40001 or a 40P01** from two transactions at once can't happen, with one connection; `transaction()` still retries one that a query raises.
- **A nested transaction**: `transaction()` passes the client of a transaction given to it through, but TypeScript wants it cast to the level's `TxnClient…` (#702).
- **Errors** are PGlite's `DatabaseError`, with `pg`'s fields (`code`, `detail`, `constraint`…), so `db.isDatabaseError()` and the retry of `transaction()` work. A closed PGlite rejects with PGlite's `PGlite is closed`.
- **`pg.types.setTypeParser()`** changes the adapter's parsing too when npm installs one `pg-types` for both.
- **A `PGliteWorker`** fits `asPool()`'s types, but the tests run on a `PGlite` only.

## Development

The tests run with the repository root's install (Vitest, Vite, TypeScript, `pg`) and test helpers. Each compares `pg`, on the fixture's database (`TEST_DATABASE_URL`, as for the root's tests), with the adapter on a PGlite that loaded the same fixture, with Node in the Asia/Tokyo time zone:

```sh
npm ci && npm run build   # at the repository root
cd adapters/pglite
npm ci
npm test                  # the tables above, the shortcuts, prepared queries and transactions
npm run test:types        # the tests, and asPool() against the root's db.d.ts
npm run check:browser     # dist/ bundled for a page, with no Node built-in
```

CI runs them on PGlite 0.5.0, 0.5.13 and the lockfile's version, on Postgres 14 and 18.

## Publishing

The owner publishes it, apart from pgcast, under its own version:

```sh
npm ci && npm run build   # at the repository root
cd adapters/pglite
npm ci && npm test && npm run test:types && npm run check:browser
npm pack --dry-run        # dist/, README.md, LICENCE, package.json
npm publish --access public
```

`prepack` builds `dist/`. The first publish of a scoped package needs `--access public`.

## Licence

MIT. `prepareValue()` is node-postgres's, under its MIT licence: see [LICENCE](LICENCE).

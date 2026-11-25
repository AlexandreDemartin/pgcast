# @pgcast/adapter-pglite

Run [pgcast](https://pgcast.dev/)'s queries and transactions on a [PGlite](https://pglite.dev/) 0.5.x, the Postgres that runs in Node or in a page. Values are read with `pg`'s parsers and written as `pg` writes them, with [exceptions](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-writes), so the types pgcast generates from your schema hold: a `timestamptz` is a `Date`, a `bigint` a string, an `interval` an object.

[Changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/adapters/pglite/CHANGELOG.md). MIT licence.

## Install

```sh
npm install zapatos@npm:@pgcast/pgcast@^7 pg @pgcast/adapter-pglite @electric-sql/pglite
```

For `pgcast/db`, install `pgcast@npm:@pgcast/pgcast@^7` in place of the `zapatos` alias. Set [`moduleNames`](https://pgcast.dev/generator#generate.moduleNames) to `"pgcast"`. Generate the types from a Postgres database with your schema. The adapter imports neither pgcast nor PGlite. Its types fit either alias.

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
// SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "title") AS result
// FROM "films" WHERE ("release_year" = $2)) AS "sq_films"   -- values: ['title', 1999]

const screenings = await db.sql<s.screenings.SQL, s.screenings.Selectable[]>`
  SELECT * FROM ${'screenings'} WHERE ${{ film_id: 7 }}`.run(pool);
// screenings[0].starts_at is a Date, as with pg

await db.serializable(pool, async txn => {
  const taken = await db.count('seat_bookings', { screening_id: 12, seat: 'F12' }).run(txn);
  if (taken === 0) await db.insert('seat_bookings', { screening_id: 12, seat: 'F12', customer: 'Ada' }).run(txn);
});
```

- To check its types, set `skipLibCheck: true` in your tsconfig: PGlite's own declarations fail without it (`Cannot find namespace 'Emscripten'`).
- `asPool(pglite)` never creates, configures nor closes the PGlite: you do, as with a `pg.Pool`, which Zapatos "doesn't manage" for you either. It takes the PGlite that `PGlite.create()` or `new PGlite()` returns, and throws on the `tx` of `pglite.transaction()`, which has no `execProtocol()`.
- `run(pool)` sends each query as `pg` sends it, through `execProtocol()`: with no value and no name, a simple `Query`, which may hold several statements; otherwise `Parse`, `Bind`, `Describe`, `Execute` and `Sync`. `.prepared(name)` parses the query once on that PGlite, as `pg` does once on a connection, whichever `asPool()` gave the pool; an empty name is no name, as in `pg`.
- `COPY … FROM STDIN` gets `pg`'s answer, a `CopyFail`, so it rejects with 57014 and the next query runs.
- The pool has the PGlite's one connection. `transaction()` and its shortcuts (`serializable()`…) take it with `connect()`, in turn, run `START TRANSACTION`, the callback and `COMMIT` on it, retry on a 40001 or a 40P01, and `release()` it at the end. A query on the pool waits for that connection. [Native PGlite calls](#how-it-differs-from-pg) can run before the adapter releases it.
- In a page, the adapter imports no Node built-in, but `pg`'s parser for a `bytea` reads a global `Buffer` as it loads. For `zapatos/db` too, follow [In a page](#in-a-page).

## In a page

`zapatos/db` is written for Node. Bundled for a browser as it is, it fails: it imports `pg` for `instanceof pg.Pool`, and `pg` needs `net`, `tls`, `dns` and `global`. It also reads `Buffer` at import (`toBuffer()`, `Buffer.isBuffer` and `Buffer.byteLength`), and PGlite's `bytea` needs a complete one. This recipe gives it both:

```ts
// buffer-global.ts
import { Buffer } from 'buffer';  // the `buffer` package, not a Node built-in
globalThis.Buffer = Buffer;
```

```ts
// pg-stub.ts: the two classes zapatos/db tests with instanceof; the adapter's pool never is one
export class Pool {}
export class Client {}
```

```ts
// main.ts: Buffer first, so that the modules after it find it
import './buffer-global';
import * as db from 'zapatos/db';
import { PGlite } from '@electric-sql/pglite';
import { asPool } from '@pgcast/adapter-pglite';

const pool = asPool(new PGlite('idb://cinema'));
```

```sh
npm install buffer
esbuild main.ts --bundle --platform=browser --format=esm --external:node:module --alias:pg=./pg-stub.ts --outfile=out.js
cp node_modules/@electric-sql/pglite/dist/{pglite.wasm,initdb.wasm,pglite.data} .
```

Load `out.js` with `<script type="module">` from the folder of PGlite's three files, where PGlite finds them; to serve them elsewhere, pass them to `PGlite.create()` ([PGlite's esbuild notes](https://pglite.dev/docs/bundler-support#esbuild)). `--external:node:module` keeps PGlite's import of it, which runs only in Node. Any bundler that aliases `pg` does the same for `zapatos/db`.

Tested: these blocks as written, the page served over http to Chrome 157, then a transaction with a parameter, an insert and a `bytea` read on `idb://cinema`, with esbuild 0.28.2, `buffer` 6.0.3, PGlite 0.5.16 and pgcast 7.1.1. `npm run check:browser` checks the `zapatos/db` part on each change: `db.mjs` and the adapter bundled by Vite with `pg` aliased, then the same transaction on a PGlite made in Node, given Node's `Buffer` and no `process` nor `require`.

- With no alias, the bundle imports Node's `net`, `tls`, `dns`, `fs`, `crypto`… With the alias and no `Buffer`, loading throws `Buffer is not defined`.
- A partial `Buffer` is not enough: one with no working `Buffer.from` fails on a `bytea` (the playground's stand-in throws there on purpose).
- Untested: Deno, Bun and edge runtimes (Cloudflare Workers, Vercel Edge).

## What it reads

Each column is parsed by its type with `pg`'s own parsers ([pg-types](https://github.com/brianc/node-pg-types) 2, which `pg` 8 uses), from the text that `execProtocol()` returns. PGlite's parsers never see it: neither its `parsers` option nor `refreshArrayTypes()` reaches pgcast's rows. Where PGlite's own `query()` parses otherwise:

| Type | `pg`, and the adapter | PGlite's `query()` and `exec()` |
|---|---|---|
| `int8`, a domain over it, `int8[]` elements | a string | a number from −(2^53−1) to 2^53−1 inclusive, a `bigint` outside that range |
| `numeric[]` | numbers, as `pg` parses them | strings |
| `bytea`, `bytea[]` elements | a Buffer | a Uint8Array |
| `date`, `date[]` elements | local midnight; BC; the year 99 | UTC midnight; an invalid `Date` for BC |
| `timestamp`, `timestamp[]` elements | a `Date` in local time; `±Infinity`; BC; the year 99 | the same `Date`, but an invalid `Date` for `infinity` (up to 0.5.13) and BC, 1999 for the year 99 |
| `timestamptz`, `timestamptz[]` elements | a `Date`; `±Infinity`; BC; an offset in seconds (1900 in Paris) | an invalid `Date` for `infinity` (up to 0.5.13), BC and an offset in seconds |
| `interval`, `interval[]` elements | an object (`db.PostgresInterval`) | its text |
| `point`, `circle`, `point[]` elements | `{ x, y }`, `{ x, y, radius }` | their text |
| `box[]`, `circle[]`, `tstzrange[]` | the array's text | an array of texts |
| an array of an enum, after `refreshArrayTypes()` | its text, `'{writer,editor}'` (see `enumArraysTypedAsText`) | an array |

The others (`int2`, `int4`, `float8`, `numeric` as a string, `bool`, `json`, `jsonb`, `uuid`, `time`, ranges, enums, domains, composites, `text[]`, `jsonb[]`…) are the same in both. Its tests read each of these, and each column of a table of every type, through `pg` and through the adapter.

## What it writes

The adapter writes a `Date` parameter or Postgres array element in local time with its offset, matching `pg`'s default (`pg.defaults.parseInputDatesAsUTC = false`). A `Date` inside a JSON object becomes an ISO string in UTC.

Like `pg`'s `prepareValue()`, the adapter writes arrays as array literals, objects as JSON, `toPostgres()` as its return value and `undefined` as `NULL`.

It sends a prepared value in binary if it is an `ArrayBuffer` view (including a `DataView`), and other non-null values in text. Postgres infers each type from the query. PGlite's `query()` serialises each value for the type Postgres asks for instead:

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

- **PGlite's own `query()` and `exec()`** can run before the adapter releases the connection. Inside an adapter `transaction()`, they see its rows before `COMMIT` and are rolled back with it. Run a transaction's queries on its client only.
- **PGlite's own `transaction()`** sends its `BEGIN` and `COMMIT` on that connection too, so one transaction ends the other. Inside a `transaction()` of the adapter, its `COMMIT` commits the adapter's writes, and the adapter's `ROLLBACK` then finds no transaction. Inside an open PGlite `transaction()`, `run(pool)` runs in it and sees its rows; a `transaction()` of the adapter runs in it and its `COMMIT` commits it, or, at another isolation level once it ran a query, rejects with 25001 and its `ROLLBACK` ends it. Never open one inside the other.
- **`run(pool)` inside a `transaction()`** waits forever for the connection that transaction holds, as with a `pg.Pool` with `max: 1`: run it on the transaction's client. So do a nested `transaction()` given the pool rather than its client, and a `connect()` whose client is never released, with every later `run(pool)` and `transaction()` behind them: no timeout ends the wait, as with `pg.Pool`'s default `connectionTimeoutMillis: 0`.
- **A 40001 or a 40P01** from two transactions at once can't happen, with one connection; `transaction()` still retries one that a query raises.
- **A nested transaction** takes the outer callback's client without a cast from pgcast 6.12.0 (#702). Its callback gets that client only if the marked outer level satisfies the request; through 7.x, also with `transactionRequiresSatisfyingLevel` off, which 8.0 removes.
- **Errors** are PGlite's `DatabaseError`, with `pg`'s fields (`code`, `detail`, `constraint`…), so `db.isDatabaseError()` and the retry of `transaction()` work. A closed PGlite rejects with PGlite's `PGlite is closed`. A query sent about when `close()` is called may run first or find PGlite closed, as PGlite's version and what runs between the two calls decide: the adapter gives its row, or rejects with `PGlite gave no result: was it closed while the query waited?`, never no rows.
- **`pg.types.setTypeParser()`** changes the adapter's parsing too when npm installs one `pg-types` for both.
- **A `PGliteWorker`** fits `asPool()`'s types, but is not tested: nothing checks that an error keeps its `code` across `postMessage()`, that a name `.prepared()` kept still exists after another tab becomes the leader, nor that one tab's transaction keeps another's queries out.

## Development

The tests run with the repository root's install (Vitest, Vite, TypeScript, `pg`) and test helpers. Each compares `pg`, on the fixture's database (`TEST_DATABASE_URL`, as for the root's tests), with the adapter on a PGlite that loaded the same fixture, with Node in the Asia/Tokyo time zone, and the parameters again in America/St_Johns:

```sh
npm ci && npm run build   # at the repository root
cd adapters/pglite
npm ci
npm test                  # the tables above, the shortcuts, prepared queries and transactions
npm run test:types        # the tests, and asPool() against the root's db.d.ts
npm run build             # dist/, which check:browser reads
npm run check:browser     # dist/, then zapatos/db with it, bundled for a page with no Node built-in and run given only TextEncoder and Buffer
```

CI runs them on PGlite 0.5.0, 0.5.13 and the lockfile's version, on Postgres 14, 18 and 19.

## Publishing

Follow the [owner setup and first publication](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/WORKFLOW.md#owner-setup) once for `@pgcast/adapter-pglite`.

For each later release, the owner pushes `@pgcast/adapter-pglite@<version>` on the merged version commit and approves the `npm` deployment. The workflow builds and publishes this adapter with provenance.

## Licence

MIT. `prepareValue()` is node-postgres's, under its MIT licence: see [LICENCE](https://github.com/AlexandreDemartin/pgcast/blob/master/adapters/pglite/LICENCE).

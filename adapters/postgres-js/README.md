# @pgcast/adapter-postgres-js

Run [pgcast](https://pgcast.dev/)'s queries and transactions on a [postgres.js](https://github.com/porsager/postgres) `sql`, 3.4 or 4.x. Values are read and written as `pg` reads and writes them, so the types pgcast generates from your schema hold: a `timestamptz` is a `Date`, a `bigint` a string, a `jsonb` its parsed value.

Version 0.1.0. MIT licence.

## Install

```sh
npm install @pgcast/adapter-postgres-js postgres
```

pgcast is installed as usual (`@pgcast/pgcast`, or `zapatos@npm:@pgcast/pgcast`). The adapter imports neither pgcast nor postgres.js: its types are structural, so it works with `zapatos/*` and `pgcast/*` module names alike.

## Use

```ts
import postgres from 'postgres';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
import { asPool } from '@pgcast/adapter-postgres-js';

const sql = postgres(process.env.DATABASE_URL!);
const pool = asPool(sql);

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

- `asPool(sql)` never creates, configures nor ends `sql`: you do, as with a `pg.Pool`, which Zapatos "doesn't manage" for you either. It takes the `sql` that `postgres()` returns, and throws on a transaction's or a reserved connection's, which has no `reserve()`.
- `run(pool)` runs each query with `sql.unsafe()`, unprepared, on whichever connection postgres.js picks. `transaction()` and its shortcuts (`serializable()`…) take a connection with `sql.reserve()`, run `START TRANSACTION`, the callback and `COMMIT` on it, retry on a 40001 or a 40P01, and `release()` it at the end.
- postgres.js 4 is an ES module only: `import postgres from 'postgres'`, or, from CommonJS on Node 20.19 or 22.12 and later, `require('postgres').default`. The adapter is CommonJS and takes either major.

## What it reads

Each column is parsed by its type with `pg`'s own parsers ([pg-types](https://github.com/brianc/node-pg-types) 2, which `pg` 8 uses), from the rows postgres.js gives raw. Its `types` option and its own parsers never reach pgcast's rows, nor would a value transform, which `asPool()` refuses. Where postgres.js parses otherwise by default:

| Type | `pg`, and the adapter | postgres.js 3.4 | postgres.js 4.x |
|---|---|---|---|
| `timestamp` | a `Date` in local time; `±Infinity` | the same, but an invalid `Date` for `infinity` and BC, 1999 for the year 99 | a `Date` in UTC |
| `timestamptz` | a `Date`; `±Infinity` | an invalid `Date` for `infinity`, BC, and an offset in seconds (1900 in Paris) | the same as `pg` |
| `date` | local midnight | UTC midnight | UTC midnight |
| `interval` | an object (`db.PostgresInterval`) | its text | its text |
| `point`, `circle` | `{ x, y }`, `{ x, y, radius }` | their text | their text |
| an array with a `NULL` | `null` | `'NULL'`, `false` for a `bool[]`, an empty Buffer for a `bytea[]`; a `json[]` throws | `null` |
| `numeric[]` | numbers, as `pg` parses them | strings | strings |
| `interval[]`, `point[]` | objects | strings | strings |
| an array of an enum, a domain or a composite | its text, `'{writer,editor}'` (see `enumArraysTypedAsText`) | an array | an array |

The others (`int2`, `int4`, `float8`, `int8` and `numeric` as strings, `bool`, `json`, `jsonb`, `bytea`, `uuid`, `time`, ranges, enums, domains…) are the same in all three. Its tests read each of these, and each column of a table of every type, through `pg` and through the adapter.

## What it writes

Each value is prepared as `pg` prepares it (its `prepareValue()`: a `Date` in local time with its offset, an array as an array literal, an object as JSON, `toPostgres()`, `undefined` as `NULL`), then sent with the type `unknown`, a `NULL` too, which Postgres infers from the query as it does for `pg`'s parameters. postgres.js writes each value for the type Postgres asks for instead, so by default:

| Value | `pg`, and the adapter | postgres.js 3.4 | postgres.js 4.x |
|---|---|---|---|
| JSON text for a `json` or `jsonb` (`param(x, true)`, `castObjectParamsToJson`) | the JSON | a JSON string, `"{\"a\":1}"` | a JSON string |
| a `Date` for a `timestamp` or a `date` | local time, local day | the same | UTC time, UTC day |
| a string for a `timestamp`; `'infinity'` | as written | moved by the offset; a `RangeError` | as written |
| `'true'` for a `bool`; `'\x…'` for a `bytea` | `true`; those bytes | `false`; the bytes of the text | the same as `pg` |
| an object with `toPostgres()`; `undefined` | its value; `NULL` | `[object Object]`; `UNDEFINED_VALUE` | `{}`; `UNDEFINED_VALUE` |
| an array of `Date`s for a `date[]` | the days | 42804 | UTC days |

## How it differs from pg

- **A Buffer for a column other than `bytea`** is stored as its hex text, `\x6869`, where `pg` sends its bytes: postgres.js can't send a binary value as `unknown`. pgcast's `Insertable` types a Buffer for a `bytea` column only.
- **`.prepared(name)`** runs the query unprepared, as the others: postgres.js 4 runs a prepared statement again after an error, or once Postgres no longer has it (26000, after a `DEALLOCATE ALL`), with each value serialized for the type Postgres then gives, so JSON text would be stored as a JSON string, even where `pg` refuses it. `name` is ignored; several statements are refused, as by `pg`.
- **A `BEGIN` run on the pool** is refused by postgres.js (`UNSAFE_TRANSACTION`), as the next query may go to another connection; `pg` runs it. Use `transaction()`.
- **Errors** are postgres.js's `PostgresError`, unchanged: `code` is the SQLSTATE, as in `pg`, so `db.isDatabaseError()` and the retry of `transaction()` work; the other fields have postgres.js's names (`constraint_name`, `table_name`).
- **A column, value or row `transform`** (`postgres.camel`) makes `asPool()` throw: pgcast reads the columns under the names Postgres gives them, and their values with `pg`'s parsers. Give pgcast a `postgres()` of its own.
- **A connection killed inside `transaction()`** (`pg_terminate_backend()`), on postgres.js 3.4 with `max: 1`: the next `transaction()` waits forever (3.4.0, 3.4.1, 3.4.5, 3.4.7) or the process crashes with an uncaught `TypeError` (the other 3.4 releases; `sql.begin()` crashes too, except on 3.4.6). These are postgres.js's own `reserve()` and `begin()`; 4.x recovers.
- **`pg.types.setTypeParser()`** changes the adapter's parsing too when npm installs one `pg-types` for both.
- **A nested transaction**: `transaction()` passes the client of a transaction given to it through, with no cast from pgcast 6.12.0, its callback getting that client at the outer transaction's level (#702).

## Development

The tests run with the repository root's install (Vitest, TypeScript, `pg`) and test helpers, on the fixture's database (`TEST_DATABASE_URL`, as for the root's tests), with Node in the Asia/Tokyo time zone:

```sh
npm ci && npm run build   # at the repository root
cd adapters/postgres-js
npm ci
npm test                  # the tables above, through pg and through the adapter, and the shortcuts and transactions
npm run test:types        # the tests, and asPool() against the root's db.d.ts
```

CI runs them on postgres.js 3.4.0, the lockfile's version, 4.0.0 and 4.1.1, on Postgres 14 and 18.

## Publishing

The owner publishes it, apart from pgcast, under its own version:

```sh
npm ci && npm run build   # at the repository root
cd adapters/postgres-js
npm ci && npm test && npm run test:types
npm pack --dry-run        # dist/, README.md, CHANGELOG.md, LICENCE, package.json
npm publish --access public
git tag @pgcast/adapter-postgres-js@0.1.0 && git push origin @pgcast/adapter-postgres-js@0.1.0
```

`prepack` builds `dist/`. The first publish of a scoped package needs `--access public`. The tag names the published commit, as `v<version>` names pgcast's.

## Licence

MIT. `prepareValue()` is node-postgres's, under its MIT licence: see [LICENCE](LICENCE).

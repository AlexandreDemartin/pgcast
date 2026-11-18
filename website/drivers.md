---
description: "Run pgcast on pg, on postgres.js or PGlite through their adapters, or on a driver of your own: the same SQL and the same types on each."
---

# Drivers

Run pgcast's queries and transactions on `pg`, on postgres.js or PGlite through their adapters, or on a driver of your own: `run()` takes a [`QueryableLike`](/sql-template#QueryableLike), and `transaction()` a [`PoolLike`](/transaction#PoolLike), from 6.12.0. A query compiles to the same SQL on each, and resolves to the same type, as long as the driver reads values as `pg` reads them. You already know `.run()` from the [tutorial](/tutorial).
{.lede}

[`cursor()`](/cursors) reads batches through the transaction client’s `query()` on both the postgres.js and PGlite adapters.

## pg

What the tutorial uses, and nothing to add: `.run()` takes a `pg.Pool` or a client, and [`transaction()`](/transaction#transaction) a pool or a client.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

The types pgcast generates describe values as `pg` parses them ([Parse like pg](#parse-like-pg)): the adapters below parse each column with `pg`'s own parsers. Whichever driver runs the queries, keep `pg` installed: `zapatos/db` loads it.

::: info Coming
The two adapters are packages of their own, `@pgcast/adapter-postgres-js` and `@pgcast/adapter-pglite`, version 0.1.0, not yet on npm ([#718](https://github.com/AlexandreDemartin/pgcast/issues/718)). Until then, each builds from its folder of the repository, [`adapters/`](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters).
:::

## postgres.js

```sh
npm install @pgcast/adapter-postgres-js postgres
```

Give `asPool()` the `sql` that `postgres()` returns, imported as usual (`import postgres from 'postgres'`):

```ts twoslash
import type { PostgresJsSql } from '@pgcast/adapter-postgres-js';
declare const postgres: (url: string) => PostgresJsSql;  // postgres.js's, as asPool() takes what it returns
// ---cut---
import { asPool } from '@pgcast/adapter-postgres-js';

const sql = postgres(process.env.DATABASE_URL!);
const pool = asPool(sql);
```

Then run queries on `pool` as on a `pg.Pool`:

<CastPanel example="drivers_postgres_js">

<<< ./examples/drivers_postgres_js.ts{ts twoslash}

</CastPanel>

The panel's code is typed on a `pg.Pool`; on `asPool(sql)`, the SQL and the type are the same.

- `starts_at` is a `Date`, as with `pg`: the adapter reads each column with `pg`'s parsers, never postgres.js's. So a `date` is a `Date` at local midnight, where postgres.js alone gives UTC midnight.
- `asPool()` never creates, configures nor ends `sql`: you do, as with a `pg.Pool`. It throws on an `sql` whose `transform` changes the columns, values or rows it reads (`postgres.camel`): give pgcast a `postgres()` of its own.
- Each query runs through `sql.unsafe()`, unprepared, [`prepared()`](/sql-template#prepared) ones too: its name is ignored.
- An error is postgres.js's `PostgresError`, not a `pg.DatabaseError`: `code` is the SQLSTATE, so [`isDatabaseError()`](/transaction#isDatabaseError) and the [retries](/retries) work, but its other fields have postgres.js's names (`constraint_name`, `table_name`).

What it reads and writes, type by type, and how it differs from `pg`: [its README](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#readme).

## PGlite

```sh
npm install @pgcast/adapter-pglite @electric-sql/pglite
```

Give `asPool()` a PGlite with your schema loaded, the one pgcast generated its types from:

```ts twoslash
declare const schema: string;
// ---cut---
import { PGlite } from '@electric-sql/pglite';
import { asPool } from '@pgcast/adapter-pglite';

const pglite = new PGlite();  // in memory; or a directory, or 'idb://cinema' in a page
await pglite.exec(schema);
const pool = asPool(pglite);
```

<CastPanel example="drivers_pglite">

<<< ./examples/drivers_pglite.ts{ts twoslash}

</CastPanel>

The panel's code is typed on a `pg.Pool`; on `asPool(pglite)`, the SQL and the type are the same.

- A `bigint` comes as a string, as with `pg`, where PGlite's own `query()` gives a `number`, or a `bigint` beyond 2^53.
- `asPool()` never creates nor closes the PGlite: you do.
- [`prepared()`](/sql-template#prepared) parses its query once on that PGlite, as `pg` does once on a connection.
- An error is PGlite's `DatabaseError`, not `pg`'s: it has `pg`'s fields (`code`, `constraint`…), so `isDatabaseError()` and the retries work.
- PGlite has one connection, which the pool lends to one transaction at a time: [Transactions](#transactions).

What it reads and writes, type by type, how it differs from `pg`, and what a page needs: [its README](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#readme).

## Transactions

[`transaction()`](/transaction#transaction) and its shortcuts take either adapter's pool as they take a `pg.Pool`. A function typed [`db.PoolLike`](/transaction#PoolLike) takes all three:

```ts twoslash
import * as db from 'zapatos/db';
import type { PGlitePool } from '@pgcast/adapter-pglite';
declare const pool: PGlitePool;
// ---cut---
const bookSeat = (pool: db.PoolLike, seat: string, customer: string) =>
  db.serializable(pool, async txnClient => {
    const taken = await db.count('seat_bookings', { screening_id: 1000, seat }).run(txnClient);
    if (taken > 0) return false;
    await db.insert('seat_bookings', { screening_id: 1000, seat, customer }).run(txnClient);
    return true;
  });

const booked = await bookSeat(pool, 'F12', 'Ines Calloway');
```

It sends what it sends on a `pg.Pool` ([The SQL it sends](/transaction#the-sql-it-sends)), on one connection: postgres.js's adapter reserves one (`sql.reserve()`), and PGlite's takes its only one.

- On PGlite, or any pool of one connection (`max: 1` for a `pg.Pool` or a postgres.js `sql`), a query on the pool waits until the transaction releases the connection. Awaited inside the callback, `.run(pool)` waits forever: run the callback's queries on `txnClient`.
- PGlite's own `query()` and `exec()` don't wait: inside the transaction, they run in it ([How it differs from pg](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#how-it-differs-from-pg)).
- A nested transaction takes the callback's client with no cast, and its callback gets that client, at the outer transaction's level ([Another driver's pool](/transaction#another-drivers-pool), [#702](https://github.com/AlexandreDemartin/pgcast/issues/702)).

## A driver of your own

`run()` takes any client whose `query()` takes `pg`'s query object, `{ text, values, name? }`, and resolves to `{ rows }`: a [`QueryableLike`](/sql-template#QueryableLike). A driver whose `query()` takes the text and the values apart takes a line:

```ts twoslash
import * as db from 'zapatos/db';
declare const client: { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> };
// ---cut---
const queryable = {
  query: ({ text, values }: { text: string; values?: unknown[] }) => client.query(text, values),
};
const films = await db.select('films', db.all).run(queryable);
```

A driver that ignores `name`, as this one does, runs a [`prepared()`](/sql-template#prepared) query unprepared. For `transaction()`, its pool is a [`PoolLike`](/transaction#PoolLike): a `connect()` that resolves to such a client, whose result also has `command`, the command tag, with a `release()`.

### Parse like pg {#parse-like-pg}

The SQL is the same on any driver, and the types describe what `pg` gives ([Value types](/runtime-config#value-types)). A driver of your own reads each type as `pg` reads it, or its rows don't match their types, and nothing says so:

| Type | `pg` gives |
|---|---|
| `timestamptz`, `timestamp` | a `Date` |
| `date` | a `Date`, at local midnight |
| `int8` | a string |
| `numeric` | a string |
| `bytea` | a `Buffer` |
| `json`, `jsonb` | the parsed value |

It writes each value as `pg` writes it too, or Postgres stores another value: `pg` sends a `Date` in local time, with its offset, where the wrapper above, given PGlite's own `query()`, sends it in UTC, so a `Date` at 05:00 on 1 March in Tokyo goes into a `date` as 28 February.

Both adapters read each column with `pg`'s parsers ([pg-types](https://github.com/brianc/node-pg-types) 2), from the text their driver gives, and write each value as `pg` writes it. Where each driver alone reads and writes otherwise: postgres.js's [What it reads](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#what-it-reads) and [What it writes](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#what-it-writes), PGlite's [What it reads](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-reads) and [What it writes](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-writes). Their source and their tests, which read each type through `pg` and through the adapter, are in [`adapters/`](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters).

## A fake for tests

A test's fake is a `QueryableLike` too, so `run()` takes it with no cast:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const answering = (rows: object[]) => ({ query: async () => ({ rows }) });

const films = await db.select('films', db.all, { columns: ['title'] })
  .run(answering([{ result: [{ title: 'Tidewater' }] }]));
```

Rows typed from the schema, and what a fake does not check: [Fake a result typed from the schema](/testing#fake-a-result-typed-from-the-schema).

## See also

- [`QueryableLike`](/sql-template#QueryableLike), [`PoolLike`](/transaction#PoolLike): what `run()` and `transaction()` take.
- [Another driver's pool](/transaction#another-drivers-pool): what `transaction()` does with it.
- [Why pgcast](/why): why pgcast never creates nor manages your pool.

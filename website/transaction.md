# Transactions

`transaction()` and its seven shortcuts, one per isolation level: the SQL they send, their retries and the types of the client they give. Then the errors: `isDatabaseError()` for those from Postgres, and those pgcast throws before any query.
{.lede}

<AtAGlance>

- Only the queries you `.run(txnClient)` are in the transaction; one run on the pool is not.
- On 40001 or 40P01, the whole callback runs again, five attempts in all by default: write it so it can.
- A query error that the callback catches turns `COMMIT` into `ROLLBACK`, and nothing is saved: let the error out.

</AtAGlance>

## `transaction()` {#transaction}

```ts
db.transaction(txnClientOrQueryable, isolationLevel, callback)
```

Runs `callback` in one transaction, then commits it, retries it or rolls it back. It returns a promise of what `callback` resolves to.

- `txnClientOrQueryable`: a `pg.Pool`, from which it checks out a client, released at the end; a client, `pg.Client`, `pg.native.Client` or a `pg.PoolClient` already checked out, used and left connected; or the client of a transaction already open, [passed through](#passing-a-transaction-through).
- `isolationLevel`: an [`IsolationLevel`](#IsolationLevel).
- `callback`: `async txnClient => …`, given a [`TxnClient`](#TxnClient) of that level. The queries of the transaction are those `.run(txnClient)`; one run on the pool, or on any other client, is not in it.

`db.serializable(pool, callback)` is `db.transaction(pool, db.IsolationLevel.Serializable, callback)`. Two customers book seat F7 of screening 1000 at once:

<<< ./examples/plain/serializable_booking.ts{ts twoslash}

One of `ines` and `barnaby` is `true`, the other `false`. When both read before either commits, Postgres refuses one of the two `INSERT`s with 40001, and pgcast runs that callback again, which finds the seat taken. That transaction sends:

<!-- probe: (n => db.serializable(pool, async () => { if (n++ === 0) throw Object.assign(new Error(), { code: '40001' }); }))(0) -->
```sql
-- attempt 1
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's selectOne(), then insert(), which Postgres refuses with 40001
ROLLBACK
-- attempt 2, 25 to 250 ms later
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's selectOne(), which returns the other booking
COMMIT
```

The SQL of the callback's queries: [`selectOne()`](/select#selectOne) and [`insert()`](/insert#insert).

Given a client you checked out, `transaction()` runs on it and leaves it connected; releasing it is yours:

<<< ./examples/plain/checked_out_client.ts{ts twoslash}

The two `count()`s run on `client`, outside the transaction: after the block, `before` is 0, `after` 1.

### The SQL it sends

| When | SQL |
|---|---|
| before the callback | `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->: the level's value, written as it is |
| the callback resolves | `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> |
| `START TRANSACTION`, the callback or `COMMIT` rejects | `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, then a retry or the rejection |

- These three run on the transaction's client, as the callback's queries do. Each reaches [`queryListener`](/runtime-config#Config.queryListener) and [`resultListener`](/runtime-config#Config.resultListener) with the transaction's id: a counter from 0, one per transaction opened, kept across retries; a transaction passed through keeps the outer one's.
- No `SAVEPOINT`: a transaction inside another is the outer one ([Passing a transaction through](#passing-a-transaction-through)).
- After a query error that the callback catches, Postgres answers the `COMMIT` with `ROLLBACK`, not an error, and nothing is saved. `transaction()` resolves, as in Zapatos 6.6.1, and warns once (`PGCAST_DEP003`); with [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), it rejects.
- Given a client you sent `BEGIN` on, it ends your transaction, unless [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient) makes it reject first ([Your own `BEGIN`](#your-own-begin)).

### Retries

When `START TRANSACTION`, the callback or `COMMIT` rejects with a `code` of 40001 (`serialization_failure`) or 40P01 (`deadlock_detected`), at any level, `transaction()` sends `ROLLBACK`, waits, then starts again: `START TRANSACTION`, the whole callback, `COMMIT`.

<RetryFlow />

| [`Config`](/runtime-config#Config) option | Default | What it sets |
|---|---|---|
| [`transactionAttemptsMax`](/runtime-config#Config.transactionAttemptsMax) | `5` | the attempts in all, the first included; `0` or `1` gives one |
| [`transactionRetryDelay`](/runtime-config#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | the wait before each retry: a whole number of ms, at random between the two |

- After the last attempt, it rejects with that attempt's error.
- Any other rejection: `ROLLBACK`, then it rejects with it, at once.
- A `COMMIT` that Postgres answers with `ROLLBACK` is not retried: pgcast doesn't know which error the callback caught.
- [`transactionListener`](/runtime-config#Config.transactionListener) gets each message with the transaction's id:

| Message | When |
|---|---|
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms``<!-- message --> | before the wait |
| ``Retrying transaction, attempt ${attempt} of ${maxAttempts}``<!-- message --> | before `START TRANSACTION` again |
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up``<!-- message --> | before it rejects |

The callback may run several times: [Retries](/retries).

### Passing a transaction through

Given the client of a transaction that `transaction()` has open, it sends nothing: it calls the callback with that client, at once, and returns its promise. No `START TRANSACTION`, `COMMIT`, `ROLLBACK` nor retry of its own; the outer transaction does them. So a function can run in its own transaction, or in the caller's:

<<< ./examples/plain/pass_through.ts{ts twoslash}

One transaction, both seats or neither: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, the two `INSERT`s, `COMMIT`.

- The callback runs at the outer transaction's level, and that level is not checked, at run time or by the type: every `TxnClient` is a [`Queryable`](/sql-template#Queryable), so `db.serializable(txnClient, …)` type-checks with a client of `db.readCommitted()`, and its callback runs in that `READ COMMITTED` transaction.
- A function whose parameter is a `TxnClientFor…` type is checked: [`IsolationSatisfying`](#IsolationSatisfying).
- What marks the client is its own `_zapatos` property ([`TxnClient`](#TxnClient)).
- A transaction you opened yourself, with a raw `BEGIN`, has no mark: it is not passed through ([Your own `BEGIN`](#your-own-begin)). Open the outer transaction with `transaction()`.

### Your own `BEGIN`

Given a client you sent `BEGIN` on, `transaction()` sends its own `START TRANSACTION`<!-- probe: db.serializable(pool, async () => {}) -->, which Postgres only warns about (25001), then ends your transaction:

| Your transaction | Zapatos 6.6.1, and pgcast without the option | With [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient) |
|---|---|---|
| no query yet, or at the session's own level (`readCommitted()`, on a default server) | its `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commits yours, rows and all | rejects before sending its `START TRANSACTION`; yours stays open |
| another level, after a query | Postgres refuses (25001), and its `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> undoes your rows | rejects before its `START TRANSACTION`; yours stays open |
| aborted by a failed query | Postgres refuses (25P02), and its `ROLLBACK` ends yours | rejects before its `START TRANSACTION`; yours stays open, aborted, for your `ROLLBACK` |

Either way, without the option, your own `ROLLBACK` then has nothing left to undo (25P01), and pgcast warns once, `PGCAST_DEP005`. With it, your `ROLLBACK` undoes the seat:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
db.setConfig({ transactionRequiresIdleClient: true });

const client = await pool.connect();
await client.query('BEGIN');
await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(client);
await db.serializable(client, txnClient =>  // rejects, having sent only an empty query
  db.insert('seat_bookings', { screening_id: 1002, seat: 'D5', customer: 'Hollis Brandt' }).run(txnClient),
).catch(() => undefined);
await client.query('ROLLBACK');  // D4 is free again
client.release();
```

- pg reports the block from pg 8.21. Before, `transaction()` runs as in 6.6.1, with no warning. Not tested with `pg-native`.
- With the option, when pg reports one, `transaction()` first sends an empty query, so as to read the status again: pg can still report a block just after a `COMMIT` that failed. Postgres counts it as no query of yours. [`queryListener`](/runtime-config#Config.queryListener) and [`resultListener`](/runtime-config#Config.resultListener) get it, with the transaction's id, as they get its `START TRANSACTION`.
- With the option, a `transaction()` at the same moment on that client is passed through, as in 6.6.1, and neither commits nor rolls back: its queries run in your block, or, when pg's report of a block was stale, as the last point says.
- Without it, `transaction()` sends what 6.6.1 sends, and warns before its `START TRANSACTION`. Nothing reads the status again, so just after a `COMMIT` that failed, the warning can come once for a client outside a block.
- Not caught: a client the pool hands out still in a block, as one released before its `ROLLBACK`; a `BEGIN` sent without `await`; a `BEGIN` sent in one query string with a statement that fails (`'BEGIN; …; SELECT 1/0'`), which pg can still report as outside a block, so `transaction()` runs as in 6.6.1, with no warning.
- With the option, just after a `COMMIT` that failed, two `transaction()` calls at the same moment on one client: when pg still reports the block, the first sends its empty query, then goes on, and the second, passed through, sends its first query, and any sent with it, before the first's `START TRANSACTION`, outside any transaction, so each is committed on its own. Its later queries run in the first call's transaction.

### Errors

<div class="stack">

| Rejects with | When | Since |
|---|---|---|
| `Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '…'`<!-- message --> | `isolationLevel` is not a value of `IsolationLevel`; thrown before a client is checked out or a query sent | pgcast 6.6.2 |
| the callback's error | after `ROLLBACK`; for 40001 and 40P01, after the last attempt | Zapatos |
| "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message --> | with [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), Postgres answered the `COMMIT` with `ROLLBACK`; not retried, and no `ROLLBACK` of its own | pgcast 6.7.0 |
| "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, pass the pool, or run the queries on that client without transaction()"<!-- message --> | with [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), a client of yours is inside a transaction block ([Your own `BEGIN`](#your-own-begin)); having sent only the empty query | pgcast 6.7.0 |

</div>

The type refuses a level that is not an `IsolationLevel` (2345), a string included:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.transaction(pool, 'SERIALIZABLE', async txnClient => true);
```

Zapatos 6.6.1 wrote any value after `ISOLATION LEVEL` as it was, where it could run a second statement ([changelog](/changelog#6.6.2-security)). A transaction passed through is not checked.

## `serializable()` {#serializable}

```ts
db.serializable(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.Serializable`: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.transaction(pool, db.IsolationLevel.Serializable, async () => {}) -->. Its callback gets a [`TxnClientForSerializable`](#TxnClientForSerializable).

## `repeatableRead()` {#repeatableRead}

```ts
db.repeatableRead(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.RepeatableRead`: `START TRANSACTION ISOLATION LEVEL REPEATABLE READ`<!-- probe: db.transaction(pool, db.IsolationLevel.RepeatableRead, async () => {}) -->. Its callback gets a [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead).

## `readCommitted()` {#readCommitted}

```ts
db.readCommitted(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.ReadCommitted`: `START TRANSACTION ISOLATION LEVEL READ COMMITTED`<!-- probe: db.transaction(pool, db.IsolationLevel.ReadCommitted, async () => {}) -->. Its callback gets a [`TxnClientForReadCommitted`](#TxnClientForReadCommitted).

## `serializableRO()` {#serializableRO}

```ts
db.serializableRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.SerializableRO`: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.SerializableRO, async () => {}) -->. Its callback gets a [`TxnClientForSerializableRO`](#TxnClientForSerializableRO). Postgres refuses a write in it (25006).

## `repeatableReadRO()` {#repeatableReadRO}

```ts
db.repeatableReadRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.RepeatableReadRO`: `START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.RepeatableReadRO, async () => {}) -->. Its callback gets a [`TxnClientForRepeatableReadRO`](#TxnClientForRepeatableReadRO). Postgres refuses a write in it (25006).

## `readCommittedRO()` {#readCommittedRO}

```ts
db.readCommittedRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.ReadCommittedRO`: `START TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.ReadCommittedRO, async () => {}) -->. Its callback gets a [`TxnClientForReadCommittedRO`](#TxnClientForReadCommittedRO). Postgres refuses a write in it (25006).

## `serializableRODeferrable()` {#serializableRODeferrable}

```ts
db.serializableRODeferrable(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) at `IsolationLevel.SerializableRODeferrable`: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE`<!-- probe: db.transaction(pool, db.IsolationLevel.SerializableRODeferrable, async () => {}) -->. Its callback gets a [`TxnClientForSerializableRODeferrable`](#TxnClientForSerializableRODeferrable). Postgres refuses a write in it (25006).

With `DEFERRABLE`, Postgres may wait for a snapshot, then runs the transaction without the overhead of a serializable one and with no risk of a serialisation failure (40001) ([SET TRANSACTION](https://www.postgresql.org/docs/current/sql-set-transaction.html)): suited to a long report or a backup.

A report whose two counts read the same snapshot:

<<< ./examples/plain/read_only_report.ts{ts twoslash}

`report` is `{ films: 4, bookings: 0 }` on the docs schema. The transaction sends:

<!-- probe: db.serializableRODeferrable(pool, async () => {}) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE
-- the callback's two count() queries
COMMIT
```

The SQL of each query: [`count()`](/select#count). The other read-only shortcuts send the same, with their level; in [`readCommittedRO()`](#readCommittedRO), each query reads its own snapshot, so a booking committed between the two counts is in the second.

## Types

### `IsolationLevel` {#IsolationLevel}

```ts
enum IsolationLevel {
  Serializable = 'SERIALIZABLE',
  RepeatableRead = 'REPEATABLE READ',
  ReadCommitted = 'READ COMMITTED',
  SerializableRO = 'SERIALIZABLE, READ ONLY',
  RepeatableReadRO = 'REPEATABLE READ, READ ONLY',
  ReadCommittedRO = 'READ COMMITTED, READ ONLY',
  SerializableRODeferrable = 'SERIALIZABLE, READ ONLY, DEFERRABLE',
}
```

The second argument of [`transaction()`](#transaction). Each value is written after `START TRANSACTION ISOLATION LEVEL`; each member has its shortcut:

| Member | Shortcut | Its client |
|---|---|---|
| `Serializable` | [`serializable()`](#serializable) | [`TxnClientForSerializable`](#TxnClientForSerializable) |
| `RepeatableRead` | [`repeatableRead()`](#repeatableRead) | [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead) |
| `ReadCommitted` | [`readCommitted()`](#readCommitted) | [`TxnClientForReadCommitted`](#TxnClientForReadCommitted) |
| `SerializableRO` | [`serializableRO()`](#serializableRO) | [`TxnClientForSerializableRO`](#TxnClientForSerializableRO) |
| `RepeatableReadRO` | [`repeatableReadRO()`](#repeatableReadRO) | [`TxnClientForRepeatableReadRO`](#TxnClientForRepeatableReadRO) |
| `ReadCommittedRO` | [`readCommittedRO()`](#readCommittedRO) | [`TxnClientForReadCommittedRO`](#TxnClientForReadCommittedRO) |
| `SerializableRODeferrable` | [`serializableRODeferrable()`](#serializableRODeferrable) | [`TxnClientForSerializableRODeferrable`](#TxnClientForSerializableRODeferrable) |

### `IsolationSatisfying` {#IsolationSatisfying}

```ts
type IsolationSatisfying<T extends IsolationLevel>
```

The levels whose client is accepted where a client of level `T` is asked for: `T` and the stricter levels. A read-write level stands for its read-only one, not the reverse; `SerializableRODeferrable` stands only for itself.

| `T` | `IsolationSatisfying<T>` |
|---|---|
| `Serializable` | `Serializable` |
| `RepeatableRead` | `Serializable`, `RepeatableRead` |
| `ReadCommitted` | `Serializable`, `RepeatableRead`, `ReadCommitted` |
| `SerializableRO` | `Serializable`, `SerializableRO` |
| `RepeatableReadRO` | `Serializable`, `RepeatableRead`, `SerializableRO`, `RepeatableReadRO` |
| `ReadCommittedRO` | every level but `SerializableRODeferrable` |
| `SerializableRODeferrable` | `Serializable`, `SerializableRO`, `SerializableRODeferrable` |

A function that takes a [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead) can be given the client of `serializable()`, not that of `readCommitted()` (2345, with `strict` on or off):

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const countBookings = (txnClient: db.TxnClientForRepeatableRead) =>
  db.count('seat_bookings', { screening_id: 1000 }).run(txnClient);

await db.serializable(pool, txnClient => countBookings(txnClient));
await db.readCommitted(pool, txnClient => countBookings(txnClient));
```

### `TxnClient` {#TxnClient}

```ts
interface TxnClient<T extends IsolationLevel> extends pg.PoolClient {
  _zapatos?: { isolationLevel: T; txnId: number };
}
```

The client a [`transaction()`](#transaction) callback gets: the one checked out from the pool, or the client given.

- `_zapatos` is set while the transaction runs: its `isolationLevel`, and its `txnId`, the id the listeners get. Once the transaction ends, `transaction()` deletes it, and releases a client it checked out.
- `T`: the levels the client stands for, an [`IsolationSatisfying`](#IsolationSatisfying) union in the seven types below.
- `_zapatos` is optional in the type, so any `pg.PoolClient` is accepted as a `TxnClient`, with or without a transaction open on it.

### `TxnClientForSerializable` {#TxnClientForSerializable}

`TxnClient<IsolationSatisfying<IsolationLevel.Serializable>>`: the client of [`serializable()`](#serializable).

### `TxnClientForRepeatableRead` {#TxnClientForRepeatableRead}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableRead>>`: the client of [`repeatableRead()`](#repeatableRead); takes that of `serializable()` too.

### `TxnClientForReadCommitted` {#TxnClientForReadCommitted}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommitted>>`: the client of [`readCommitted()`](#readCommitted); takes that of `serializable()` and `repeatableRead()` too.

### `TxnClientForSerializableRO` {#TxnClientForSerializableRO}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRO>>`: the client of [`serializableRO()`](#serializableRO); takes that of `serializable()` too.

### `TxnClientForRepeatableReadRO` {#TxnClientForRepeatableReadRO}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableReadRO>>`: the client of [`repeatableReadRO()`](#repeatableReadRO); takes that of `serializable()`, `repeatableRead()` and `serializableRO()` too.

### `TxnClientForReadCommittedRO` {#TxnClientForReadCommittedRO}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommittedRO>>`: the client of [`readCommittedRO()`](#readCommittedRO); takes that of every shortcut but `serializableRODeferrable()`.

### `TxnClientForSerializableRODeferrable` {#TxnClientForSerializableRODeferrable}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>`: the client of [`serializableRODeferrable()`](#serializableRODeferrable); takes that of `serializable()` and `serializableRO()` too.

## `isDatabaseError()` {#isDatabaseError}

```ts
db.isDatabaseError(err, ...types)
```

`true` when the `code` of `err`, five characters, starts with the code of one of `types`; otherwise `false`, and always with no `types`.

- `err`: any value; one with no `code` of five characters gives `false`, `null` and `undefined` included. On an error from Postgres, `.run()` rejects with node-postgres's `DatabaseError`, whose `code` is the SQLSTATE; it also has `constraint`, `detail`, `table` and the other fields Postgres sends.
  - The type is `unknown`, so it takes a `catch` variable as it is (below), with `strict` on or off. Zapatos 6.6.1 typed it `{ code?: string }`, which refused `unknown`, the global `Error`, `null` under `strict` and `pg.DatabaseError` under `exactOptionalPropertyTypes`, and the function threw a `TypeError` on `null` or `undefined` ([#178](https://github.com/AlexandreDemartin/pgcast/issues/178)).
- `types`: names, any number; with none, `false`. Two kinds:

| Name | Code | Matches |
|---|---|---|
| a class: `IntegrityConstraintViolation` | `23` | every code of the class: 23505, 23514, 23503… |
| a condition, `Class_Condition`: `IntegrityConstraintViolation_UniqueViolation` | `23505` | that code |

The names are those of [Postgres's error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html), in PascalCase: `unique_violation` in the class `integrity_constraint_violation` is `IntegrityConstraintViolation_UniqueViolation`. The type refuses any other name.

<<< ./examples/plain/is_database_error.ts{ts twoslash}

On the docs schema:

| Query | `code` | Condition name |
|---|---|---|
| a second booking of the same seat | `23505` | `IntegrityConstraintViolation_UniqueViolation` |
| the seat `'Z100'`, which the domain `seat_label` refuses | `23514` | `IntegrityConstraintViolation_CheckViolation` |
| a booking of a screening that does not exist | `23503` | `IntegrityConstraintViolation_ForeignKeyViolation` |
| an `insert()` in [`serializableRO()`](#serializableRO) | `25006` | `InvalidTransactionState_ReadOnlySqlTransaction` |
| two concurrent bookings of a seat, at `SERIALIZABLE` (above) | `40001` | `TransactionRollback_SerializationFailure` |

- `DiskFull`, `OutOfMemory`, `TooManyConnections` and `ConfigurationLimitExceeded` have the class's code, `53`, as `InsufficientResources` does: each matches every code of the class. `InsufficientResources_DiskFull` matches 53100 only.
- The errors pgcast throws itself have no `code`: `false` for each ([below](#errors-pgcast-throws-before-any-query)).
- With `strict` on, a `catch` variable is `unknown`, and `isDatabaseError()` takes it:

```ts twoslash
// @strict: true
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;
}
```

- It returns a `boolean` without narrowing `err`: to read `err.detail` or `err.constraint`, narrow it with `instanceof pg.DatabaseError` first ([Errors](/handle-errors#catch-a-refusal-from-postgres)).

Handling them in an app: [Errors](/handle-errors).

## Errors pgcast throws before any query

A plain `Error`, with no `code`, before anything is sent. A shortcut throws its own synchronously, from the call itself, but for `truncate()`'s options in another order and an aggregate's `columns` or `lateral` ([`count()`](/select#count)): `.run()` is never reached, so a `.catch()` chained on it does not get them.

The others are thrown as `.compile()` compiles the query, so `.run()` rejects with them; `transaction()` rejects with its own. Each is listed with what throws it:

<div class="stack">

| Thrown by | How | Messages |
|---|---|---|
| `select()`, `selectOne()`, `selectExactlyOne()` and the aggregates, given a bad `order`, `lock` or `aggregate` | the call throws | [`select()`, Errors](/select#errors) |
| `upsert()` of rows with different keys, with `upsertRequiresSameKeys` | the call throws | [Rows with different keys](/insert#upsert-different-keys) |
| `update()` with no column to set | the call throws | [`update()`](/insert#update) |
| `truncate()` with another option | the call throws | [`truncate()`](/insert#truncate) |
| an interpolation that has no meaning in SQL: a number, `null`, `db.all`, the global object | `.run()` rejects | [Interpolations](/sql-template#interpolations) |
| `db.self` with no column; `db.parent()` with no parent table, so as an `insert()`, `upsert()` or `update()` value | `.run()` rejects | [`self`](/sql-template#self), [`parent()`](/sql-template#parent) |
| `count()` and the other aggregates given a `columns` of no column or several, or none at all for `sum()`, `avg()`, `min()` and `max()`; or a single subquery as `lateral`; so a query that nests one | `.run()` rejects | [`count()`](/select#count) |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()` as a filter value; `db.raw()`, `db.cols()` or `db.vals()` as an `insert()`, `upsert()` or `update()` value, or in any `vals({…})` | `.run()` rejects | [Whereable objects](/sql-template#whereable), [Conditions](/conditions), [`insert()`](/insert#insert), [`vals()`](/sql-template#vals) |
| `truncate()` with its options in another order | `.run()` rejects | [`truncate()`](/insert#truncate) |
| `transaction()` with another isolation level | its promise rejects | [`transaction()`, Errors](#errors) |
| `transaction()` given a client inside a transaction block, with `transactionRequiresIdleClient`, after an empty query | its promise rejects | [Your own `BEGIN`](#your-own-begin) |

</div>

After a query, pgcast rejects in two cases of its own: `selectExactlyOne()` with no row, or a second one under [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), with a [`NotExactlyOneError`](/select#NotExactlyOneError); `transaction()` whose `COMMIT` Postgres answers with `ROLLBACK`, with [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit) ([Errors](#errors)).

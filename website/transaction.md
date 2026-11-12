# `transaction()` and errors

`transaction()` and its seven shortcuts, one per isolation level: the SQL they send, their retries and the types of the client they give. Then the errors: `isDatabaseError()` for those from Postgres, and those pgcast throws before any query.
{.lede}

## `transaction()` {#transaction}

```ts
db.transaction(txnClientOrQueryable, isolationLevel, callback)
```

Runs `callback` in one transaction, then commits it, retries it or rolls it back. It returns a promise of what `callback` resolves to.

- `txnClientOrQueryable`: a `pg.Pool`, from which it checks out a client, released at the end; a client, `pg.Client` or a `pg.PoolClient` already checked out, used and left connected; or the client of a transaction already open, [passed through](#passing-a-transaction-through).
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

### Retries

When `START TRANSACTION`, the callback or `COMMIT` rejects with a `code` of 40001 (`serialization_failure`) or 40P01 (`deadlock_detected`), at any level, `transaction()` sends `ROLLBACK`, waits, then starts again: `START TRANSACTION`, the whole callback, `COMMIT`.

| [`Config`](/runtime-config#Config) option | Default | What it sets |
|---|---|---|
| [`transactionAttemptsMax`](/runtime-config#Config.transactionAttemptsMax) | `5` | the attempts in all, the first included; `0` or `1` gives one |
| [`transactionRetryDelay`](/runtime-config#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | the wait before each retry: a whole number of ms, at random between the two |

- After the last attempt, it rejects with that attempt's error.
- Any other rejection: `ROLLBACK`, then it rejects with it, at once.
- [`transactionListener`](/runtime-config#Config.transactionListener) gets each message with the transaction's id:

| Message | When |
|---|---|
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms``<!-- message --> | before the wait |
| ``Retrying transaction, attempt ${attempt} of ${maxAttempts}``<!-- message --> | before `START TRANSACTION` again |
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up``<!-- message --> | before it rejects |

The callback may run several times: [Retry a transaction](/retries).

### Passing a transaction through

Given the client of a transaction that `transaction()` has open, it sends nothing: it calls the callback with that client, at once, and returns its promise. No `START TRANSACTION`, `COMMIT`, `ROLLBACK` nor retry of its own; the outer transaction does them. So a function can run in its own transaction, or in the caller's:

<<< ./examples/plain/pass_through.ts{ts twoslash}

One transaction, both seats or neither: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, the two `INSERT`s, `COMMIT`.

- The callback runs at the outer transaction's level, and that level is not checked, at run time or by the type: every `TxnClient` is a [`Queryable`](/sql-template#Queryable), so `db.serializable(txnClient, …)` type-checks with a client of `db.readCommitted()`, and its callback runs in that `READ COMMITTED` transaction.
- A function whose parameter is a `TxnClientFor…` type is checked: [`IsolationSatisfying`](#IsolationSatisfying).
- What marks the client is its own `_zapatos` property ([`TxnClient`](#TxnClient)).

### Errors

| Rejects with | When | Since |
|---|---|---|
| `Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '…'`<!-- message --> | `isolationLevel` is not a value of `IsolationLevel`; thrown before a client is checked out or a query sent | pgcast 6.6.2 |
| the callback's error | after `ROLLBACK`; for 40001 and 40P01, after the last attempt | Zapatos |
| a `TypeError`, `Cannot destructure property 'code' of 'err' as it is null.` (or `undefined`) | the callback throws `null` or `undefined`, after `ROLLBACK` | Zapatos |

The type refuses a level that is not an `IsolationLevel` (2345), a string included:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.transaction(pool, 'SERIALIZABLE', async txnClient => true);
```

Zapatos 6.6.1 wrote any value after `ISOLATION LEVEL` as it was, where it could run a second statement ([changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md), § Security). A transaction passed through is not checked.

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

[`transaction()`](#transaction) at `IsolationLevel.SerializableRODeferrable`: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE`<!-- probe: db.transaction(pool, db.IsolationLevel.SerializableRODeferrable, async () => {}) -->. Its callback gets a [`TxnClientForSerializableRODeferrable`](#TxnClientForSerializableRODeferrable). Postgres refuses a write in it (25006). With `DEFERRABLE`, Postgres may wait for a snapshot, then runs the transaction without the overhead of a serializable one and with no risk of a serialization failure (40001) ([SET TRANSACTION](https://www.postgresql.org/docs/current/sql-set-transaction.html)): suited to a long report or a backup.

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

- `err`: an object with an optional `code` string. The type accepts `any`, `pg.DatabaseError` and `{ code?: string }`, and refuses `unknown` and the global `Error` (below); `err instanceof pg.DatabaseError` narrows a `catch` variable to one it accepts. On an error from Postgres, `.run()` rejects with node-postgres's `DatabaseError`, whose `code` is the SQLSTATE; it also has `constraint`, `detail`, `table` and the other fields Postgres sends. `null` or `undefined` throws a `TypeError`.
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
- With `strict` on, a `catch` variable is `unknown`, which the type refuses (2345):

```ts twoslash
// @errors: 2345
// @strict: true
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation');
}
```

- A value typed as the global `Error`, as `instanceof Error` narrows it, is refused too, with `strict` on or off (2559): the parameter's type is `{ code?: string }`, and `Error` has no property in common with it.

```ts twoslash
// @errors: 2559
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  if (err instanceof Error && db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) {}
}
```

Handling them in an app: [Handle errors](/handle-errors).

## Errors pgcast throws before any query

A plain `Error`, with no `code`, before anything is sent. A shortcut throws its own synchronously, from the call itself: `.run()` is never reached, so a `.catch()` chained on it does not get them. The others are thrown as `.compile()` compiles the query, so `.run()` rejects with them; `transaction()` rejects with its own. Each is listed with what throws it:

| Thrown by | How | Messages |
|---|---|---|
| `select()`, `selectOne()`, `selectExactlyOne()` and the aggregates, given a bad `order`, `lock` or `aggregate` | the call throws | [`select()`, Errors](/select#errors) |
| `upsert()` of rows with different keys, with `upsertRequiresSameKeys` | the call throws | [Rows with different keys](/insert#upsert-different-keys) |
| `update()` with no column to set | the call throws | [`update()`](/insert#update) |
| `truncate()` with another option | the call throws | [`truncate()`](/insert#truncate) |
| an interpolation that has no meaning in SQL: a number, `null`, `db.all`, the global object | `.run()` rejects | [Interpolations](/sql-template#interpolations) |
| `db.self` with no column, `db.parent()` with no parent table | `.run()` rejects | [`self`](/sql-template#self), [`parent()`](/sql-template#parent) |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()` as a filter value | `.run()` rejects | [Whereable objects](/sql-template#whereable), [Conditions](/conditions) |
| `transaction()` with another isolation level | its promise rejects | [`transaction()`, Errors](#errors) |

After a query, pgcast rejects in two cases of its own: `selectExactlyOne()` with no row, with a [`NotExactlyOneError`](/select#NotExactlyOneError); `count()` and the other aggregates with no row to read, with a `TypeError` ([`count()`](/select#count)).

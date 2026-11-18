# Transactions

`transaction()` and its seven shortcuts, one per isolation level: the SQL they send, their retries and the types of the client they give. `savepoint()`, for a unit of work that can fail alone inside a transaction. `advisoryXactLock()`, a lock the transaction holds until it ends. Then the errors: `isDatabaseError()` for those from Postgres, and those pgcast throws before any query.
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

- `txnClientOrQueryable`: a `pg.Pool`, from which it checks out a client, released at the end; a client, `pg.Client`, `pg.native.Client` or a `pg.PoolClient` already checked out, used and left connected; the client of a transaction already open, [passed through](#passing-a-transaction-through); or the [`PoolLike`](#PoolLike) of another driver, used as a `pg.Pool` is ([Another driver's pool](#another-drivers-pool)).
- `isolationLevel`: an [`IsolationLevel`](#IsolationLevel).
- `callback`: `async txnClient => …`, given a [`TxnClient`](#TxnClient) of that level, or, from a `PoolLike`, a [`TxnClientLike`](#TxnClientLike). The queries of the transaction are those `.run(txnClient)`; one run on the pool, or on any other client, is not in it.

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
- No `SAVEPOINT`: a transaction inside another is the outer one ([Passing a transaction through](#passing-a-transaction-through)). To nest a unit of work that can fail alone: [`savepoint()`](#savepoint).
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
- [`transactionListener`](/runtime-config#Config.transactionListener) gets each message with the transaction's id, and [`transactionEventListener`](/runtime-config#Config.transactionEventListener) the event beside it, right after, with the same numbers:

| Message | Event | When |
|---|---|---|
| ``Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms``<!-- message --> | `{ type: 'rollback', code, attempt, maxAttempts, delayMs }` | before the wait |
| ``Retrying transaction, attempt ${attempt} of ${maxAttempts}``<!-- message --> | `{ type: 'retry', attempt, maxAttempts }` | before `START TRANSACTION` again |
| ``Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up``<!-- message --> | `{ type: 'giveUp', code, attempt, maxAttempts }` | before it rejects |

The callback may run several times: [Retries](/retries).

### Passing a transaction through

Given the client of a transaction that `transaction()` has open, it sends nothing: it calls the callback with that client, at once, and returns its promise. No `START TRANSACTION`, `COMMIT`, `ROLLBACK` nor retry of its own; the outer transaction does them. So a function can run in its own transaction, or in the caller's:

<<< ./examples/plain/pass_through.ts{ts twoslash}

One transaction, both seats or neither: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, the two `INSERT`s, `COMMIT`.

- The callback runs at the outer transaction's level, as Postgres can't change the isolation level once the transaction's first query has run. The type doesn't check that level: every `TxnClient` is a [`Queryable`](/sql-template#Queryable), so `db.serializable(txnClient, …)` type-checks with a client of `db.readCommitted()`, and its callback runs in that `READ COMMITTED` transaction, as in Zapatos 6.6.1, with a warning, once, `PGCAST_DEP007`.
- With [`transactionRequiresSatisfyingLevel`](/runtime-config#Config.transactionRequiresSatisfyingLevel), when the outer level doesn't satisfy the one asked for ([`IsolationSatisfying`](#IsolationSatisfying)), it rejects before calling the callback, and the outer transaction rolls back unless its callback catches the error. A level that satisfies it is passed through, option or not, and so is the client of `db.serializableRODeferrable()` given to `db.serializableRO()`, `db.repeatableReadRO()` or `db.readCommittedRO()`, which the type leaves out, as in Zapatos 6.6.1 ([`IsolationSatisfying`](#IsolationSatisfying)).
- A function whose parameter is a `TxnClientFor…` type is checked: [`IsolationSatisfying`](#IsolationSatisfying).
- What marks the client is its own `_zapatos` property ([`TxnClient`](#TxnClient)).
- A transaction you opened yourself, with a raw `BEGIN`, has no mark: it is not passed through ([Your own `BEGIN`](#your-own-begin)). Open the outer transaction with `transaction()`.

### Another driver's pool {#another-drivers-pool}

From 6.12.0, `transaction()` and its shortcuts also take a [`PoolLike`](#PoolLike): a pool of any driver whose `connect()` gives a client whose `query()` takes `pg`'s query object and resolves to `{ rows, command }`, and which has a `release()`. A driver's adapter gives one, and so can a test's fake. It needs no cast:

<<< ./examples/plain/transaction_other_pool.ts{ts twoslash}

It checks a client out of the pool, runs the transaction on it, and releases it, as on a `pg.Pool`:

<!-- probe: db.serializable({ connect: async () => ({ query: async q => { await pool.query(q); return { rows: [], command: q.text }; }, release() {} }) }, async () => 0) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's count()
COMMIT
```

The SQL of the callback's query: [`count()`](/select#count).

- The callback gets the pool's client, typed as the pool gives it and marked: a [`TxnClientLike`](#TxnClientLike) at that level. `taken` is a `number`, as on a `pg.Pool`.
- `command` is read off the `COMMIT`, which Postgres answers with `ROLLBACK` after a query error that the callback caught ([The SQL it sends](#the-sql-it-sends)): a pool whose client gives no `command` does not compile. PGlite and postgres.js give it at run time, but PGlite's type makes it optional, `command?: string`, so a pool that forwards PGlite's result maps `command` to a `string`, as its adapter does ([Drivers](/drivers#pglite)).
- A retry reads the error's `code` alone, so another driver's 40001 and 40P01 are retried too ([Retries](#retries)).
- Passed to a nested call, the callback's client is passed through at run time, but the type takes only `pg`'s ([Passing a transaction through](#passing-a-transaction-through)): cast it, `txnClient as unknown as db.TxnClientForReadCommitted`<!-- tsc: export const nested = db.serializable({ connect: async () => ({ query: async () => ({ rows: [], command: 'COMMIT' }), release() {} }) }, txnClient => db.readCommitted(…, async inner => inner)); -->. Once cast, it is typed as a `pg.PoolClient`, which it is not: run only fragments on it, `.run(inner)` and the shortcuts. `inner.query('SELECT 1')`<!-- tsc: export const raw = db.serializable({ connect: async () => ({ query: async () => ({ rows: [], command: 'COMMIT' }), release() {} }) }, txnClient => db.readCommitted(txnClient as unknown as db.TxnClientForReadCommitted, async inner => …)); --> compiles, but the other driver's `query()` takes only the query object. Never give the nested call the pool: its client is a second transaction, and a pool of one connection, as PGlite's, waits for the first one's `release()` forever.
- A parameter that takes a `pg.Pool` or another driver's pool is typed `db.PoolLike`, which a `pg.Pool` is: `(pool: db.PoolLike) => db.serializable(pool, async txnClient => txnClient)`<!-- tsc: export const inAnyPool = …; -->. Typed as a union, `pg.Pool | typeof showPool`, it gives the callback the other driver's client, where `pg`'s is a `pg.PoolClient`.
- The calls of Zapatos 6.6.1 keep their types, the callback's client included. Where TypeScript reads the first parameter as a type, it is also a `PoolLike`, and two paths move:
  - `Parameters<typeof db.serializable>[0]`, or the first parameter as an `infer` reads it: `.query('SELECT 1')` on it gives TS2339;
  - an arrow given where `typeof db.serializable` is expected, `async (_, callback) => callback(txnClient)`, gives TS2345, and one typed with 6.6.1's parameters gives TS2322.

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
| "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message --> | with [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), a client of yours is inside a transaction block ([Your own `BEGIN`](#your-own-begin)); having sent only the empty query | pgcast 6.7.0 |

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

## `savepoint()` {#savepoint}

```ts
db.savepoint(txnClient, callback)
```

Runs `callback` inside a savepoint of the transaction `txnClient` is in. It returns a promise of what `callback` resolves to.

- `txnClient`: the client of a transaction: a [`TxnClient`](#TxnClient), the [`TxnClientLike`](#TxnClientLike) of another driver's pool, or a `pg.PoolClient` you sent `BEGIN` on. A pool, a `pg.Client` or a [`QueryableLike`](/sql-template#QueryableLike) does not compile.
- `callback`: `async spClient => …`, given that same client, typed as it is: in `db.serializable()`, a [`TxnClientForSerializable`](#TxnClientForSerializable). A callback typed for a level the client does not satisfy does not compile ([`IsolationSatisfying`](#IsolationSatisfying)).

A customer books three seats, skipping one already taken; the others are booked in one transaction:

<<< ./examples/plain/savepoint_seat.ts{ts twoslash}

`booked` is `['K1', 'K3']`. Each seat sends:

<!-- probe: db.savepoint(pool, async () => {}).then(() => db.savepoint(pool, async () => { throw new Error(); })) -->
```sql
-- K1 and K3
SAVEPOINT pgcast_savepoint_1
-- the callback's insert()
RELEASE SAVEPOINT pgcast_savepoint_1
-- K2
SAVEPOINT pgcast_savepoint_1
-- the callback's insert(), which Postgres refuses with 23505
ROLLBACK TO SAVEPOINT pgcast_savepoint_1
RELEASE SAVEPOINT pgcast_savepoint_1
```

The SQL of the callback's query: [`insert()`](/insert#insert).

| When | SQL |
|---|---|
| before the callback | `SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => {}) --> |
| the callback resolves | `RELEASE SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => {}) --> |
| the callback or that `RELEASE` rejects | `ROLLBACK TO SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => { throw new Error(); }) -->, then `RELEASE SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => { throw new Error(); }) -->, then it rejects with that error |
| that `ROLLBACK TO` or that `RELEASE` rejects | nothing more: it rejects with its error, in place of the first, as `transaction()` does when its `ROLLBACK` rejects |
| it rejects with 40001 or 40P01 | nothing more: it rejects with that error |

- The name ends in the savepoint's depth: `pgcast_savepoint_1` directly in the transaction, `pgcast_savepoint_2` inside that, and so on, the same text on every call at a depth. `ROLLBACK TO` and `RELEASE` also end every savepoint established after their own, so savepoints nest: each failure undoes the work of its own level, inner levels included, whatever they left. Don't give a savepoint of yours such a name.
- On 40001 or 40P01, the transaction stays aborted: its `COMMIT` cannot save half of it. `transaction()` rolls back and runs its whole callback again, the savepoint included ([Retries](#retries)). A savepoint never retries on its own: only a new transaction gets a new snapshot.
- A callback that catches a query's error and returns: Postgres refuses the `RELEASE` (25P02), so `savepoint()` rolls back to the savepoint and rejects with that 25P02. Its work is undone, inner levels included, and the transaction can go on. So a 40001 or 40P01 the callback catches is not retried there. After a 40P01, or a 40001 of `REPEATABLE READ`, the transaction's `COMMIT` saves what it wrote outside that savepoint; after a 40001 of `SERIALIZABLE`, Postgres can refuse a later query or the `COMMIT` with 40001 again, and `transaction()` retries that one. Let them out, and rethrow them around `savepoint()`, as the example does.
- The 40001 and 40P01 are read by their `code`, as [Retries](#retries) reads them. One thrown from JavaScript, then caught, gets no `ROLLBACK TO`: the work of its savepoint stays in, unless an outer level rolls back.
- Outside a transaction block, Postgres refuses the `SAVEPOINT` (25P01): `savepoint()` rejects with it, and never calls the callback.
- One at a time on a client: `await` each. Two at once nest in the order they are called: the first, if it ends first, ends the second's savepoint, whose own `RELEASE` then fails (3B001), and the transaction is aborted; a `ROLLBACK TO` of the second also undoes what the first wrote after the second's `SAVEPOINT`. Not checked.
- The depth is counted per client object, by each copy of pgcast installed: a wrapper or a `Proxy` of the client counts from 1 again, as does, with two copies such as two versions in `node_modules`, a savepoint of one inside the other's. The inner savepoint then takes the outer one's name, and its 40001 caught by the outer callback leaves the outer work in.
- Its queries reach [`queryListener`](/runtime-config#Config.queryListener) and [`resultListener`](/runtime-config#Config.resultListener) with the transaction's id; [`transactionListener`](/runtime-config#Config.transactionListener) gets nothing from it.
- A `transaction()` given the client of a `transaction()` callback is [passed through](#passing-a-transaction-through): it sends no `SAVEPOINT`. Given a `pg.PoolClient` you sent `BEGIN` on, it is not ([Your own `BEGIN`](#your-own-begin)).

## `advisoryXactLock()` {#advisoryXactLock}

```ts
db.advisoryXactLock(txnClient, key)
```

From 6.12.0. Takes a transaction-level advisory lock on `key`, waiting while another transaction holds it. It returns a promise that resolves to `undefined` once the lock is held. Postgres releases it when the transaction ends ([Advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)).

- `txnClient`: the client of a transaction: a [`TxnClient`](#TxnClient), the [`TxnClientLike`](#TxnClientLike) of another driver's pool, or a `pg.PoolClient` you sent `BEGIN` on. A pool, a `pg.Client` or a [`QueryableLike`](/sql-template#QueryableLike) does not compile.
- `key`: a `bigint`, `BigInt(42)` (`42n` needs a `target` of ES2020), or a pair of 32-bit integers, `[1, 42]`, written inline, `as const` or typed `readonly [number, number]`. A `number`, a string or a `number[]` does not compile.

A screening sells its last seats one booking at a time:

<<< ./examples/plain/advisory_lock_seats.ts{ts twoslash}

`booked` is `true`. A second booking at the same moment waits for the first one's `COMMIT`, then counts its seat. Each sends:

<!-- probe: db.readCommitted(pool, txnClient => db.advisoryXactLock(txnClient, [2, 1002])) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT pg_advisory_xact_lock($1, $2)
-- the callback's count(), then insert()
COMMIT
```

The SQL of the callback's queries: [`count()`](/select#count) and [`insert()`](/insert#insert).

| Key | SQL | Values |
|---|---|---|
| a `bigint`, `BigInt(42)` | `SELECT pg_advisory_xact_lock($1)`<!-- probe: db.advisoryXactLock(pool, BigInt(42)) --> | `['42']`, its decimal string, as `pg` would send it |
| two numbers, `[1, 42]` | `SELECT pg_advisory_xact_lock($1, $2)`<!-- probe: db.advisoryXactLock(pool, [1, 42]) --> | `[1, 42]` |

- The key goes to `pg_advisory_xact_lock` as it is, with no hash. Its two forms are two key spaces, so `BigInt(42)` and `[0, 42]` are two locks. To lock on a text, hash it in a query of yours: `` db.sql`SELECT pg_advisory_xact_lock(hashtextextended(${db.param(title)}, 0))` ``.
- Postgres releases the lock at `COMMIT`, at `ROLLBACK`, and at a `ROLLBACK TO` a savepoint taken before it, such as that of a [`savepoint()`](#savepoint) whose callback rejects; a `RELEASE` does not release it. So an attempt that `transaction()` retries never holds the lock of the one before ([Retries](#retries)).
- At `REPEATABLE READ` and `SERIALIZABLE`, the transaction's snapshot is taken by its first query, at the latest the lock, so before the wait: a row the other transaction committed meanwhile is not seen. At `REPEATABLE READ`, the example's `count()` then misses the other booking, and the last seat is sold twice; at `SERIALIZABLE`, Postgres refuses one of the two with 40001, and its retry sees the row. At `READ COMMITTED`, as in the example, each query takes its own snapshot: the `count()` sees it.
- Postgres checks the key's range: 22003 outside `bigint` or a 32-bit integer, 22P02 for a fraction or `NaN`.
- It runs, rather than returning a fragment, so that its type can ask for a transaction's client, which a fragment's `run()` can't. In a query of yours, write `pg_advisory_xact_lock(${db.param(…)})` in `sql`.
- Its query reaches [`queryListener`](/runtime-config#Config.queryListener) and [`resultListener`](/runtime-config#Config.resultListener) with the transaction's id.
- The session lock, `pg_advisory_lock()`, has no function: it outlives the transaction, its retries and the client's checkout ([Know what a rollback leaves](/testing#know-what-a-rollback-leaves)).

It rejects before any query in three cases:

<div class="stack">

| Rejects with | When |
|---|---|
| "advisoryXactLock() was given a key that is neither a bigint nor an array of two numbers, so Postgres would take no lock: give a bigint, BigInt(42), or a pair of integers, [1, 42]"<!-- message --> | `key` is neither, from JavaScript or past a cast: `null`, `42`, `[1]`, `[null, 2]`. Postgres takes no lock on a `NULL` key, and says nothing |
| "advisoryXactLock() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours"<!-- message --> | `txnClient` is a `pg.Pool`, from JavaScript or past a cast, whose `query()` would run the `SELECT` as a transaction of its own |
| "advisoryXactLock() was given a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or after a BEGIN of yours"<!-- message --> | `pg` reports the client outside a transaction block (from `pg` 8.21), where the `SELECT` would be a transaction of its own. The status is the last one `pg` received: a query not yet answered, such as a `BEGIN` you did not await, is not counted, and a client whose `COMMIT` of your `BEGIN` just failed can still read as inside a block. A client that reports none, another driver's or `pg` before 8.21, runs |

</div>

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

`SerializableRODeferrable` is left out of the rows of `SerializableRO`, `RepeatableReadRO` and `ReadCommittedRO`, as in Zapatos 6.6.1, though it gives every guarantee they ask for, and `transaction()` passes its client through ([Passing a transaction through](#passing-a-transaction-through)). So a function that takes a `TxnClientForSerializableRO` refuses the client of `serializableRODeferrable()` (2345). It stays that way: counting it in, a function that takes a `TxnClientForSerializableRO` would read `SerializableRODeferrable` in its own `_zapatos.isolationLevel`, and so would the callbacks of `serializableRO()`, `repeatableReadRO()` and `readCommittedRO()`. Code that compiles under 6.6.1 would then fail, such as an exhaustive `switch` on that level or a `Record` keyed by those levels ([#489](https://github.com/AlexandreDemartin/pgcast/issues/489); the change waits for 7.0, [#694](https://github.com/AlexandreDemartin/pgcast/issues/694)). A function that takes both clients names both types, and the same goes for the other two levels:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const countSeats = (txnClient: db.TxnClientForSerializableRO | db.TxnClientForSerializableRODeferrable) =>
  db.count('seat_bookings', { screening_id: 1000 }).run(txnClient);

await db.serializableRO(pool, txnClient => countSeats(txnClient));
await db.serializableRODeferrable(pool, txnClient => countSeats(txnClient));
// @ts-expect-error REPEATABLE READ, READ ONLY satisfies neither type
await db.repeatableReadRO(pool, txnClient => countSeats(txnClient));
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
- `_zapatos` is optional in the type, as in Zapatos 6.6.1, so any `pg.PoolClient` is accepted as a `TxnClient`, with or without a transaction open on it, and a client kept after its transaction ended too. Nothing at run time can tell: a function whose parameter is a `TxnClientFor…` type, given such a client, runs its queries outside any transaction.

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

### `PoolLike` {#PoolLike}

```ts
type PoolClientLike = { query: (query: SQLQuery) => PromiseLike<{ rows: any[]; command: string }>; release: () => void }

interface PoolLike<C = PoolClientLike> {
  connect: () => PromiseLike<C extends PoolClientLike ? C : PoolClientLike>
}
```

A pool of any driver, which [`transaction()`](#transaction) takes as it takes a `pg.Pool`, from 6.12.0 ([Another driver's pool](#another-drivers-pool)).

- Its client's `query()` is a [`QueryableLike`](/sql-template#QueryableLike)'s whose result also has `command`, the command tag: `COMMIT`, or `ROLLBACK` when Postgres rolled the transaction back. `release()` is called once the transaction ends, with no argument.
- `C` is that client's type, which the callback gets. `PoolClientLike` is not exported.
- A `pg.Pool` is a `PoolLike`.

### `TxnClientLike` {#TxnClientLike}

```ts
type TxnClientLike<C, T extends IsolationLevel> = C & {
  _zapatos?: { isolationLevel: T; txnId: number }
}
```

The client of a [`PoolLike`](#PoolLike), `C`, as a [`transaction()`](#transaction) callback gets it: marked while the transaction runs, as a [`TxnClient`](#TxnClient) is, `_zapatos` optional in the type too. A nested call does not take it ([Another driver's pool](#another-drivers-pool)).

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

The others are thrown as `.compile()` compiles the query, so `.run()` rejects with them; `transaction()` and `advisoryXactLock()` reject with their own. Each is listed with what throws it:

<div class="stack">

| Thrown by | How | Messages |
|---|---|---|
| `select()`, `selectOne()`, `selectExactlyOne()` and the aggregates, given a bad `order`, `lock` or `aggregate` | the call throws | [`select()`, Errors](/select#errors) |
| `upsert()` of rows with different keys, with `upsertRequiresSameKeys` | the call throws | [Rows with different keys](/insert#upsert-different-keys) |
| `update()` with no column to set | the call throws | [`update()`](/insert#update) |
| `truncate()` with another option | the call throws | [`truncate()`](/insert#truncate) |
| an interpolation that has no meaning in SQL: a number, `null`, `db.all`, the global object; `db.all` as the filter of `deletes()` or `update()` | `.run()` rejects | [Interpolations](/sql-template#interpolations), [`all`](/sql-template#all) |
| `db.self` with no column; `db.parent()` with no parent table, so as an `insert()`, `upsert()` or `update()` value | `.run()` rejects | [`self`](/sql-template#self), [`parent()`](/sql-template#parent) |
| `count()` and the other aggregates given a `columns` of no column or several, or none at all for `sum()`, `avg()`, `min()` and `max()`; or a single subquery as `lateral`; so a query that nests one | `.run()` rejects | [`count()`](/select#count) |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()` as a filter value; `db.all` as a filter value, a condition's value or an item of `isIn()` or `isNotIn()`; any of these, `db.param()`, a fragment or `db.parent()` as an item of `arrayContains()`, `arrayContainedIn()` or `arrayOverlaps()`; `db.raw()`, `db.cols()` or `db.vals()` as an `insert()`, `upsert()` or `update()` value, or in any `vals({…})` | `.run()` rejects | [Whereable objects](/sql-template#whereable), [Conditions](/conditions#refused-values), [`insert()`](/insert#insert), [`vals()`](/sql-template#vals) |
| `truncate()` with its options in another order | `.run()` rejects | [`truncate()`](/insert#truncate) |
| `transaction()` with another isolation level | its promise rejects | [`transaction()`, Errors](#errors) |
| `transaction()` given a client inside a transaction block, with `transactionRequiresIdleClient`, after an empty query | its promise rejects | [Your own `BEGIN`](#your-own-begin) |
| `advisoryXactLock()` given a key that is neither a `bigint` nor an array of two numbers, a `pg.Pool`, or a client outside a transaction block | its promise rejects | [`advisoryXactLock()`](#advisoryXactLock) |

</div>

After a query, pgcast rejects in two cases of its own: `selectExactlyOne()` with no row, or a second one under [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), with a [`NotExactlyOneError`](/select#NotExactlyOneError); `transaction()` whose `COMMIT` Postgres answers with `ROLLBACK`, with [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit) ([Errors](#errors)).

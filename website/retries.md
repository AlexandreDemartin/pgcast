---
description: "Book seats at a screening under SERIALIZABLE, so two requests at once can't break a rule, and let pgcast run the transaction again when Postgres refuses one."
---

# Retries

Book seats at a screening under `SERIALIZABLE`, so that two requests at once can't break a rule, and let pgcast run the transaction again when Postgres refuses one. Then what goes in the callback and what stays out of it, and how to test a retry. It assumes the basics of the [tutorial](/tutorial).
{.lede}

## Put the rule and its writes in one callback

The rule: four seats per customer per screening, at most. No constraint can say that, so the code counts, then books, both in one [`serializable()`](/transaction#serializable) transaction:

<<< ./examples/plain/retries_book_seats.ts{ts twoslash}

Ines has two tabs open, and books from both at once. Each transaction counts 0 seats held, then books, which would give her five. At `SERIALIZABLE`, Postgres refuses one of the two, at its `INSERT` or at its `COMMIT`, with 40001 (`serialization_failure`); pgcast rolls it back and runs the whole callback again. Here, `tabTwo`'s transaction sends:

<!-- probe: (refused => db.serializable({ connect: async () => ({ release() {}, query: async query => { await pool.query(query); if (query.text === 'COMMIT' && !refused++) throw Object.assign(new Error(), { code: '40001' }); return { rows: [] }; } }) }, async () => {}))(0) -->
```sql
-- attempt 1
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- count(): 0 seats held, then insert() of E4, E5 and E6
COMMIT
-- refused with 40001: tabOne has committed D4 and D5
ROLLBACK
-- attempt 2, 25 to 250 ms later
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- count(): 2 seats held, and 2 + 3 > 4, so no insert()
COMMIT
```

The tab whose transaction commits first gets its rows, `seat_bookings.JSONSelectable[]`; the other gets `null`, here `tabTwo`. The SQL of the callback's queries: [`count()`](/select#count) and [`insert()`](/insert#insert); what pgcast sends around them, and when it retries: [Retries](/transaction#retries).

- Run every query of the transaction on `txnClient`. A query on `pool` is not in it: it isn't rolled back, and the next attempt runs it again.
- Two requests may still run one after the other, and then neither is retried: the second simply counts the first one's seats.

## Keep side effects out of the callback

The callback runs once per attempt, up to five times by default. Postgres rolls back its queries each time; nothing else is undone. So what isn't a query on `txnClient` goes before the transaction or after it:

<<< ./examples/plain/retries_outside.ts{ts twoslash}

| Work | Where |
|---|---|
| the queries of the rule and the booking | in the callback, on `txnClient` |
| a `fetch()`, a file, a price from another service | before |
| an email, a payment, a message on a queue | after the `await`, from what the callback returned |
| a counter, an array, a log line | from the return value, not changed in the callback |

Moved into the callback, a retried booking sends two confirmation emails, and pushes its seats twice onto an array outside it.

## Let the error through

pgcast retries only what reaches it. Don't swallow a database error inside the callback: after it, Postgres refuses every query of the transaction with 25P02 (`current transaction is aborted, commands ignored until end of transaction block`), and if the callback returns, pgcast sends `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->, which Postgres turns into a rollback without an error.

The promise rejects without a retry, and nothing is saved. With [`transactionRequiresCommit: false`](/runtime-config#Config.transactionRequiresCommit), it resolves with the callback result. A swallowed 40001 or 40P01 cannot trigger a retry under either setting.

If you catch one inside, rethrow it.

Catch it outside the transaction, once pgcast has given up, with [`isDatabaseError()`](/transaction#isDatabaseError):

<<< ./examples/plain/retries_catch.ts{ts twoslash}

| What happened | `bookSeats()` | `reply()` |
|---|---|---|
| booked | resolves with the rows | `'Booked'` |
| over the four seats | resolves with `null` | `'Four seats each, at most'` |
| a seat already booked by someone else | rejects with 23505, sometimes after a retry | `'Seat taken'` |
| a conflict on every attempt | rejects with the last attempt's 40001 or 40P01 | `'Busy: please try again'` |

## Book inside a larger transaction

Given the `txnClient` of a transaction already open, `bookSeats()` joins it: `serializable()` sends nothing of its own and calls the callback at once ([Passing a transaction through](/transaction#passing-a-transaction-through)). A couple books two seats, both or neither:

<<< ./examples/plain/retries_larger.ts{ts twoslash}

One transaction: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, the two `count()`s and `insert()`s, `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->. If either `bookSeats()` resolves with `null`, the `throw` sends `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) --> in place of `COMMIT`, and the `await` rejects with that `Error`, not retried. On a 40001, it is the outer transaction that rolls back and runs its callback again, both bookings included.

Typed `pg.Pool | db.TxnClientForSerializable`, the first parameter refuses the client of a transaction at a lower level, where the rule would no longer hold (2345, with `strict` on or off):

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const bookSeats = (txnClientOrPool: pg.Pool | db.TxnClientForSerializable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });
// ---cut---
await db.readCommitted(pool, txnClient => bookSeats(txnClient, 1000, ['G1'], 'Wren Abernathy'));
```

A [`db.Queryable`](/sql-template#Queryable) parameter accepts this client. The call below compiles, then rejects before the booking callback. With [`transactionRequiresSatisfyingLevel: false`](/runtime-config#Config.transactionRequiresSatisfyingLevel), the booking would run at `READ COMMITTED`.

<<< ./examples/plain/retries_lower_level.ts{ts twoslash}

## Queue the requests with a lock

Rather than conflict and retry, the requests for one screening can wait in turn. Take [`advisoryXactLock()`](/transaction#advisoryXactLock) first in the callback, in [`readCommitted()`](/transaction#readCommitted), where each query reads what has been committed before it:

<<< ./examples/plain/retries_lock.ts{ts twoslash}

The tab that comes second waits at `SELECT pg_advisory_xact_lock($1, $2)`<!-- probe: db.readCommitted(pool, txnClient => db.advisoryXactLock(txnClient, [2, 1000])) --> until the first one's `COMMIT`, then counts its seats and books nothing: one tab gets its rows, the other `null`, with no 40001 and no retry. Postgres releases the lock when the transaction ends, at each attempt's `ROLLBACK` too, so a retry never inherits it.

- Every transaction that writes what the rule counts takes the lock first, or the rule no longer holds.
- Keep `readCommitted()`. In `serializable()`, the snapshot is taken before the wait: the second tab still gets 40001, and its retry sees the seats; in `repeatableRead()`, it books too: five seats in all.
- A key is a pair of 32-bit integers, or a `bigint`; a key from a text, and why there is no session lock: [`advisoryXactLock()`](/transaction#advisoryXactLock).

## Tune and watch the retries

Four options of [`setConfig()`](/runtime-config#setConfig), for every transaction of the process:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 10,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
  transactionListener: (message, txnId) => console.log(`[txn ${txnId}] ${message}`),
  transactionEventListener: (event, txnId) => console.log(JSON.stringify({ txnId, ...event })),
});
```

A retried transaction then logs each message, then its event, with the same numbers:

```txt
[txn 0] Transaction rollback (code 40001) on attempt 1 of 10, retrying in 292ms
{"txnId":0,"type":"rollback","code":"40001","attempt":1,"maxAttempts":10,"delayMs":292}
[txn 0] Retrying transaction, attempt 2 of 10
{"txnId":0,"type":"retry","attempt":2,"maxAttempts":10}
```

- [`transactionAttemptsMax`](/runtime-config#Config.transactionAttemptsMax): the attempts in all. `1` turns the retries off.
- [`transactionRetryDelay`](/runtime-config#Config.transactionRetryDelay): the wait before each retry. The client stays checked out of the pool while it waits.
- [`transactionListener`](/runtime-config#Config.transactionListener): every message it gets is in [Retries](/transaction#retries).
- [`transactionEventListener`](/runtime-config#Config.transactionEventListener): the same, as a [`TransactionEvent`](/runtime-config#TransactionEvent), so a log or a metric reads the kind, the code and the attempt as fields.

## Test a retry

Two real requests at once may or may not conflict, so a test can't count on it. Throw the failure yourself instead: pgcast retries any error whose `code` is `'40001'`. From an outer transaction, `bookSeats()` joins it, so its rows are rolled back with the failed attempt:

<<< ./examples/plain/retries_test.ts{ts twoslash}

Here with `test` from `node:test` and `assert` from `node:assert/strict`; any test runner does. The first test proves the callback can run twice: the first attempt's two seats are gone, and the second books them once.

- The second test gives up: its callback throws on every attempt, so with `transactionAttemptsMax: 2` it runs twice, and the promise rejects with the very error it threw, after `on attempt 2 of 2, giving up`.
- `transactionRetryDelay` at `0` keeps the test fast. `setConfig()` holds for the whole process: put back what the other tests expect ([`getConfig()`](/runtime-config#getConfig)).

## See also

- [`transaction()`](/transaction#transaction): its isolation levels, the SQL it sends, its retries and its errors.
- [`TxnClientForSerializable`](/transaction#TxnClientForSerializable) and [`IsolationSatisfying`](/transaction#IsolationSatisfying): which client a level accepts.
- [Savepoints](/savepoints): undo part of a transaction and keep the rest.
- [Errors](/handle-errors): the errors of an app, from Postgres and from pgcast.

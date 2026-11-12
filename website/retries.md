# Retry a transaction

Book seats at a screening under `SERIALIZABLE`, so that two requests at once can't break a rule, and let pgcast run the transaction again when Postgres refuses one. Then what goes in the callback and what stays out of it, and how to test a retry. It assumes the basics of the [tutorial](/tutorial).
{.lede}

## Put the rule and its writes in one callback

The rule: four seats per customer per screening, at most. No constraint can say that, so the code counts, then books, both in one [`serializable()`](/transaction#serializable) transaction:

<<< ./examples/plain/retries_book_seats.ts{ts twoslash}

Ines has two tabs open, and books from both at once. Each transaction counts 0 seats held, then books, which would give her five. At `SERIALIZABLE`, Postgres refuses one of the two, at its `INSERT` or at its `COMMIT`, with 40001 (`serialization_failure`); pgcast rolls it back and runs the whole callback again. Here, `tabTwo`'s transaction sends:

```sql
-- attempt 1
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- count(): 0 seats held, then insert() of E4, E5 and E6
COMMIT    -- refused with 40001: tabOne has committed D4 and D5
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

| Work | Where | Because |
|---|---|---|
| the queries of the rule and the booking | in the callback, on `txnClient` | rolled back and run again together |
| a `fetch()`, a file, a price from another service | before | it runs once, and the transaction stays short, so it conflicts less |
| an email, a payment, a message on a queue | after the `await`, from what the callback returned | it runs once, and only once the rows are committed |
| a counter, an array, a log line | from the return value, not changed in the callback | an attempt that is rolled back would leave its trace |

Moved into the callback, a retried booking sends two confirmation emails, and pushes its seats twice onto an array outside it.

## Let the error through

pgcast retries only what reaches it. Don't catch a database error inside the callback: after it, Postgres refuses every query of the transaction with 25P02 (`current transaction is aborted, commands ignored until end of transaction block`), and if the callback returns, pgcast sends `COMMIT`, which Postgres turns into a rollback without an error. The promise then resolves with what the callback returned, nothing is saved, and a 40001 caught this way is never retried.

Catch it outside the transaction instead, once pgcast has given up, with [`isDatabaseError()`](/transaction#isDatabaseError):

<<< ./examples/plain/retries_catch.ts{ts twoslash}

| What happened | `bookSeats()` | `reply()` |
|---|---|---|
| booked | resolves with the rows | `'Booked'` |
| over the four seats | resolves with `null` | `'Four seats each, at most'` |
| a seat already booked by someone else | rejects with 23505, after a retry if both were running | `'Seat taken'` |
| a conflict on every attempt | rejects with the last attempt's 40001 or 40P01 | `'Busy: please try again'` |

Throw an `Error`, or the error you caught; not `null` or `undefined`, for which pgcast rejects with a `TypeError` of its own instead ([#179](https://github.com/AlexandreDemartin/pgcast/issues/179)).

## Book inside a larger transaction

Given the `txnClient` of a transaction already open, `bookSeats()` joins it: `serializable()` sends nothing of its own and calls the callback at once ([Passing a transaction through](/transaction#passing-a-transaction-through)). A couple books two seats, both or neither:

<<< ./examples/plain/retries_larger.ts{ts twoslash}

One transaction: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`, the two `count()`s and `insert()`s, `COMMIT`. On a 40001, it is the outer transaction that rolls back and runs its callback again, both bookings included.

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

Typed [`db.Queryable`](/sql-template#Queryable), it would take that client, and `bookSeats()` would run at `READ COMMITTED` ([#177](https://github.com/AlexandreDemartin/pgcast/issues/177)).

## Tune and watch the retries

Three options of [`setConfig()`](/runtime-config#setConfig), for every transaction of the process:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 10,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
  transactionListener: (message, txnId) => console.log(`[txn ${txnId}] ${message}`),
});
```

A retried transaction then logs:

```txt
[txn 0] Transaction rollback (code 40001) on attempt 1 of 10, retrying in 292ms
[txn 0] Retrying transaction, attempt 2 of 10
```

- [`transactionAttemptsMax`](/runtime-config#Config.transactionAttemptsMax): the attempts in all, `5` by default. `1` turns the retries off; so does `0`, whose message reads `on attempt 1 of 0, giving up` ([#179](https://github.com/AlexandreDemartin/pgcast/issues/179)).
- [`transactionRetryDelay`](/runtime-config#Config.transactionRetryDelay): the wait before each retry, a random number of milliseconds between the two. The client stays checked out of the pool while it waits.
- [`transactionListener`](/runtime-config#Config.transactionListener): every message it gets is in [Retries](/transaction#retries).

## Test a retry

Two real requests at once may or may not conflict, so a test can't count on it. Throw the failure yourself instead: pgcast retries any error whose `code` is `'40001'`. From an outer transaction, `bookSeats()` joins it, so its rows are rolled back with the failed attempt:

<<< ./examples/plain/retries_test.ts{ts twoslash}

Here with `test` from `node:test` and `assert` from `node:assert/strict`; any test runner does. The test proves the callback can run twice: the first attempt's two seats are gone, and the second books them once.

- `transactionRetryDelay` at `0` keeps the test fast. `setConfig()` holds for the whole process: put back what the other tests expect.
- To test giving up, throw on every attempt with `transactionAttemptsMax: 2`: the promise rejects with the very error you threw, after `on attempt 2 of 2, giving up`.

## See also

- [`transaction()`](/transaction#transaction): its isolation levels, the SQL it sends, its retries and its errors.
- [`TxnClientForSerializable`](/transaction#TxnClientForSerializable) and [`IsolationSatisfying`](/transaction#IsolationSatisfying): which client a level accepts.
- [Handle errors](/handle-errors): the errors of an app, from Postgres and from pgcast.

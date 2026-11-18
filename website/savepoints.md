# Savepoints

Undo part of a transaction and keep the rest, with `savepoint()`: book the seats that are free among several, skipping those already taken, in one transaction. Then why a conflict still retries the whole transaction, and what to avoid. It assumes you know [Retries](/retries).
{.lede}

## Book what is free

A customer asks for seats F7, F8 and F9 of screening 1000, and Hollis already has F8. Each seat's [`insert()`](/insert#insert) goes in its own [`savepoint()`](/transaction#savepoint), inside one [`serializable()`](/transaction#serializable): a seat already taken, refused with 23505 by the `seat_bookings` primary key, undoes its own insert alone, and the others commit.

<<< ./examples/plain/savepoints_seats.ts{ts twoslash}

`result` is `{ booked: ['F7', 'F9'], taken: ['F8'] }`. The callback's client, `spClient`, is the client it was given, typed as it is: in `serializable()`, a [`TxnClientForSerializable`](/transaction#TxnClientForSerializable) (hover it). The transaction sends:

<!-- probe: db.serializable(pool, txnClient => db.savepoint(txnClient, async () => {}).then(() => db.savepoint(txnClient, async () => { throw new Error(); })).catch(() => {}).then(() => db.savepoint(txnClient, async () => {}))) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- F7
SAVEPOINT pgcast_savepoint_1
-- insert(), then
RELEASE SAVEPOINT pgcast_savepoint_1
-- F8
SAVEPOINT pgcast_savepoint_1
-- insert(), which Postgres refuses with 23505, then
ROLLBACK TO SAVEPOINT pgcast_savepoint_1
RELEASE SAVEPOINT pgcast_savepoint_1
-- F9
SAVEPOINT pgcast_savepoint_1
-- insert(), then
RELEASE SAVEPOINT pgcast_savepoint_1
COMMIT
```

The `catch` keeps the 23505 alone: any other error goes up to `serializable()`. The SQL of the callback's query: [`insert()`](/insert#insert); each case `savepoint()` sends, and the name of a savepoint inside another: [`savepoint()`](/transaction#savepoint).

## Let a conflict retry the transaction

On a 40001 or a 40P01 inside the savepoint, `savepoint()` rejects with it and sends no `ROLLBACK TO`, so the transaction stays aborted. Let it go up, as the example's `throw err` does: `transaction()` rolls back and runs its whole callback again, every seat's savepoint included ([Retries](/retries)).

A savepoint never retries on its own: after a 40001 or a 40P01 the transaction is aborted, and the retry needs a new transaction, with a new snapshot.

## Avoid the pitfalls

- One savepoint at a time on a client: `await` each. Two at once nest in the order they are called: two seats booked with `Promise.all()` make the transaction reject with 3B001, and nothing is booked.
- Don't catch a query's error inside the savepoint's callback: once its work is undone, `savepoint()` rejects with 25P02. Catch it around `savepoint()`, as the example does.
- Outside a transaction, Postgres refuses the `SAVEPOINT` with 25P01, and the callback never runs: call `savepoint()` on a transaction's client.

A `transaction()` given the client of a `transaction()` callback is not a savepoint: it sends nothing, and its callback joins the outer transaction ([Passing a transaction through](/transaction#passing-a-transaction-through)).

## See also

- [`savepoint()`](/transaction#savepoint): the SQL of each case, the clients it takes, its depth and its limits.
- [Retries](/retries): what goes in a transaction's callback, and how to test a retry.
- [Errors](/handle-errors): the errors of an app, from Postgres and from pgcast.

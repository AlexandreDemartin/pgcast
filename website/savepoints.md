# Savepoints

Undo part of a transaction and keep the rest, with `savepoint()`: book the seats that are free among several, skipping those already taken, in one transaction. Then why a conflict still retries the whole transaction, and what to avoid. It assumes you know [Retries](/retries).
{.lede}

## Book what is free

A customer asks for seats F7, F8 and F9 of screening 1000, and Hollis already has F8. Each seat's [`insert()`](/insert#insert) goes in its own [`savepoint()`](/transaction#savepoint), inside one [`serializable()`](/transaction#serializable): a seat already taken, refused with 23505 by the `seat_bookings` primary key, undoes its own insert alone, and the others commit.

<<< ./examples/plain/savepoints_seats.ts{ts twoslash}

`result` is `{ booked: ['F7', 'F9'], taken: ['F8'] }`, and `spClient` is `txnClient` itself (hover it). The transaction sends:

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

The SQL of the callback's query: [`insert()`](/insert#insert); each case `savepoint()` sends, the clients it takes, and the name of a savepoint inside another: [`savepoint()`](/transaction#savepoint).

## Let a conflict retry the transaction

The `catch` keeps the 23505 alone and rethrows any other error. On a 40001 or a 40P01 that the savepoint's callback lets out, `savepoint()` rejects with it and the transaction stays aborted ([`savepoint()`](/transaction#savepoint)), so only a new transaction can retry it: rethrown, it reaches `serializable()`, which rolls back and runs its whole callback again, every seat's savepoint included ([Retries](/retries)).

## Avoid the pitfalls

- One savepoint at a time on a client: `await` each, as the loop does; two seats booked at once, with `Promise.all()`, make the transaction reject with 3B001 ([`savepoint()`](/transaction#savepoint)).
- Catch a query's error around `savepoint()`, as the example does: a callback that catches it and returns makes `savepoint()` reject with 25P02, so a 40001 it catches is not retried there; with the example's `catch`, the transaction rejects with that 25P02 ([`savepoint()`](/transaction#savepoint)).
- Call `savepoint()` on a transaction's client: outside one, Postgres refuses its `SAVEPOINT` with 25P01 ([`savepoint()`](/transaction#savepoint)).
- A `transaction()` given the callback's client is no savepoint: it joins the outer transaction ([Passing a transaction through](/transaction#passing-a-transaction-through)).

## See also

- [`savepoint()`](/transaction#savepoint): the SQL of each case, the clients it takes, its depth and its limits.
- [Retries](/retries): what goes in a transaction's callback, and how to test a retry.
- [Errors](/handle-errors): the errors of an app, from Postgres and from pgcast.

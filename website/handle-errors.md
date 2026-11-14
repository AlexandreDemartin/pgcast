# Errors

Tell what went wrong with a query, and answer it: a seat already booked, a screening that isn't there, an option your own code got wrong. It assumes you know the shortcuts of [First query](/first-query).
{.lede}

## Catch a refusal from Postgres

When Postgres refuses a query, `.run()` rejects with node-postgres's `DatabaseError`, whose `code` is the SQLSTATE. Give it to [`isDatabaseError()`](/transaction#isDatabaseError) with the name of the refusal you expect, and let anything else through. Book seat C4 of screening 1002, which someone may have booked already:

<CastPanel example="errors_seat_taken">

<<< ./examples/errors_seat_taken.ts{ts twoslash}

</CastPanel>

If C4 is taken, Postgres refuses the `INSERT` with 23505, a unique violation, and `booking` is `undefined`; if not, it is the new row. Any other error, from Postgres or not, is thrown again.

With `try` and `await`, the `catch` variable is `unknown` under `strict`, which `isDatabaseError()` refuses ([why](/transaction#isDatabaseError)). Narrow it with `instanceof pg.DatabaseError` first (pg 8.6 or later, not `pg.native`, whose errors are plain `Error`s): then TypeScript knows its fields too.

```ts twoslash
// @strict: true
import * as db from 'zapatos/db';
import pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  if (!(err instanceof pg.DatabaseError && db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation'))) throw err;
  console.log(err.detail);  // Key (screening_id, seat)=(1002, C4) already exists.
}
```

## Tell the refusals apart

Three refusals a booking can meet on the docs schema, each with its `code` and the constraint that `err.constraint` names, which tells two constraints of the same kind apart:

| The booking | `code` | `err.constraint` |
|---|---|---|
| a seat already booked | `23505` | `seat_bookings_pkey` |
| the seat `'Z100'`, which the domain `seat_label` refuses | `23514` | `seat_label_check` |
| screening 1042, which doesn't exist | `23503` | `seat_bookings_screening_id_fkey` |

Each code has its name for `isDatabaseError()`, so one function can give each its answer:

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
const bookingProblem = (err: pg.DatabaseError) =>
  db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation') ? 'That seat is taken.' :
  db.isDatabaseError(err, 'IntegrityConstraintViolation_CheckViolation') ? 'There is no such seat.' :
  db.isDatabaseError(err, 'IntegrityConstraintViolation_ForeignKeyViolation') ? 'There is no such screening.' :
  undefined;
```

- A class name, with no `_`, matches every code of its class: `'IntegrityConstraintViolation'` matches all three. Several names match if any does: `db.isDatabaseError(err, 'IntegrityConstraintViolation', 'DataException')`.
- The names are Postgres's [error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) in PascalCase, and the type refuses any other: your editor completes them.
- `isDatabaseError(null, …)` throws a `TypeError`, which narrowing first avoids; the other cases, such as the names of class 53: [`isDatabaseError()`](/transaction#isDatabaseError).

## Catch outside a transaction

In a transaction, let the error out of the callback and catch it around [`transaction()`](/transaction#transaction): pgcast sends `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, then rejects with the same error. A customer books seats H1 and H2 of screening 1001, both or neither, and H2 is taken:

<<< ./examples/plain/errors_book_pair.ts{ts twoslash}

`booked` is `false`, and H1 isn't booked. The transaction sends:

<!-- probe: db.serializable(pool, async () => { throw Object.assign(new Error(), { code: '23505' }); }) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the insert() of H1
-- the insert() of H2, which Postgres refuses with 23505
ROLLBACK
```

The SQL of each `INSERT`: [`insert()`](/insert#insert). A serialisation failure (40001) or a deadlock (40P01) has already been retried by then, up to [`transactionAttemptsMax`](/runtime-config#Config.transactionAttemptsMax) attempts; if the promise still rejects with one, `'TransactionRollback'` recognises both, and the request can be tried again later ([Retries](/retries)).

::: warning Lost writes
Don't catch a database error inside the callback and carry on. Postgres has aborted the transaction: each query after it is refused with 25P02 (`InvalidTransactionState_InFailedSqlTransaction`), and if the callback returns, pgcast sends `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->, which Postgres turns into a rollback without an error.

The promise resolves, nothing the callback wrote is saved, and pgcast warns once, `PGCAST_DEP003`. With [`transactionRequiresCommit: true`](/runtime-config#Config.transactionRequiresCommit), the default from 7.0, it rejects instead ([`transaction()`, Errors](/transaction#errors)).

For a seat that may be taken, ask Postgres not to refuse: [`upsert()` with `doNothing`](/insert#doNothing) writes `ON CONFLICT ON CONSTRAINT "seat_bookings_pkey" DO NOTHING`<!-- probe: db.upsert('seat_bookings', { screening_id: 1001, seat: 'H2', customer: 'Wren Abernathy' }, db.constraint('seat_bookings_pkey'), { updateColumns: db.doNothing }) --> and gives `undefined` for a taken seat, with no error, and the transaction goes on.
:::

## Tell a missing row from the others

[`selectExactlyOne()`](/select#selectExactlyOne) is for a row that must be there. With none, `.run()` rejects with a [`NotExactlyOneError`](/select#NotExactlyOneError): screening 1042 doesn't exist.

<CastPanel example="errors_not_found">

<<< ./examples/errors_not_found.ts{ts twoslash}

</CastPanel>

- Recognise it with `err instanceof db.NotExactlyOneError`. It is not a `pg.DatabaseError` and has no `code`, so `isDatabaseError()` gives `false`.
- Its message is "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message -->, and `err.query.compile()` gives the SQL and values of the panel.
- It asks for `LIMIT $2`<!-- probe: examples/errors_not_found.ts -->, its value `1`, so two matching rows are not an error: it gives the first, as in Zapatos 6.6.1 ([#32](https://github.com/AlexandreDemartin/pgcast/issues/32)).
- In a `lateral`, a missing row is `null`, not an error ([`selectExactlyOne()`](/select#selectExactlyOne)).
- When a missing row is ordinary, as in a search, [`selectOne()`](/select#selectOne) gives `undefined` instead, and TypeScript makes you check it.

Log its SQL and values where you catch it, then let the error go on:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const screening = await db.selectExactlyOne('screenings', { id: 1042 }).run(pool).catch((err: unknown) => {
  if (err instanceof db.NotExactlyOneError) console.error(err.query.compile());
  throw err;
});
```

## Fix the errors pgcast throws

pgcast throws a plain `Error`, with no `code`, before the query is sent, when a value is not one it accepts: an option outside its type (`'desc'`, `'serializable'`), or a value with no meaning in SQL (`db.Default` in a filter).

These are bugs in the calling code, to fix rather than to catch: the messages say how. Where they surface depends on who throws:

| Who throws | For example | What you get |
|---|---|---|
| a shortcut, given an option outside its type | `direction: 'desc'` in an `order` of [`select()`](/select#errors) | the call throws, before `.run()` |
| `.compile()`, inside `.run()`, given a value with no meaning in SQL | `db.Default` in a filter ([Whereable objects](/sql-template#whereable)) | `.run()` rejects |
| [`transaction()`](/transaction#errors), given a level that is not an `IsolationLevel` | `'serializable'` | its promise rejects |

Every one of them, with its page: [Errors pgcast throws before any query](/transaction#errors-pgcast-throws-before-any-query). Zapatos 6.6.1 sent some of these values to Postgres instead: `db.Default` in a filter as the string `'Symbol(DEFAULT)'`.

A `.catch()` chained on `.run()` misses what the call throws. The type refuses `'desc'`, but a cast lets it through, and `select()` throws "Direction must be ASC/DESC, not 'desc'"<!-- message -->:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const request: { query: { sort: string } };  // ?sort=desc
// ---cut---
const direction = request.query.sort as 'ASC' | 'DESC';
db.select('films', db.all, { order: { by: 'title', direction } })
  .run(pool)
  .catch(err => console.error(err));  // never called: select() has thrown already
```

Check the value instead of casting it, so that `direction` is one you wrote:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const request: { query: { sort: string } };  // ?sort=desc
// ---cut---
const direction = request.query.sort === 'desc' ? 'DESC' : 'ASC';
const films = await db.select('films', db.all, { order: { by: 'title', direction } }).run(pool);
```

If a call still throws, inside an `async` function the throw becomes the promise's rejection, so the caller's `.catch()` gets it, and a `try` around the call catches it too. In a `transaction()` callback, `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) --> follows.

## Answer each kind in one place

The error handler of an app can now tell the three kinds apart, and give each its answer:

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
function statusOf(err: unknown) {
  if (err instanceof db.NotExactlyOneError) return 404;  // no such row
  if (err instanceof pg.DatabaseError) {
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) return 409;  // already there
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation', 'DataException')) return 422;  // a value Postgres refuses
    if (db.isDatabaseError(err, 'TransactionRollback')) return 503;  // try again later
  }
  return 500;  // anything else: a bug, or the database out of reach
}
```

## See also

- [`isDatabaseError()`](/transaction#isDatabaseError): the names it takes, and the codes of the docs schema.
- [Errors pgcast throws before any query](/transaction#errors-pgcast-throws-before-any-query): each, with what throws it and its messages.
- [`transaction()`](/transaction#transaction): its `ROLLBACK`, its retries and its errors.
- [Retries](/retries): what the callback must do when it may run again.

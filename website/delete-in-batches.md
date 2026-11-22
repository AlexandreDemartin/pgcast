# Batch deletes

Delete in batches: remove many rows without holding their locks in one long transaction. Postgres has no `DELETE … LIMIT`, so [`deletes()`](/insert#deletes) takes a `sql` fragment on [`self`](/sql-template#self), `IN (SELECT … ORDER BY … LIMIT …)`, and a loop runs it until it deletes nothing.
{.lede}

## Delete one batch

The screenings before 3 March 2030, the oldest first, two to a batch to show the loop:

<CastPanel example="delete_in_batches">

<<< ./examples/delete_in_batches.ts{ts twoslash}

<template #caption><span>Screenings 1000 and 1001, the two of 1 March.</span></template>
</CastPanel>

- `DELETE FROM screenings LIMIT 1` is a syntax error in Postgres (42601). The subquery picks the batch instead, and `"id" IN (`<!-- probe: examples/delete_in_batches.ts --> deletes it.
- `db.self` is the column of its key, `id`. Given as the whole `where`, with no key, the fragment throws "The 'self' column alias has no meaning here"<!-- message -->.
- `ORDER BY "starts_at", "id"`<!-- probe: examples/delete_in_batches.ts --> takes the oldest first, so a run stopped halfway leaves the newest.
- `returning: ['id']` keeps each result small, as the loop needs only its length.
- A screening that has bookings is refused (23503), and the batch with it: delete its `seat_bookings` first, the same way.

## Delete them all

The loop runs the batch until it deletes nothing:

<<< ./examples/plain/delete_in_batches_loop.ts{ts twoslash}

`deleted` is `4`: a batch of two, another of two, then one of none.

- Each `deletes()` runs on the pool, so each batch is a transaction of its own: it commits, and releases its rows' locks, before the next one starts. In one [`transaction()`](/transaction#transaction), every batch would hold its locks until the last `COMMIT`, as one `DELETE` would.
- Pick a size whose `DELETE` stays short on your table.
- To write many rows at once: [Batches](/batches).

## See also

- [`deletes()`](/insert#deletes) and [`self`](/sql-template#self): the SQL of each part.
- [Transactions](/transaction): what runs in one, and what does not.
- [`DELETE`](https://www.postgresql.org/docs/current/sql-delete.html), in the Postgres docs.

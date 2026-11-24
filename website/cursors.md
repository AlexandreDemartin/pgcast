# Cursors

Send every film to a search index in batches. For a page per HTTP request, see [Pagination](/paginate).
{.lede}

## Index the films

Choose the columns the index needs and order the films by ID. Inside the transaction, wait for the index to accept each batch before fetching the next.

<<< ./examples/plain/cursors_films.ts{ts twoslash}

Hover over `films` for its type, `{ id: number; title: string }[]`. It’s the type [`select()`](/select#select) gives for the same columns. Use [`selectRows()`](/select#selectRows) here so Postgres returns one row per film. A cursor over `select()` would fetch its single aggregate row (`jsonb_agg`) and give the index all four films at once.

The example index logs IDs 1000 and 1001 together, then 1002 and 1003. With a batch size of three, the second batch holds just the fourth film. The values in the declaration are `['id', 'title']`.

<!-- probe: db.repeatableReadRO(pool, async txnClient => { for await (const films of db.cursor(txnClient, db.selectRows('films', db.all, { columns: ['id', 'title'], order: { by: 'id', direction: 'ASC' } }), { batchSize: 2 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" ORDER BY "id" ASC
FETCH FORWARD 2 FROM pgcast_cursor_1
-- The second FETCH returns the last two films. A third returns no rows.
CLOSE pgcast_cursor_1
COMMIT
```

Each fetch costs one round trip. Choose a whole number of rows from 1 to 2147483647 to limit how many each fetch brings into memory. Allow room for one batch to overlap the next. Other ways to keep a large read cheap: [Performance](/performance).

[`cursor()`](/transaction#cursor) runs the declaration unnamed. You can reuse prepared fragments at any depth. The cursor number can change the declaration's SQL, and `pg` requires one query text per name.

## Keep one snapshot

Read the cursor inside the [`transaction()`](/transaction#transaction) that owns it. Postgres refuses the declaration outside a transaction (25P01) and closes the cursor when the transaction ends. If you first read the generator after that transaction ends, pgcast rejects the read before sending a query.

The example’s plain select reads the snapshot visible at declaration. Under repeatable read, an earlier query in the transaction may already have fixed that snapshot.

Suppose another transaction commits a fifth film after the first batch. Under `READ COMMITTED`, a [`count()`](/aggregates#count) in the loop sees five films while the cursor reads four. Under `REPEATABLE READ, READ ONLY`, both see four.

## Handle an early exit or a retry

While the transaction is live, a `break`, a `return` or an error thrown by the index closes the cursor. For a failed SQL query inside the loop, see [`cursor()`](/transaction#cursor).

If a fetch fails, the index keeps any batches it has already received. A retry after a serialisation failure (40001) starts the scan on a new snapshot. A film delivered by the failed attempt may be missing from the new scan.

If the published index must match one successful scan, write the batches to a staging table for this scan using `txnClient` in a read-write transaction. A rollback discards that attempt’s rows. Publish a new index from the staged rows [after commit](/retries#keep-side-effects-out-of-the-callback).

## Work inside the loop

- In a read-write transaction, `lock: { for: 'UPDATE' }` locks rows as the cursor fetches them. Under `READ COMMITTED`, a later fetch can see a title change another transaction committed after declaration.
- A film inserted by the loop stays outside the open cursor’s snapshot.
- If the cursor was already open when you called [`savepoint()`](/transaction#savepoint) and you fetch a film inside the savepoint, the next fetch after the rollback starts after that film.
- Each cursor takes the lowest free number on its client for its name, `pgcast_cursor_<n>`.

Postgres documents the cursor’s lifetime in [DECLARE](https://www.postgresql.org/docs/current/sql-declare.html) and how it advances in [FETCH](https://www.postgresql.org/docs/current/sql-fetch.html).

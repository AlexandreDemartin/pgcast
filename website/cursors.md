# Cursors

Send every film to a search index in batches, keeping only the current batch in memory. For a page per HTTP request, see [Pagination](/paginate).
{.lede}

## Index the films

Choose the columns the index needs and order the films by ID. Inside the transaction, wait for the index to accept each batch before fetching the next.

<<< ./examples/plain/cursors_films.ts{ts twoslash}

Hover over `films` for its type, `{ id: number; title: string }[]`. It’s the type [`select()`](/select#select) gives for the same columns. Use [`selectRows()`](/select#selectRows) here so Postgres returns one row per film. A cursor over `select()` would fetch its single aggregate row (`jsonb_agg`) and give the index all four films at once.

The example index logs IDs 1000 and 1001 together, then 1002 and 1003. The values in the declaration are `['id', 'title']`.

<!-- probe: db.repeatableReadRO(pool, async txnClient => { for await (const films of db.cursor(txnClient, db.selectRows('films', db.all, { columns: ['id', 'title'], order: { by: 'id', direction: 'ASC' } }), { batchSize: 2 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" ORDER BY "id" ASC
FETCH FORWARD 2 FROM pgcast_cursor_1
-- The second FETCH returns the last two films. A third returns no rows.
CLOSE pgcast_cursor_1
COMMIT
```

Each fetch costs one round trip. Choose a batch size from 1 to 2147483647 that leaves room for one array of that many rows. With a size of three, the second batch holds just the fourth film.

A prepared fragment runs unprepared inside [`cursor()`](/transaction#cursor). The cursor number changes the declaration’s SQL, and `pg` requires one query text per prepared statement name. The fragment keeps its name for its next ordinary run.

## Keep one snapshot

Read the cursor inside the [`transaction()`](/transaction#transaction) callback. Postgres refuses the declaration outside a transaction (25P01) and closes the cursor when the transaction ends. If you return the generator from the callback, pgcast rejects the first read before it sends a query.

The cursor sees the films as they were at its declaration. Suppose another transaction commits a fifth film after the first batch. Under `READ COMMITTED`, a [`count()`](/select#count) in the loop sees five films while the cursor reads four. Under `REPEATABLE READ, READ ONLY`, both see four.

## Handle an early exit or a retry

A `break` or `return` from the loop closes the cursor. Throwing an error in the loop also closes it and passes the same error to the caller.

An error in a computed column, such as a division by zero on the third film, arrives when the second fetch reaches it. The index has already received the first two films, and Postgres aborts the transaction.

If a fetch fails with a serialisation failure (40001), a [retry](/retries) starts the callback again and reads the first batch again. Make indexing safe to repeat, for example by replacing each entry by film ID. For work that writes to Postgres, use the same client in a read-write transaction so a rollback undoes the batch’s writes too.

## Work inside the loop

- In a read-write transaction, `lock: { for: 'UPDATE' }` locks rows as the cursor fetches them. After the first batch, another transaction can still lock the third film.
- A film inserted by the loop stays outside the open cursor’s snapshot.
- A [`savepoint()`](/transaction#savepoint) taken while the cursor is open can roll back work, but the cursor keeps its position. If you fetch a film inside the savepoint, the next fetch after the rollback starts after that film.
- Nested loops and two loops running at once on the same client each get their own cursor, `pgcast_cursor_1` and `pgcast_cursor_2`.

Postgres documents the cursor’s lifetime in [DECLARE](https://www.postgresql.org/docs/current/sql-declare.html) and how it advances in [FETCH](https://www.postgresql.org/docs/current/sql-fetch.html).

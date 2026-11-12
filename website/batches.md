# Insert and upsert in batches

Write many rows at once: split them under Postgres's parameter limit, skip the ones already there, add up counts, keep rows with different keys from erasing what's stored, and get back only what you need. It assumes you know [`insert()` and `upsert()`](/insert).
{.lede}

## Insert an array

Give [`insert()`](/insert#insert) an array, and every row goes in one query:

<CastPanel example="batches_insert">

<<< ./examples/batches_insert.ts{ts twoslash}

</CastPanel>

Each cell is a parameter: three rows of two columns, `VALUES ($1, $2), ($3, $4), ($5, $6) RETURNING`<!-- probe: examples/batches_insert.ts -->. An empty array sends nothing and resolves with `[]`.

## Split under the parameter limit

Postgres takes at most 65,535 parameters in a query. Past that, it refuses the query as a protocol violation, 08P01, with a message that varies with the count and doesn't say why, such as `bind message supplies 0 parameters, but prepared statement "" requires 65536`.

A query's parameters, to count before you send it:

- one per cell: rows × columns;
- none for a cell that is `DEFAULT`, a key missing from its row or [`db.Default`](/sql-template#Default); a `sql` fragment sends its own;
- one per column of `returning` and per key of [`extras`](/insert#insert-options), and the parameters of `updateValues`, once.

Or ask the query itself: [`.compile()`](/sql-template#compile)`.values.length` of a one-row insert, as below, when every row has the same keys.

Then send the rows in chunks of a fixed size, well under the limit. In one transaction, every chunk goes in or none does:

<<< ./examples/plain/batches_chunks.ts{ts twoslash}

<!-- probe: db.readCommitted(pool, async () => {}) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
-- the insert() of each chunk: 20 of them for 100,000 tags
COMMIT
```

- If a chunk fails, [`readCommitted()`](/transaction#readCommitted) sends `ROLLBACK`<!-- probe: db.readCommitted(pool, async () => { throw new Error(); }) --> and rejects with its error: no tag is left in. A deadlock (40P01) runs the chunks again first ([Retry a transaction](/retries)).
- On the pool, without the transaction, each chunk commits as it goes: the chunks before the one that failed stay.
- `upsert()` splits the same way.

## Skip the rows already there

Give [`upsert()`](/insert#upsert) the rows and [`updateColumns: db.doNothing`](/insert#doNothing): Postgres inserts the new ones and leaves the others as they are.

<CastPanel example="batches_skip_existing">

<<< ./examples/batches_skip_existing.ts{ts twoslash}

</CastPanel>

- Only the rows inserted come back ([`doNothing`](/insert#doNothing)): with `orchards` already tagged, `added` holds `lighthouses` alone.
- A row given twice in the array is inserted once.

## Add up counts

Except with `doNothing`, an upsert refuses an array that holds the same key twice: 21000, `ON CONFLICT DO UPDATE command cannot affect row a second time`. So sum the ballots first, one row per `film_id` and `stars`:

```ts twoslash
const ballots = [
  { film_id: 1002, stars: 4 },
  { film_id: 1002, stars: 4 },
  { film_id: 1002, stars: 5 },
  { film_id: 1000, stars: 5 },
  { film_id: 1000, stars: 5 },
  { film_id: 1000, stars: 5 },
];

const counts = new Map<string, { film_id: number; stars: number; votes: number }>();
for (const { film_id, stars } of ballots) {
  const key = `${film_id}:${stars}`;
  const row = counts.get(key) ?? { film_id, stars, votes: 0 };
  row.votes += 1;
  counts.set(key, row);
}
const rows = [...counts.values()];  // the three rows below
```

Then add each row's votes to those stored: set `votes` in [`updateValues`](/insert#upsert-options) from both, the stored row by its table's name, the new one as `EXCLUDED`.

<CastPanel example="batches_counts">

<<< ./examples/batches_counts.ts{ts twoslash}

</CastPanel>

- The first run inserts the three rows. The second updates them, to 4, 2 and 6 votes, each with `$action: 'UPDATE'`.
- An `undefined` in `updateValues` doesn't leave `votes` alone ([An `undefined` value](/insert#undefined-values), [#168](https://github.com/AlexandreDemartin/pgcast/issues/168)).

## Rows with different keys

pgcast inserts a key that some rows lack as `DEFAULT` in those rows. Without `updateColumns`, an upsert then sets every column from `EXCLUDED`, that `DEFAULT` included. Say you correct the names on two bookings, and only one of them has its `booked_at`:

- the second row is `(DEFAULT, $5, $6, $7)`<!-- probe: db.upsert('seat_bookings', [{ screening_id: 1000, seat: 'F7', customer: 'Ines Calloway', booked_at: '2030-02-20T09:15:00Z' }, { screening_id: 1000, seat: 'F8', customer: 'Barnaby Quill-Hart' }], ['screening_id', 'seat']) -->, and `"booked_at"` is set from `EXCLUDED."booked_at"`<!-- probe: db.upsert('seat_bookings', [{ screening_id: 1000, seat: 'F7', customer: 'Ines Calloway', booked_at: '2030-02-20T09:15:00Z' }, { screening_id: 1000, seat: 'F8', customer: 'Barnaby Quill-Hart' }], ['screening_id', 'seat']) -->: F8's booking time becomes the time of the upsert, `now()`, the column's default;
- pgcast warns once per process, `PGCAST_DEP001`.

Name the columns to update instead, with [`updateColumns`](/insert#upsert-options):

<CastPanel example="batches_different_keys">

<<< ./examples/batches_different_keys.ts{ts twoslash}

</CastPanel>

- The update is `DO UPDATE SET ("customer") = ROW(EXCLUDED."customer")`<!-- probe: examples/batches_different_keys.ts -->: F8 keeps its booking time. A new row still takes the `booked_at` given, or the default.
- Or give every row the same keys: upsert the rows with a `booked_at` and those without in two calls.
- Not every key counts as missing ([Rows with different keys](/insert#upsert-different-keys)).

::: tip Opt-in
With `db.setConfig({ upsertRequiresSameKeys: true })` ([`Config.upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys)), such an upsert throws before it sends anything.
:::

### An `undefined` in a row

Rows built from input often hold an `undefined`, such as a `booked_at` the form left empty. By default it's sent as `NULL`, as in Zapatos 6.6.1. `booked_at` is `NOT NULL`, so Postgres refuses the whole batch, 23502, `null value in column "booked_at" of relation "seat_bookings" violates not-null constraint`, and pgcast warns once, `PGCAST_DEP002`.

::: tip Opt-in
With `db.setConfig({ undefinedMeansMissing: true })` ([`Config.undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing)), an `undefined` is a missing key: F8 with `booked_at: undefined` is `(DEFAULT, $5, $6, $7)`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.upsert('seat_bookings', [{ screening_id: 1000, seat: 'F7', customer: 'Ines Calloway', booked_at: '2030-02-20T09:15:00Z' }, { screening_id: 1000, seat: 'F8', customer: 'Barnaby Quill-Hart', booked_at: undefined }], ['screening_id', 'seat'], { updateColumns: 'customer' })) -->, a row with different keys as above ([An `undefined` value](/insert#undefined-values)).
:::

## Choose what comes back

Each row comes back whole by default, and from an upsert with its `$action`. For a big batch, ask for less:

<CastPanel example="batches_returning">

<<< ./examples/batches_returning.ts{ts twoslash}

</CastPanel>

- [`returning: ['seat']`](/insert#insert-options) sends `jsonb_build_object($8::text, "seat")`<!-- probe: examples/batches_returning.ts --> in place of `to_jsonb("seat_bookings".*)`<!-- probe: examples/batches_different_keys.ts -->.
- `$action` tells the new rows from the updated ones: `newSeats` is `['F8']` when F7 was already booked.
- [`reportAction: 'suppress'`](/insert#upsert-options) leaves `$action` out of the SQL and of the type, for a batch that doesn't need it.
- Both narrow the type only with `strictNullChecks` on ([Options](/insert#insert-options)).

## See also

- [`insert()`](/insert#insert) and [`upsert()`](/insert#upsert): every option, the SQL it adds.
- [`transaction()`](/transaction#transaction): its levels, retries and errors.
- [Versions, opt-ins and warnings](/versions): the two opt-ins and their warnings.

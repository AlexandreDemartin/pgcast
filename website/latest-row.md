# Latest rows

Get the latest row: each film's next screening, or the latest one per cinema. Nest [`selectOne()`](/select#selectOne) with an [`order`](/select#order-limit-offset-and-withties) in a [`lateral`](/select#lateral) for one row per parent, or give [`distinct`](/select#distinct) an `order` that starts on its column.
{.lede}

## One row per parent

Each film with its next screening from 2 March 2030:

<CastPanel example="latest_row">

<<< ./examples/latest_row.ts{ts twoslash}

<template #caption><span>A Lantern for Edith at cinema 1002, 20:15 UTC, and Small Hours at Calder Bay at cinema 1001, 18:00 UTC; null for the other two, whose screenings are on 1 March.</span></template>
</CastPanel>

- In the lateral, `selectOne()` adds a `LIMIT` of 1 to `ORDER BY "starts_at" ASC, "id" ASC`<!-- probe: examples/latest_row.ts -->: the first row of the order, for each film. For the latest, sort `DESC`.
- `next` is the row or `null`, and its type says so. Every film comes back, the ones with no screening left included.
- `id` after `starts_at` settles two screenings at the same time, so the same one comes back each time.

## The latest per value of a column

Each cinema's latest screening, from `screenings` alone:

<CastPanel example="latest_row_distinct">

<<< ./examples/latest_row_distinct.ts{ts twoslash}

<template #caption><span>Cinema 1000 at 21:45 UTC on 1 March, its later screening of the two; cinemas 1001 and 1002 with their one screening each, on 2 March.</span></template>
</CastPanel>

- `SELECT DISTINCT ON ("cinema_id")`<!-- probe: examples/latest_row_distinct.ts --> keeps the first row of each `cinema_id` in the order: `"starts_at" DESC` makes it the latest.
- The `order` starts on `cinema_id`, or Postgres refuses the query (42P10).
- A cinema with no screening is not in the result, and the rows are screenings, with no column of `cinemas`. For each cinema with its row or `null`, start from `cinemas` with the lateral above.

## See also

- [`lateral`](/select#lateral) and [`selectOne()`](/select#selectOne): what a nested query returns.
- [`distinct`](/select#distinct): `DISTINCT` and `DISTINCT ON`.
- [Joins](/lateral): the rows that point to a row, step by step.

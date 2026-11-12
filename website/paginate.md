# Paginate a list

Show a long list a page at a time: here the films, newest first, two to a page. You give an `order` that never ties, a `limit`, then either an `offset` for page *n* or the last row's keys for the next page; and, if the page shows one, a total. It assumes the basics of the [tutorial](/tutorial).
{.lede}

## Order, then limit

Ask for the first page: an `order` that ends on a unique column, then a `limit`.

<CastPanel example="paginate">

<<< ./examples/paginate.ts{ts twoslash}

</CastPanel>

- End the [`order`](/select#order-limit-offset-and-withties) on a unique column, `id` here. Two films of the same year can otherwise come back in either order, and from one request to the next a film can turn up on two pages or on none: Postgres promises no order among ties ([LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)).
- `limit` is sent as a parameter, `$4`.
- Name the [`columns`](/select#columns) the page shows, and keep the `order`'s among them if you'll fetch the next page from the last row (below).

Then pick how the reader moves on:

| | `offset` | The last row's keys |
|---|---|---|
| Go to page *n* | yes | no: the next page, from the one before |
| A deep page | Postgres computes every row it skips | Postgres starts at the last row, with an index that matches the `order` |
| A film added or removed meanwhile | shifts every later page by one | the next page still starts after the last row shown |
| It needs | an `order` | an `order` that never ties, its columns in `columns` |

## Go to page n with offset

Skip `(n - 1) × size` rows with [`offset`](/select#order-limit-offset-and-withties):

<CastPanel example="paginate_offset">

<<< ./examples/paginate_offset.ts{ts twoslash}

</CastPanel>

- Past the last page, `select()` gives `[]`.
- Postgres still computes the rows it skips, so page 500 costs more than page 1; and a newer film added between two requests pushes the last film of page 1 onto page 2, where the reader sees it twice ([LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)). For a long list that changes, start from the last row.

## Fetch the next page from the last row

This is keyset pagination: ask for the rows that come after the last one you showed, in the same `order`.

### Keep the last row

The last row of the page holds its keys, or is `undefined` when the page is empty: then there is no next page.

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);
// ---cut---
const last = page.at(-1);
if (last === undefined) throw new Error('No next page');
```

Hover `last` to see its type: a row of the `columns` you asked for, or `undefined`, so the keys must be among them. With `strict` on, the compiler holds you to both:

- Without the guard, `last.id` does not compile: `'last' is possibly 'undefined'` (TS18048).
- Without `id` in `columns`, it does not compile either (TS2339).

With `strict` off, both compile: a missing key goes as `NULL`, and the next page skips the rest of that year.

### Ask for the rows after it

Give the `where` as a [`sql`](/sql-template#sql) fragment that compares the `order`'s columns, in its order, with those of `last`, each value through [`db.param()`](/sql-template#param). Here `last` is the one kept above, past its guard, 2008 and 1002:

<CastPanel example="paginate_keyset">

<<< ./examples/paginate_keyset.ts{ts twoslash}

</CastPanel>

- `("release_year", "id") < ($4, $5)` keeps the rows before 2008 and 1002 in the order: an earlier year, or 2008 and a smaller `id` ([row-wise comparison](https://www.postgresql.org/docs/current/functions-comparisons.html#ROW-WISE-COMPARISON)). `<` goes with `DESC`; for an `ASC` order, write `>`.
- With an index on `(release_year, id)`, Postgres starts reading at the last row. On 300,000 films, after the last row (1960, 150000), `EXPLAIN (ANALYZE)` shows an `Index Scan Backward` with `Index Cond: (ROW(release_year, id) < ROW(1960, 150000))`: it reads the 2 rows it returns, and none to skip.
- Keep the key columns `NOT NULL`, as these are: where the comparison reaches a `NULL`, it gives `NULL`, and that row never shows up.
- `s.films.SQL` lets the fragment name only the columns of `films`.

### With a filter

To keep a filter beside the comparison, give the comparison as the value of the first key in a [Whereable](/sql-template#whereable): there [`db.self`](/sql-template#self) stands for that column, and the Whereable joins it to the other keys with `AND`.

<CastPanel example="paginate_keyset_filter">

<<< ./examples/paginate_keyset_filter.ts{ts twoslash}

</CastPanel>

### When the directions differ

A row comparison goes one way. With `release_year` `DESC` and `id` `ASC`, spell it out with [`conditions.or`](/conditions#conditions.or): an earlier year, or the same year and a larger `id`. Then bound it on the first key, with [`conditions.and`](/conditions#conditions.and) and [`conditions.lte`](/conditions#conditions.lte): that year or an earlier one.

<CastPanel example="paginate_mixed">

<<< ./examples/paginate_mixed.ts{ts twoslash}

</CastPanel>

- Create the index in the `order`'s directions, `(release_year DESC, id ASC)`. Postgres starts reading at the last row's year: on 300,000 films, after the last row (1960, 150000), `EXPLAIN (ANALYZE)` shows `Index Cond: (release_year <= 1960)`, then a `Filter:` that removes the rest of that year, 1,167 rows.
- Without the bound, the `OR` is only a `Filter:`: Postgres reads and throws away every row before the last one, 148,671 here, as for an `offset`.

## Count the total

Two ways, by where you want the number:

| | [`count()`](/select#count) | `count(*) OVER ()` in `extras` |
|---|---|---|
| Queries | one more | none, but it reads every row of the `where`, as `count()` does |
| The total | a `number` | a key on each row |
| An empty page | still the total | no row, so no total |
| With the last row's keys | the list's total, given the list's filter | the rows left: use `count()` |

Both count the rows of the `where`. The window's `where` is the page's own: with the last row's comparison in it, it counts the rows left, not the whole list.

### With `count()`

<CastPanel example="paginate_count">

<<< ./examples/paginate_count.ts{ts twoslash}

</CastPanel>

Give it the list's `where`, and none of the page's options:

- `offset` leaves the one row of the count behind, and `.run()` rejects with `TypeError: Cannot read properties of undefined (reading 'result')` ([#163](https://github.com/AlexandreDemartin/pgcast/issues/163)).
- `order` by a column: Postgres refuses the query (42803).

### With a window in `extras`

A window function in [`extras`](/select#extras) counts the rows before `LIMIT` cuts them, and gives the total on each row:

<CastPanel example="paginate_total">

<<< ./examples/paginate_total.ts{ts twoslash}

</CastPanel>

- Each row has `total: 4`. The type is the fragment's second type argument, `number`; Postgres's `bigint` arrives as a JSON number.
- On an empty page, past the last one, there is no row to carry it: `page[0]?.total` is `undefined`, not the total.
- The window makes the page's query read and sort every row of the `where`. On 300,000 films, `EXPLAIN (ANALYZE)` shows a `Seq Scan` and a `WindowAgg` over all of them, where the page alone is an `Index Scan Backward` that stops at its 2 rows.
- With `strict` off, `total` is not in the type ([Options](/select#options)), and `page[0].total` does not compile (TS2339).

## See also

- [`select()`](/select#select): every option and the SQL it writes; [`count()`](/select#count) and its options.
- [The `sql` template](/sql-template#sql), [`self`](/sql-template#self) and [`param()`](/sql-template#param), for the comparison.
- [Why pgcast](/why): why a query stays the SQL you see.

# Recipes

One need a page, met with one query: its SQL, its typed result, and the variants it often needs. Each recipe links to the [reference](/reference) for every option it uses.
{.lede}

<GroupPages />

## Answered elsewhere

These needs have a section on another page:

- Filter, sort or group by a related row's value: [Joins § Filter, sort and group by a lateral](/lateral#filter-sort-and-group-by-a-lateral).
- Go through a join table, or join a table to itself: [Joins § Go through a join table](/lateral#go-through-a-join-table), [§ Join a table to itself](/lateral#join-a-table-to-itself).
- Name the row of a reusable lateral: [Joins § Name the row of a reusable lateral](/lateral#name-the-row-of-a-reusable-lateral).
- Sort by distance: [Joins § Order by a computed value](/lateral#order-by-a-computed-value).
- A page and its total: [Pagination § Count the total](/paginate#count-the-total).
- The next page from the last row: [Pagination § Fetch the next page from the last row](/paginate#fetch-the-next-page-from-the-last-row).
- Insert many rows, and skip the ones already there: [Batches](/batches).
- Queue writes with a lock: [Retries § Queue the requests with a lock](/retries#queue-the-requests-with-a-lock).
- Type a `jsonb` column: [Custom types § A `jsonb` domain](/custom-types#a-jsonb-domain).
- A CTE before a shortcut: [Raw SQL § Put a CTE before a shortcut](/raw-sql#put-a-cte-before-a-shortcut).
- Tell which constraint refused a write: [Errors](/handle-errors).
- Type a hand-written query: [Typed SQL](/typed-sql).
- Read a large result in chunks: [Cursors](/cursors).
- Run pgcast on a migration tool's client: [`QueryableLike`](/sql-template#QueryableLike).

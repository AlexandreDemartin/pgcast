# Unions

Combine two tables: actors and crew in one list, sorted and paged. No shortcut writes a `UNION`, so the query goes in a [`sql`](/sql-template#sql) template with `UNION ALL`, its row typed by hand or by [`@pgcast/typegen`](/typed-sql).
{.lede}

## One list from two tables

Everyone in the docs schema by name, five to a page, here the first page:

<CastPanel example="combine_tables">

<<< ./examples/combine_tables.ts{ts twoslash}

<template #caption><span>Ambrose Okafor, Clementine Ashdown, Corin Halloway (crew), Halvard Brecke and Imogen Thackery.</span></template>
</CastPanel>

- Each `SELECT` gives the same columns in the same order: Postgres matches them by position, not by name, and refuses two types it can't match (42804). The first `SELECT` names the result's columns.
- `ORDER BY` and `LIMIT` sort and page the whole union, by its own columns: `ORDER BY "name", kind, "id"`<!-- probe: examples/combine_tables.ts -->. A column qualified by its table, `actors.name`, is refused (42P01).
- An `id` can be in both tables, so `kind` and `id` end the order: each row has one place, and no row is on two pages. The next page is `OFFSET ${db.param(5)}`, and the total is a query of its own ([Pagination § Count the total](/paginate#count-the-total)).
- `UNION ALL` keeps every row. `UNION` alone also removes the rows that are equal in every column; with `kind` and `id`, there are none to remove.
- The row's type is the one you write, not checked: `kind` comes back as a `text`, so `'actor' | 'crew'` is yours to keep true. [Typed SQL](/typed-sql) generates the row from Postgres and checks it.

## Filter each part

The people whose name holds `or`. Each `SELECT` takes the filter, as a Whereable of its own table:

<CastPanel example="combine_tables_filter">

<<< ./examples/combine_tables_filter.ts{ts twoslash}

<template #caption><span>Ambrose Okafor, an actor, Corin Halloway, crew, and Teodor Vasko, an actor.</span></template>
</CastPanel>

- The condition is written once and sent twice, as `ILIKE $1`<!-- probe: examples/combine_tables_filter.ts --> and `ILIKE $2`<!-- probe: examples/combine_tables_filter.ts -->, one value each.
- A pattern from a user needs its `%`, `_` and `\` escaped first: [Text search](/text-search).

## See also

- [Raw SQL](/raw-sql) and [`sql`](/sql-template#sql): names, values and the row's type in a query of your own.
- [Pagination](/paginate): the order a page needs, and the total.
- [`UNION`](https://www.postgresql.org/docs/current/queries-union.html), in the Postgres docs.

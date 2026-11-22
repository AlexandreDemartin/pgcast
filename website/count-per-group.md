# Group counts

Count per group: a count per value, part of a count, a count per array item. [`select()`](/select#select) groups with [`columns`, `extras` and `groupBy`](/select#groupby-and-having); `count(*) FILTER (WHERE …)` counts part of each group, and `unnest()` in a `sql` template counts the items of an array column, its row typed.
{.lede}

## Count per value

The number of films of each studio:

<CastPanel example="count_per_group">

<<< ./examples/count_per_group.ts{ts twoslash}

<template #caption><span>Studio 1000 has 2 films, studios 1001 and 1002 one each.</span></template>
</CastPanel>

- `GROUP BY "studio_id"`<!-- probe: examples/count_per_group.ts --> gives one row per studio, with `columns` holding what it groups by.
- `count(*)` is a `bigint`, but the row comes back as JSON, so `films` is a number, as its fragment says.
- Not [`count()`](/aggregates#count) with `groupBy`: it gives the first group's count only.
- With the studio's name: [Joins § Filter, sort and group by a lateral](/lateral#filter-sort-and-group-by-a-lateral). To keep only some groups, `having` ([`groupBy` and `having`](/select#groupby-and-having)).

## Count part of each group

Each cinema's screenings, and how many of them are subtitled:

<CastPanel example="count_per_group_filter">

<<< ./examples/count_per_group_filter.ts{ts twoslash}

<template #caption><span>The Lantern has 2 screenings, 1 subtitled; the other two cinemas have 1 each, neither subtitled.</span></template>
</CastPanel>

- `FILTER (WHERE …)` counts only the group's rows that match, so one query gives both counts.
- A Whereable in the fragment is a condition, as in a `where`: `FILTER (WHERE ("subtitled" = $1))`<!-- probe: db.sql`count(*) FILTER (WHERE ${{ subtitled: true }})` --> ([Whereable objects](/sql-template#whereable)).
- A cinema with no subtitled screening gets `0`. A `subtitled` still `NULL` is not `true`, so it does not count.

## Count per array item

The number of films in each genre, among those released before 2010. `genres` is an array, so each film counts once in each of its genres:

<CastPanel example="count_per_group_facets">

<<< ./examples/count_per_group_facets.ts{ts twoslash}

<template #caption><span>drama 2, then mystery, romance and thriller 1 each.</span></template>
</CastPanel>

- `unnest()` gives a row per item, so the query groups by the item. A film whose `genres` is `{}` gives no row, and no group.
- The `WHERE` is the search's own filter, a Whereable here, so the counts are those of the films the search finds.
- In a `sql` template, the `bigint` comes back as a string: `::int` makes it a number. The row's type is the one you write, `{ genre: string; films: number }[]`, not checked: [Typed SQL](/typed-sql) generates and checks it.

## See also

- [`groupBy` and `having`](/select#groupby-and-having): what a grouped `select()` can return.
- [`count()`](/aggregates#count): one count, its options, and `count(DISTINCT …)`.
- [Aggregate functions](https://www.postgresql.org/docs/current/functions-aggregate.html) and [`FILTER`](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES), in the Postgres docs.

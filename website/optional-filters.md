# Optional filters

Filter by optional fields: build a filter from only the fields a request gives. Push one condition per field into a list, then pass it to [`and()`](/conditions#conditions.and), which joins what the list holds and gives every row when it is empty.
{.lede}

## Build the list, then join it

Here a search gives a studio, a year to stay before, or an actor, in any mix. Each field there adds its condition: a key of the film, or an [`exists()`](/conditions#conditions.exists) on its cast.

<CastPanel example="optional_filters">

<<< ./examples/optional_filters.ts{ts twoslash}

<template #caption><span>The films of Larkspur Pictures with Teodor Vasko in the cast: The Salt Orchard (id 1000) and The Cartographer's Silence (id 1002).</span></template>
</CastPanel>

- Type the list `(s.films.Whereable | db.SQLFragment<boolean | null>)[]`. It holds the film's keys, checked against `films`, and a condition on another table, such as the `exists()` on `roles`. A key `films` lacks, or a Whereable of `roles`, does not compile.
- Push a key only when its field is there. `{ studio_id: search.studioId }` with no studio is `"studio_id" = $1`<!-- probe: db.sql`${{ studio_id: undefined }}` --> sent as `NULL`, which matches no row ([Whereable objects](/sql-template#whereable)).
- With no field at all, `and()` is `TRUE`<!-- probe: db.conditions.and() -->: every film. That is what a search with no field should give. In [`update()`](/insert#update) or [`deletes()`](/insert#deletes) it is every row: check the list first ([An empty filter](/security#an-empty-filter)).
- When each field sets a column of its own, a Whereable built key by key does the same, as [An empty filter](/security#an-empty-filter) shows.

With Zapatos 6.6.1, an empty `and()` wrote `()`, which Postgres refuses (42601). In a select, a length check kept for that alone can go.

## Match any of the fields

To find the films that match any field given, join the list with [`or()`](/conditions#conditions.or):

<CastPanel example="optional_filters_or">

<<< ./examples/optional_filters_or.ts{ts twoslash}

<template #caption><span>A film of Ninefold Films or one from before 1980: The Salt Orchard (1974, id 1000) and Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

An empty `or()` is `FALSE`<!-- probe: db.conditions.or() -->: no row. If no field should mean every film, check the list's length before you choose.

## See also

- [`and()`](/conditions#conditions.and), [`or()`](/conditions#conditions.or) and [`exists()`](/conditions#conditions.exists): the SQL each one writes.
- [Whereable objects](/sql-template#whereable): how each key compiles.
- [Related rows](/related-rows): more conditions on another table.

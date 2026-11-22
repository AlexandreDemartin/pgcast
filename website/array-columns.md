# Array columns

Filter on array columns: a film in a genre, in any of several, or in only these. [`arrayContains()`](/conditions#conditions.arrayContains), [`arrayOverlaps()`](/conditions#conditions.arrayOverlaps) and [`arrayContainedIn()`](/conditions#conditions.arrayContainedIn) compare `films.genres`, a `text[]`, with an array you give; [`eqAny()`](/conditions#conditions.eqAny) compares a plain column with a list.
{.lede}

## In a genre

The dramas: the films whose `genres` hold `drama`.

<CastPanel example="array_columns">

<<< ./examples/array_columns.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) and A Lantern for Edith (id 1001).</span></template>
</CastPanel>

- The array you give is one parameter, its items typed as the column's: `arrayContains([1])` does not compile on `genres` ([Arrays](/conditions#arrays)).
- Give several genres, and a film must hold them all: `arrayContains(['drama', 'romance'])` is A Lantern for Edith alone.
- `@>`<!-- probe: examples/array_columns.ts -->, like `&&` and `<@` below, is an operator a GIN index on the column serves ([GIN operator classes](https://www.postgresql.org/docs/current/gin.html#GIN-BUILTIN-OPCLASSES)).

## In any of several

The films that are a romance or a thriller, or both:

<CastPanel example="array_columns_overlaps">

<<< ./examples/array_columns_overlaps.ts{ts twoslash}

<template #caption><span>A Lantern for Edith (id 1001) and The Cartographer's Silence (id 1002).</span></template>
</CastPanel>

An empty array overlaps no array: with no genre ticked, no film. Leave the key out then, as in [Optional filters](/optional-filters).

## In only these

The films whose every genre is drama or romance:

<CastPanel example="array_columns_contained_in">

<<< ./examples/array_columns_contained_in.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000), A Lantern for Edith (id 1001) and Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

Small Hours at Calder Bay has no genre, `{}`, and the empty array is in any list. To leave it out, add that the array is not empty: `{ genres: db.conditions.and(db.conditions.arrayContainedIn(['drama', 'romance']), db.conditions.ne([])) }`<!-- tsc: db.select('films', …) -->.

## A value in the array, with = ANY

Postgres also writes "this value is one of the array's" as `value = ANY(array)`. In a `sql` fragment value, [`db.self`](/sql-template#self) is the column:

<CastPanel example="array_columns_any">

<<< ./examples/array_columns_any.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) and A Lantern for Edith (id 1001), the rows of the first example.</span></template>
</CastPanel>

The rows are those of `arrayContains(['drama'])`, but the type does not check a fragment, and a GIN index does not serve `= ANY` on the column. Prefer the condition.

## A plain column in a list

For a list of values against a column that is not an array, use [`eqAny()`](/conditions#conditions.eqAny). The films of Larkspur Pictures and Ninefold Films:

<CastPanel example="array_columns_eqAny">

<<< ./examples/array_columns_eqAny.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000), The Cartographer's Silence (id 1002) and Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

The list is one parameter too, `= ANY($1)`<!-- probe: db.sql`${{ studio_id: db.conditions.eqAny([1000, 1002]) }}` -->, so one query text serves a list of any length. [Lists](/conditions#lists) compares it with `isIn()`.

## See also

- [Arrays](/conditions#arrays) and [`eqAny()`](/conditions#conditions.eqAny): the values each condition takes, and what it refuses.
- [Array functions and operators](https://www.postgresql.org/docs/current/functions-array.html), in the Postgres docs.

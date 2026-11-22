# Related rows

Filter on related rows: keep the rows that have a related row, or those that lack one. [`exists()`](/conditions#conditions.exists) writes the subquery, [`not()`](/conditions#conditions.not) turns it around, and [`isInSelect()`](/conditions#conditions.isInSelect) compares a column with a subquery's.
{.lede}

## Keep the rows that have one

The films showing at The Lantern, cinema 1000: those with a screening there.

<CastPanel example="related_rows">

<<< ./examples/related_rows.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) and The Cartographer's Silence (id 1002).</span></template>
</CastPanel>

- [`db.parent('id')`](/sql-template#parent) is the film's id, as the `parent` option names `films`.
- Each film comes back once, however many screenings match: `EXISTS`<!-- probe: examples/related_rows.ts --> asks whether there is one. A join would give the film once per screening.
- The result is the films alone. To get their screenings too, nest them in a `lateral` ([Joins](/lateral)).

## Keep the rows that lack one

Wrap the same condition in `not()`. Here the cinemas with no subtitled screening:

<CastPanel example="related_rows_none">

<<< ./examples/related_rows_none.ts{ts twoslash}

<template #caption><span>Kestrel Picture House (id 1001) and The Old Mill Screen (id 1002).</span></template>
</CastPanel>

The screenings of both have `subtitled` still `NULL`, which `{ subtitled: true }` does not match: a screening not known to be subtitled counts as none.

## Compare with a subquery's column

When the outer row is not in the subquery's filter, compare a column with the subquery's own. Here the crew who mentor someone: each `id` that is some member's `mentor_id`.

<CastPanel example="related_rows_in">

<<< ./examples/related_rows_in.ts{ts twoslash}

<template #caption><span>Wilhelmina Strand (id 1000) and Corin Halloway (id 1001).</span></template>
</CastPanel>

The subquery's column must have the key's type ([`isInSelect()`](/conditions#conditions.isInSelect)).

## Keep NULL out of NOT IN

The crew who mentor no one are the other way round. Under `not()`, Postgres reads `IN` as `NOT IN`, and a `NULL` in the subquery's column makes it match no row: Wilhelmina Strand has no mentor. Leave the `NULL`s out of the subquery:

<CastPanel example="related_rows_not_in">

<<< ./examples/related_rows_not_in.ts{ts twoslash}

<template #caption><span>Petra Ilves (id 1002) and Jonah Merriweather (id 1003).</span></template>
</CastPanel>

Without `IS NOT NULL`<!-- probe: examples/related_rows_not_in.ts -->, the query gives no one, with no error. `not(exists(…))` has no such trap: [`exists()`](/conditions#conditions.exists) shows these crew members with it.

## See also

- [Subqueries](/conditions#subqueries): what `exists()` and `isInSelect()` write, and their options.
- [`parent()`](/sql-template#parent): the outer row's column in a subquery.
- [Optional filters](/optional-filters): a subquery among the conditions a request gives.

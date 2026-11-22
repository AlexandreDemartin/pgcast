# Nested counts

Count across joins: each studio's roles, through its films. Nest [`count()`](/select#count) in a [`lateral`](/select#lateral), and reach the table in between with [`isInSelect()`](/conditions#conditions.isInSelect) or [`exists()`](/conditions#conditions.exists), whose `parent` option names the outer row.
{.lede}

## Count through a table in between

A role points to a film, and a film to a studio. Each studio with the number of roles in its films:

<CastPanel example="count_across_joins">

<<< ./examples/count_across_joins.ts{ts twoslash}

<template #caption><span>Larkspur Pictures 6, its two films of three roles each; Greyhaven Studios 3; Ninefold Films 3.</span></template>
</CastPanel>

- `"film_id" IN (SELECT "id" FROM "films" WHERE ("studio_id" = "studios"."id"))`<!-- probe: examples/count_across_joins.ts -->: the roles of the studio's films, counted in one query.
- `parent: 'studios'` makes `db.parent('id')` the studio's `id`, two levels up. Without it, the query throws "The 'parent' table alias has no meaning here"<!-- message --> before it is sent.
- `roles` is a `number`, and `0` for a studio with no role ([`count()`](/select#count)).

## Count the rows that have a related row

Each studio with the number of its films that cast Teodor Vasko (actor 1003):

<CastPanel example="count_across_joins_exists">

<<< ./examples/count_across_joins_exists.ts{ts twoslash}

<template #caption><span>Larkspur Pictures 2, The Salt Orchard and The Cartographer's Silence; 0 for the other two.</span></template>
</CastPanel>

- The first `db.parent('id')` is the lateral's, the studio; the one in `exists()` is the film's, as its `parent: 'films'` says: `"film_id" = "films"."id"`<!-- probe: examples/count_across_joins_exists.ts -->.
- `exists()` counts each film once, however many roles match. A count of the roles themselves goes through `isInSelect()`, above.
- [Related rows](/related-rows) has the same conditions as a filter, without the count.

## See also

- [Subqueries](/conditions#subqueries): `exists()`, `isInSelect()` and their `parent` option.
- [`lateral`](/select#lateral) and [`count()`](/select#count): what a nested count returns.
- [Decision 006](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/006-subquery-conditions.md): why the subquery conditions take `parent`.

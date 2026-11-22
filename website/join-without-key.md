# Keyless joins

Join without a foreign key: on an array, a JSON key, a computed value. A subquery in [`lateral`](/select#lateral) gives each row the rows it matches, and [`db.parent()`](/sql-template#parent) names the outer row's column in its filter, so the join's condition can be any SQL.
{.lede}

## On an array

Each film, and the other films that share one of its genres:

<CastPanel example="join_without_key">

<<< ./examples/join_without_key.ts{ts twoslash}

<template #caption><span>The Salt Orchard and A Lantern for Edith, both dramas, find each other; the other two films find none.</span></template>
</CastPanel>

- `&&` is true when the two arrays share an item: `"genres" && "films"."genres"`<!-- probe: examples/join_without_key.ts -->. A film whose `genres` is `{}` shares none.
- `alias: 'other'` keeps `db.parent()` on the outer film, as in [Join a table to itself](/lateral#join-a-table-to-itself), and [`ne(db.parent('id'))`](/conditions#conditions.ne) leaves the film itself out.
- `alike` is typed as the subquery's rows, as for a join on a key.
- For a plain column against the outer row's array, write [`eqAny(db.parent('genres'))`](/conditions#conditions.eqAny).

## On a JSON key

Each film, and the other films in the same format, a key of `details`:

<CastPanel example="join_without_key_json">

<<< ./examples/join_without_key_json.ts{ts twoslash}

<template #caption><span>The two 35mm films find each other, as do the two digital ones.</span></template>
</CastPanel>

- `->>` reads the key as text on both sides: `"details"->>'format' = "films"."details"->>'format'`<!-- probe: examples/join_without_key_json.ts -->. A film without the key gives `NULL`, which equals nothing.
- With no index, Postgres reads the films again for each one. An index on the expression, `CREATE INDEX ON films ((details->>'format'))`, serves this `=` ([Indexes on expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)).

## On a computed value

Each film, and the other films within 10 minutes of its running time:

<CastPanel example="join_without_key_computed">

<<< ./examples/join_without_key_computed.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (104 minutes) finds The Salt Orchard (112) and A Lantern for Edith (98); The Cartographer's Silence (131) finds none.</span></template>
</CastPanel>

- The fragment compares the column with values worked out from the outer row: `BETWEEN "films"."runtime_minutes" - 10 AND "films"."runtime_minutes" + 10`<!-- probe: examples/join_without_key_computed.ts -->.
- To sort the matches by a computed value, such as a distance, and keep the nearest: [Joins § Order by a computed value](/lateral#order-by-a-computed-value).

## See also

- [Joins](/lateral): `lateral` step by step, on foreign keys.
- [`parent()`](/sql-template#parent): where it works, and what it writes.
- [Reach the outer row](/raw-sql#reach-the-outer-row-through-parent): a hand-written subquery in a `lateral`.

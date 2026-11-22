# In-place updates

Update from the current value: a counter, a value set once, a JSON merge, an array item added. In [`update()`](/insert#update), a `sql` fragment value reads the column as [`db.self`](/sql-template#self), so Postgres works out the new value from the stored one, in one statement.
{.lede}

## Count

Add a vote to a film's four-star count:

<CastPanel example="update_in_place">

<<< ./examples/update_in_place.ts{ts twoslash}

</CastPanel>

- [`add(1)`](/conditions#conditions.add) is `"votes" + $1`<!-- probe: examples/update_in_place.ts -->. `` db.sql`${db.self} + 1` `` writes the same with `1` in the SQL text.
- Postgres adds to the value as it updates the row. Under its default isolation level, two votes at once both count, where reading the count in JavaScript and writing it back can lose one ([Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)).
- A film with no four-star vote yet has no row to update, so `update()` gives `[]`. To insert the row then, use [`upsert()`](/insert#upsert).

## Set a value once

A screening's `subtitled` is `NULL` until the cinema says. Set it, unless it is set already:

<CastPanel example="update_in_place_once">

<<< ./examples/update_in_place_once.ts{ts twoslash}

<template #caption><span>Screening 1002 is now subtitled. On screening 1000, already set to false, the same update keeps false.</span></template>
</CastPanel>

- [`coalesce()`](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL) gives the stored value, or the new one when it is `NULL`.
- In a fragment, a value goes through [`db.param()`](/sql-template#param): a bare string there is a name, and a boolean throws ([Interpolations](/sql-template#interpolations)).
- To know whether this request set the value, filter on it instead, `{ id: 1002, subtitled: db.conditions.isNull }`<!-- tsc: db.update('screenings', { subtitled: true }, …) -->, and set `true`: `update()` gives `[]` when the value was set already.

## Merge JSON

Add keys to a film's `details`, a `jsonb` column, and keep the others:

<CastPanel example="update_in_place_json">

<<< ./examples/update_in_place_json.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay: its format becomes 70mm, and restored is added.</span></template>
</CastPanel>

- `||` merges the top-level keys: each key of the patch replaces the stored one whole. `{ prizes: ['Bronze Owl'] }` on The Cartographer's Silence drops its two prizes. To change a key inside another, use `jsonb_set()` ([JSON functions](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-JSON-PROCESSING)).
- The patch is one parameter, cast to `jsonb`: `CAST($1 AS "jsonb")`<!-- probe: examples/update_in_place_json.ts -->.

## Add an array item

Add a genre to a film, unless it has it:

<CastPanel example="update_in_place_array">

<<< ./examples/update_in_place_array.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay, which had no genre, is now a mystery.</span></template>
</CastPanel>

- [`array_append()`](https://www.postgresql.org/docs/current/functions-array.html) adds the item even when the array holds it. The filter's `not(arrayContains(['mystery']))` leaves out a film that has it, which then gives `[]` ([Array columns](/array-columns)).
- `array_remove()` takes an item out, every copy of it.

## See also

- [`update()`](/insert#update): its arguments, and what it returns.
- [`self`](/sql-template#self): where it is the column.
- [Arithmetic](/conditions#arithmetic): `add()` and `subtract()`, on numbers and dates.

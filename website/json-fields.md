# JSON fields

Query JSON fields: read a field of a `jsonb` column into the result, sort by it, filter on it. A `sql` fragment in [`extras`](/select#extras) reads it with `->>`, typed by the fragment; [`order`](/select#order-limit-offset-and-withties) takes the same fragment, and [`jsonbContains()`](/conditions#conditions.jsonbContains) and [`jsonbPathExists()`](/conditions#conditions.jsonbPathExists) filter on it.
{.lede}

## Read a field

Each film with the format of its print, a field of `details`:

<CastPanel example="json_fields">

<<< ./examples/json_fields.ts{ts twoslash}

<template #caption><span>The Salt Orchard and A Lantern for Edith in 35mm, the other two in digital.</span></template>
</CastPanel>

- `->>` gives the field as text, `"details"->>'format'`<!-- probe: examples/json_fields.ts -->, or `NULL` when the key is missing. The type is the fragment's second type parameter, `string | null`: pgcast does not check it against the JSON.
- `->` keeps the field as JSON, and `#>>` follows a path: `` db.sql`${'details'}#>>'{prizes,0}'` ``<!-- tsc: db.select('films', db.all, { extras: { first: … } }) --> is a film's first prize, or `NULL` ([JSON operators](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-JSON-OP-TABLE)).
- A key that comes from a variable goes through `db.param()`, as in the table of [jsonb](/conditions#jsonb).
- To type the whole column rather than one field, narrow its placeholder: [A `jsonb` domain](/custom-types#a-jsonb-domain).

## Sort by a field

The films with the most prizes first, the count of `prizes` read once and used twice:

<CastPanel example="json_fields_order">

<<< ./examples/json_fields_order.ts{ts twoslash}

<template #caption><span>The Cartographer's Silence (2 prizes), The Salt Orchard (1), A Lantern for Edith (0), then Small Hours at Calder Bay, which has no prizes key.</span></template>
</CastPanel>

- `jsonb_array_length()` counts the array's items, and gives `NULL` when the key is missing: `nulls: 'LAST'` puts Small Hours at Calder Bay at the end, `DESC NULLS LAST`<!-- probe: examples/json_fields_order.ts -->.
- A sort on `->>` sorts text, as a comparison on it compares text ([jsonb](/conditions#jsonb)). Cast a JSON number to sort it as a number: `` db.sql`(${'details'}->>'reels')::int` ``<!-- tsc: db.select('films', db.all, { order: { by: …, direction: 'ASC' } }) -->.

## Filter on a field

The digital films with at least one prize, two conditions on `details` joined with [`and()`](/conditions#conditions.and):

<CastPanel example="json_fields_filter">

<<< ./examples/json_fields_filter.ts{ts twoslash}

<template #caption><span>The Cartographer's Silence (id 1002). Small Hours at Calder Bay is digital too, with no prizes.</span></template>
</CastPanel>

`jsonbContains()` tests that a field equals a value, and `jsonbPathExists()` compares in a path, here with the variable `$n`. The table of [jsonb](/conditions#jsonb) gives the one to use for each test, a pattern a user typed included.

## See also

- [jsonb](/conditions#jsonb): the two conditions, what each matches and what it refuses.
- [`extras`](/select#extras) and [`order`](/select#order-limit-offset-and-withties): the options the fragment goes in.
- [JSON functions and operators](https://www.postgresql.org/docs/current/functions-json.html), in the Postgres docs.

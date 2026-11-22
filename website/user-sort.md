# User sorting

Sort by a user's choice: a column and a direction from the request, safely. Map each key you allow to an [`OrderSpecForTable`](/select#OrderSpecForTable), give the direction as one of two values, and end the [`order`](/select#order-limit-offset-and-withties) on `id`.
{.lede}

## Map the keys you allow

Here the request asks for `sort=tagline` and `dir=desc`. Each key the page allows maps to its own order, and anything else gets the default:

<CastPanel example="user_sort">

<<< ./examples/user_sort.ts{ts twoslash}

<template #caption><span>The Salt Orchard, then The Cartographer's Silence, then the two films with no tagline: Small Hours at Calder Bay (id 1003), then A Lantern for Edith (id 1001).</span></template>
</CastPanel>

- The request's strings never reach the SQL, not even as parameters: they only pick one of your orders, and each `by` is a column you wrote. A caller's string given as `by` would be a name, any column in scope ([A caller's string as a name](/security#a-caller-s-string-as-a-name)).
- `direction` is `'ASC'` or `'DESC'`, whatever `dir` holds: `sort=nonsense&dir=sideways` gives the default, `"release_year" ASC, "id" ASC`<!-- probe: db.select('films', db.all, { order: [{ by: 'release_year', direction: 'ASC' }, { by: 'id', direction: 'ASC' }] }) -->. To answer 400 instead, check both strings before the query.
- `Object.hasOwn()` keeps the lookup to the map's own keys. Without it, `sort=constructor` finds `Object`, not an order, and the query throws "Direction must be ASC/DESC, not '…'"<!-- message -->.
- `nulls: 'LAST'` keeps the films with no tagline at the end in either direction, `"tagline" DESC NULLS LAST`<!-- probe: examples/user_sort.ts -->. Without it, Postgres puts `NULL` first in a `DESC` order ([Sorting rows](https://www.postgresql.org/docs/current/queries-order.html)).
- `id`, last, breaks the ties: the two films with no tagline come back in the same order on each request, which [Pagination](/paginate#order-then-limit) needs.

## Sort by several keys

Here the request gives a list, `sort=-runtime,title`: the longest films first, then by title. Each key in the map adds its order, a `-` makes it `DESC`, and a key the map lacks is skipped:

<CastPanel example="user_sort_keys">

<<< ./examples/user_sort_keys.ts{ts twoslash}

<template #caption><span>The Cartographer's Silence (131 minutes), The Salt Orchard (112), Small Hours at Calder Bay (104), A Lantern for Edith (98).</span></template>
</CastPanel>

- `"runtime_minutes" DESC, "title" ASC, "id" ASC`<!-- probe: examples/user_sort_keys.ts -->: the keys in the request's order, then `id`.
- `sort=-xmin,constructor` gives no key, so the order is `id` alone.
- A map value can be a `sql` fragment of the table too, as `` db.sql`jsonb_array_length(${'details'}->'prizes')` ``<!-- tsc: db.select('films', db.all, { order: { by: …, direction: 'DESC' } }) -->: the user picks it by its key, as here ([JSON fields](/json-fields#sort-by-a-field)).

## See also

- [`order`](/select#order-limit-offset-and-withties) and [`OrderSpecForTable`](/select#OrderSpecForTable): what each item writes.
- [A caller's string as a name](/security#a-caller-s-string-as-a-name): why a choice maps to a name from your own list.
- [Pagination](/paginate): the next page of the same order.

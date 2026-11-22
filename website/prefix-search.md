# Prefix search

Search as users type: match the start of each word typed so far. `to_tsquery()` reads `cart:*` as the words that start with `cart`, so a `sql` fragment on `title_search` sends the cleaned words, each with `:*`, as one parameter; [`ilike()`](/conditions#conditions.ilike) on a prefix is the variant for the start of a whole title.
{.lede}

## The start of each word

The films whose title has a word starting with each word typed, as the reader types "the cart":

<CastPanel example="prefix_search">

<<< ./examples/prefix_search.ts{ts twoslash}

<template #caption><span>The Cartographer's Silence (id 1002).</span></template>
</CastPanel>

- `prefixQuery()` keeps the letters and digits of each word, then writes `the:* & cart:*`: one parameter, `to_tsquery('english', $1)`<!-- probe: db.sql`${{ title_search: db.sql`${db.self} @@ to_tsquery('english', ${db.param('the:* & cart:*')})` }}` -->.
- `to_tsquery()` reads operators, `&`, `|`, `!`, `<->` and `:*`, and raises a syntax error on a stray one (42601), as for a user's `salt &`. Keeping letters and digits leaves none in the input.
- Postgres stems each word as it built the column's vector, and drops a stop word: "the" counts for nothing, and "cartographe" still finds `'cartograph'`.
- With nothing typed, or only stop words, the query holds no word: Postgres sends a notice and matches no film. Leave the filter out until a word is typed ([Optional filters](/optional-filters)).
- The GIN index on `title_search` serves a prefix too: Postgres plans a bitmap index scan.

## The start of the title

To match the start of the whole title instead, give `ilike()` the escaped input followed by `%`:

<CastPanel example="prefix_search_ilike">

<<< ./examples/prefix_search_ilike.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- `escapeLike()` is that of [Text search](/text-search#escape-then-match): the input's `%`, `_` and `\` match themselves.
- Only the title's first letters count: "lantern" does not find A Lantern for Edith, and "a lantern" does.

## See also

- [Full-text search](/conditions#full-text): `websearchToTsquery()`, and `to_tsquery()` in a fragment.
- [Ranked search](/rank-results): the best matches first.
- [Controlling text search](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES), in the Postgres docs: prefixes in a `tsquery`.

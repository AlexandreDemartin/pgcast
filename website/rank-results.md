# Ranked search

Rank search results: the best matches first, with the match highlighted. [`websearchToTsquery()`](/conditions#conditions.websearchToTsquery) finds the films on `title_search`; `ts_rank()` in [`order`](/select#order-limit-offset-and-withties) puts the best first, and `ts_headline()` in [`extras`](/select#extras) marks the words found.
{.lede}

## Best matches first

A search of three words, any of which may match:

<CastPanel example="rank_results">

<<< ./examples/rank_results.ts{ts twoslash}

<template #caption><span>The Salt Orchard, which matches two of the words, then A Lantern for Edith, which matches one; each headline marks the words found.</span></template>
</CastPanel>

- `query` is the same `tsquery` as the condition's, written in a fragment so that `ts_rank()` and `ts_headline()` can read it. Each use sends the input as a parameter of its own.
- `ts_rank()` scores how often the query's words appear in the vector. Two rows can tie: make `order` an array that ends with `{ by: 'id', direction: 'ASC' }` for a stable list.
- `ts_headline()` reads the text, not the vector: `title` here, with `<b>` around each match. It can be slow, as it parses each text it is given, so give it only the rows you show ([Highlighting results](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-HEADLINE)).

::: warning Security
Postgres does not promise that `ts_headline()`'s output is safe to put in a web page as it is ([Highlighting results](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-HEADLINE)). To keep the marks, give it markers of your own with its `StartSel` and `StopSel` options, escape its output, then replace them.
:::

## Weight the columns

Search the tagline too, a match in the title counting for more. `setweight()` labels each column's words, and `ts_rank()` weighs them by label:

<CastPanel example="rank_results_weighted">

<<< ./examples/rank_results_weighted.ts{ts twoslash}

<template #caption><span>The Salt Orchard, "orchard" in its title, then The Cartographer's Silence, "map" in its tagline.</span></template>
</CastPanel>

- `A` and `B` are two of the four labels; by default `ts_rank()` weighs them 1.0 and 0.4 ([Ranking search results](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING)).
- `coalesce()` turns a `NULL` tagline into `''`, as `||` with a `NULL` vector gives `NULL`, which matches no row.
- This vector is computed on each row, and no index serves it. To index it, store it as a generated column with a GIN index, as `title_search` is ([Postgres's docs](https://www.postgresql.org/docs/current/textsearch-tables.html)); the condition then applies to it.

## See also

- [Full-text search](/conditions#full-text): what `websearchToTsquery()` reads in a user's query.
- [Prefix search](/prefix-search): match the words as they are typed.
- [Text search](/text-search): a substring, with `ilike()`.

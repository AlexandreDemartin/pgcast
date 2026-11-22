# Text search

Search what users type: the films whose title, or tagline, holds the text. [`ilike()`](/conditions#conditions.ilike) matches a pattern whatever the case, once the input's `%`, `_` and `\` are escaped; [`or()`](/conditions#conditions.or) spreads it over columns, and [`ilikeAny()`](/conditions#conditions.ilikeAny) takes one pattern per word.
{.lede}

## Escape, then match

Escape the input first, then put it between two `%`, so that it may sit anywhere in the title:

<CastPanel example="text_search">

<<< ./examples/text_search.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- In a pattern, `%` is any text, `_` any one character and `\` escapes the next ([Patterns](/conditions#patterns)). Unescaped, a search for `_` matches every title; escaped, only a title that holds a `_`.
- The input is a parameter either way, `ILIKE $1`<!-- probe: db.sql`${{ title: db.conditions.ilike('%bay%') }}` -->: escaping keeps its meaning, as no input can change the SQL ([Security](/security#values-never-enter-the-sql)).
- No B-tree index serves a pattern that starts with `%`, so Postgres reads the whole table. A trigram index of the [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) extension serves it.

## Search several columns

Give each column the same pattern, and join them with `or()`. "map" is in no title, but it is in a tagline:

<CastPanel example="text_search_columns">

<<< ./examples/text_search_columns.ts{ts twoslash}

<template #caption><span>The Cartographer's Silence (id 1002), whose tagline is "Every map leaves something out."</span></template>
</CastPanel>

A film with no tagline, `NULL`, can still match on its title.

## Search each word

For a search of several words, give `ilikeAny()` one pattern per word: a title that holds any of them matches.

<CastPanel example="text_search_words">

<<< ./examples/text_search_words.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) and Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- The whole list is one parameter, `ILIKE ANY($1)`<!-- probe: db.sql`${{ title: db.conditions.ilikeAny(['%salt%', '%bay%']) }}` -->.
- `filter(Boolean)` drops the empty strings that `split()` leaves around spaces. An empty word would give `%%`, which matches every title; an empty list matches none ([`likeAny()`](/conditions#conditions.likeAny)).
- For the titles that hold every word, join one `ilike()` per word with [`and()`](/conditions#conditions.and).

## Ignore accents

`ilike()` ignores case, not accents: "cartógrapher" does not find The Cartographer's Silence. Postgres's [`unaccent`](https://www.postgresql.org/docs/current/unaccent.html) extension gives an `unaccent()` function: once it is installed, call it on the column and on the pattern, in a `sql` fragment value where [`db.self`](/sql-template#self) is the column.

## See also

- [Patterns](/conditions#patterns): `like()`, `ilike()` and the regular expressions, what each one matches.
- [Full-text search](/conditions#full-text): match words, not text, with `websearchToTsquery()`.
- [Optional filters](/optional-filters): a search among the other fields of a request.

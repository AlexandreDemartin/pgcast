# Conditions {#db-conditions}

`db.conditions` holds the tests, comparisons and operators you give as the value of a Whereable's key, each a `sql` fragment with that column on its left. This page lists each one, the SQL it writes and the values it takes.
{.lede}

## `conditions` {#conditions}

```ts
db.conditions.eq(value)  // or: import { conditions as dc } from 'zapatos/db'
```

Each member is a [`sql`](/sql-template#sql) fragment written around [`db.self`](/sql-template#self), or a function that returns one. As the value of a key of a [Whereable](/sql-template#whereable), `self` is that key's column, and the condition sits in its own parentheses inside the Whereable's: `{ release_year: db.conditions.gte(2000) }` gives `(("release_year" >= $1))`<!-- probe: db.sql`${{ release_year: db.conditions.gte(2000) }}` -->.

<CastPanel example="conditions_where">

<<< ./examples/conditions_where.ts{ts twoslash}

</CastPanel>

- **Where**: as a Whereable value, so in the `where` of [`select()`](/select#select), [`count()`](/select#count), [`update()`](/insert#update) and [`deletes()`](/insert#deletes), the `having` of `select()`, and a Whereable in a `sql` template. Elsewhere `self` has no column: `` db.sql`SELECT ${db.conditions.isNull}` `` throws "The 'self' column alias has no meaning here"<!-- message --> as it compiles.
  - [`and()`](#conditions.and), [`or()`](#conditions.or) and [`not()`](#conditions.not) also take Whereables, so they can be a whole `where`; [`now`](#conditions.now), [`fromNow()`](#conditions.fromNow) and [`exists()`](#conditions.exists) hold no `self`, and go anywhere.
- **Values**: each value is a parameter, `$1`, except a [`Parameter`](/sql-template#Parameter), kept as it is with its cast; a `sql` fragment, written as its SQL; and [`parent()`](/sql-template#parent), the parent query's column in a `lateral` subquery, or in the `where` of [`exists()`](#conditions.exists) and [`isInSelect()`](#conditions.isInSelect), whose `parent` option names that table. `Default`, `self`, `all`, `raw()`, `cols()` and `vals()` throw: [Values a condition refuses](#refused-values). [`eqAny()`](#conditions.eqAny) and the [array conditions](#arrays) send their array as one parameter of plain values: an item that is any of these, a `Parameter`, a fragment or `parent()` throws, at any depth in an array condition, and in place of the array `eqAny()` takes `parent()` alone.
  - [`jsonbContains()`](#conditions.jsonbContains) takes a JSON value alone, and [`jsonbPathExists()`](#conditions.jsonbPathExists) a string as its path and an object of JSON values as its variables: a `Parameter`, a fragment or `parent()` throws there too.
  - [`likeAny()`](#conditions.likeAny) and [`ilikeAny()`](#conditions.ilikeAny) send their array as one parameter of patterns: an item that is neither a string nor `null` throws, any of these included, and so does `parent()` in place of the array.
  - [`websearchToTsquery()`](#conditions.websearchToTsquery) takes two strings: any of these, `all`, a `Parameter`, a fragment, `parent()` or any other value that is no string throws.
- **Type**: a condition is a `SQLFragment` whose second type argument, `T`, is the type of the value it compares with (its `Constraint`, [`sql`](/sql-template#sql)); the Whereable checks `T` against the column's type. The eight tests, `now` and `fromNow()` have no `T`, and pass on any column; the `T` of [`websearchToTsquery()`](#conditions.websearchToTsquery) is a type only a column typed `any` takes, as a `tsvector` column is.
  - A Whereable is also an expression: interpolated in a `SELECT` list, `{ runtime_minutes: add(10) }` is each film's runtime plus ten, `(("runtime_minutes" + $1))`<!-- probe: db.sql`${{ runtime_minutes: db.conditions.add(10) }}` -->. So the type lets through, as a Whereable value, what is no test: [`add()`](#conditions.add), [`subtract()`](#conditions.subtract), [`now`](#conditions.now) and [`fromNow()`](#conditions.fromNow), which Postgres refuses alone in a `where` (42804).

A value of another type does not compile:

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { release_year: db.conditions.eq('1991') });
```

With `strictNullChecks` (or `strict`) on, the type also refuses `null` as a value, in `eq()`, `isIn()` and the others, except [`isDistinctFrom()`](#conditions.isDistinctFrom) and [`isNotDistinctFrom()`](#conditions.isNotDistinctFrom), which take a nullable value. With it off, `eq(null)` compiles to `"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(null) }}` -->, which matches no row. The test for `NULL` is [`isNull`](#conditions.isNull).

## Tests: null, true, false, unknown {#tests}

Constants, not functions: `{ subtitled: db.conditions.isNull }`, no `()`. Each writes the column, then its test.

| Test | Matches a `boolean` that is |
|---|---|
| `isNull`, `isUnknown` | `NULL` |
| `isNotNull`, `isNotUnknown` | `true` or `false` |
| `isTrue` | `true` |
| `isNotTrue` | `false` or `NULL` |
| `isFalse` | `false` |
| `isNotFalse` | `true` or `NULL` |

<CastPanel example="conditions_null">

<<< ./examples/conditions_null.ts{ts twoslash}

</CastPanel>

`isNull` and `isNotNull` work on any column. The six others are for a `boolean`, or a domain over one: on another type Postgres refuses them (42804), though the type lets them through.

### `isNull` {#conditions.isNull}

`"col" IS NULL`<!-- probe: db.sql`${{ col: db.conditions.isNull }}` -->.

### `isNotNull` {#conditions.isNotNull}

`"col" IS NOT NULL`<!-- probe: db.sql`${{ col: db.conditions.isNotNull }}` -->.

### `isTrue` {#conditions.isTrue}

`"col" IS TRUE`<!-- probe: db.sql`${{ col: db.conditions.isTrue }}` -->.

### `isNotTrue` {#conditions.isNotTrue}

`"col" IS NOT TRUE`<!-- probe: db.sql`${{ col: db.conditions.isNotTrue }}` -->.

### `isFalse` {#conditions.isFalse}

`"col" IS FALSE`<!-- probe: db.sql`${{ col: db.conditions.isFalse }}` -->.

### `isNotFalse` {#conditions.isNotFalse}

`"col" IS NOT FALSE`<!-- probe: db.sql`${{ col: db.conditions.isNotFalse }}` -->.

### `isUnknown` {#conditions.isUnknown}

`"col" IS UNKNOWN`<!-- probe: db.sql`${{ col: db.conditions.isUnknown }}` -->: as `isNull`, for a `boolean`.

### `isNotUnknown` {#conditions.isNotUnknown}

`"col" IS NOT UNKNOWN`<!-- probe: db.sql`${{ col: db.conditions.isNotUnknown }}` -->: as `isNotNull`, for a `boolean`.

## Comparisons {#comparisons}

Each takes one value of the column's type, `<T>(a: T)`, and writes the column, its operator and the value.

<CastPanel example="conditions_compare">

<<< ./examples/conditions_compare.ts{ts twoslash}

</CastPanel>

`ne()` and the four orderings match no row whose column is `NULL`; `isDistinctFrom()` does: on `screenings`, `{ subtitled: ne(true) }` finds the `false` row, `{ subtitled: isDistinctFrom(true) }` the `false` row and the two `NULL`s.

### `eq()` {#conditions.eq}

`"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(1) }}` -->.

### `ne()` {#conditions.ne}

`"col" <> $1`<!-- probe: db.sql`${{ col: db.conditions.ne(1) }}` -->.

### `gt()` {#conditions.gt}

`"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.gt(1) }}` -->. [`after()`](#conditions.after) is the same function.

### `gte()` {#conditions.gte}

`"col" >= $1`<!-- probe: db.sql`${{ col: db.conditions.gte(1) }}` -->.

### `lt()` {#conditions.lt}

`"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.lt(1) }}` -->. [`before()`](#conditions.before) is the same function.

### `lte()` {#conditions.lte}

`"col" <= $1`<!-- probe: db.sql`${{ col: db.conditions.lte(1) }}` -->.

### `isDistinctFrom()` {#conditions.isDistinctFrom}

`"col" IS DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isDistinctFrom(1) }}` -->: as `ne()`, with `NULL` a value like any other, so it is never unknown.

### `isNotDistinctFrom()` {#conditions.isNotDistinctFrom}

`"col" IS NOT DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isNotDistinctFrom(1) }}` -->: as `eq()`, with `NULL` a value like any other. `isDistinctFrom()` and `isNotDistinctFrom()` both take a nullable value, `null` included: with `tagline` a `string | null`, `{ tagline: isNotDistinctFrom(tagline) }` finds the films without a tagline when it holds `null`. [`isNull`](#conditions.isNull) stays the plain test for `NULL`.

## Ranges {#ranges}

Each takes two values of the column's type, `<T>(a: T, b: T)`, each a parameter in its own parentheses. Both bounds belong to the range: `between()` matches them, `notBetween()` does not.

<CastPanel example="conditions_between">

<<< ./examples/conditions_between.ts{ts twoslash}

</CastPanel>

### `between()` {#conditions.between}

`"col" BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.between(1, 2) }}` -->. `a` is the low bound: `between(2010, 1990)` matches no row.

### `betweenSymmetric()` {#conditions.betweenSymmetric}

`"col" BETWEEN SYMMETRIC ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.betweenSymmetric(1, 2) }}` -->: the bounds in either order.

### `notBetween()` {#conditions.notBetween}

`"col" NOT BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.notBetween(1, 2) }}` -->. With the bounds reversed, every row whose column is not `NULL`.

### `notBetweenSymmetric()` {#conditions.notBetweenSymmetric}

`"col" NOT BETWEEN SYMMETRIC ($1) AND ($2)`<!-- probe: db.sql`${{ col: db.conditions.notBetweenSymmetric(1, 2) }}` -->: the bounds in either order.

## Patterns {#patterns}

Each takes one pattern, `<T extends string>(a: T)`, so only on a column whose type is a string: on `release_year`, the type refuses them (TS2322). [`likeAny()`](#conditions.likeAny) and [`ilikeAny()`](#conditions.ilikeAny) take an array of them.

| Family | Syntax | Matches |
|---|---|---|
| `like()`, `ilike()`, `likeAny()`, `ilikeAny()` | `%` any text, `_` one character, `\` escapes the next | the whole value |
| `similarTo()` | Postgres's SQL regular expressions | the whole value |
| `reMatch()`, `reImatch()` | POSIX regular expressions | any part of the value |

So `like('Lantern')` matches no title, and `reMatch('Lantern')` matches `A Lantern for Edith`. The `i` forms ignore case.

<CastPanel example="conditions_patterns">

<<< ./examples/conditions_patterns.ts{ts twoslash}

</CastPanel>

### `like()` {#conditions.like}

`"col" LIKE $1`<!-- probe: db.sql`${{ col: db.conditions.like('x') }}` -->.

### `notLike()` {#conditions.notLike}

`"col" NOT LIKE $1`<!-- probe: db.sql`${{ col: db.conditions.notLike('x') }}` -->.

### `ilike()` {#conditions.ilike}

`"col" ILIKE $1`<!-- probe: db.sql`${{ col: db.conditions.ilike('x') }}` -->.

### `notIlike()` {#conditions.notIlike}

`"col" NOT ILIKE $1`<!-- probe: db.sql`${{ col: db.conditions.notIlike('x') }}` -->.

### `likeAny()` {#conditions.likeAny}

```ts
db.conditions.likeAny<T extends string>(a: readonly T[]): SQLFragment<boolean | null, T>
```

From 6.12.0. `"col" LIKE ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.likeAny(['x%', 'y%']) }}` -->: the column matches one of the patterns, the whole array one parameter, as in [`eqAny()`](#conditions.eqAny). Where `or(like('The %'), like('% Bay'))` writes one parameter per pattern, and one text per count, this is one text for any count.

- **Empty array**: `false`, on a `NULL` column too: no row, and every row under [`not()`](#conditions.not).
- **`null` items**: Postgres reads one as a `NULL` pattern, so a row no other pattern matches gives `NULL`, and `not()` leaves it out too. The type refuses `null` there with `strictNullChecks` on.
- **Negation**: `not(likeAny(patterns))`, which Postgres reads as `NOT LIKE ALL`: the rows that match none of them.
- **Wildcards**: `%`, `_` and `\` in a user's input are the pattern's own, as in [`like()`](#conditions.like): escape them first, `input.replace(/[\\%_]/g, '\\$&')`, or `'100%'` matches every title that starts with `100`.
- **Columns**: one whose type is a string. On a `citext` column, `LIKE` ignores case only when the extension's schema is on the `search_path`, as with `like()`.
- **Literal types**: the patterns are typed `string`, where `like()` keeps its literal. So on a column typed narrower, a [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions) union or a placeholder narrowed to `` `${string}@${string}` ``, the type refuses them (TS2322): write the array `as const`, `likeAny(['%@example.com'] as const)`<!-- tsc: db.select('films', { title: db.conditions.… }) -->. On an enum column, a label then passes the type, and Postgres refuses it (42883), as with `like()`.

A list that is not an array throws as the query compiles, as in `isIn()`, and so does an item that is neither a string nor `null` when `likeAny()` is called: `pg` would send a number as its text, and a `Parameter`, a fragment or an object as JSON, patterns no one wrote. An item added to the array afterwards goes unchecked. The message names the item:

> `` `likeAny()` sends its array as one parameter, so each item is a pattern, a string, not `db.param()`: give the pattern as a string. ``<!-- message -->

### `ilikeAny()` {#conditions.ilikeAny}

```ts
db.conditions.ilikeAny<T extends string>(a: readonly T[]): SQLFragment<boolean | null, T>
```

From 6.12.0. `"col" ILIKE ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.ilikeAny(['x%', 'y%']) }}` -->: as [`likeAny()`](#conditions.likeAny), ignoring case. Its negation, `not(ilikeAny(patterns))`, is `NOT ILIKE ALL`.

<CastPanel example="conditions_ilikeAny">

<<< ./examples/conditions_ilikeAny.ts{ts twoslash}

</CastPanel>

### `similarTo()` {#conditions.similarTo}

`"col" SIMILAR TO $1`<!-- probe: db.sql`${{ col: db.conditions.similarTo('x') }}` -->.

### `notSimilarTo()` {#conditions.notSimilarTo}

`"col" NOT SIMILAR TO $1`<!-- probe: db.sql`${{ col: db.conditions.notSimilarTo('x') }}` -->.

### `reMatch()` {#conditions.reMatch}

`"col" ~ $1`<!-- probe: db.sql`${{ col: db.conditions.reMatch('x') }}` -->.

### `reImatch()` {#conditions.reImatch}

`"col" ~* $1`<!-- probe: db.sql`${{ col: db.conditions.reImatch('x') }}` -->.

### `notReMatch()` {#conditions.notReMatch}

`"col" !~ $1`<!-- probe: db.sql`${{ col: db.conditions.notReMatch('x') }}` -->.

### `notReImatch()` {#conditions.notReImatch}

`"col" !~* $1`<!-- probe: db.sql`${{ col: db.conditions.notReImatch('x') }}` -->.

## Lists {#lists}

`isIn()` and `isNotIn()` take an array of values of the column's type, `<T>(a: readonly T[])`, compiled as [`vals()`](/sql-template#vals) of it: one parameter per item. [`eqAny()`](#conditions.eqAny) sends the whole array as one parameter.

Which one: `eqAny()` for a list built at run time, as one query text serves any length, so one [`prepared()`](/sql-template#prepared) statement, with no limit of 65,535 parameters; `isIn()` for a short fixed list, or one that holds a `Parameter` or a fragment, which `eqAny()` refuses.

<CastPanel example="conditions_isIn">

<<< ./examples/conditions_isIn.ts{ts twoslash}

</CastPanel>

An item compiles as in `vals([…])` within a filter:

| Item | Compiles to |
|---|---|
| a plain value | a parameter, `$1` |
| a `Parameter` | as it is, with its cast: `isIn([db.param('x', 'text'), 'y'])` gives `IN (CAST($1 AS "text"), $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([db.param('x', 'text'), 'y']) }}` --> |
| a `sql` fragment | its SQL |
| `parent(c?)` | the parent column, in a `lateral` subquery: `IN ("films"."id")`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.conditions.isIn([db.parent('id')]) }) } }) --> |
| `Default`, `self`, `all`, `raw()`, `cols()`, `vals()` | throws ([Values a condition refuses](#refused-values)) |

Zapatos 6.6.1 sent a `Parameter` and `parent()` there as one more parameter, as JSON (`'{"value":"x","cast":"text"}'`, `'{"value":"id"}'`), so `isIn()` found nothing and `isNotIn()` matched every row on a text column.

The list itself is an array, `readonly` or not. Anything else gets past the type only as `any`, or as `null` and `undefined` without `strictNullChecks`: a `Set`, an iterator, a typed array, an array-like object, a string. It throws as the query compiles, so `run()` rejects with a plain `Error` before any query:

> `` `isNotIn()` takes an array, not `Set`: make one with `isNotIn([...values])`, or `Array.from(values)` for an array-like object. ``<!-- message -->

One value in place of the list, a string, a number, `null` or `undefined`, gets the other advice, as spreading `'Ada'` would give `'A'`, `'d'`, `'a'`:

> `` `isIn()` takes an array, not `string`: for one value, write `isIn([value])`. ``<!-- message -->

Zapatos 6.6.1 read the list's `length`. A `Set` or an iterator has none, so `isIn()` gave `false` and `isNotIn()` gave `true`, every row: with `ids` a `Set`, `db.deletes('films', { id: db.conditions.isNotIn(ids) })` was `DELETE FROM "films" WHERE ((true))`. A string gave its characters, which for a one-character string such as Express's `req.query.id` (`'5'` for `?id=5`) was its one value, the right rows, and now rejects; an array-like object gave its values and then its `length`, and `null` a `TypeError` at the call.

### `isIn()` {#conditions.isIn}

`"col" IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([1, 2]) }}` -->. An empty array gives `false`: no row.

### `isNotIn()` {#conditions.isNotIn}

`"col" NOT IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isNotIn([1, 2]) }}` -->. An empty array gives `true`: every row. A `NULL` in the list, as Postgres reads `NOT IN`, makes it match no row; the type refuses `null` there with `strictNullChecks` on.

<CastPanel example="conditions_isNotIn">

<<< ./examples/conditions_isNotIn.ts{ts twoslash}

</CastPanel>

### `eqAny()` {#conditions.eqAny}

```ts
db.conditions.eqAny(a: ParentColumn): SQLFragment<boolean | null, never>
db.conditions.eqAny<T>(a: readonly T[]): SQLFragment<boolean | null, T>
```

From 6.9.0. `"col" = ANY($1)`<!-- probe: db.sql`${{ col: db.conditions.eqAny([1, 2]) }}` -->, the whole array one parameter. Where `isIn()` writes one text per length, `IN ($1, $2, …)`, this is one text for any length, so one [`prepared()`](/sql-template#prepared) statement serves them all, and it takes more items than the 65,535 parameters a query can hold ([Batches](/batches)).

<CastPanel example="conditions_eqAny">

<<< ./examples/conditions_eqAny.ts{ts twoslash}

</CastPanel>

- **Empty array**: no row, as Postgres reads `= ANY('{}')`, with the same SQL.
- **`null` items** never match, and under [`not()`](#conditions.not) one makes it match no row, as `NOT IN` does; the type refuses `null` there with `strictNullChecks` on.
- **Items**: Postgres reads the parameter as an array of the column's type, so each item is what [`eq()`](#conditions.eq) takes there: an enum's label, a `Date` ([Dates and times](#dates)), an `int8` as a string or a `bigint`. On a `jsonb` column, an object is sent as JSON, and a string is JSON text: `'"x"'` for the string `x`, `JSON.stringify([1, 2])` for an array.
- **[`parent()`](/sql-template#parent)**: an array column of the parent row, in a `lateral` subquery. A film's tags that are among its genres, `{ tag: eqAny(db.parent('genres')) }`, give `= ANY("films"."genres")`<!-- probe: db.select('films', db.all, { lateral: { tags: db.select('tags', { tag: db.conditions.eqAny(db.parent('genres')) }) } }) -->, where `isIn([db.parent('genres')])` compares the tag with the whole array, which Postgres refuses (42883, `operator does not exist: text = text[]`).
- **[`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson)** on, the array is still sent as an array, `= ANY($1)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ col: db.conditions.eqAny([1, 2]) }}`) -->: a `sql` fragment with `db.param(ids)` becomes `= ANY(CAST($1 AS "json"))`, which Postgres refuses (42809).

A list that is not an array throws as the query compiles, as in `isIn()`. So does an item that one array parameter cannot hold: `pg` would send a `Parameter` or a fragment as JSON, and read an array item as more items, with no error. The message names the item, a `sql` fragment or `db.parent()` in place of `db.param()`:

> `` `eqAny()` sends its array as one parameter, so each item is a plain value, not `db.param()`: give the value itself, or use `isIn()`, which takes it. ``<!-- message -->

> `` `eqAny()` sends its array as one parameter, which reads an array item as more items: on an array column, use `isIn()`; on a `jsonb` column, give the item as JSON text, `JSON.stringify(item)`. ``<!-- message -->

`Default`, `self`, `all`, `raw()`, `cols()` and `vals()` throw too, as an item or as the list: [Values a condition refuses](#refused-values).

The type takes more than that, and each of these throws as the query compiles, before any query ([#570](https://github.com/AlexandreDemartin/pgcast/issues/570)):

- **Items**: a `Parameter`, a fragment or `parent()`, as the Whereable does in `isIn()`.
- **The list**: `{}`, `{ value: 'title' }` and `db.param()` of a column's name, `db.param('title')`, pass as a `ParentColumn`, whose members are all optional. `eqAny({})`<!-- tsc: db.select('films', { id: db.conditions.… }) --> throws as a list that is not an array, `eqAny(db.param('title'))`<!-- tsc: db.select('films', { id: db.conditions.… }) --> as `db.param()` does.

## Arrays {#arrays}

From 7.0.0. Each condition takes an array of the column's elements, including a readonly array, or a [parent column](/sql-template#parent). On `films.genres`, a `text[]`, pass an array of strings. For enum labels on TypeScript 4.1 and 5.9, use `['director'] as const` or a typed `s.crew_job[]`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { genres: db.conditions.arrayOverlaps(['romance']) });
// @ts-expect-error genres holds strings
db.select('films', { genres: db.conditions.arrayOverlaps([1]) });
// @ts-expect-error a parent column can be the operand, but cannot be a genre
db.select('films', { genres: db.conditions.arrayContains([db.parent('id')]) });
```

A saved `arrayContains(['drama'])` has the constraint `string[]`. In a callback, write `.map(genres => db.conditions.arrayContains(genres))` to preserve the element type. A mock written to the 6.6.1 signature needs both overloads.

TypeScript still accepts an empty literal, a `never[]` variable or `parent()` on a scalar column. Postgres rejects the array comparison on an integer column.

The 6.6.1 spelling below also compiles. It sends a two-dimensional array as one parameter. These operators compare elements across dimensions, so `{drama,romance}` overlaps `{{romance,thriller}}`.

<CastPanel example="conditions_arrays">

<<< ./examples/conditions_arrays.ts{ts twoslash}

</CastPanel>

Or write a `sql` fragment value, where `db.self` is the column, and cast its parameter: `` db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` `` gives `"col" @> CAST($1 AS "text"[])`<!-- probe: db.sql`${{ col: db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` }}` -->.

<CastPanel example="conditions_arrays_fragment">

<<< ./examples/conditions_arrays_fragment.ts{ts twoslash}

</CastPanel>

With [`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) on, a condition sends its array as `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ genres: db.conditions.arrayContains(['drama']) }}`) -->, an array of arrays too, which Postgres refuses (42883: `text[] @> json`). The condition's type refuses a `Parameter` of an array (TS2769), but in the fragment, the cast given to `param()` wins over the option ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)): it runs either way.

As in Zapatos 6.6.1, the type also takes `{}`, `{ value: … }` and `db.param()` of a column's name, which pass as a `ParentColumn`, whose members are all optional ([#570](https://github.com/AlexandreDemartin/pgcast/issues/570)). `{}` is sent as `'{}'`, the empty array: `arrayContains({})`<!-- tsc: db.select('films', { genres: db.conditions.… }) --> matches every row whose array is not `NULL`, `arrayContainedIn({})` the empty arrays, and `arrayOverlaps({})` no row. Postgres refuses `{ value: 'title' }` and `db.param('title')` (22P02, `malformed array literal`), and under [`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson), `{}` and `{ value: … }` too (42883).

The array is one parameter, so each item, at any depth, is a plain value, as in [`eqAny()`](#conditions.eqAny): `Default`, `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment or `parent()` throws as the query compiles ([refused values](#refused-values)). On `genres`, TypeScript refuses each of these items (TS2322). Zapatos 6.6.1 sent `Default` as `'{"Symbol(DEFAULT)"}'`, `self` as `'{"Symbol(self)"}'` and `db.all` as `'{"Symbol(all)"}'`. It sent the other items as their JSON. Among `NULL`, `{}` and `{drama}`, `arrayContainedIn([db.all])` matched only `{}`, and under `not()` only `{drama}`. The other two operators matched no row. On an `int4[]`, Postgres refused these items (22P02). For SQL, write the `sql` fragment value above.

### `arrayContains()` {#conditions.arrayContains}

`"col" @> $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContains(['x']) }}` -->: the column holds every element of the value.

### `arrayContainedIn()` {#conditions.arrayContainedIn}

`"col" <@ $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContainedIn(['x']) }}` -->: every element of the column is in the value.

### `arrayOverlaps()` {#conditions.arrayOverlaps}

`"col" && $1`<!-- probe: db.sql`${{ col: db.conditions.arrayOverlaps(['x']) }}` -->: they share at least one element.

## jsonb {#jsonb}

From 6.9.0, two conditions on a `jsonb` column: its JSON contains a value, or a path finds an item in it.

A test on one field of the JSON is one of them, or a `sql` fragment for a pattern:

| To test a field | Write | SQL |
|---|---|---|
| equals a value | `jsonbContains({ format: '35mm' })` | `"details" @> CAST($1 AS "jsonb")`<!-- probe: db.sql`${{ details: db.conditions.jsonbContains({ format: '35mm' }) }}` --> |
| is over a value, or starts with one | `jsonbPathExists('$.reels ? (@ > $n)', { n: 10 })` | `jsonb_path_exists("details", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: db.sql`${{ details: db.conditions.jsonbPathExists('$.reels ? (@ > $n)', { n: 10 }) }}` --> |
| matches a pattern a user typed | `` db.sql`${db.self}->>${db.param('format')} ILIKE ${db.param(pattern)}` `` | `"details"->>$1 ILIKE $2`<!-- probe: db.sql`${{ details: db.sql`${db.self}->>${db.param('format')} ILIKE ${db.param('%mm')}` }}` --> |

- **Equality** compares JSON values, so `{ reels: 10 }` does not match the string `"10"`, and a GIN index on the column serves it, with either operator class.
- **An ordered comparison** goes in the path, which compares JSON numbers: 9 reels are fewer than 10. `starts with $p` takes a variable too.
- **A pattern** from a user's input: the key and the pattern are two parameters. Not `like_regex` in a path: its pattern must be a literal of the path, so `$.format ? (@ like_regex $p)` fails in Postgres (42601), and the input would have to go into the path's text.
- **`->>` returns text**, so a comparison on it compares text: `` db.sql`${db.self}->>'reels' > ${db.param(10)}` `` finds a print of 9 reels, as `'9'` sorts after `'10'`. Compare in the path instead, as above.

### `jsonbContains()` {#conditions.jsonbContains}

```ts
db.conditions.jsonbContains(a: JSONValue): SQLFragment<boolean | null, JSONValue>
db.conditions.jsonbContains<T>(a: JSONValue): SQLFragment<boolean | null, T>
```

`"col" @> CAST($1 AS "jsonb")`<!-- probe: db.sql`${{ col: db.conditions.jsonbContains({ format: '35mm' }) }}` -->: the column's JSON contains the value, as Postgres reads [containment](https://www.postgresql.org/docs/current/datatype-json.html#JSON-CONTAINMENT). The value goes as its JSON text, `JSON.stringify(a)`, so you need not write `JSON.stringify` yourself.

<CastPanel example="conditions_jsonbContains">

<<< ./examples/conditions_jsonbContains.ts{ts twoslash}

</CastPanel>

- **Objects and arrays** are compared level by level, from the top: `{ prizes: ['Golden Gull'] }` finds the films whose `prizes` hold that string, among other prizes, and `{ format: '35mm' }` a `format` key at the top, never one nested deeper, as in `{ "cut": { "format": "35mm" } }`. `{}` is contained in every object, so every film.
- **A string, a number, `null`**: JSON values too, the string sent as `"35mm"`, `null` as JSON's `null`. Each matches that value, or an array that holds it at its top level: `details` is an object, so `jsonbContains('35mm')` finds no film. A bare `` db.sql`${db.self} @> ${db.param(x, 'jsonb')}` `` sends a string as text, and an array as a Postgres array unless `castArrayParamsToJson` is on: Postgres refuses both (22P02).
- **[`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson)** and **[`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson)** change nothing: `"details" @> CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true }), db.sql`${{ details: db.conditions.jsonbContains({ format: '35mm' }) }}`) -->, the value already JSON text.
- **What JSON lacks** throws as the query compiles, at any depth, the message naming its key: `undefined`, a function or a symbol, which `JSON.stringify` leaves out of an object (so `{ format: undefined }` would be `{}`, every film) and writes as `null` in an array; a `bigint`, which it throws on; a circular value. The type refuses them, but not in a value typed `{ format?: string }`, which may hold `undefined` unless `exactOptionalPropertyTypes` is on, nor in one typed `any`.
- **Type**: the value is a `JSONValue`, and so is the condition's `T`: a `jsonb` column takes it, a `text` or `integer` one refuses it (TS2322). A `json` column passes, both being `JSONValue`, and Postgres refuses it (42883, `operator does not exist: json @> jsonb`). A value typed by an `interface` is refused (TS2769), as in an `insert()` on a `jsonb` column: give it a `type` alias. The type also refuses a class instance without an index signature, a `readonly string[]` and the readonly tuple inferred for `const a = ['a'] as const` (TS2769). Pass a mutable copy with `jsonbContains([...a])`.
- **A `jsonb` domain whose placeholder you narrowed** ([A `jsonb` domain](/custom-types#a-jsonb-domain)) refuses the condition's `JSONValue` (TS2322): name the placeholder, `jsonbContains<PgProjection>({ format: '35mm' })`, and the condition has its type. The value is still any JSON value, `{ format: 'VHS' }` too, not checked against the placeholder: a contained value may hold only some of its keys. A `text` column refuses that condition too (TS2322).

A `Parameter`, a `sql` fragment or `parent()` throws as the query compiles, at any depth, as `Default`, `self`, `raw()`, `cols()` and `vals()` do, and the type refuses each: `JSON.stringify` would send its fields, which match no row, with no error.

> `` `jsonbContains()` sends its value as JSON text, so it takes a JSON value, not `db.param()`: give a value; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message -->

### `jsonbPathExists()` {#conditions.jsonbPathExists}

```ts
db.conditions.jsonbPathExists(path: string, vars?: JSONObject): SQLFragment<boolean | null, JSONValue>
db.conditions.jsonbPathExists<T>(path: string, vars?: JSONObject): SQLFragment<boolean | null, T>
```

`jsonb_path_exists("col", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: db.sql`${{ col: db.conditions.jsonbPathExists('$.prizes[*] ? (@ == $prize)', { prize: 'Golden Gull' }) }}` -->: the [SQL/JSON path](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-SQLJSON-PATH) finds at least one item in the column's JSON. The path is one parameter, its variables another: each `$name` of the path is a key of `vars`, sent as its JSON text, so a value you compare with never goes into the path.

<CastPanel example="conditions_jsonbPathExists">

<<< ./examples/conditions_jsonbPathExists.ts{ts twoslash}

</CastPanel>

- **Variables**: `{ prefix: 'Silver' }` gives `$prefix` the JSON string `"Silver"`, and a number stays a number, so `'2000'` equals no year. A name that is no plain identifier is quoted in the path: `$"print format"` reads `{ 'print format': 'digital' }`. Left out, `vars` is `{}`, with the same SQL. A variable the path names and `vars` lacks fails in Postgres (42704, `could not find jsonpath variable "prize"`).
- **Not in the path**: a value written into the path's text is read as path. `` `$.prizes[*] ? (@ == "${prize}")` ``, given the prize `Golden" || @ != "`, finds every film with a prize.
- **`lax` and `strict`**: in `lax` mode, the default, a film without `prizes` gives no item for `$.prizes[*]`. In `strict` mode, `strict $.prizes` fails the whole query on such a film (2203A, `JSON object does not contain key "prizes"`); inside a filter, `strict $ ? (@.prizes.size() > 1)`, that film is skipped. pgcast passes no `silent` argument, so Postgres's default holds, and these errors are raised.
- **A path, not a predicate**: `$.format == "VHS"` is a predicate check, whose one item is its boolean, `false` too, so every film matches. Write a filter: `$.format ? (@ == $format)`.
- **An invalid path** fails in Postgres (42601): `$.prizes[*` gives `syntax error at end of jsonpath input`.
- If a datetime comparison needs the session time zone, `jsonbPathExists()` raises 0A000. For a path without variables, use `` db.sql`jsonb_path_exists_tz(${db.self}, ${db.param(path, 'jsonpath')})` ``. For a path with variables, pass their values as the third argument with `` db.sql`jsonb_path_exists_tz(${db.self}, ${db.param(path, 'jsonpath')}, ${db.param(JSON.stringify(vars), 'jsonb')})` ``.
- **Indexes**: no GIN index serves `jsonb_path_exists()`. Both `jsonb` operator classes serve `@>`, [`jsonbContains()`](#conditions.jsonbContains), and `@?`, which takes no variables: for a fixed path on a GIN-indexed column, write `` db.sql`${db.self} @? ${db.param(path, 'jsonpath')}` ``, `(("details" @? CAST($1 AS "jsonpath")))`<!-- probe: db.sql`${{ details: db.sql`${db.self} @? ${db.param('$.format', 'jsonpath')}` }}` -->. An expression index on the call, its path and `vars` fixed, serves that call alone: after `CREATE INDEX ON films ((jsonb_path_exists(details, '$.format', '{}')))`, `{ details: jsonbPathExists('$.format') }` is an index scan; another path or other `vars` scans the table.
- **[`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson)** and **[`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson)** change nothing: `jsonb_path_exists("details", CAST($1 AS "jsonpath"), CAST($2 AS "jsonb"))`<!-- probe: (db.setConfig({ castObjectParamsToJson: true, castArrayParamsToJson: true }), db.sql`${{ details: db.conditions.jsonbPathExists('$.format ? (@ == $format)', { format: '35mm' }) }}`) -->.
- **What JSON lacks** in `vars` throws as the query compiles, at any depth, the message naming its key, as in [`jsonbContains()`](#conditions.jsonbContains): `{ prize: undefined }` would leave `$prize` out. So does a path that is no string. The type refuses both, but not a value typed `{ prize?: string }`, which may hold `undefined` unless `exactOptionalPropertyTypes` is on, nor one typed `any`.
- **Type**: `path` is a `string`, and `vars` a `JSONObject`, an object of JSON values: an array, a string or `null` there is refused (TS2769), as Postgres would refuse it (22023, `"vars" argument is not an object`), and so is a value typed by an `interface`: give it a `type` alias. The condition's `T` is `JSONValue`, as for `jsonbContains()`: a `jsonb` column takes it, a `text` or `integer` one refuses it (TS2322). A `json` column passes, and Postgres refuses it (42883, `function jsonb_path_exists(json, jsonpath, jsonb) does not exist`). On a `jsonb` domain whose placeholder you narrowed, name it: `jsonbPathExists<PgProjection>('$.format')`.

> `` `jsonbPathExists()` takes its path as a string, not `db.param()`: write the path as a string, and each value it compares with as a variable, `jsonbPathExists(path, { name: value })`. ``<!-- message -->

## Combining: `and()`, `or()`, `not()` {#combining}

Each takes conditions or Whereables, a Whereable compiled with its own keys. As a Whereable value, `self` reaches the conditions inside: `{ release_year: or(lt(1980), gt(2010)) }` gives `((("release_year" < $1 OR "release_year" > $2)))`<!-- probe: db.sql`${{ release_year: db.conditions.or(db.conditions.lt(1980), db.conditions.gt(2010)) }}` -->. As a whole `where`, they take Whereables:

<CastPanel example="conditions_or">

<<< ./examples/conditions_or.ts{ts twoslash}

</CastPanel>

They take the Whereable of every table, so in a schema with a column named like a member of `String`, of a type that member fits (`length`, a number), they take any string as one, by design: they name no table to check it by, and a check there refused a generic `and({ ...where, id })` on TypeScript 4.1 ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). A shortcut's `where` refuses it.

### `and()` {#conditions.and}

```ts
db.conditions.and<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) -->: each operand in its own parentheses, joined by `AND`.

- A `sql` fragment with a bare `OR` at its top level stays whole: `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` gives `(("id" = 1000 OR "id" = 1001) AND (("studio_id" = $1)))`<!-- probe: db.conditions.and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) -->, film 1001 alone.
- With no argument, `TRUE`<!-- probe: db.conditions.and() -->: every row, as a Whereable `{}`. Zapatos 6.6.1 wrote `()`, which Postgres refuses as a condition (42601). As a `groupBy`, `GROUP BY ()` ran, and `GROUP BY TRUE` is refused (42601): leave `groupBy` out ([Conditions](/switching#conditions)).

::: warning Every row
`update()` and `deletes()` given `and(...filters)` or `not(or(...ids))` with an empty list now reach every row: `deletes('films', and())` sends `WHERE TRUE`<!-- probe: db.deletes('films', db.conditions.and()) --> and deletes them all, `not(or())` gives `(NOT (FALSE))`<!-- probe: db.conditions.not(db.conditions.or()) -->. Zapatos 6.6.1 threw (42601) before any row changed. Keep the length check where an empty list must not reach every row.
:::

Zapatos 6.6.1 wrote the operands bare, `(a OR b AND c)`, which Postgres reads `a OR (b AND c)`: the example above found film 1000 too, whatever its studio, and `deletes()` or `update()` given it deleted or updated that row.

Only an `and()` of two operands or more, one with a bare `OR` at its top level, now gives other rows. One whose SQL ends in the next operand:

- now fails (42601), `` and(db.sql`${'release_year'} BETWEEN 1970`, db.sql`2000`) ``;
- or, when the split falls inside a quoted literal, compares with another value, with no error: `` and(db.sql`${'title'} = 'x`, db.sql`y'`) `` compares `"title"` with `'x) AND (y'`, where it was `'x AND y'`.

Any other gains parentheses and gives the same rows.

### `or()` {#conditions.or}

```ts
db.conditions.or<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`(a OR b)`<!-- probe: db.conditions.or(db.sql`a`, db.sql`b`) -->: its operands joined by `OR`, as they are: `AND` binds tighter than `OR`, so none reaches across it. With no argument, `FALSE`<!-- probe: db.conditions.or() -->: no row. Zapatos 6.6.1 wrote `()` here too, and as a `groupBy`, `GROUP BY FALSE` is refused (42601).

### `not()` {#conditions.not}

```ts
db.conditions.not<T>(condition: SQLFragment<any, T> | Whereable)
```

`(NOT (…))`<!-- probe: db.conditions.not(db.sql`a`) -->: the whole condition negated.

<CastPanel example="conditions_not">

<<< ./examples/conditions_not.ts{ts twoslash}

</CastPanel>

On `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` writes `(NOT ("release_year" = 1974 OR "release_year" = 1991))`<!-- probe: db.conditions.not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`).compile(undefined, undefined, 'release_year') -->.

Zapatos 6.6.1 wrote `(NOT "release_year" = 1974 OR "release_year" = 1991)`, which Postgres reads `(NOT "release_year" = 1974) OR "release_year" = 1991`: the 1991 film too. Only a condition with a bare `AND` or `OR` at its top level changes rows; any other gains one pair of parentheses.

## Subqueries: `exists()`, `isInSelect()` {#subqueries}

From 6.9.0. Each writes a subquery on a table, filtered by a Whereable or a `sql` fragment of that table, or [`all`](/sql-template#all) for no `WHERE`; `{}` gives `WHERE TRUE`, as in [`select()`](/select#select). The type checks the Whereable's keys and values against the subquery's table.

<CastPanel example="conditions_exists">

<<< ./examples/conditions_exists.ts{ts twoslash}

</CastPanel>

- **The outer row**: in the subquery's `where`, [`parent('id')`](/sql-template#parent) is a column of the outer query's row, `"films"."id"`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) -->, once the `parent` option names its table, as the outer query names it: its alias if it has one. Nothing checks that column: a wrong one is Postgres's 42703, a wrong table its 42P01, before any row.
- **The same SQL wherever it sits**: in a `sql` query, in `deletes()`, `extras` or a `lateral` subquery. Without `parent`, `parent()` in the subquery throws "The 'parent' table alias has no meaning here", inside a `lateral` too, and `self` has no meaning there either.

| Option | SQL it adds | Effect on the type |
|---|---|---|
| `parent` | the table of `parent()`: `"films"."id"`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) --> | none |
| `alias` | `AS "mentees"`<!-- probe: db.conditions.exists('crew', db.all, { alias: 'mentees' }) --> after the table | none |

A `null` that gets past the type, from JavaScript or JSON: `null` options are none, as in the [shortcuts](/select#errors), so `exists('crew', db.all, null)` writes `EXISTS (SELECT 1 FROM "crew")`<!-- probe: db.conditions.exists('crew', db.all, null) -->.

### `exists()` {#conditions.exists}

```ts
db.conditions.exists<T extends Table>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, options?: { parent?: string; alias?: string })
```

`EXISTS (SELECT 1 FROM "roles" WHERE ("film_id" = "films"."id"))`<!-- probe: db.conditions.exists('roles', { film_id: db.parent('id') }, { parent: 'films' }) -->: some row of the table matches. It is never `NULL`, and holds no `self`, so it goes anywhere: as the whole `where`, in `and()`, `or()` and `not()`, or under any key. The anti-join is `not(exists(…))`.

When the subquery reads the outer query's table, give it an alias. Here, the crew who mentor no one:

<CastPanel example="conditions_exists_alias">

<<< ./examples/conditions_exists_alias.ts{ts twoslash}

</CastPanel>

Without the alias, `"crew"."id"` would be the subquery's own row: written by hand, `NOT EXISTS (SELECT 1 FROM crew WHERE mentor_id = crew.id)` gives every member of the crew, as no one mentors themself, with no error. So when `parent` names the subquery's own name, its alias or else its table, as Postgres reads a name (its first 63 bytes), the condition throws as the query compiles, and `run()` rejects before any query:

> `` `exists()` was given `parent: 'crew'`, which names "crew", the subquery's own name, so Postgres would read `parent()` as a column of the subquery's row: give the subquery another name with the `alias` option. ``<!-- message -->

Names compare as Postgres reads them: `'crew'`, `'"crew"'` and `'public.crew'` are one name. The check compares names, not tables, so `parent: 'public.crew'` over a `crew` table of another schema is refused too, though Postgres would tell the two apart: an alias settles it.

### `isInSelect()` {#conditions.isInSelect}

```ts
db.conditions.isInSelect<T extends Table, C extends keyof SelectableForTable<T>>(table: T, where: WhereableForTable<T> | SQLFragment<any> | AllType, column: C, options?: { parent?: string; alias?: string })
```

`"col" IN (SELECT "actor_id" FROM "roles")`<!-- probe: db.sql`${{ col: db.conditions.isInSelect('roles', db.all, 'actor_id') }}` -->, as a Whereable value: the key's column is on the left. Its `T` is the type of `column`, `null` aside, which the Whereable checks against the key's column. `parent` and `alias` work as in [`exists()`](#conditions.exists). The actors with top billing in some film:

<CastPanel example="conditions_isInSelect">

<<< ./examples/conditions_isInSelect.ts{ts twoslash}

</CastPanel>

A column of another type does not compile:

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('actors', { name: db.conditions.isInSelect('roles', db.all, 'actor_id') });
```

- With the 7.0 default, an enum-array subquery compares as `string`, so TypeScript rejects the same enum-array column and accepts a text column that Postgres rejects (42883).
- **`not()` of it** matches no row once the subquery gives a `NULL`, as Postgres reads `NOT IN`: `{ id: not(isInSelect('crew', db.all, 'mentor_id')) }` finds no one, as one `mentor_id` is `NULL`. For the anti-join, write `not(exists(…))`, above.
- **As the whole `where`**, outside a key, it has no column: the type refuses it there, alone, under `not()` or in `and()` (TS2345), and untyped code throws "The 'self' column alias has no meaning here".

## Full-text search: `websearchToTsquery()` {#full-text}

From 6.9.0. A search on a `tsvector` column: the words of a text, as a text search configuration stems them. The docs schema's `films.title_search` is a generated column, `to_tsvector('english', title)`, which Postgres keeps up to date, with a GIN index ([Postgres's docs](https://www.postgresql.org/docs/current/textsearch-tables.html)).

<CastPanel example="conditions_websearchToTsquery">

<<< ./examples/conditions_websearchToTsquery.ts{ts twoslash}

</CastPanel>

### `websearchToTsquery()` {#conditions.websearchToTsquery}

```ts
db.conditions.websearchToTsquery<T = TsvectorColumn>(config: string, query: string): SQLFragment<boolean | null, T>
```

`"col" @@ websearch_to_tsquery(CAST($1 AS "regconfig"), $2)`<!-- probe: db.sql`${{ col: db.conditions.websearchToTsquery('english', 'lanterns') }}` -->, the configuration and the query two parameters. Postgres reads the query as a search box does, and never raises a syntax error, so it takes what a user types as it is. On `title_search`:

| Query | Postgres reads | Matches |
|---|---|---|
| `lanterns` | `'lantern'`, the stem | A Lantern for Edith |
| `salt orchard` | `'salt' & 'orchard'`, each word | The Salt Orchard |
| `"orchard salt"` | `'orchard' <-> 'salt'`, the phrase in that order | none |
| `salt or lantern` | `'salt' \| 'lantern'` | The Salt Orchard, A Lantern for Edith |
| `-salt orchard` | `!'salt' & 'orchard'` | none |
| `salt & lantern`, `salt \| lantern` | `'salt' & 'lantern'`: `&` and `\|` are no operators | none |
| `lant:*` | `'lant'`: no prefix | none |
| `the` | no word, only a stop word: Postgres sends a NOTICE | none |

- **The configuration**: name the one that built the column's vector, whose stems the query's must be: `websearchToTsquery('simple', 'lanterns')` looks for `'lanterns'`, which `title_search` does not hold. Left out, Postgres would take `default_text_search_config`, a setting of the server or the session, so the condition always names it. Postgres looks it up on the `search_path` (`'pg_catalog.english'` works too), and one it does not know is its 42704, `text search configuration "klingon" does not exist`; on Postgres 15 and earlier, a name whose schema does not exist, `'nowhere.english'`, is its 3F000, `schema "nowhere" does not exist`. A configuration of your own, built on `unaccent` for one, is a name like any other.
- **`NULL`**: a `NULL` vector gives `NULL`, so neither the condition nor [`not()`](#conditions.not) of it matches the row.
- **Type**: its `T` is [`TsvectorColumn`](#conditions.TsvectorColumn), which only a column typed `any` takes: a `tsvector` column, through its `PgTsvector` placeholder left as generated ([Custom types](/custom-types)). A `text` column does not compile, nor a `varchar`, a `citext` or a domain over one, all typed `string`: Postgres would read `text @@ tsquery`, and build the vector with `default_text_search_config`, not with the configuration given. Every other column typed `any` passes: a domain over a domain over `text`, as generated with [`domainsTypedByContext: false`](/generator#generate.domainsTypedByContext), runs that `text @@ tsquery` with no error; an `xml` column, Postgres refuses (42883). Once you edit the placeholder, give its type, `websearchToTsquery<PgTsvector>(…)`, or for a `string`, `db.conditions.websearchToTsquery<string>('english', 'lanterns')`<!-- tsc: db.select('films', { title_search: … }) -->.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { title: db.conditions.websearchToTsquery('english', 'lanterns') });
```

- **Other parsers**: `to_tsquery()` reads `&`, `|`, `!` and prefixes, `lant:*`, and raises a syntax error on a user's stray `&`, so it has no condition of its own. Write a `sql` fragment, the configuration cast to `regconfig`, `"title_search" @@ to_tsquery(CAST($1 AS "regconfig"), $2)`<!-- probe: db.sql`${{ title_search: db.sql`${db.self} @@ to_tsquery(${db.param('english', 'regconfig')}, ${db.param('lant:*')})` }}` -->:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { title_search: db.sql`${db.self} @@ to_tsquery(${db.param('english', 'regconfig')}, ${db.param('lant:*')})` });
```

`Default`, `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment or `parent()` as the configuration or the query does not compile (TS2345). Untyped, it throws as the query compiles, naming it:

> `` `websearchToTsquery()` sends its configuration and its query as parameters: give the query as a string, not `db.param()`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message -->

So does any other value that is no string, which `pg` would send as its text or as JSON: an array as `'{"salt","orchard"}'`, whose words Postgres reads, and `null` or `undefined` as `NULL`, which matches no row. The message names it:

> `` `websearchToTsquery()` takes its query as a string, not `undefined`: give it as a string, `websearchToTsquery('english', 'salt orchard')`. ``<!-- message -->

### `TsvectorColumn` {#conditions.TsvectorColumn}

```ts
interface TsvectorColumn
```

The `T` of [`websearchToTsquery()`](#conditions.websearchToTsquery) unless given: a type that only a column typed `any` takes. It exists only in the type, with no value. A project built with `declaration: true` writes it in its `.d.ts` by this name, but not a spread of one, whose members name a symbol `zapatos/db` does not export: TS4023.

## Dates and times {#dates}

[`after()`](#conditions.after) and [`before()`](#conditions.before) compare with a value: a `Date`, an ISO 8601 string with its offset (`'2030-03-01T20:00:00Z'`, a `TimestampTzString`; the type refuses another form such as `'2030-03-02'`, TS2322), or one of the two fragments below. `pg` sends a `Date` as a string in the local time zone, with its offset: on a `timestamptz` column, the same instant. On a `date` column, Postgres keeps the local day and drops the time: `eq(new Date(2030, 2, 1, 23, 30))` matches `2030-03-01`, and `lt()` of it does not.

<CastPanel example="conditions_dates">

<<< ./examples/conditions_dates.ts{ts twoslash}

</CastPanel>

### `after()` {#conditions.after}

`gt()` under another name: `"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.after(1) }}` -->.

### `before()` {#conditions.before}

`lt()` under another name: `"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.before(1) }}` -->.

### `now` {#conditions.now}

`now()`<!-- probe: db.conditions.now -->: a constant, the start of the current transaction. A value, not a condition: `{ starts_at: after(now) }` gives `(("starts_at" > now()))`<!-- probe: db.sql`${{ starts_at: db.conditions.after(db.conditions.now) }}` -->, and in `update()` it sets the column. Alone as a Whereable value in a `where`, `{ starts_at: now }`, Postgres refuses it (42804), though the type lets it through: in a `SELECT` list, the same Whereable runs ([`conditions`](#conditions)).

### `fromNow()` {#conditions.fromNow}

```ts
db.conditions.fromNow(n: number, unit: IntervalUnit = 'millisecond')
```

`now() + $1`<!-- probe: db.conditions.fromNow(-7, 'days') -->, the value `` `${n} ${unit}` ``, which Postgres reads as an interval: `fromNow(-7, 'days')` sends `'-7 days'`, `fromNow(1.5, 'hours')` `'1.5 hours'`. A value, as [`now`](#conditions.now).

`unit` is one of `microsecond`, `millisecond`, `second`, `minute`, `hour`, `day`, `week`, `month`, `year`, `decade`, each with or without an `s`, then `century`, `centuries`, `millennium`, `millennia`. An `n` whose string Postgres does not read (`NaN`, `1e21`, written `1e+21`) fails with 22007.

The screenings of the next seven days, from `now()`, here the time of the query:

<CastPanel example="conditions_now">

<<< ./examples/conditions_now.ts{ts twoslash}

</CastPanel>

## Arithmetic: `add()`, `subtract()` {#arithmetic}

```ts
db.conditions.add<T extends number | Date>(a: T)
db.conditions.subtract<T extends number | Date>(a: T)
```

Operations, not tests: for an [`update()`](/insert#update) value, where `self` is the column it sets.

<CastPanel example="conditions_add">

<<< ./examples/conditions_add.ts{ts twoslash}

</CastPanel>

- In a `where`, the type lets them through, and Postgres refuses them (42804: "argument of WHERE must be type boolean"); in a `SELECT` list, the same Whereable runs ([`conditions`](#conditions)).
- In `upsert()`'s `updateValues`, there is no current column: they throw "The 'self' column alias has no meaning here"<!-- message --> ([`upsert()`](/insert#upsert)). In `insert()`, the type refuses them (TS2769), as Postgres does: the column is written in `VALUES` (42703).
- They take a number or a `Date`, not a `Parameter` (TS2345): for a cast, write a `sql` fragment value (below).
- On a `date` column, the type refuses a number (TS2322), and Postgres could not run it either: `date + unknown` is ambiguous (42725).
- On a `date`, `timestamp` or `timestamptz` column, a `Date` type-checks. `add()` of one fails wherever it stands. On `date`, it is ambiguous (42725), in a `where` too. On the other two, a `where` refuses it before reading the `Date` (42804); as an `update()` value, nested in a `sql` fragment or in a `SELECT` list, Postgres reads it as an interval (22007). `subtract()` of one gives a number of days on `date`, an interval on the other two, not the column's type: Postgres refuses it as an `update()` value (42804), and runs it nested in a `sql` fragment or in a `SELECT` list.

For dates, write a `sql` fragment value, where `db.self` is the column, and cast its parameter. On a `date` column, `` db.sql`${db.self} + ${db.param(3, 'int4')}` `` adds three days: `"col" + CAST($1 AS "int4")`<!-- probe: db.sql`${{ col: db.sql`${db.self} + ${db.param(3, 'int4')}` }}` -->. On a `timestamptz` column, add an interval: a screening moved to the next day.

<CastPanel example="conditions_add_interval">

<<< ./examples/conditions_add_interval.ts{ts twoslash}

</CastPanel>

The type does not check a fragment: an `int4` on a `timestamptz` column type-checks, and Postgres refuses it (42883).

### `add()` {#conditions.add}

`"col" + $1`<!-- probe: db.sql`${{ col: db.conditions.add(1) }}` -->.

### `subtract()` {#conditions.subtract}

`"col" - $1`<!-- probe: db.sql`${{ col: db.conditions.subtract(1) }}` -->.

## Values a condition refuses {#refused-values}

`Default`, `self`, `all`, `raw()`, `cols()` and `vals()` have no meaning as the value of a condition. The type refuses them (TS2322, or TS2345 where the condition bounds its argument: a pattern, a range's second bound, `add()`, `subtract()`, `websearchToTsquery()`; TS2769 as the operand of an array condition, the list of `eqAny()`, the value of `jsonbContains()` and the path or variables of `jsonbPathExists()`).

At run time, calling the condition does not throw, compiling it does, so `run()` rejects with a plain `Error` before any query.

Zapatos 6.6.1 sent `Default`, `self` and `all` as the strings `'Symbol(DEFAULT)'`, `'Symbol(self)'` and `'Symbol(all)'`, and `raw()`, `cols()` and `vals()` as JSON, `'{"value":…}'`: no row on a text column, every row with `ne()` or `isNotIn()`, 22P02 or 22007 on the others. Why a `raw()` value is not SQL: [Security](/security).

| Message | When |
|---|---|
| `` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message --> | `Default` as the value of a comparison, a range, a pattern, an array condition, `add()` or `subtract()` |
| `` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message --> | `self` there |
| `` `db.all` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message --> | `all` there, and as an item of the array of an array condition, at any depth: `arrayContains([db.all])`, `[[db.all]]` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` or `vals()` there |
| `` `db.Default` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give `db.Default` as the value itself, `{ column: db.Default }`. ``<!-- message --> | `Default` in `isIn()` or `isNotIn()` |
| `` `db.self` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: give a value; in a filter or in `update()`, write `db.self` in a `sql` fragment value, outside `vals([…])`, where it stands for the column. ``<!-- message --> | `self` in `isIn()` or `isNotIn()` |
| `` `db.all` has no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: in a filter, leave the key out, or compare with a value; in a write, give a value. To match every row, give `db.all` as the whole filter of `select()` and its kin: `select(table, db.all)`. ``<!-- message --> | `all` in `isIn()` or `isNotIn()` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as an item of `vals([…])` in a column's value, in a filter (as `isIn()` writes it) or in a `sql` fragment value of `vals({…})`, so of `insert()`, `upsert()` or `update()`: for SQL, write it in a `sql` fragment value, outside `vals([…])` (in a filter or in `update()`, `db.self` there stands for the column); for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` or `vals()` in `isIn()` or `isNotIn()` |
| `` `jsonbContains()` sends its value as JSON text, so it takes a JSON value, not `db.Default`: give a value; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` as the value of [`jsonbContains()`](#conditions.jsonbContains); `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment or `parent()` there gets the same message, naming it |
| `` `jsonbPathExists()` sends its variables as JSON text, so it takes an object of JSON values, not `db.Default`: give an object; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` as the variables of [`jsonbPathExists()`](#conditions.jsonbPathExists); `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment or `parent()` there gets the same message, naming it |
| `` `jsonbPathExists()` takes its path as a string, not `db.Default`: write the path as a string, and each value it compares with as a variable, `jsonbPathExists(path, { name: value })`. ``<!-- message --> | `Default` as the path of [`jsonbPathExists()`](#conditions.jsonbPathExists); `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment, `parent()` or any value that is no string there gets the same message, naming it |
| `` `eqAny()` takes an array of values, not `db.Default`: write `eqAny(values)`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` as the list of [`eqAny()`](#conditions.eqAny); `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter` or a `sql` fragment there gets the same message, naming it |
| `` `eqAny()` sends its array as one parameter, so each item is a plain value, not `db.Default`: give a value. ``<!-- message --> | `Default` as an item of `eqAny()`; `self`, `all`, `raw()`, `cols()` or `vals()` there gets the same message, naming it |
| `` `arrayContains()` sends its array as one parameter, so each item is a plain value, not `db.Default`: give a value. ``<!-- message --> | `Default` as an item of the array of [`arrayContains()`](#conditions.arrayContains), at any depth; `self`, `raw()`, `cols()` or `vals()` there gets the same message, naming it, and so does each in `arrayContainedIn()` or `arrayOverlaps()`, naming the condition |
| `` `arrayContains()` sends its array as one parameter, so each item is a plain value, not `db.param()`: give the value itself; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | a `Parameter` there; a `sql` fragment or `parent()` gets the same message, naming it |
| `` `websearchToTsquery()` sends its configuration and its query as parameters: give the configuration as a string, not `db.Default`; for SQL, write a `sql` fragment with `db.self` in place of the condition. ``<!-- message --> | `Default` as the configuration of [`websearchToTsquery()`](#conditions.websearchToTsquery); as the query, the message says `query`; `self`, `all`, `raw()`, `cols()`, `vals()`, a `Parameter`, a `sql` fragment or `parent()` gets the same message, naming it |
| `` `websearchToTsquery()` takes its configuration as a string, not `null`: give it as a string, `websearchToTsquery('english', 'salt orchard')`. ``<!-- message --> | `null` as the configuration of [`websearchToTsquery()`](#conditions.websearchToTsquery); as the query, the message says `query`; `undefined`, an array, an object or any other value that is no string gets the same message, naming it |
| `The 'self' column alias has no meaning here`<!-- message --> | a condition where `self` has no column: in a `sql` template outside a Whereable, in `upsert()`'s `updateValues`, in the `where` of `exists()` or `isInSelect()`, and `isInSelect()` outside a key |
| `The 'parent' table alias has no meaning here`<!-- message --> | `parent()` in a condition outside a `lateral` subquery, or in the `where` of `exists()` or `isInSelect()` without `parent` |

A comparison with SQL is a `sql` fragment value, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } ``: [Raw SQL](/raw-sql).

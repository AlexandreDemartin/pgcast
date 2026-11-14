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
  - [`and()`](#conditions.and), [`or()`](#conditions.or) and [`not()`](#conditions.not) also take Whereables, so they can be a whole `where`; [`now`](#conditions.now) and [`fromNow()`](#conditions.fromNow) hold no `self`, and go anywhere.
- **Values**: each value is a parameter, `$1`, except a [`Parameter`](/sql-template#Parameter), kept as it is with its cast; a `sql` fragment, written as its SQL; and [`parent()`](/sql-template#parent), the parent query's column in a `lateral` subquery. `Default`, `self`, `raw()`, `cols()` and `vals()` throw: [Values a condition refuses](#refused-values).
- **Type**: a condition is a `SQLFragment` whose second type argument, `T`, is the type of the value it compares with (its `Constraint`, [`sql`](/sql-template#sql)); the Whereable checks `T` against the column's type. The eight tests, `now` and `fromNow()` have no `T`, and pass on any column.

A value of another type does not compile:

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('films', { release_year: db.conditions.eq('1991') });
```

With `strictNullChecks` (or `strict`) on, the type also refuses `null` as a value, in `eq()`, `isIn()` and the others; off, `eq(null)` compiles to `"col" = $1`<!-- probe: db.sql`${{ col: db.conditions.eq(null) }}` -->, which matches no row. The test for `NULL` is [`isNull`](#conditions.isNull).

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

`isNull` and `isNotNull` work on any column. The six others are for a `boolean`: on another type Postgres refuses them (42804), though the type lets them through.

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

`"col" IS NOT DISTINCT FROM $1`<!-- probe: db.sql`${{ col: db.conditions.isNotDistinctFrom(1) }}` -->: as `eq()`, with `NULL` a value like any other. With `strictNullChecks` on, the type refuses `null` here too: [`isNull`](#conditions.isNull) is the test for it.

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

Each takes one pattern, `<T extends string>(a: T)`, so only on a column whose type is a string: on `release_year`, the type refuses them (TS2322).

| Family | Syntax | Matches |
|---|---|---|
| `like()`, `ilike()` | `%` any text, `_` one character | the whole value |
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

Each takes an array of values of the column's type, `<T>(a: readonly T[])`, compiled as [`vals()`](/sql-template#vals) of it: one parameter per item.

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
| `Default`, `self`, `raw()`, `cols()`, `vals()` | throws ([Values a condition refuses](#refused-values)) |

Zapatos 6.6.1 sent a `Parameter` and `parent()` there as one more parameter, as JSON (`'{"value":"x","cast":"text"}'`, `'{"value":"id"}'`), so `isIn()` found nothing and `isNotIn()` matched every row on a text column.

### `isIn()` {#conditions.isIn}

`"col" IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isIn([1, 2]) }}` -->. An empty array gives `false`: no row.

### `isNotIn()` {#conditions.isNotIn}

`"col" NOT IN ($1, $2)`<!-- probe: db.sql`${{ col: db.conditions.isNotIn([1, 2]) }}` -->. An empty array gives `true`: every row. A `NULL` in the list, as Postgres reads `NOT IN`, makes it match no row; the type refuses `null` there with `strictNullChecks` on.

<CastPanel example="conditions_isNotIn">

<<< ./examples/conditions_isNotIn.ts{ts twoslash}

</CastPanel>

## Arrays {#arrays}

Each takes an array, sent as one parameter, or [`parent()`](/sql-template#parent): `<T>(a: T[] | ParentColumn)`. They compare the elements, whatever the dimensions: `{drama,romance}` overlaps `{{romance,thriller}}`.

`T` is the element, as in Zapatos 6.6.1, where the Whereable expects the column's array type: on `genres`, a `text[]`, the type refuses `arrayOverlaps(['romance'])`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
// @ts-expect-error genres takes a string[], and arrayOverlaps(['romance']) gives a string (TS2322)
db.select('films', { genres: db.conditions.arrayOverlaps(['romance']) });
```

It stays that way: every type I tried on the column broke some code that compiles under 6.6.1, either a mock written to its signature or the typed result of `.map(db.conditions.arrayContains)` ([#40](https://github.com/AlexandreDemartin/pgcast/issues/40)). Two ways compile. Given the column's type as `T`, the value is an array of arrays:

<CastPanel example="conditions_arrays">

<<< ./examples/conditions_arrays.ts{ts twoslash}

</CastPanel>

Or write a `sql` fragment value, where `db.self` is the column, and cast its parameter: `` db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` `` gives `"col" @> CAST($1 AS "text"[])`<!-- probe: db.sql`${{ col: db.sql`${db.self} @> ${db.param(['drama'], 'text[]')}` }}` -->.

<CastPanel example="conditions_arrays_fragment">

<<< ./examples/conditions_arrays_fragment.ts{ts twoslash}

</CastPanel>

With [`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) on, a condition sends its array as `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ genres: db.conditions.arrayContains(['drama']) }}`) -->, an array of arrays too, which Postgres refuses (42883: `text[] @> json`). The condition's type refuses a `Parameter` (TS2345), but in the fragment, the cast given to `param()` wins over the option ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)): it runs either way.

### `arrayContains()` {#conditions.arrayContains}

`"col" @> $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContains(['x']) }}` -->: the column holds every element of the value.

### `arrayContainedIn()` {#conditions.arrayContainedIn}

`"col" <@ $1`<!-- probe: db.sql`${{ col: db.conditions.arrayContainedIn(['x']) }}` -->: every element of the column is in the value.

### `arrayOverlaps()` {#conditions.arrayOverlaps}

`"col" && $1`<!-- probe: db.sql`${{ col: db.conditions.arrayOverlaps(['x']) }}` -->: they share at least one element.

## Combining: `and()`, `or()`, `not()` {#combining}

Each takes conditions or Whereables, a Whereable compiled with its own keys. As a Whereable value, `self` reaches the conditions inside: `{ release_year: or(lt(1980), gt(2010)) }` gives `((("release_year" < $1 OR "release_year" > $2)))`<!-- probe: db.sql`${{ release_year: db.conditions.or(db.conditions.lt(1980), db.conditions.gt(2010)) }}` -->. As a whole `where`, they take Whereables:

<CastPanel example="conditions_or">

<<< ./examples/conditions_or.ts{ts twoslash}

</CastPanel>

### `and()` {#conditions.and}

```ts
db.conditions.and<T>(...conditions: (SQLFragment<any, T> | Whereable)[])
```

`((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) -->: each operand in its own parentheses, joined by `AND`.

- A `sql` fragment with a bare `OR` at its top level stays whole: `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` gives `(("id" = 1000 OR "id" = 1001) AND (("studio_id" = $1)))`<!-- probe: db.conditions.and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) -->, film 1001 alone.
- With no argument, `TRUE`<!-- probe: db.conditions.and() -->: every row, as a Whereable `{}`. Zapatos 6.6.1 wrote `()`, which Postgres refuses (42601).

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

`(a OR b)`<!-- probe: db.conditions.or(db.sql`a`, db.sql`b`) -->: its operands joined by `OR`, as they are: `AND` binds tighter than `OR`, so none reaches across it. With no argument, `FALSE`<!-- probe: db.conditions.or() -->: no row. Zapatos 6.6.1 wrote `()` here too.

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

## Dates and times {#dates}

[`after()`](#conditions.after) and [`before()`](#conditions.before) compare with a value: a `Date`, an ISO 8601 string with its offset (`'2030-03-01T20:00:00Z'`, a `TimestampTzString`; the type refuses another form such as `'2030-03-02'`, TS2322), or one of the two fragments below. `pg` sends a `Date` as a string in the local time zone, with its offset: on a `timestamptz` column, the same instant.

<CastPanel example="conditions_dates">

<<< ./examples/conditions_dates.ts{ts twoslash}

</CastPanel>

### `after()` {#conditions.after}

`gt()` under another name: `"col" > $1`<!-- probe: db.sql`${{ col: db.conditions.after(1) }}` -->.

### `before()` {#conditions.before}

`lt()` under another name: `"col" < $1`<!-- probe: db.sql`${{ col: db.conditions.before(1) }}` -->.

### `now` {#conditions.now}

`now()`<!-- probe: db.conditions.now -->: a constant, the start of the current transaction. A value, not a condition: `{ starts_at: after(now) }` gives `(("starts_at" > now()))`<!-- probe: db.sql`${{ starts_at: db.conditions.after(db.conditions.now) }}` -->, and in `update()` it sets the column. Alone as a Whereable value, `{ starts_at: now }`, Postgres refuses it (42804), though the type lets it through.

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

- In a `where`, the type lets them through, and Postgres refuses them (42804: "argument of WHERE must be type boolean").
- In `upsert()`'s `updateValues`, there is no current column: they throw "The 'self' column alias has no meaning here"<!-- message --> ([`upsert()`](/insert#upsert)). In `insert()`, the column is written, and Postgres refuses it (42703).
- They take a number or a `Date`, not a `Parameter` (TS2345): for a cast, write a `sql` fragment value (below).
- On a `date` column, the type refuses a number (TS2322), and Postgres could not run it either: `date + unknown` is ambiguous (42725).
- On a `date`, `timestamp` or `timestamptz` column, a `Date` type-checks, and Postgres refuses it ([#180](https://github.com/AlexandreDemartin/pgcast/issues/180)). On `date`, `add()` is ambiguous (42725) and `subtract()` gives an integer, not a date (42804); on the other two, `add()` reads it as an interval (22007), `subtract()` gives an interval, not a time (42804).

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

`Default`, `self`, `raw()`, `cols()` and `vals()` have no meaning as the value of a condition. The type refuses them (TS2322, or TS2345 where the condition bounds its argument: a pattern, a range's second bound, an array condition, `add()`, `subtract()`).

At run time, calling the condition does not throw, compiling it does, so `run()` rejects with a plain `Error` before any query.

Zapatos 6.6.1 sent `Default` and `self` as the strings `'Symbol(DEFAULT)'` and `'Symbol(self)'`, and `raw()`, `cols()` and `vals()` as JSON, `'{"value":…}'`: no row on a text column, every row with `ne()` or `isNotIn()`, 22P02 or 22007 on the others. Why a `raw()` value is not SQL: [Security](/security).

| Message | When |
|---|---|
| `` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message --> | `Default` as the value of a comparison, a range, a pattern, an array condition, `add()` or `subtract()` |
| `` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message --> | `self` there |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` or `vals()` there |
| `` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message --> | `Default` in `isIn()` or `isNotIn()` |
| `` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column. ``<!-- message --> | `self` in `isIn()` or `isNotIn()` |
| `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`. ``<!-- message --> | `raw()`, `cols()` or `vals()` in `isIn()` or `isNotIn()` |
| `The 'self' column alias has no meaning here`<!-- message --> | a condition where `self` has no column: in a `sql` template outside a Whereable, in `upsert()`'s `updateValues` |
| `The 'parent' table alias has no meaning here`<!-- message --> | `parent()` in a condition outside a `lateral` subquery |

A comparison with SQL is a `sql` fragment value, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } ``: [Raw SQL](/raw-sql).

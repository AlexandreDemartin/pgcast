# Select {#select-and-the-aggregates}

The read shortcuts: `select()`, `selectOne()` and `selectExactlyOne()` for rows, `count()`, `sum()`, `avg()`, `min()` and `max()` for one number. Each option, the SQL it adds and what it does to the type, then the types they share.
{.lede}

## `select()` {#select}

```ts
db.select(table, where, options?, mode?, aggregate?)
```

Builds one `SELECT` of the rows of `table` that match `where`. It returns a [`SQLFragment`](/sql-template#SQLFragment): `.run(pool)` gives an array of the table's `JSONSelectable` rows, `[]` when none match.

- `table`: a table of the generated schema.
- `where`: a `Whereable`, an object of columns and their values or [conditions](/conditions), its keys in alphabetical order, joined by `AND` in one pair of parentheses, a condition or `sql` value in its own (`("id" = $1 AND ("studio_id" > $2) AND "title" = $3)`<!-- probe: db.select('films', { title: 'x', id: 1000, studio_id: db.conditions.gt(1000) }) -->); a [`sql`](/sql-template#sql) fragment, written as it is; or [`db.all`](/sql-template#all), for no `WHERE` at all.
- `options`: the [options](#options) below, all optional.
- `mode` and `aggregate`: what `selectOne()`, `count()` and the others pass; see [`SelectResultMode`](#SelectResultMode).

<CastPanel example="select">

<<< ./examples/select.ts{ts twoslash}

</CastPanel>

### The SQL it writes

- Each row is one `jsonb` value, `to_jsonb("films".*)`<!-- probe: examples/select.ts -->, so dates and times come back as strings and `bigint` as a number: the `JSONSelectable` types say so ([The catalog](/catalog-types)).
- The rows are gathered into one array, `coalesce(jsonb_agg(result), '[]')`<!-- probe: examples/select.ts -->, around a subquery aliased `"sq_<alias or table>"`, so `ORDER BY` and `LIMIT` apply to the rows. One query, one value back.
- Inside, the clauses come in this order: `SELECT [DISTINCT …]` · the columns `AS result` · `FROM` the table `[AS alias]` · each `LEFT JOIN LATERAL` · `WHERE` · `GROUP BY` · `HAVING` · `ORDER BY` · `LIMIT` or `FETCH FIRST … WITH TIES` · `OFFSET` · each `FOR …` lock.
- Every value is a parameter (`$1`, `$2`); every name is quoted as Postgres quotes it, any `"` in it doubled. Zapatos 6.6.1 let a name that held a `"` close its quotes; pgcast fixed this ([changelog](/changelog#6.6.2-security)).

### Options

The SQL of each row is what the built library compiles, on the docs schema; `…` stands for a `sql` fragment.

| Option | SQL it adds | Effect on the type |
|---|---|---|
| `columns: ['title']` | `jsonb_build_object($1::text, "title")`<!-- probe: db.select('films', db.all, { columns: ['title'] }) --> in place of `to_jsonb("films".*)` | only those keys (`JSONOnlyColsForTable`) |
| `order: { by: 'title', direction: 'ASC' }` | `ORDER BY "title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'title', direction: 'ASC' } }) --> | none |
| `limit: 2` | `LIMIT $1`<!-- probe: db.select('films', db.all, { limit: 2 }) --> | none |
| `offset: 2` | `OFFSET $1`<!-- probe: db.select('films', db.all, { offset: 2 }) --> | none |
| `withTies: true` | `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, limit: 2, withTies: true }) --> in place of `LIMIT $1` | none |
| `extras: { cinema: 'name' }` | `\|\| jsonb_build_object($1::text, "name")`<!-- probe: db.select('cinemas', db.all, { extras: { cinema: 'name' } }) --> | a key per extra (`ExtrasResult`) |
| `lateral: { cast: … }` | `LEFT JOIN LATERAL (…) AS "lateral_cast" ON true`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) -->, read by `\|\| jsonb_build_object($1::text, "lateral_cast".result)`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) --> | a key per subquery (`LateralResult`) |
| `lateral: …`, one subquery | `"lateral_passthru".result`<!-- probe: db.select('films', db.all, { lateral: db.select('roles', { film_id: db.parent('id') }) }) --> in place of the columns, and its `LEFT JOIN LATERAL` | the subquery's result, in place of the row |
| `alias: 'mentor'` | `FROM "crew" AS "mentor"`<!-- probe: db.select('crew', db.all, { alias: 'mentor' }) -->, then `"mentor"` for the table | none |
| `distinct: true` | `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) --> | none |
| `distinct: 'cinema_id'` | `SELECT DISTINCT ON ("cinema_id")`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) --> | none |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.select('ratings', db.all, { columns: ['film_id'], groupBy: 'film_id' }) --> | none |
| `having: …` | `HAVING sum("votes") >= $1`<!-- probe: db.select('ratings', db.all, { groupBy: 'film_id', having: db.sql`sum(${'votes'}) >= ${db.param(10)}` }) --> | none |
| `lock: { for: 'UPDATE' }` | `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> | none |

::: tip Strict
`columns`, `extras` and `lateral` change the type only with `strictNullChecks` (or `strict`) on. Without it, the result stays the full `JSONSelectable` and an extra or a lateral key is not in the type; the type refuses nothing, not even `columns` beside one `lateral` subquery, and one subquery is typed as the table's row while its own result comes back.
:::

### `columns`

`columns?: readonly ColumnForTable<T>[]`, a [`ColumnsOption`](#ColumnsOption): only these columns, each a key of the result object, in place of the whole row. It does not rename a column: [`extras`](#extras) does.

A `readonly` array, `['id', 'title'] as const` or a `readonly ColumnForTable<T>[]`, gives the same SQL and the same type as a mutable one. With `strictNullChecks`, Zapatos 6.6.1 typed its rows as `never`, which any type accepted; a type that the query does not return is now refused:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const columns = ['id', 'title'] as const;

async function filmCards(queryable: db.Queryable) {
  const cards: { id: number; title: string }[] = await db.select('films', db.all, { columns }).run(queryable);
  // @ts-expect-error tagline is not among the columns
  const withTaglines: { title: string; tagline: string | null }[] = await db.select('films', db.all, { columns }).run(queryable);
  return [cards, withTaglines];
}
```

### `order`, `limit`, `offset` and `withTies`

- `order`: one `{ by, direction, nulls? }` or an array of them, in that order. `by` is a column or any SQL of the table, its `SQL` type: a `sql` fragment (`` db.sql`array_length(${'genres'}, 1)` ``), [`db.parent()`](/sql-template#parent); `direction` is `'ASC'` or `'DESC'`; `nulls`, `'FIRST'` or `'LAST'`.
- `limit` and `offset`: numbers, sent as parameters.
- `withTies: true`, with `limit` and `order`: also the rows that tie with the last one on the `order`. Without `limit` it adds nothing; without `order`, Postgres refuses the query (42601).

<CastPanel example="selectPage">

<<< ./examples/selectPage.ts{ts twoslash}

</CastPanel>

<CastPanel example="selectWithTies">

<<< ./examples/selectWithTies.ts{ts twoslash}

</CastPanel>

Paging through a long list: [Pagination](/paginate).

### `extras`

`extras?: { [key: string]: column | SQLFragment }`, an [`ExtrasOption`](#ExtrasOption): more keys on each result object. A column gives its value under another key; a `sql` fragment gives the type of its second type parameter, `` db.sql<s.cinemas.SQL, number>`…` ``, so `number` here. The keys are added to the row with `||`, after `columns`.

<CastPanel example="selectExtras">

<<< ./examples/selectExtras.ts{ts twoslash}

</CastPanel>

### `lateral`

`lateral?: { [key: string]: SQLFragment } | SQLFragment`, a [`LateralOption`](#LateralOption): other shortcuts, nested, each joined with `LEFT JOIN LATERAL … ON true`. In them, [`db.parent()`](/sql-template#parent) names a column of this query's table.

- **An object**: each key becomes a key of the result, holding its subquery's result: an array for `select()`, an object or `null` for `selectOne()`, a number for `count()`. The keys are joined in alphabetical order; each is one identifier, `"lateral_<key>"`.
- **One subquery**: its result is passed through in place of each row. Then `columns` and `extras` have nothing to add to, and the type refuses them, with `strictNullChecks` on.

Steps, nesting and self-joins: [Joins](/lateral). Since pgcast 6.6.2, a key or an `alias` with a `"` in it stays one identifier; in Zapatos 6.6.1 it could close its quotes ([changelog](/changelog#6.6.2-security)).

### `alias`

`alias?: string`: a name for the table in this query, needed to join a table to itself (`crew` and its `mentor_id`). It replaces the table name in the columns, in `"sq_<alias>"` and for the `parent()` of each `lateral` subquery, and `lock.of` takes it. Its steps: [Join a table to itself](/lateral#join-a-table-to-itself).

### `distinct`

With `true`: `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) -->, on the whole result object. The select list is that one `result`, so Postgres refuses an `order` on a column with it (42P10).

<CastPanel example="selectDistinctAll">

<<< ./examples/selectDistinctAll.ts{ts twoslash}

</CastPanel>

With a column, an array of columns or a `sql` fragment: `SELECT DISTINCT ON (…)`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) -->, one row for each value. Give an `order` that starts with the same columns, or which row you get is up to Postgres.

<CastPanel example="selectDistinct">

<<< ./examples/selectDistinct.ts{ts twoslash}

</CastPanel>

### `groupBy` and `having`

- `groupBy`: a column, an array of columns (`GROUP BY "film_id", "stars"`<!-- probe: db.select('ratings', db.all, { groupBy: ['film_id', 'stars'] }) -->) or a `sql` fragment.
- `having`: a `Whereable`, in parentheses as in `where`, or a `sql` fragment.

Postgres returns only the grouped columns, those a grouped primary key determines, and aggregates, and refuses any other (42803): the whole row, without `columns`, runs when `groupBy` holds the primary key.

<CastPanel example="selectGroupBy">

<<< ./examples/selectGroupBy.ts{ts twoslash}

</CastPanel>

### `lock`

`lock?: SelectLockingOptions | SelectLockingOptions[]`: a locking clause each, in order, written after everything else.

| Key | Values | SQL |
|---|---|---|
| `for` | `'UPDATE'`, `'NO KEY UPDATE'`, `'SHARE'`, `'KEY SHARE'` | `FOR UPDATE`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE' } }) --> |
| `of`, optional | a table name, or the `alias`; or an array of them | `OF "screenings"`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', of: 'screenings' } }) --> |
| `wait`, optional | `'NOWAIT'`, `'SKIP LOCKED'` | `NOWAIT`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', wait: 'NOWAIT' } }) --> |

Postgres refuses a lock with `DISTINCT`, `GROUP BY` or an aggregate (0A000).

<CastPanel example="selectLock">

<<< ./examples/selectLock.ts{ts twoslash}

</CastPanel>

### Errors

`select()` throws these as it builds the query, before any is sent:

| Message | When | Since |
|---|---|---|
| `Direction must be ASC/DESC, not '…'`<!-- message --> | an `order` with another `direction` | Zapatos |
| `Nulls must be FIRST/LAST/undefined, not '…'`<!-- message --> | an `order` with another `nulls` | Zapatos |
| `Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '…'`<!-- message --> | a `lock` with another `for` | pgcast 6.6.2 |
| `Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '…'`<!-- message --> | a `lock` with another `wait` | pgcast 6.6.2 |
| `Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '…'`<!-- message --> | an `aggregate` that is not one, in `SelectResultMode.Numeric` | pgcast 6.6.2 |

The type refuses a bad `direction`, `nulls` or `lock`, not a bad `aggregate`, a `string`. Zapatos 6.6.1 wrote a bad `lock` or `aggregate` into the SQL as it was, where it could run a second statement. A value that has no meaning in `where` or `having` (`db.Default`, `db.self`, `db.raw()`) throws as the query compiles: [Conditions](/conditions).

## `selectOne()` {#selectOne}

```ts
db.selectOne(table, where, options?)
```

As [`select()`](#select), with `LIMIT $1`<!-- probe: db.selectOne('films', db.all) -->, its value `1`, and no `jsonb_agg`: `.run(pool)` gives the first row, or `undefined` when none matches. Any `limit` you pass is replaced by `1`; `offset` and the other options are kept. In a `lateral`, its key holds the row or `null`.

With `withTies` and `order`, it writes `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.selectOne('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, withTies: true }) -->, here and in `selectExactlyOne()`. `.run()` then gives one of the tied rows; in a `lateral`, the parent row comes back once per tie.

<CastPanel example="selectOne">

<<< ./examples/selectOne.ts{ts twoslash}

</CastPanel>

## `selectExactlyOne()` {#selectExactlyOne}

```ts
db.selectExactlyOne(table, where, options?)
```

As [`selectOne()`](#selectOne), but its type has no `undefined`: when no row matches, `.run()` rejects with a [`NotExactlyOneError`](#NotExactlyOneError). It checks for at least one row, not exactly one: with `LIMIT $2`<!-- probe: examples/selectExactlyOne.ts -->, its value `1`, it takes the first. In a `lateral`, a missing row gives `null` and no error, though the type says otherwise.

<CastPanel example="selectExactlyOne">

<<< ./examples/selectExactlyOne.ts{ts twoslash}

</CastPanel>

With [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), the query run on its own asks for two rows, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('studios', { id: 1000 })) --> with `2`, and `.run()` rejects on a second row too. Nested in another query, in a `lateral` or a `sql` template, it keeps `LIMIT 1`, option or not: a second row there would join the parent row twice.

### `NotExactlyOneError` {#NotExactlyOneError}

```ts
class NotExactlyOneError extends Error {
  query: SQLFragment;
}
```

What `selectExactlyOne()`, the mode `ExactlyOne` of `select()`, rejects with when no row matches. Its `name` is `'NotExactlyOneError'`, its `message` "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message -->; with [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), a second row gives "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->.

Its `query` is the [`SQLFragment`](/sql-template#SQLFragment) that ran: `err.query.compile()` gives its SQL and values. `err instanceof db.NotExactlyOneError` recognises it; catching it: [Tell a missing row from the others](/handle-errors#tell-a-missing-row-from-the-others).

## `count()` {#count}

```ts
db.count(table, where, options?)
```

`SELECT count(*) AS result`<!-- probe: db.count('films', db.all) -->, with no `jsonb_agg`: `.run(pool)` gives a `number`, `0` when no row matches the `where`. The `bigint` that Postgres returns goes through `Number()`.

<CastPanel example="count">

<<< ./examples/count.ts{ts twoslash}

</CastPanel>

`count()` and the four below take the options of [`select()`](#options), with these differences:

<div class="stack">

| Option | SQL it adds | Effect on the type |
|---|---|---|
| `columns: ['subtitled']` | `count("subtitled")`<!-- probe: db.count('screenings', db.all, { columns: ['subtitled'] }) --> in place of `count(*)`: the rows where it is not `NULL`; one column, as several (or none, `[]`) throw | none |
| `distinct: true` | `SELECT DISTINCT count(*)`<!-- probe: db.count('films', db.all, { distinct: true }) -->, on the one result: not `count(DISTINCT …)`, which needs a `sql` template | none |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.count('ratings', db.all, { groupBy: 'film_id' }) -->; `.run()` gives the first group's value only, and with no group rejects with a `TypeError` | none |
| `extras` | nothing | none |
| `lateral: { … }` | its `LEFT JOIN LATERAL`s, whose results are not read; a single subquery throws, as there is no row to pass it through to | none |
| `having`, `limit`, `offset` | as in `select()`; when they leave no row (a `having` that keeps none, `limit: 0`, `offset: 1`), `.run()` rejects with a `TypeError` | none |

</div>

`count()` and the four below throw these while compiling, so `.run()` rejects with a plain `Error`, not a `DatabaseError`, before any query, and `.compile()` throws; so does a query that nests one:

| Message | When | Since |
|---|---|---|
| `…() needs one column to aggregate: pass columns: ['column']`<!-- message --> | `sum()`, `avg()`, `min()` or `max()` without `columns` | pgcast 6.7.0 |
| `…() takes one column in columns, not …`<!-- message --> | `columns` with several columns, or none (`[]`) | pgcast 6.7.0 |
| `…() cannot pass a lateral query through: nest it in the lateral of a select() instead`<!-- message --> | a single subquery as `lateral` | pgcast 6.7.0 |

Zapatos 6.6.1 sent the SQL, which Postgres refused: `sum(*)` and `count("id", "mood")` (42883), `count()` (42809), `SELECT  AS result` (42601). The type is that of 6.6.1, which lets these calls through, a single subquery as `lateral` when there is no `columns` nor `extras`.

Two calls that ran under 6.6.1 now reject too:

- An aggregate of your own that takes another number of arguments under a built-in name. After `CREATE AGGREGATE max(int4, int4) (…)`, `db.max('ratings', db.all, { columns: ['stars', 'votes'] })` sent `max("stars", "votes")`. `db.select('ratings', db.all, { columns: ['stars', 'votes'] }, db.SelectResultMode.Numeric, 'max')` sends the same SQL.
- A refused aggregate marked `noop`, which resolved to its `noopResult`: `run()` compiles the query before it reads `noop`.

With `columns`, it counts two of the four screenings: the other two have `subtitled` `NULL`.

<CastPanel example="count_columns">

<<< ./examples/count_columns.ts{ts twoslash}

</CastPanel>

`count(DISTINCT …)` is a `sql` template. Postgres's `count()` returns a `bigint`, which `pg` gives as a string (`'3'`): `::int` makes it a number, here `3` cinemas.

<CastPanel example="count_distinct">

<<< ./examples/count_distinct.ts{ts twoslash}

</CastPanel>

`where`, `alias`, `withTies` and `lock` add what they add to `select()`. So does `order`, by a `groupBy` column or a `sql` fragment (`` db.sql`count(*)` ``): by another column, Postgres refuses the query (42803).

`.run()` reads the first row of the result. When the query returns none, it rejects with `TypeError: Cannot read properties of undefined (reading 'result')`; so do `sum()`, `avg()`, `min()` and `max()`.

## `sum()` {#sum}

```ts
db.sum(table, where, options?)
```

`SELECT sum("column") AS result`<!-- probe: db.sum('ratings', db.all, { columns: ['column'] }) -->, a `number`; otherwise as [`count()`](#count). Give one column in `columns`: without it, `.run()` rejects before any query, where Zapatos 6.6.1 sent `sum(*)`, which Postgres refuses (42883). The type lets that call through, as in 6.6.1. When no row matches the `where`, Postgres returns `NULL`, and `Number(null)` makes it `0`; `.run()` then warns once, `PGCAST_DEP004`. From 6.7.0, [`aggregatesTypedByColumn`](#typed-by-column) gives `null`.

<CastPanel example="sum">

<<< ./examples/sum.ts{ts twoslash}

</CastPanel>

## `avg()` {#avg}

```ts
db.avg(table, where, options?)
```

`SELECT avg("column") AS result`<!-- probe: db.avg('ratings', db.all, { columns: ['column'] }) -->: the mean, through `Number()`, so `0` when no row matches. Otherwise as [`sum()`](#sum).

<CastPanel example="avg">

<<< ./examples/avg.ts{ts twoslash}

</CastPanel>

## `min()` {#min}

```ts
db.min(table, where, options?)
```

`SELECT min("column") AS result`<!-- probe: db.min('ratings', db.all, { columns: ['column'] }) -->, through `Number()`, so `0` when no row matches. The type says `number` whatever the column:

- a date or time column (`date`, `timestamp`, `timestamptz`) gives its milliseconds since 1970, as node-postgres reads it as a `Date`;
- text or an enum gives `NaN`, unless the text reads as a number: `'9'` gives `9`.

`.run()` warns once, `PGCAST_DEP004`, when `Number()` changes the value. From 6.7.0, [`aggregatesTypedByColumn`](#typed-by-column) keeps it. Otherwise as [`sum()`](#sum).

<CastPanel example="min">

<<< ./examples/min.ts{ts twoslash}

</CastPanel>

## `max()` {#max}

```ts
db.max(table, where, options?)
```

`SELECT max("column") AS result`<!-- probe: db.max('ratings', db.all, { columns: ['column'] }) -->; as [`min()`](#min): `0` when no row matches, a date's milliseconds, and `NaN` on text or an enum unless the text reads as a number.

<CastPanel example="max">

<<< ./examples/max.ts{ts twoslash}

</CastPanel>

## Typed by column {#typed-by-column}

From 6.7.0, [`aggregatesTypedByColumn`](/runtime-config#Config.aggregatesTypedByColumn) drops the `Number()`. Declared in [`ConfigTypes`](/runtime-config#ConfigTypes) as well, it types each result as Postgres sends it:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
db.setConfig({ aggregatesTypedByColumn: true });

const firstShow = await db.min('screenings', db.all, {
  columns: ['starts_at'],
}).run(pool);
```

<div class="stack">

| Call | Off | On |
|---|---|---|
| `min()` of `starts_at`, a `timestamptz` | its milliseconds, `number` | a `Date`, `Date \| null` |
| `max()` of `title`, a `text` | `NaN`, `number` | `'The Salt Orchard'`, `string \| null` |
| `sum()` or `avg()`, no row matching | `0`, `number` | `null`, `number \| null` |
| `max()` of `runtime_minutes`, an `integer` | `131`, `number` | `131`, `number \| null` |
| `min()` nested in a `lateral` | an ISO string, typed `number` | the same string, `TimestampTzString \| null` |
| `min()` as the single `lateral` of a `selectOne()` | a `Date`, typed `number \| undefined` | the same `Date`, `Date \| null \| undefined` |

</div>

- The SQL is the same either way: `SELECT min("starts_at") AS result FROM "screenings"`<!-- probe: (db.setConfig({ aggregatesTypedByColumn: true }), db.min('screenings', db.all, { columns: ['starts_at'] })) -->.
- `min()` and `max()` give a `bigint` or a `numeric` as `pg` sends it, a string; nested, as a JSON number.
- `count()` never gives `NULL`: it is unchanged.
- Passed through as the single `lateral`, it is typed as at top level by `selectOne()` and `selectExactlyOne()`, which hand its column over as it is, and as nested by `select()`, which wraps its rows in `jsonb_agg()`. That `selectOne()` or `selectExactlyOne()`, nested in turn, is typed as nested.
- `.copy()` returns a plain `SQLFragment`, typed as at top level: nested in turn, a copy comes back as JSON with that type.

## Types

What the signatures above are made of, from `zapatos/db`. `T` is a table, `C` the `columns`, `E` the `extras`, `L` the `lateral` and `A` the `alias`.

### `SelectResultMode` {#SelectResultMode}

```ts
enum SelectResultMode { Many, One, ExactlyOne, Numeric }
```

The fourth argument of `select()`: an array of rows (`select()`), a row or `undefined` (`selectOne()`), a row or an error (`selectExactlyOne()`), a number (`count()` and the others).

With `Numeric`, the fifth argument names the aggregate, `'count'` by default; since pgcast 6.6.2 it must be a function name, plain, quoted or `U&` quoted, in up to three dotted parts (`stddev_pop`, `my_schema."MyAgg"`). Any aggregate that returns a number works:

<CastPanel example="selectAggregate">

<<< ./examples/selectAggregate.ts{ts twoslash}

</CastPanel>

### `SelectOptionsForTable` {#SelectOptionsForTable}

`SelectOptionsForTable<T, C, L, E, A>`: the `options` object of `select()`, `selectOne()`, `selectExactlyOne()` and the aggregates, every key optional, as in [Options](#options).

### `SelectLockingOptions` {#SelectLockingOptions}

```ts
interface SelectLockingOptions<A extends string> {
  for: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: Unprefixed<Table> | A | (Unprefixed<Table> | A)[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}
```

One locking clause of [`lock`](#lock). `of` takes a table name without its schema, or the query's `alias` (`A`).

### `ColumnsOption` {#ColumnsOption}

`ColumnsOption<T> = readonly ColumnForTable<T>[] | undefined`: the type of `columns`, and of `returning` in [`insert()`](/insert#insert) and the other writes. A `readonly` array gives the same type as a mutable one ([`columns`](#columns)).

### `ExtrasOption` {#ExtrasOption}

`ExtrasOption<T> = SQLFragmentOrColumnMap<T> | undefined`: the type of `extras`, here and in the writes.

### `LateralOption` {#LateralOption}

`LateralOption<C, E>`: the type of `lateral`. An object of subqueries ([`SQLFragmentMap`](#SQLFragmentMap)); or one subquery, only when neither `columns` nor `extras` is given.

### `SQLFragmentMap` {#SQLFragmentMap}

`interface SQLFragmentMap { [k: string]: SQLFragment<any> }`: the object form of `lateral`, a key per subquery.

### `SQLFragmentOrColumnMap` {#SQLFragmentOrColumnMap}

`interface SQLFragmentOrColumnMap<T> { [k: string]: SQLFragment<any> | ColumnForTable<T> }`: the form of `extras`, a key per column or fragment.

### `JSONOnlyColsForTable` {#JSONOnlyColsForTable}

`JSONOnlyColsForTable<T, C> = Pick<JSONSelectableForTable<T>, C[number]>`: a row with only the `columns` (or `returning`) given. It names that row in a signature:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
type FilmCard = db.JSONOnlyColsForTable<'films', ['id', 'title']>;

function filmCardsOf(queryable: db.Queryable, studio_id: number): Promise<FilmCard[]> {
  return db.select('films', { studio_id }, { columns: ['id', 'title'] }).run(queryable);
}
```

- `C` may be a `readonly` tuple, as `columns` may ([`columns`](#columns)).

### `ExtrasResult` {#ExtrasResult}

`ExtrasResult<T, E>`: the keys that `extras` adds, each typed as its column in `JSONSelectable`, or as its fragment's result.

### `LateralResult` {#LateralResult}

`LateralResult<L> = { [K in keyof L]: RunResultForSQLFragment<L[K]> }`: the keys that a `lateral` object adds, each typed as its subquery's result, with `undefined` turned into `null` ([`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment)).

### `FullSelectReturnTypeForTable` {#FullSelectReturnTypeForTable}

`FullSelectReturnTypeForTable<T, C, L, E, M>`: what `.run()` gives for a mode `M`: the row (the `JSONSelectable`, narrowed by `columns`, with `extras` and `lateral`; or the passed-through subquery's result), as an array, as is, or with `undefined`; or a `number`. The row of the writes is [`ReturningTypeForTable`](/insert#ReturningTypeForTable).

### `SelectSignatures` {#SelectSignatures}

The call signature of `select()`: `table`, `where`, `options?`, `mode?` (by default `Many`) and `aggregate?`, returning `SQLFragment<FullSelectReturnTypeForTable<…>>`.

### `SelectOneSignatures` {#SelectOneSignatures}

The call signature of `selectOne()`: `table`, `where`, `options?`, with the mode `One`.

### `SelectExactlyOneSignatures` {#SelectExactlyOneSignatures}

The call signature of `selectExactlyOne()`: `table`, `where`, `options?`, with the mode `ExactlyOne`.

### `NumericAggregateSignatures` {#NumericAggregateSignatures}

The call signature of `count()`, `sum()`, `avg()`, `min()` and `max()`: `table`, `where`, `options?`, returning `SQLFragment<number>`. With `aggregatesTypedByColumn` declared in [`ConfigTypes`](/runtime-config#ConfigTypes), `sum()` and `avg()` take [`NullableNumericAggregateSignatures`](#NullableNumericAggregateSignatures), and `min()` and `max()` [`ColumnAggregateSignatures`](#ColumnAggregateSignatures) ([Typed by column](#typed-by-column)).

### `NullableNumericAggregateSignatures` {#NullableNumericAggregateSignatures}

From 6.7.0. The call signature of `sum()` and `avg()` with `aggregatesTypedByColumn` declared: as [`NumericAggregateSignatures`](#NumericAggregateSignatures), returning `SQLFragment<number | null>`.

### `ColumnAggregateSignatures` {#ColumnAggregateSignatures}

From 6.7.0. The call signature of `min()` and `max()` with `aggregatesTypedByColumn` declared: as [`NumericAggregateSignatures`](#NumericAggregateSignatures), returning a [`ColumnAggregateFragment`](#ColumnAggregateFragment) of the column in `columns`.

### `ColumnAggregateFragment` {#ColumnAggregateFragment}

```ts
interface ColumnAggregateFragment<RunResult, NestedResult> extends SQLFragment<RunResult>
```

From 6.7.0. What `min()` and `max()` return with `aggregatesTypedByColumn` declared: `.run()` gives `RunResult`, the column's `Selectable` type or `null`; nested in a `lateral`, it is typed `NestedResult`, its `JSONSelectable` type or `null`, as [`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment) reads it. In `extras` too, once [#262](https://github.com/AlexandreDemartin/pgcast/issues/262) parenthesises it; Postgres refuses it bare today. A function of yours that returns one, in a project built with `declaration: true`, has it written in its `.d.ts` by this name.

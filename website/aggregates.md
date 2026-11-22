# Aggregates

By default, `count()` returns a number, `sum()` and `avg()` a number or `null`, and `min()` and `max()` a column value or `null`.
{.lede}

## `count()` {#count}

```ts
db.count(table, where, options?)
```

`SELECT count(*) AS result`<!-- probe: db.count('films', db.all) -->, with no `jsonb_agg`: `.run(pool)` gives a `number`, `0` when no row matches the `where`. The `bigint` that Postgres returns goes through `Number()`.

<CastPanel example="count">

<<< ./examples/count.ts{ts twoslash}

</CastPanel>

`count()` and the four below take the options of [`select()`](/select#options), with these differences:

<div class="stack">

| Option | SQL it adds | Effect on the type |
|---|---|---|
| `columns: ['subtitled']` | `count("subtitled")`<!-- probe: db.count('screenings', db.all, { columns: ['subtitled'] }) --> in place of `count(*)`: the rows where it is not `NULL`; one column, as several (or none, `[]`) throw | none |
| `distinct: true` | `SELECT DISTINCT count(*)`<!-- probe: db.count('films', db.all, { distinct: true }) -->, on the one result: not `count(DISTINCT …)`, which needs a `sql` template | none |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.count('ratings', db.all, { groupBy: 'film_id' }) -->; `.run()` gives the first group's value only, and with no group what no row gives (below) | none |
| `extras` | nothing | none |
| `lateral: { … }` | its `LEFT JOIN LATERAL`s, whose results are not read; a single subquery throws, as there is no row to pass it through to | none |
| `having`, `limit`, `offset` | as in `select()`; when they leave no row (a `having` that keeps none, `limit: 0`, `offset: 1`), what no row gives (below) | none |

</div>

`count()` and the four below throw these while compiling, so `.run()` rejects with a plain `Error`, not a `DatabaseError`, before any query, and `.compile()` throws; so does a query that nests one:

| Message | When | Since |
|---|---|---|
| `…() needs one column to aggregate: pass columns: ['column']`<!-- message --> | `sum()`, `avg()`, `min()` or `max()` without `columns` | pgcast 6.7.0 |
| `…() takes one column in columns, not …`<!-- message --> | `columns` with several columns, or none (`[]`) | pgcast 6.7.0 |
| `…() takes columns as an array, not …: pass columns: ['column']…`<!-- message --> | a string or another primitive as `columns`, `'title'` for `['title']`; an empty string, `0` or `false` is no `columns` | pgcast 6.7.0 |
| `…() cannot pass a lateral query through: nest it in the lateral of a select() instead`<!-- message --> | a single subquery as `lateral` | pgcast 6.7.0 |

Zapatos 6.6.1 sent the SQL, which Postgres refused: `sum(*)` and `count("id", "mood")` (42883), `count()` (42809), `count("0", "1")` for `'id'` past the type (42703), `SELECT  AS result` (42601). The type is that of 6.6.1, which lets the other calls through, a single subquery as `lateral` when there is no `columns` nor `extras`.

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

`.run()` reads the first row of the result. When the query returns none, it reads a `NULL`: `count()` gives `0`, and `sum()`, `avg()`, `min()` and `max()` give what they give for an empty set, `null` by default or `0` with [`aggregatesTypedByColumn: false`](#typed-by-column). Zapatos 6.6.1 rejected with `TypeError: Cannot read properties of undefined (reading 'result')`. Nested in a `lateral`, a query that returns no row gives `null`, `count()`'s too, though its type says `number`.

## `sum()` {#sum}

```ts
db.sum(table, where, options?)
```

`SELECT sum("column") AS result`<!-- probe: db.sum('ratings', db.all, { columns: ['column'] }) -->, a `number | null` by default. Otherwise as [`count()`](#count). Give one column in `columns`: without it, `.run()` rejects before any query, where Zapatos 6.6.1 sent `sum(*)`, which Postgres refuses (42883). The type lets that call through, as in 6.6.1. With no matching rows, the sum is `null`, or `0` with `aggregatesTypedByColumn: false` in `setConfig()`. Only a literal `false` in `ConfigTypes` selects the legacy `number` signature.

<CastPanel example="sum">

<<< ./examples/sum.ts{ts twoslash}

</CastPanel>

## `avg()` {#avg}

```ts
db.avg(table, where, options?)
```

`SELECT avg("column") AS result`<!-- probe: db.avg('ratings', db.all, { columns: ['column'] }) -->: the mean as a number, with the same empty result and type settings as [`sum()`](#sum).

<CastPanel example="avg">

<<< ./examples/avg.ts{ts twoslash}

</CastPanel>

## `min()` {#min}

```ts
db.min(table, where, options?)
```

`SELECT min("column") AS result`<!-- probe: db.min('ratings', db.all, { columns: ['column'] }) -->, by default, the column value as `pg` reads it, or `null`. The default parser gives a `Date` for a finite `date` and a string for `text`. With `aggregatesTypedByColumn: false` in `setConfig()`, `.run()` applies `Number()`. A literal `false` in `ConfigTypes` gives the type `number`.

<CastPanel example="min">

<<< ./examples/min.ts{ts twoslash}

</CastPanel>

## `max()` {#max}

```ts
db.max(table, where, options?)
```

`SELECT max("column") AS result`<!-- probe: db.max('ratings', db.all, { columns: ['column'] }) -->, the maximum of the column, with the same result type as [`min()`](#min).

<CastPanel example="max">

<<< ./examples/max.ts{ts twoslash}

</CastPanel>

## Typed by column {#typed-by-column}

From 7.0, aggregates are typed by column by default. To restore the numeric 6.x results, set [`aggregatesTypedByColumn`](/runtime-config#ConfigTypes) to `false` at run time and in the type declaration.

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const firstShow = await db.min('screenings', db.all, {
  columns: ['starts_at'],
}).run(pool);
```

<div class="stack">

| Call | Explicit `false` | Default in 7.0 |
|---|---|---|
| `min()` of a finite `starts_at` (`timestamptz`), default pg parser | its milliseconds, `number` | a `Date`, `Date \| null` |
| `max()` of `title`, a `text` | `NaN`, `number` | `'The Salt Orchard'`, `string \| null` |
| `sum()` or `avg()`, no row matching, or no row returned | `0`, `number` | `null`, `number \| null` |
| `max()` of `runtime_minutes`, an `integer` | `131`, `number` | `131`, `number \| null` |
| `min()` under a `lateral` key | an ISO string, typed `number` | the same string, `TimestampTzString \| null` |
| `min()` as the single `lateral` of a `selectOne()` | a `Date`, typed `number \| undefined` | the same `Date`, `Date \| null \| undefined` |

</div>

- The SQL is the same either way: `SELECT min("starts_at") AS result FROM "screenings"`<!-- probe: db.min('screenings', db.all, { columns: ['starts_at'] }) -->.
- `min()` and `max()` give a `bigint` or `numeric` as a string with the default pg parser and runtime setting. Under a lateral key the outer JSON parser reads the number and can preserve large values as strings.
- `count()` is unchanged by the option: `0` at top level, and `null` nested in a `lateral` or as an `extras` value when its query returns no row.
- Passed through as the single `lateral`, it is typed as at top level by `selectOne()` and `selectExactlyOne()`, which hand its column over as it is, and as nested by `select()`, which wraps its rows in `jsonb_agg()`. That `selectOne()` or `selectExactlyOne()`, nested in turn, is typed as nested.
- `.copy()` returns a plain `SQLFragment`. In `extras` or under a `lateral` key, nest the original `min()` or `max()`. With the default column typing, a copied date aggregate keeps the direct type `Date | null` even though Postgres returns a date string in JSON for a non-null date.

## Types

What the signatures above are made of, from `zapatos/db`.

### `NumericAggregateSignatures` {#NumericAggregateSignatures}

The signature of `count()`, also used for the other aggregates with `aggregatesTypedByColumn: false` in `ConfigTypes`: `table`, `where`, `options?`, returning `SQLFragment<number>`. By default, `sum()` and `avg()` take [`NullableNumericAggregateSignatures`](#NullableNumericAggregateSignatures), and `min()` and `max()` [`ColumnAggregateSignatures`](#ColumnAggregateSignatures) ([Typed by column](#typed-by-column)).

### `NullableNumericAggregateSignatures` {#NullableNumericAggregateSignatures}

The default signature of `sum()` and `avg()` from 7.0: as [`NumericAggregateSignatures`](#NumericAggregateSignatures), returning `SQLFragment<number | null>`.

### `ColumnAggregateSignatures` {#ColumnAggregateSignatures}

The default signature of `min()` and `max()` from 7.0: as [`NumericAggregateSignatures`](#NumericAggregateSignatures), returning a [`ColumnAggregateFragment`](#ColumnAggregateFragment) of the column in `columns`.

### `ColumnAggregateFragment` {#ColumnAggregateFragment}

```ts
interface ColumnAggregateFragment<RunResult, NestedResult> extends SQLFragment<RunResult>
```

With the default `ConfigTypes`, `min()` and `max()` use `RunResult` (the column's `Selectable` type or `null`) for direct calls and single laterals of `selectOne()`, `selectExactlyOne()` and `selectRows()`. These single laterals give the pg value, as does a direct call with the default runtime setting. Under a lateral key, in `extras` or under `select()`, the value is JSON, typed `NestedResult` (the column's `JSONSelectable` type or `null`), as [`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment) reads it. A function of yours that returns one, in a project built with `declaration: true`, has it written in its `.d.ts` by this name, but not a spread of one (`{ ...db.min(…) }`), whose members name a symbol `zapatos/db` does not export: TS4023.

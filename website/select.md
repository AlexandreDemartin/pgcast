# Select {#select-and-the-aggregates}

`select()`, `selectOne()` and `selectExactlyOne()` return rows.
{.lede}

## `select()` {#select}

```ts
db.select(table, where, options?, mode?, aggregate?)
```

Builds one `SELECT` of the rows of `table` that match `where`. It returns a [`SQLFragment`](/sql-template#SQLFragment): `.run(pool)` gives an array of the table's `JSONSelectable` rows, `[]` when none match.

- `table`: a table of the generated schema.
- `where`: a `Whereable`, an object of columns and their values or [conditions](/conditions), its keys in alphabetical order, joined by `AND` in one pair of parentheses, a condition or `sql` value in its own (`("id" = $1 AND ("studio_id" > $2) AND "title" = $3)`<!-- probe: db.select('films', { title: 'x', id: 1000, studio_id: db.conditions.gt(1000) }) -->); a [`sql`](/sql-template#sql) fragment, written as it is; or [`db.all`](/sql-template#all), for no `WHERE` at all.
  - From 6.11.0, the type refuses a string, a `String` or an array as the `where` of any shortcut (2345), as `having` and in `exists()` and `isInSelect()`, even on a table with a column named like a member of `String`, of a type that member fits (`length` a number), whatever the schema.
  - In a function generic over the table, `<K extends 'films' | 'studios'>(table: K)`, each shortcut refuses an object written in place as its `where` (TS2353, which names `SQLFragment`), as in Zapatos 6.6.1: while `K` is generic, TypeScript checks the object's keys against `SQLFragment` alone. Type the object first, `const where: s.WhereableForTable<K> = { id: 1 }`, then pass `where`: it compiles, and a key that no table has is still refused. A column that only one of `K`'s tables has passes too: `{ title: 'x' }` compiles, and on `studios`, which has no `title`, Postgres refuses the query (42703).
- `options`: the [options](#options) below, all optional.
- `mode` and `aggregate`: what `selectOne()`, `count()` and the others pass; see [`SelectResultMode`](#SelectResultMode).

For its rows one by one, as [`cursor()`](/transaction#cursor) reads them, the same query without `jsonb_agg`: [`selectRows()`](#selectRows).

<CastPanel example="select">

<<< ./examples/select.ts{ts twoslash}

</CastPanel>

### The SQL it writes

- Each row is one `jsonb` value, `to_jsonb("films".*)`<!-- probe: examples/select.ts -->, so dates and times come back as strings and `bigint` as a number: the `JSONSelectable` types say so ([The catalog](/catalog-types)).
- The rows are gathered into one array, `coalesce(jsonb_agg(result), '[]')`<!-- probe: examples/select.ts -->, around a subquery aliased `"sq_<alias or table>"`, so `ORDER BY` and `LIMIT` apply to the rows. One query, one value back. On large values, many rows or nested laterals, that JSON costs: [Performance](/performance), and [With `shortcutsUseJson`](#shortcutsUseJson).
  - With [`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows), a `select()` run or compiled on its own sends the rows themselves, `SELECT to_jsonb("films".*) AS result FROM "films"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('films', db.all)) -->, [`selectRows()`](#selectRows)'s query, and `.run()` gives the same array; nested, it keeps the aggregate.
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

### With `shortcutsUseJson` {#shortcutsUseJson}

With [`shortcutsUseJson`](/runtime-config#Config.shortcutsUseJson), each row and the array are built with `json` functions, in place of their `jsonb` twins. The values and the types are the same, but for a row's key order and a nested result's type, `json`.

| Option | SQL with `shortcutsUseJson` |
|---|---|
| none | `to_json("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) -->, and the array `coalesce(json_agg(result), '[]')`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) --> |
| `columns`, with or without `extras` and `lateral` | one `json_build_object($1::text, "title", $2::text, upper("title"))`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { columns: ['title'], extras: { upper: db.sql`upper(${'title'})` } })) -->, its keys parameters |
| `extras` or `lateral`, beside every column | `to_json("row_films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) --> of the row with its keys as aliases, `"lateral_cast".result AS "cast"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) -->, in a subquery `AS "row_films"`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } })) --> |
| `distinct: true` | `SELECT DISTINCT to_jsonb("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { distinct: true })) -->, as `json` has no equality, under `json_agg`; over a passed-through `select()`, `selectOne()` or `selectExactlyOne()`, `SELECT DISTINCT to_jsonb("lateral_passthru".result)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { distinct: true, lateral: db.selectOne('studios', { id: db.parent('studio_id') }) })) --> |

- Beside every column, each key is one identifier, any `"` doubled. An empty key, one with a NUL, or one over 63 bytes in UTF-8, which Postgres would refuse or truncate, throws while compiling: give `columns`, whose keys stay parameters.
- There, a string `order.by` or `distinct` is written after the table, `ORDER BY "films"."title" ASC`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all, { order: { by: 'title', direction: 'ASC' }, extras: { upper: db.sql`upper(${'title'})` } })) -->, unless it holds a `.`: a bare name would also match a key of that name (42702). So `by: 'result'` names the table's column. A `sql` fragment is written as given, so a bare name in it that equals a key fails with 42702: `` by: db.sql`${'title'}` `` beside `extras: { title: … }`, and the same in `distinct` or beside a `lateral` key. Write it qualified, `` db.sql`${'films'}.${'title'}` ``.
- A key equal to a column comes twice in the JSON, and the last wins, as `||` makes it win.
- With `columns`, one `json_build_object()` takes 100 arguments: over 50 keys, columns, `extras` and `lateral` keys together, throw while compiling.
- A passed-through `lateral`, but under `distinct: true`, and the [aggregates](/aggregates) keep their SQL; the subquery builds its own with `json`.

<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', { studio_id: 1000 }, { order: { by: 'title', direction: 'ASC' }, lateral: { cast: db.select('roles', { film_id: db.parent('id') }, { columns: ['character'] }) } })) -->
```sql
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_films".*) AS result FROM (SELECT "films".*, "lateral_cast".result AS "cast" FROM "films" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "character") AS result FROM "roles" WHERE ("film_id" = "films"."id")) AS "sq_roles") AS "lateral_cast" ON true WHERE ("studio_id" = $2) ORDER BY "films"."title" ASC) AS "row_films") AS "sq_films"
-- ["character", 1000]
```

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

- `order`: one [`OrderSpecForTable`](#OrderSpecForTable), `{ by, direction, nulls? }`, or an array of them, in that order. `by` is a column or any SQL of the table, its `SQL` type: a `sql` fragment (`` db.sql`array_length(${'genres'}, 1)` ``), [`db.parent()`](/sql-template#parent); `direction` is `'ASC'` or `'DESC'`; `nulls`, `'FIRST'` or `'LAST'`.
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

A read shortcut is a subquery there: `select()`, `selectOne()`, `selectExactlyOne()`, `count()`, `sum()`, `avg()`, `min()` or `max()`, or a `.copy()` of one, is written in parentheses, `(SELECT count(*) AS result FROM "films" WHERE "studio_id" = "studios"."id")`<!-- probe: db.select('studios', db.all, { extras: { films: db.count('films', db.sql`${'studio_id'} = ${'studios'}.${'id'}`) } }) -->, and comes back as JSON, as in a `lateral`, or `null` when its query returns no row. It must give one row at most: a `groupBy` that gives several is refused (21000). `db.parent()` has no meaning in `extras`, so name the outer table in a `sql` fragment, as here. A `sql` fragment is written as given: put a query of your own, or a shortcut inside one, in its parentheses.

<CastPanel example="selectExtras">

<<< ./examples/selectExtras.ts{ts twoslash}

</CastPanel>

### `lateral`

`lateral?: { [key: string]: SQLFragment } | SQLFragment`, a [`LateralOption`](#LateralOption): other shortcuts, nested, each joined with `LEFT JOIN LATERAL … ON true`. In them, [`db.parent()`](/sql-template#parent) names a column of this query's table.

- **An object**: each key becomes a key of the result, holding its subquery's result: an array for `select()`, an object or `null` for `selectOne()`, a number for `count()`, or `null` when its query returns no row ([`count()`](/aggregates#count)). A `count()` whose `groupBy` gives several groups brings the parent row back once per group under an outer `select()`; under `selectOne()` or `selectExactlyOne()`, once, with one group's count, though with [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow) `selectExactlyOne()` rejects with `NotExactlyOneError`. The keys are joined in alphabetical order; each is one identifier, `"lateral_<key>"`.
- **One subquery**: its result is passed through in place of each row. Then `columns` and `extras` have nothing to add to, and the type refuses them, with `strictNullChecks` on.
  - When you call `.run()` on the outer `selectOne()`, `selectExactlyOne()` or [`selectRows()`](#selectRows), `pg` reads the passed-through `result` column with its configured type parser. An outer `select()` returns the values in a JSON array. A `sql` template keeps its result annotation in both cases.
  - By default, `pg` reads a [`count()`](/aggregates#count) of two rows as `"2"`. It also reads `bigint` or `numeric` results from `sum()` and `avg()` as strings. With `Number` as its `int8` parser, the same count gives `2`. The aggregate is typed as `number`, or `number | null` for `sum()` and `avg()` by default.
  - Apply `Number()` only to a string. A missing aggregate row gives `null`, as do `sum()` and `avg()` when no rows match. With no parent row, `selectOne()` gives `undefined`.
  - With the column-typed signatures, if a single `lateral` of `selectOne()` or `selectExactlyOne()` can be either a date minimum or a count, nesting that query under a key types the JSON date string as `Date`, and passing it to `selectRows()` accepts the count although the default pg parser returns a string.
- **`null`**: `lateral: null`, or a key whose subquery is `null` or `undefined`, throws while compiling, so `.run()` rejects before any query: "`` `lateral: null` has no meaning: for no lateral join, leave `lateral` out; to join, give it a `select()`, `selectOne()` or `count()` query, or an object of them. ``<!-- message -->", or "`` The `lateral` key 'cast' is `null`, not a query: leave the key out, or give it a `select()`, `selectOne()` or `count()` query. ``<!-- message -->". Zapatos 6.6.1 threw a `TypeError` at the call.

Give the count a key to read it as JSON. The ungrouped count below returns one row, giving `{ n: 2 }`. A grouped count that returns no row gives `{ n: null }`.

<<< ./examples/plain/lateral_keyed_count.ts{ts twoslash}

<!-- probe: db.selectExactlyOne('studios', { id: 1000 }, { columns: [], lateral: { n: db.count('films', { studio_id: db.parent('id') }) } }) -->
```sql
SELECT jsonb_build_object() || jsonb_build_object($1::text, "lateral_n".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "films" WHERE ("studio_id" = "studios"."id")) AS "lateral_n" ON true WHERE ("id" = $2) LIMIT $3
-- ["n", 1000, 1]
```

For a string with each selector, convert the timestamp to JSON in the subquery and annotate its result as `string`.

<<< ./examples/plain/lateral_json_timestamp.ts{ts twoslash}

<!-- probe: db.select('studios', { id: 1000 }, { lateral: db.sql`SELECT to_jsonb(now()) AS result` }) -->
```sql
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT "lateral_passthru".result AS result FROM "studios" LEFT JOIN LATERAL (SELECT to_jsonb(now()) AS result) AS "lateral_passthru" ON true WHERE ("id" = $1)) AS "sq_studios"
-- [1000]
```

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

A `null` that gets past the type, from JavaScript or JSON: `null` options are none, as in the [writes](/insert#insert-options). `order: null` or `lock: null` throws as the query compiles, in the aggregates and nested in a `lateral` too, so `.run()` rejects before any query: "`` `order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them. ``<!-- message -->", and the same for each key. So do `columns: null` and `extras: null` in `select()`, `selectOne()` and `selectExactlyOne()`, unless one `lateral` subquery takes the columns' place. Zapatos 6.6.1 threw a `TypeError` at the call, on `null` options too, except in `selectOne()` and `selectExactlyOne()`.

## `selectOne()` {#selectOne}

```ts
db.selectOne(table, where, options?)
```

As [`select()`](#select), with `LIMIT $1`<!-- probe: db.selectOne('films', db.all) -->, its value `1`, and no `jsonb_agg`: `.run(pool)` gives the first row, or `undefined` when none matches. Any `limit` you pass is replaced by `1`; `offset` and the other options are kept. In a `lateral`, its key holds the row or `null`.

With `withTies`, it writes `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.selectOne('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, withTies: true }) -->, here and in `selectExactlyOne()`; Postgres refuses it without `order` (42601). `.run()` then gives one of the tied rows; in a `lateral` under an outer `select()`, the parent row comes back once per tie.

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

With [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), the query run on its own asks for two rows (by default `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('studios', { id: 1000 })) --> with `2`) and `.run()` rejects on a second row too. Nested in a `lateral` or a `sql` template, it requests one row plus any ties with `withTies: true`.

### `NotExactlyOneError` {#NotExactlyOneError}

```ts
class NotExactlyOneError extends Error {
  query: SQLFragment;
}
```

What `selectExactlyOne()`, the mode `ExactlyOne` of `select()`, rejects with when no row matches. Its `name` is `'NotExactlyOneError'`, its `message` "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message -->; with [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), a second row gives "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->.

Its `query` is the [`SQLFragment`](/sql-template#SQLFragment) that ran, or, for a [`.copy()`](/sql-template#copy), the one it was copied from: `err.query.compile()` gives its SQL and values. `err instanceof db.NotExactlyOneError` recognises it; catching it: [Tell a missing row from the others](/handle-errors#tell-a-missing-row-from-the-others).

## `selectRows()` {#selectRows}

```ts
db.selectRows(table, where, options?)
```

From 6.12.0. The query [`select()`](#select) wraps in `jsonb_agg`, as a fragment of its own, one row per result: for [`cursor()`](/transaction#cursor), which runs exactly the fragment it is given, and so reads a `select()` as one row, its whole array. It takes `select()`'s `table`, `where` and [options](#options), and `.run(pool)` returns an array with one element per result row, or `[]` when none match.

| Call | SQL |
|---|---|
| `db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } })` | `SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" WHERE ("studio_id" = $3) ORDER BY "title" ASC`<!-- probe: db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }) --> |
| `db.select(…)`, the same arguments | `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (…) AS "sq_films"`<!-- probe: db.select('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }) -->, the same query inside, with the same values |
| `db.select(…)` with [`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows) | `selectRows()`'s query, run or compiled on its own; a single `lateral` passed through is converted above it, `SELECT to_jsonb(result) AS result FROM (…) AS "sq_studios"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('studios', db.all, { lateral: db.count('films', { studio_id: db.parent('id') }) })) --> |

A studio's films, read 100 at a time:

<<< ./examples/plain/cursor_select_rows.ts{ts twoslash}

<!-- probe: db.readCommitted(pool, async txnClient => { for await (const _ of db.cursor(txnClient, db.selectRows('films', { studio_id: 1000 }, { columns: ['id', 'title'], order: { by: 'title', direction: 'ASC' } }), { batchSize: 100 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT jsonb_build_object($1::text, "id", $2::text, "title") AS result FROM "films" WHERE ("studio_id" = $3) ORDER BY "title" ASC
FETCH FORWARD 100 FROM pgcast_cursor_1
-- the same FETCH again, until one returns no row
CLOSE pgcast_cursor_1
COMMIT
```

- By default, a passed-through `min()` of a `date` is typed as `Date | null` per row. For a matching finite date, the default parser gives a `Date`.
- A `lateral` passed through and typed `number` does not compile: `count()`, `sum()`, `avg()`, and `min()` or `max()` unless typed by column, alone or in a union, `cond ? count() : select()`. The error is TS2322 on `lateral`, `… is not assignable to type 'undefined'.` A `sql` template typed `number` is refused with them, as its type cannot be told from theirs. Use a key for an [ungrouped count](#lateral), as in `` db.selectRows('studios', db.all, { lateral: { films: db.count('films', { studio_id: db.parent('id') }) } }) ``<!-- tsc -->. A count subquery that returns no row gives JSON `null` under that key. A `lateral` whose type is a type parameter, an object of subqueries included, or a fragment typed by an unconstrained one, `db.SQLFragment<R>`, does not compile either: `function f<L extends db.SQLFragmentMap>(l: L) { return db.selectRows('studios', db.all, { lateral: l }); }` gives TS2345. The forwarder can call `select()` or cast the map with `l as db.SQLFragmentMap`. For a `db.SQLFragment<R>`, use `l as db.SQLFragment<any>` (the map cast gives TS2352).
- A `lock` locks each row as its batch is fetched, not before.
- Nested, it is a set of rows, not one value. A `sql` template takes it, `` db.sql`SELECT count(*) FROM (${db.selectRows('films', db.all)}) AS f` ``<!-- tsc -->, and so do [`withCTEs()`](/sql-template#withCTEs) and `cursor()`. As a `lateral`, an `extras` value, a `where` or the Whereable value of a typed column, it does not compile: its type, a [`RowsQuery`](#RowsQuery), says so. Its type takes it as `order.by`, and as the Whereable value of a column typed `any`, where Postgres refuses it. Past the type, from JavaScript, a `lateral` key repeats the parent row once per row, and an `extras` value gets 21000 from Postgres.

## Types

What the signatures above are made of, from `zapatos/db`. `T` is a table, `C` the `columns`, `E` the `extras`, `L` the `lateral` and `A` the `alias`.

### `SelectResultMode` {#SelectResultMode}

```ts
enum SelectResultMode { Many, One, ExactlyOne, Numeric }
```

The fourth argument of `select()`: an array of rows (`select()`), a row or `undefined` (`selectOne()`), a row or an error (`selectExactlyOne()`), a number when you call `select()` with `SelectResultMode.Numeric`.

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

### `OrderSpecForTable` {#OrderSpecForTable}

```ts
interface OrderSpecForTable<T extends Table> {
  by: SQLForTable<T>;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}
```

From 6.9.0. One item of [`order`](#order-limit-offset-and-withties): `by`, then `direction`, then `NULLS` and `nulls` if given, `"title" DESC NULLS LAST`.

### `ColumnsOption` {#ColumnsOption}

`ColumnsOption<T> = readonly ColumnForTable<T>[] | undefined`: the type of `columns`, and of `returning` in [`insert()`](/insert#insert) and the other writes. A `readonly` array gives the same type as a mutable one ([`columns`](#columns)).

### `ExtrasOption` {#ExtrasOption}

`ExtrasOption<T> = SQLFragmentOrColumnMap<T> | undefined`: the type of `extras`, here and in the writes.

### `LateralOption` {#LateralOption}

`LateralOption<C, E>`: the type of `lateral`. An object of subqueries ([`SQLFragmentMap`](#SQLFragmentMap)); or one subquery, only when neither `columns` nor `extras` is given. From 7.2.0, its parameters are constrained by `readonly string[] | undefined` and `{ [k: string]: SQLFragment<any> | string } | undefined`, which every `ColumnsOption<T>` and `ExtrasOption<T>` meets, rather than by `ColumnsOption<Table>` and `ExtrasOption<Table>`: a generic `L extends LateralOption<C, E>` no longer relates `C` to every column of the schema ([decision 016](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/016-parent-column-default.md)).

In a function generic over `columns` (`C extends ColumnsOption<T>`) or `extras` (`E extends ExtrasOption<T>`), `select()`, `selectOne()` and `selectExactlyOne()` given no `lateral` type each column of their rows as `any` inside that function, as in Zapatos 6.6.1, so a wrong column compiles. That holds with generic `columns` and no `extras` or a generic one, and with a generic `extras` and no `columns`; without `strictNullChecks`, also with generic `columns` and a literal `extras`, or with literal `columns` and a generic `extras`. The function's callers get typed rows. Pass `lateral: undefined`, which changes no SQL, and the rows are typed inside the function in each of these cases: a key of a generic `extras` is then refused as well. A function that passes on a generic `lateral` of its own, or a whole options object typed with `LateralOption<C, …>`, keeps `any`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
async function filmCards<C extends db.ColumnsOption<'films'>>(queryable: db.Queryable, columns: C) {
  const loose = await db.select('films', db.all, { columns }).run(queryable);
  const looseYear: string = loose[0]!.release_year;  // compiles: each column is any here
  const cards = await db.select('films', db.all, { columns, lateral: undefined }).run(queryable);
  // @ts-expect-error release_year is a number
  const year: string = cards[0]!.release_year;
  // @ts-expect-error films has no rating column
  const rating = cards[0]!.rating;
  return [looseYear, year, rating];
}
```

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

The call signature of `selectOne()`: `table`, `where`, `options?`, with the mode `One`. By default, it returns a [`ColumnAggregateFragment`](/aggregates#ColumnAggregateFragment) when its single `lateral` is a column-typed `min()` or `max()`, including one passed through `selectOne()` or `selectExactlyOne()`, and a `SQLFragment` otherwise ([Typed by column](/aggregates#typed-by-column)): a function typed `SelectOneSignatures` then returns what `selectOne()` does, not a `SQLFragment` of its own.

### `SelectExactlyOneSignatures` {#SelectExactlyOneSignatures}

The call signature of `selectExactlyOne()`: `table`, `where`, `options?`, with the mode `ExactlyOne`. By default, it returns a `ColumnAggregateFragment` in the same case as [`SelectOneSignatures`](#SelectOneSignatures): a function typed `SelectExactlyOneSignatures` then returns what `selectExactlyOne()` does.

### `SelectRowsSignatures` {#SelectRowsSignatures}

From 6.12.0. The call signature of `selectRows()`: `table`, `where`, `options?`, returning `SQLFragment<R[], RowsQuery>`, `R` the row as `selectOne()` types it.

### `RowsQuery` {#RowsQuery}

```ts
interface RowsQuery
```

From 6.12.0. The second type argument of the fragment `selectRows()` returns, which marks a query of many rows: `lateral`, `extras` and a `where` take `SQLFragment<any>`, whose second argument is `never`, so they refuse it; a `sql` template, `withCTEs()` and `cursor()` take `SQLFragment<any, any>`. Write it to type a variable: `db.SQLFragment<s.films.JSONSelectable[], db.RowsQuery>`. A helper typed `db.SQLFragment<R>` or `db.SQLFragment<any>` refuses it too (TS2345); typed `db.SQLFragment<R, any>`, it takes both: `` const run = <R>(q: db.SQLFragment<R, any>) => q.run(pool); ``<!-- tsc: export … -->.

# `insert()`, `update()` and the other writes

The shortcuts that write: `insert()`, `upsert()`, `update()`, `deletes()` and `truncate()`. For each, its parameters, every option with the SQL it adds and its effect on the type, and what it throws.
{.lede}

What every write shares:

- It returns a `SQLFragment`: [`.run(pool)`](/sql-template) sends it, `.compile()` gives its `text` and `values` without sending anything.
- A value is sent as a parameter (`$1`), never written into the SQL; a `sql` fragment is SQL.
- Rows come back through `to_jsonb()`, as a table's `JSONSelectable`: a `timestamptz` is a string ([How types are cast from the catalog](/catalog-types)).
- An error from Postgres rejects `.run()` with a `DatabaseError` ([`isDatabaseError()`](/transaction)). The errors below are thrown by pgcast as it builds the query, before anything is sent.

## `insert()` {#insert}

```ts
db.insert(table, values, options?)
```

Insert one row or several, and return them as Postgres stored them, defaults and serials filled in.

- `table`: a table of the schema.
- `values`: an `Insertable`, or an array of them. A `sql` fragment is written as SQL (`` db.sql`now()` ``), `db.Default` as `DEFAULT`; an `undefined` value is `NULL` ([An `undefined` value](#undefined-values)).
  - `raw()`, `cols()` and `vals()` are no values here: pgcast's type refuses them, where Zapatos 6.6.1's took them. At run time they are still sent as one parameter, as JSON: `{ tagline: db.raw("'x'") }` sends `{"value":"'x'"}` ([#132](https://github.com/AlexandreDemartin/pgcast/issues/132)). For SQL, write a `sql` fragment.
- `options`: `returning` and `extras` ([Options](#insert-options)).

<CastPanel example="insert">

<<< ./examples/insert.ts{ts twoslash}

</CastPanel>

- One row gives one result; an array gives an array, in the same order.
- The columns are the keys of every row; a key missing from a row is `DEFAULT` in that row, as `tagline` above.
- An empty array is a no-op: `.run(pool)` resolves with `[]` and sends nothing, unless forced with `.run(pool, true)`. Its SQL, `INSERT INTO "films" SELECT null WHERE false`, is marked as a no-op.
- Postgres takes at most 65,535 parameters in a query: split a bigger insert ([Insert and upsert in batches](/batches)).

### Options {#insert-options}

`returning` and `extras` are the same for `upsert()`, `update()` and `deletes()` (<a href="#ReturningOptionsForTable"><code>ReturningOptionsForTable</code></a>).

<CastPanel example="insert_returning">

<<< ./examples/insert_returning.ts{ts twoslash}

</CastPanel>

| Option | SQL it adds | Effect on the type |
|---|---|---|
| none | `RETURNING to_jsonb("films".*) AS result` | `films.JSONSelectable` |
| `returning: ['id']` | `jsonb_build_object($5::text, "id")` in place of `to_jsonb("films".*)` | `Pick<films.JSONSelectable, 'id'>` |
| `extras: { name: 'title' }` | `\|\| jsonb_build_object($6::text, "title")` | adds `name`, of the column's type |
| `extras: { shouted: … }`, the fragment above | `\|\| jsonb_build_object($7::text, upper("title"))` | adds `shouted`, of the fragment's `RunResult`: `string`, from `db.sql<s.films.SQL, string>` |

- Several `extras` keys go in one `jsonb_build_object()`, as in the panel.
- A `readonly` array in `returning` (`['id'] as const`) sends the same SQL, but the result type is `never` for now ([#41](https://github.com/AlexandreDemartin/pgcast/issues/41)): write the array without `as const`.
- Both need `strictNullChecks` for their types.

## `upsert()` {#upsert}

```ts
db.upsert(table, values, conflictTarget, options?)
```

`INSERT … ON CONFLICT … DO UPDATE`: insert each row, or update the existing row it conflicts with.

- `table`, `values`: as for [`insert()`](#insert).
- `conflictTarget`: the arbiter of the conflict: a column, an array of columns, or the name of a unique or primary-key constraint wrapped in [`constraint()`](#constraint).
- `options`: `updateColumns`, `noNullUpdateColumns`, `updateValues` and `reportAction` ([Options](#upsert-options)); `returning` and `extras`, as for [`insert()`](#insert-options).

<CastPanel example="upsert">

<<< ./examples/upsert.ts{ts twoslash}

</CastPanel>

- The update sets every column inserted, from `EXCLUDED`, and each key of `updateValues`.
- Each result has `$action`, `'INSERT'` or `'UPDATE'` (<a href="#UpsertAction"><code>UpsertAction</code></a>).
- One row gives one result; an array gives an array, without the rows that do nothing (<a href="#doNothing"><code>doNothing</code></a>).
- An empty array is a no-op, as for `insert()`.

### Options {#upsert-options}

Each SQL replaces the `DO UPDATE SET …` of the plain upsert, on `ratings` (on `films` for `noNullUpdateColumns`), or adds to it:

| Option | SQL it adds | Effect on the type |
|---|---|---|
| none | `DO UPDATE SET ("film_id", "stars", "votes") = ROW(EXCLUDED."film_id", EXCLUDED."stars", EXCLUDED."votes")` | `ratings.JSONSelectable & UpsertAction` |
| `updateColumns: 'votes'` | `DO UPDATE SET ("votes") = ROW(EXCLUDED."votes")` | none |
| `updateColumns: db.doNothing` | `DO NOTHING` | `\| undefined`, for one row |
| `noNullUpdateColumns: 'tagline'` | `CASE WHEN EXCLUDED."tagline" IS NULL THEN "films"."tagline" ELSE EXCLUDED."tagline" END` in place of `EXCLUDED."tagline"` | none |
| `updateValues: { votes: 10 }` | `$3` in place of `EXCLUDED."votes"` | none |
| ``updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` }`` | `"ratings"."votes" + 1` in place of `EXCLUDED."votes"` | none |
| `reportAction: 'suppress'` | no `\|\| jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END)` | no `UpsertAction` |

- `updateColumns` takes a column or an array; `noNullUpdateColumns` a column, an array, or `db.all` for every column.
- `updateValues` is one set of values for every row updated. Its keys are always updated, even when `updateColumns` leaves them out, or is `doNothing` (then the SQL is `DO UPDATE SET`, not `DO NOTHING`).
- In `updateValues`, a plain value is a parameter. A value that holds a fragment, `param()`, `raw()`, `cols()`, `vals()`, `Default` or `self`, at any depth of its arrays and plain objects, is compiled as in a `sql` template.
- To read a column there, name the table for the existing row, `${'ratings'}.${'votes'}`, or `EXCLUDED` for the new one, `` db.sql`EXCLUDED.${'votes'}` ``. `db.self`, and a condition that uses it ([`conditions.add()`](/conditions)), throw "The 'self' column alias has no meaning here", as in Zapatos 6.6.1.

::: warning Security
Zapatos 6.6.1 wrote a plain string in `updateValues` as an identifier: `{ mood: 'happy' }` gave `ROW("happy")`, and a string from a user could read other columns or tables. pgcast sends it as a parameter, `ROW($3)`, as its type and `update()` always said. To read a column there, write a fragment, as in the table ([The security model](/security)).
:::

### Rows with different keys {#upsert-different-keys}

In several rows without `updateColumns`, a key missing from one row is inserted as `DEFAULT`, then set from `EXCLUDED` on conflict: that row's existing value is lost.

- `[{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }]` sends `($4, $5, DEFAULT)`, so an existing count of 4-star votes goes back to 1.
- It runs, as in Zapatos 6.6.1, and warns once per process: `PGCAST_DEP001`.
- A key of `updateValues`, or a column of an array or string `conflictTarget`, does not count: new rows without their serial `id`, upserted on `'id'`, neither warn nor throw. With `constraint()`, every key counts.
- Rows with the same keys, one row, and any `updateColumns` never warn.

::: tip Opt-in
With `upsertRequiresSameKeys: true` ([`Config`](/runtime-config)), such an upsert throws before any query: "rows have different keys: pass updateColumns, or give every row the same keys". Without it, pgcast warns as `PGCAST_DEP001`; it becomes the default in 7.0 ([Versions, opt-ins and warnings](/versions)).
:::

## `constraint()` {#constraint}

```ts
db.constraint(name)
```

Wrap the name of a unique or primary-key constraint of the table, for the `conflictTarget` of `upsert()`: `ON CONFLICT ON CONSTRAINT "ratings_pkey"`, in place of `ON CONFLICT ("film_id", "stars")`. The names come from the schema, so one the table doesn't have fails to compile:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
// ---cut---
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_pkey'));
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_stars_key'));
```

- The type takes every unique index of the table, and Postgres only a constraint. An index made with `CREATE UNIQUE INDEX`, which is no constraint, type-checks, and Postgres refuses it: 42704, `constraint "…" for table "…" does not exist`.
- For such an index, pass its columns as the `conflictTarget`: `'code'` for a unique index on `code`.

## `Constraint` {#Constraint}

The class that `constraint()` returns, its constraint name in `value`: `new db.Constraint<'ratings'>('ratings_pkey')` is the same.

## `doNothing` {#doNothing}

An empty array, for the `updateColumns` of `upsert()`: a row that conflicts is left as it is, and returns nothing.

<CastPanel example="upsert_do_nothing">

<<< ./examples/upsert_do_nothing.ts{ts twoslash}

</CastPanel>

- One row: `undefined` when it conflicts, and the type says so.
- An array: the rows inserted only; `[]` when every row conflicts.

## `UpsertAction` {#UpsertAction}

`{ $action: 'INSERT' | 'UPDATE' }`, added to each result of `upsert()`: `'INSERT'` for a new row, `'UPDATE'` for an updated one, read from the row's `xmax`. `reportAction: 'suppress'` leaves it out of the SQL and of the type.

## `update()` {#update}

```ts
db.update(table, values, where, options?)
```

Update the rows that match, and return them. The arguments come in the order of the SQL: `SET`, then `WHERE`.

- `table`: a table of the schema.
- `values`: an `Updatable`, with at least one key. A `sql` fragment is written as SQL, where `db.self` is the column, and so is a condition such as [`conditions.add()`](/conditions). `raw()`, `cols()` and `vals()` are refused, as for [`insert()`](#insert). An `undefined` value is `NULL` ([An `undefined` value](#undefined-values)).
- `where`: a `Whereable`, or a `sql` fragment ([Conditions](/conditions)).
- `options`: `returning` and `extras`, as for [`insert()`](#insert-options).

<CastPanel example="update">

<<< ./examples/update.ts{ts twoslash}

</CastPanel>

- Always an array: every row updated, `[]` when none matches.
- `SET (…) = ROW(…)`: `ROW()` keeps a single column valid since Postgres 10.
- `values` with no key throws: "nothing to update: an Updatable needs at least one column". Zapatos 6.6.1 sent `SET () = ROW()`, which Postgres refused (42601).

::: warning Every row
An empty `Whereable`, `{}`, compiles to `WHERE TRUE`: `update()` updates every row of the table, and `deletes()` deletes them all.
:::

## `deletes()` {#deletes}

```ts
db.deletes(table, where, options?)
```

Delete the rows that match, and return them. `delete` is a reserved word in JavaScript, hence the name.

- `table`: a table of the schema.
- `where`: a `Whereable`, or a `sql` fragment ([Conditions](/conditions)); `{}` is every row, as for [`update()`](#update).
- `options`: `returning` and `extras`, as for [`insert()`](#insert-options).

<CastPanel example="deletes">

<<< ./examples/deletes.ts{ts twoslash}

</CastPanel>

- Always an array: every row deleted, `[]` when none matches.

## `DeleteSignatures` {#DeleteSignatures}

The interface of `deletes()`'s call signature, `(table, where, options?) => SQLFragment<…[]>`, for a function that wraps it and keeps its types.

## `truncate()` {#truncate}

```ts
db.truncate(table, ...options)
```

Empty one table, or several in one statement.

- `table`: a table of the schema, or an array of them.
- `options`: `'CONTINUE IDENTITY'` or `'RESTART IDENTITY'`, then `'RESTRICT'` or `'CASCADE'`, each optional.

<CastPanel example="truncate">

<<< ./examples/truncate.ts{ts twoslash}

</CastPanel>

| Option | SQL it adds | Effect on the type |
|---|---|---|
| none | `TRUNCATE "tags"` | `undefined` |
| `'CONTINUE IDENTITY'` | `CONTINUE IDENTITY`: sequences keep their values, as by default | none |
| `'RESTART IDENTITY'` | `RESTART IDENTITY`: the tables' sequences restart | none |
| `'RESTRICT'` | `RESTRICT`: Postgres refuses if another table references one of them, as by default | none |
| `'CASCADE'` | `CASCADE`: also empties the tables that reference them | none |

- Any other option throws: "Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '…'". Zapatos 6.6.1 wrote it into the SQL as it was.

## An `undefined` value {#undefined-values}

In the values of `insert()`, `update()` and `upsert()`, Zapatos 6.6.1 sends `undefined` as `NULL`: a `NOT NULL DEFAULT` column fails, and `update()` erases the column instead of leaving it.

| In | By default, as in 6.6.1 | With `undefinedMeansMissing: true` |
|---|---|---|
| `insert()` | `NULL` | `DEFAULT`: `VALUES ($1, $2, $3, DEFAULT, $4)` |
| `update()` | sets the column to `NULL`, and counts as a key | left out: `SET ("title") = ROW($1)`; with no key left, it throws "nothing to update…" |
| `upsert()` | inserts `NULL`, then sets it from `EXCLUDED` | left out: not inserted, nor updated unless `updateColumns` names it (then from `EXCLUDED`, so an existing row takes the column's `DEFAULT`); in several rows, its cell is `DEFAULT` and counts as missing ([Rows with different keys](#upsert-different-keys)) |

- By default, each sends the SQL of 6.6.1 and warns once per process: `PGCAST_DEP002`.
- An `undefined` in a `where` is unchanged.
- An `undefined` in `updateValues` is unchanged too, in both modes: its key is still updated, from `EXCLUDED`. So an existing row takes the value inserted, or the column's `DEFAULT` when the row doesn't insert it, with no warning: `upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } })` sends `EXCLUDED."votes"`, and an existing count goes back to 1.

::: tip Opt-in
`undefinedMeansMissing: true` ([`Config`](/runtime-config)) reads an `undefined` value as a missing key, as `JSON.stringify()` does. Without it, pgcast warns as `PGCAST_DEP002`; it becomes the default in 7.0 ([Versions, opt-ins and warnings](/versions)).
:::

## `ReturningOptionsForTable` {#ReturningOptionsForTable}

`{ returning?, extras? }`: the options of `insert()`, `upsert()`, `update()` and `deletes()` that shape each result ([Options](#insert-options)).

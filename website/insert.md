# Writes

The shortcuts that write: `insert()`, `upsert()`, `update()`, `deletes()` and `truncate()`. For each, its parameters, every option with the SQL it adds and its effect on the type, and what it throws.
{.lede}

What every write shares:

- It returns a `SQLFragment`: [`.run(pool)`](/sql-template#run) sends it, `.compile()` gives its `text` and `values` without sending anything.
- A value is sent as a parameter (`$1`), never written into the SQL; a `sql` fragment is SQL.
- Rows come back through `to_jsonb()`, as a table's `JSONSelectable`: a `timestamptz` is a string ([The catalog](/catalog-types)).
- An error from Postgres rejects `.run()` with a `DatabaseError` ([`isDatabaseError()`](/transaction#isDatabaseError)). The errors below are thrown by pgcast as it builds the query, before anything is sent.

## `insert()` {#insert}

```ts
db.insert(table, values, options?)
```

Insert one row or several, and return them as Postgres stored them, defaults and serials filled in.

- `table`: a table of the schema.
- `values`: an `Insertable`, or an array of them, `readonly` or not (`readonly` from 6.11.0). A `sql` fragment is written as SQL (`` db.sql`now()` ``), `db.Default` as `DEFAULT`; an `undefined` cell takes `DEFAULT` ([An `undefined` value](#undefined-values)).
  - With a `readonly` array, the error for a wrong row, or for another wrong argument, reads "The type '…' is 'readonly' and cannot be assigned to the mutable type '…'" on TypeScript 7: the error of the last overload, the mutable array's, which TypeScript 7 prints alone. TypeScript 4.1 and 5.9 list each overload's error, the row's among them.
  - From 6.11.0, the type refuses a string or a `String` as a row, here and in `upsert()` (2769), and a string, a `String` or an array as `update()`'s values (2345), even on a table with a column named like a member of `String`, of a type that member fits (`length` a number), whatever the schema.
  - `raw()`, `cols()` and `vals()` are no values here: they throw while compiling, before any query ([`raw()`](/sql-template#raw) gives the message), and pgcast's type refuses them, where Zapatos 6.6.1's took them. For SQL, write a `sql` fragment; in an array or a `jsonb` object, they are part of the value, sent as JSON.
  - `db.parent()` throws "The 'parent' table alias has no meaning here"<!-- message -->: an `INSERT` has no parent query. The type refuses it.
  - From 6.10.0, a read shortcut, `select()`, `selectOne()`, `selectExactlyOne()`, `count()`, `sum()`, `avg()`, `min()` or `max()`, or a `.copy()` of one, is a subquery: it is written in parentheses, `VALUES ($1, $2, (SELECT count(*) AS result FROM "ratings"))`<!-- probe: db.insert('ratings', { film_id: 1, stars: 5, votes: db.count('ratings', db.all) }) -->, in `upsert()` and `update()` too. It stores what it gives as an [`extras`](/select#extras) value: an aggregate its value, the others their JSON, so `selectOne()` with `columns: ['title']` stores `{"title": "The Salt Orchard"}` in a `text` column. With no row, `select()` stores `[]` and `count()` `0`; `selectOne()`, `selectExactlyOne()`, `sum()`, `avg()`, `min()` and `max()` store `NULL`, and `selectExactlyOne()` does not throw. Zapatos 6.6.1 wrote it bare, which Postgres refused (42601). A write shortcut is refused there with or without parentheses (42601): Postgres runs it only in a `WITH`.
  - A column typed `any`, as a `zapatos/custom` placeholder is, passes the type, not the run time. Zapatos 6.6.1 sent each as one parameter, as JSON: `{ tagline: db.raw("'x'") }` stored `{"value":"'x'"}`, `db.parent('id')` `{"value":"id"}` ([#259](https://github.com/AlexandreDemartin/pgcast/issues/259)).
- `options`: `returning` and `extras` ([Options](#insert-options)).

<CastPanel example="insert">

<<< ./examples/insert.ts{ts twoslash}

</CastPanel>

- One row gives one result; an array gives an array, in the order Postgres returns them, in practice the order given.
- The columns are the keys of every row; a key missing from a row is `DEFAULT` in that row, as `tagline` above.
- A row with no key, or rows with none between them, throw: "nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template"<!-- message -->. Zapatos 6.6.1 sent `() VALUES ()`, which Postgres refused (42601).
- A row that is `null`, given on its own, or a string, a number or another primitive, alone or among other rows, beside a row with no key too, throws while compiling, so `.run()` rejects before any query, in `upsert()` and `update()` too, with a message that names the row's type, that of [`cols()`](/sql-template#cols) for a row on its own or the first of an array, that of [`vals()`](/sql-template#vals) for a later one: a `null` row gives "`` `db.cols()` takes an object or an array, not `null`: for one column, write `db.cols([name])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->", and `[row, 42]` "`` `db.vals()` takes an object or an array, not `number`: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give an object. ``<!-- message -->". A `null` row among others gives `DEFAULT` in each column, as in Zapatos 6.6.1. On a `null` row alone, Zapatos 6.6.1 failed with a `TypeError`, at the call in `upsert()`; it wrote a string row as columns `"0"`, `"1"`…, which Postgres refused unless the table has them (42703), and a primitive with no character (`''`, a number, a boolean…) beside a row of columns as a row of defaults, which ran.
- A `Buffer` row, or a built-in row with no own enumerable key (a `Date`, a `Map`…), among other rows throws while compiling too, in `upsert()` too, with the message of `cols()` for the first row and that of `vals()` for a later one, which name the built-in: `[row, new Date()]` gives "`` `db.vals()` takes an object or an array, not a built-in `Date` with no own enumerable key, which would compile to nothing: for one value, write `db.vals([value])`; for a row of `insert()`, `upsert()` or `update()`, give a plain object. ``<!-- message -->". A `Buffer` throws alone in an array too. Zapatos 6.6.1 wrote the `Date` as a row of defaults, which ran, and a `Buffer`'s bytes as columns `"0"`, `"1"`…, which Postgres refused unless the table has them (42703). A built-in row with own enumerable keys, other than a `Buffer`, is still a row of them, as is a `Proxy` row, unless it wraps a built-in with no own enumerable key, which throws as that built-in does; a row with no key, alone or beside only rows with none, still throws "nothing to insert".
- An empty array is a no-op: `.run(pool)` resolves with `[]` and sends nothing, unless forced with `.run(pool, true)`. Its SQL, `INSERT INTO "films" SELECT null WHERE false`<!-- probe: db.insert('films', []) -->, is marked as a no-op.
- Postgres takes at most 65,535 parameters in a query: split a bigger insert ([Batches](/batches)).

### Options {#insert-options}

`returning` and `extras` are the same for `upsert()`, `update()` and `deletes()` ([`ReturningOptionsForTable`](#ReturningOptionsForTable)).

<CastPanel example="insert_returning">

<<< ./examples/insert_returning.ts{ts twoslash}

</CastPanel>

| Option | SQL it adds | Effect on the type |
|---|---|---|
| none | `RETURNING to_jsonb("films".*) AS result`<!-- probe: examples/insert.ts --> | `films.JSONSelectable` |
| `returning: ['id']` | `jsonb_build_object($5::text, "id")`<!-- probe: examples/insert_returning.ts --> in place of `to_jsonb("films".*)` | `Pick<films.JSONSelectable, 'id'>` |
| `extras: { name: 'title', shouted: … }`, as above | `\|\| jsonb_build_object($6::text, "title", $7::text, upper("title"))`<!-- probe: examples/insert_returning.ts --> | adds `name`, of the column's type, and `shouted`, of the fragment's `RunResult`: `string`, from `db.sql<s.films.SQL, string>` |

- A `readonly` array in `returning` (`['id'] as const`) gives the same SQL and the same type as a mutable one ([`columns`](/select#columns)).
- Both need `strictNullChecks` for their types.
- `null` options are none. `returning: null` or `extras: null`, past the type, throws as the query compiles, so `.run()` rejects before any query, in `upsert()`, `update()` and `deletes()` too: "`` `returning: null` has no meaning: for every column, leave `returning` out; for some, give an array of their names. ``<!-- message -->". An `insert()` or `upsert()` of `[]` is still a no-op, and a row with no key still throws first, at the call. Zapatos 6.6.1 threw a `TypeError` at the call.

## `upsert()` {#upsert}

```ts
db.upsert(table, values, conflictTarget, options?)
```

`INSERT … ON CONFLICT … DO UPDATE`: insert each row, or update the existing row it conflicts with.

- `table`, `values`: as for [`insert()`](#insert); `raw()`, `cols()`, `vals()` and `parent()` throw there too, on a conflicting row or a new one.
- `conflictTarget`: the arbiter of the conflict: a column, an array of columns, or the name of a unique or primary-key constraint wrapped in [`constraint()`](#constraint).
- `options`: `updateColumns`, `noNullUpdateColumns`, `updateValues` and `reportAction` ([Options](#upsert-options)); `returning` and `extras`, as for [`insert()`](#insert-options).

<CastPanel example="upsert">

<<< ./examples/upsert.ts{ts twoslash}

</CastPanel>

- The update sets every column inserted, from `EXCLUDED`, and each key of `updateValues`. The `conflictTarget` columns are set too: a `citext` key, which Postgres matches whatever its case, takes the new value's case. An `updateColumns` without them leaves them as they are.
- Each result has `$action`, `'INSERT'` or `'UPDATE'` ([`UpsertAction`](#UpsertAction)).
- One row gives one result; an array gives an array, without the rows that do nothing ([`doNothing`](#doNothing)).
- An empty array is a no-op, as for `insert()`.
- A row with no key, or rows with none between them, throw, as for `insert()`; by default, an `undefined` value is no key.

### Options {#upsert-options}

Each SQL replaces the `DO UPDATE SET …` of the plain upsert, on `ratings` (on `films` for `noNullUpdateColumns`), or adds to it:

| Option | SQL it adds | Effect on the type |
|---|---|---|
| none | `DO UPDATE SET ("film_id", "stars", "votes") = ROW(EXCLUDED."film_id", EXCLUDED."stars", EXCLUDED."votes")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) --> | `ratings.JSONSelectable & UpsertAction` |
| `updateColumns: 'votes'` | `DO UPDATE SET ("votes") = ROW(EXCLUDED."votes")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: 'votes' }) --> | none |
| `updateColumns: db.doNothing` | `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: db.doNothing }) --> | `\| undefined`, for one row |
| `noNullUpdateColumns: 'tagline'` | `CASE WHEN EXCLUDED."tagline" IS NULL THEN "films"."tagline" ELSE EXCLUDED."tagline" END`<!-- probe: db.upsert('films', { id: 1002, tagline: null }, 'id', { noNullUpdateColumns: 'tagline' }) --> in place of `EXCLUDED."tagline"` | none |
| `updateValues: { votes: 10 }` | `ROW(EXCLUDED."film_id", EXCLUDED."stars", $3)`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateValues: { votes: 10 } }) -->: `$3` in place of `EXCLUDED."votes"` | none |
| ``updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` }`` | `"ratings"."votes" + 1`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateValues: { votes: db.sql`${'ratings'}.${'votes'} + 1` } }) --> in place of `EXCLUDED."votes"` | none |
| `reportAction: 'suppress'` | no `\|\| jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END)`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) --> | no `UpsertAction` |

- `updateColumns` takes a column or an array; `noNullUpdateColumns` a column, an array, or `db.all` for every column. [Batches](/batches#rows-with-different-keys) has a panel of `updateColumns`: a booking keeps its time.
- An `updateColumns` computed at run time may be empty. With no `updateValues` key, the SQL is then `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars'], { updateColumns: ['votes'].filter(() => false) }) -->; by default, a key set to `undefined` is none ([An `undefined` value](#undefined-values)). One row that conflicts then gives `undefined`, though the type of a `ratings.Column[]` says the row. Check for `undefined`, or pass [`doNothing`](#doNothing), which the type follows.
- `updateValues` is one set of values for every row updated. Its defined keys are updated, even when `updateColumns` leaves them out, or is `doNothing` (then the SQL is `DO UPDATE SET`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: 1 } }) -->, not `DO NOTHING`); by default, a key set to `undefined` adds no column ([An `undefined` value](#undefined-values)).
- In `updateValues`, a plain value is a parameter. A value that holds a fragment, `param()`, `raw()`, `cols()`, `vals()`, `parent()`, `Default` or `self`, at any depth of its arrays and plain objects, is compiled as in a `sql` template; a read shortcut is written in parentheses, as in [`insert()`](#insert).
- To read a column there, name the table for the existing row, `${'ratings'}.${'votes'}`, or `EXCLUDED` for the new one, `` db.sql`EXCLUDED.${'votes'}` ``.
- There, a fragment or condition that uses `db.self` (`` db.sql`${db.self} + 1` ``, [`conditions.add()`](/conditions#conditions.add)) throws "The 'self' column alias has no meaning here"<!-- message -->, as in Zapatos 6.6.1; `db.self` or `db.all` alone, or in a `vals([…])`, throws while compiling ([`self`](/sql-template#self), [`all`](/sql-template#all)); `db.parent()`, alone or in a fragment, throws "The 'parent' table alias has no meaning here"<!-- message -->.

::: warning Security
Zapatos 6.6.1 wrote a plain string in `updateValues` as an identifier: `{ tagline: 'happy' }` put `"happy"` in the `ROW(…)`, and a string from a user could read other columns or tables.

pgcast sends it as a parameter, `$3` in its place, as its type and `update()` always said. To read a column there, write a fragment, as in the table ([Security](/security)).
:::

With `noNullUpdateColumns`, a `NULL` leaves the existing value. Film 1002 comes back from a feed with no tagline, and keeps its own:

<CastPanel example="upsert_no_null">

<<< ./examples/upsert_no_null.ts{ts twoslash}

</CastPanel>

- The update still sets every column inserted, `"id"` included; only `"tagline"` keeps the existing value when the new one is `NULL`.
- `film` is the updated row: `$action` is `'UPDATE'`, and `tagline` is still `'Every map leaves something out.'`.

With `reportAction: 'suppress'`, the result has no `$action`:

<CastPanel example="upsert_suppress">

<<< ./examples/upsert_suppress.ts{ts twoslash}

</CastPanel>

With `strictNullChecks` off, the type keeps `$action`, which is then `undefined`.

A partitioned table needs `'suppress'` when a row lands in a partition whose columns sit where the table's do: the same columns in the same order, as `PARTITION OF` gives unless the table already had a dropped column, or as a table made with `CREATE TABLE` and then attached can have. Postgres reads no `xmax` there, and refuses the query (0A000): "cannot retrieve a system column in this context", as with Zapatos 6.6.1. A row that lands in a partition with its columns in another order reports `$action`, as does an upsert into the partition itself.

### Rows with different keys {#upsert-different-keys}

If a missing key would set a stored column from `EXCLUDED`, the call throws before any query: "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

- Give every row the key, name the columns to update with `updateColumns`, or supply a defined value for the missing key in `updateValues`.
- Columns named in the conflict target are exempt. New rows can omit their serial `id` when upserting on `'id'`. A constraint name alone does not identify its columns to pgcast.
- A `null` row among others counts as a row missing every key.

With [`upsertRequiresSameKeys: false`](/runtime-config#Config.upsertRequiresSameKeys), the missing cell takes `DEFAULT` and can overwrite a stored value. For example, `[{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }]` sends `($4, $5, DEFAULT)`<!-- probe: (db.setConfig({ upsertRequiresSameKeys: false }), db.upsert('ratings', [{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }], ['film_id', 'stars'])) -->, so an existing count of 4-star votes goes back to 1.

## `constraint()` {#constraint}

```ts
db.constraint(name)
```

Wrap the name of a unique or primary-key constraint of the table, for the `conflictTarget` of `upsert()`: `ON CONFLICT ON CONSTRAINT "ratings_pkey"`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, db.constraint('ratings_pkey')) -->, in place of `ON CONFLICT ("film_id", "stars")`<!-- probe: db.upsert('ratings', { film_id: 1000, stars: 5, votes: 1 }, ['film_id', 'stars']) -->. The names come from the schema, so one the table doesn't have fails to compile:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
// ---cut---
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_pkey'));
db.upsert('ratings', { film_id: 1002, stars: 4 }, db.constraint('ratings_stars_key'));
```

- The type takes every unique index of the table, and Postgres only a constraint. An index made with `CREATE UNIQUE INDEX`, which is no constraint, type-checks, and Postgres refuses it: 42704, `constraint "…" for table "…" does not exist`.
- For such an index, pass its columns as the `conflictTarget`: `'code'` for a unique index on `code`.
- A `DEFERRABLE` unique constraint type-checks too, and Postgres refuses it as an arbiter, by its name or by its columns: 55000, `ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters`.
- Two more type-check, and Postgres refuses them: on Postgres 18, a `WITHOUT OVERLAPS` key with `DO UPDATE`, which Postgres treats as an exclusion constraint (42809), and a constraint whose index isn't valid yet, such as a partitioned table's, added with `ALTER TABLE ONLY`: Postgres refuses it with `doNothing` too, and by its columns as the `conflictTarget` (42P10).
- Generate with [`uniqueIndexConstraintsOnly`](/generator#generate.uniqueIndexConstraintsOnly) and none of these names compiles: `UniqueIndex` then lists only what Postgres takes here. It becomes the default in 7.0.

The type does not check that a constraint belongs to the upsert's table, and Postgres refuses another table's: 42704. Only inside the call does `constraint()` take the table's names, as above. Held in a variable, `const k = db.constraint('tags_pkey')` takes any table's name, so `db.upsert('ratings', …, k)` compiles. Give the table, `db.constraint<'ratings'>('ratings_pkey')`, and the type checks the name against it:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const k = db.constraint('tags_pkey');
db.upsert('ratings', { film_id: 1002, stars: 4 }, k);  // compiles, then 42704
// @ts-expect-error tags_pkey is not a constraint of ratings
db.constraint<'ratings'>('tags_pkey');
```

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

`{ $action: 'INSERT' | 'UPDATE' }`, added to each result of `upsert()`: `'INSERT'` for a new row, `'UPDATE'` for an updated one, read from the row's `xmax`. `reportAction: 'suppress'` leaves it out of the SQL and of the type; a partitioned table can need it, as Postgres reads no `xmax` in a partition whose columns sit where the table's do ([Options](#upsert-options)).

## `UpsertOptions` {#UpsertOptions}

From 6.9.0. `UpsertOptions<T, C, E, UC, RA>`: the `options` of `upsert()`, the [`ReturningOptionsForTable`](#ReturningOptionsForTable) with `updateValues`, `updateColumns`, `noNullUpdateColumns` and `reportAction` ([Options](#upsert-options)). `UC` is the type of `updateColumns` and `RA` that of `reportAction` (`undefined` for an option not given).

Its `updateValues` takes any string on a table with a column named like a member of `String`, of a type that member fits (`length`, a number), by design: the check that the values of `upsert()`, `insert()` and `update()` have would add a key to `UpsertOptions['updateValues']` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)).

## `UpsertReturnableForTable` {#UpsertReturnableForTable}

`UpsertReturnableForTable<T, C, E, RA>`: one row of what `upsert()` returns, the [`ReturningTypeForTable`](#ReturningTypeForTable) with [`UpsertAction`](#UpsertAction), unless `RA`, the `reportAction`, is `'suppress'`: `db.UpsertReturnableForTable<'ratings', undefined, undefined, undefined>` is `ratings.JSONSelectable & UpsertAction`. It does not add the `undefined` of `updateColumns: []` ([`doNothing`](#doNothing)). It needs `strictNullChecks`: without it, it is the whole `JSONSelectable` with `UpsertAction`, whatever `C`, `E` and `RA`.

## `update()` {#update}

```ts
db.update(table, values, where, options?)
```

Update the rows that match, and return them. The arguments come in the order of the SQL: `SET`, then `WHERE`.

- `table`: a table of the schema.
- `values`: an `Updatable`, with at least one key. A `sql` fragment is written as SQL, where `db.self` is the column, and so is a condition such as [`conditions.add()`](/conditions#conditions.add); written inline, it may need a type argument ([`Constraint`](/sql-template#type-arguments)). `raw()`, `cols()`, `vals()` and `parent()` throw, as for [`insert()`](#insert). An `undefined` assignment is omitted ([An `undefined` value](#undefined-values)).
- `where`: a `Whereable`, or a `sql` fragment ([Conditions](/conditions)).
- `options`: `returning` and `extras`, as for [`insert()`](#insert-options).

<CastPanel example="update">

<<< ./examples/update.ts{ts twoslash}

</CastPanel>

- Always an array: every row updated, `[]` when none matches.
- `SET (…) = ROW(…)`: `ROW()` keeps a single column valid since Postgres 10.
- `values` with no key throws: "nothing to update: an Updatable needs at least one column"<!-- message -->. Zapatos 6.6.1 sent `SET () = ROW()`, which Postgres refused (42601).

::: warning Every row
An empty `Whereable`, `{}`, compiles to `WHERE TRUE`<!-- probe: db.update('films', { title: 'x' }, {}) -->: `update()` updates every row of the table, and `deletes()` deletes them all. An empty list in [`and(...filters)` or `not(or(...ids))`](/conditions#conditions.and) reaches every row too.
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

The interface of `deletes()`'s call signature, `(table, where, options?) => SQLFragment<…[]>`, for a function that wraps it and keeps its types. A wrapper typed with it gets the types of its parameters from it, with no cast, and its calls are checked and typed as those of `deletes()`:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const loggedDeletes: db.DeleteSignatures = (table, where, options) => {
  const query = db.deletes(table, where, options);
  console.log(query.compile().text);
  return query;
};

const removed = loggedDeletes('tags', { film_id: 1003 }, { returning: ['tag'] });
```

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
| none | `TRUNCATE "tags"`<!-- probe: db.truncate('tags') --> | `undefined` |
| `'CONTINUE IDENTITY'` | `CONTINUE IDENTITY`<!-- probe: db.truncate('tags', 'CONTINUE IDENTITY') -->: sequences keep their values, as by default | none |
| `'RESTART IDENTITY'` | `RESTART IDENTITY`<!-- probe: db.truncate('tags', 'RESTART IDENTITY') -->: the tables' sequences restart | none |
| `'RESTRICT'` | `RESTRICT`<!-- probe: db.truncate('tags', 'RESTRICT') -->: Postgres refuses if a table not in the list references one of them, as by default | none |
| `'CASCADE'` | `CASCADE`<!-- probe: db.truncate('tags', 'CASCADE') -->: also empties the tables that reference them | none |

With `'CASCADE'`, Postgres empties every table that references one of them, at any depth: `films` takes `roles`, `screenings`, `ratings` and `tags` with it, and `seat_bookings` through `screenings`, each named in a notice, `truncate cascades to table "roles"`:

<CastPanel example="truncate_cascade">

<<< ./examples/truncate_cascade.ts{ts twoslash}

</CastPanel>

- `.run()` resolves `undefined`, as its type says. Zapatos 6.6.1 resolved `[]`.
- The options go in that order, one of each kind at most, as Postgres takes them, and the type refuses any other. Past the type, in JavaScript or with `as any`, another order throws while compiling, so `.run()` rejects with a plain `Error` before any query: `truncate('tags', 'CASCADE', 'RESTART IDENTITY')` gives "Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not '…'"<!-- message -->. Zapatos 6.6.1 sent `TRUNCATE "tags" CASCADE RESTART IDENTITY`, and Postgres refused it (42601).
- Any other option throws: "Truncate option must be CONTINUE IDENTITY/RESTART IDENTITY/RESTRICT/CASCADE, not '…'"<!-- message -->. Zapatos 6.6.1 wrote it into the SQL as it was.

## An `undefined` value {#undefined-values}

In 7.0 an undefined write value counts as a missing key. Use `null` to store SQL `NULL` in a nullable column.

<div class="stack">

| In | Default in 7.0 | With `undefinedMeansMissing: false` |
|---|---|---|
| `insert()` | `DEFAULT`: `VALUES ($1, $2, $3, DEFAULT, $4)`<!-- probe: db.insert('films', { studio_id: 1000, title: 'x', release_year: 2030, tagline: undefined, runtime_minutes: 90 }) --> | `NULL` |
| `update()` | left out: `SET ("title") = ROW($1)`<!-- probe: db.update('films', { title: 'x', tagline: undefined }, { id: 1000 }) -->; with no key left, it throws "nothing to update…"<!-- message --> | sets the column to `NULL`, and counts as a key |
| `upsert()` | left out: not inserted, nor updated unless `updateColumns` names it (then from `EXCLUDED`, so an existing row takes the column's `DEFAULT`); in several rows, its cell is `DEFAULT` and counts as missing ([Rows with different keys](#upsert-different-keys)); with no column left, it throws "nothing to insert…"<!-- message --> | inserts `NULL`, then sets it from `EXCLUDED` |
| `upsert()` `updateValues` | left out, as a key `updateValues` doesn't have: `SET ("film_id", "stars") = ROW(EXCLUDED."film_id", EXCLUDED."stars")`<!-- probe: db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateValues: { votes: undefined } }) -->, so the existing value stays; with `doNothing`, or an `updateColumns` empty at run time, and no other key, `DO NOTHING`<!-- probe: db.upsert('ratings', { film_id: 1002, stars: 4 }, ['film_id', 'stars'], { updateColumns: db.doNothing, updateValues: { votes: undefined } }) --> | sets it from `EXCLUDED`: the value inserted, or the column's `DEFAULT` |

</div>

An `undefined` in a filter still binds a parameter. A column named in `updateColumns`, or inserted and selected for the implicit update, still takes its value from `EXCLUDED` when its override is undefined.

Set [`undefinedMeansMissing: false`](/runtime-config#Config.undefinedMeansMissing) to keep the 6.x write behaviour through 7.x. This choice is independent of the upsert key check.

## `ReturningOptionsForTable` {#ReturningOptionsForTable}

`{ returning?, extras? }`: the options of `insert()`, `upsert()`, `update()` and `deletes()` that shape each result ([Options](#insert-options)).

## `ReturningTypeForTable` {#ReturningTypeForTable}

`ReturningTypeForTable<T, C, E>`: one row of what `insert()`, `update()` and `deletes()` return, for the table `T`, the `returning` columns `C` and the `extras` `E` (`undefined` for an option not given): the `JSONSelectable`, narrowed to `C`, with the keys of `E`.

`insert()` of one row returns it; `insert()` of an array, `update()` and `deletes()` return an array of it. It types a fake result, in a test, from the schema:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
type NewFilm = db.ReturningTypeForTable<'films', ['id', 'title'], undefined>;

const inserted: NewFilm = { id: 1000, title: 'The Long Take' };
```

- Stable: type tests pin it to what `.run()` gives, here for `db.insert('films', film, { returning: ['id', 'title'] })`.
- `C` may be a `readonly` tuple, as `returning` may ([Options](#insert-options)).
- It needs `strictNullChecks`: without it, it is the whole `JSONSelectable`, whatever `C` and `E`.

# The `sql` template

`sql` is the tagged template every query in pgcast is built from, the shortcuts included. This page lists what it takes, what each interpolation compiles to, and the `SQLFragment` it returns.
{.lede}

## `sql` {#sql}

```ts
db.sql<
  Interpolations = db.SQL,
  RunResult = pg.QueryResult['rows'],
  Constraint = never,
>`…`: SQLFragment<RunResult, Constraint>
```

Returns a [`SQLFragment`](#SQLFragment): the literal parts as you wrote them, each interpolation compiled as below, every value a numbered parameter. Nothing is sent until [`run()`](#run).

<CastPanel example="sql_template">

<<< ./examples/sql_template.ts{ts twoslash}

</CastPanel>

### Type arguments

| Argument | Default | What it sets |
|---|---|---|
| `Interpolations` | [`db.SQL`](#SQL): every table and column of the schema | what may be interpolated; `s.films.SQL` allows only the names of `films`, and `cols()` / `vals()` of any value |
| `RunResult` | `pg.QueryResult['rows']` (`any[]`) | what `run()` resolves to, and the type of the fragment as a `lateral` or `extras` value |
| `Constraint` | `never` | the value type a condition compares with; set by [`conditions`](/conditions#conditions), checked by a Whereable. You rarely give it. |

`RunResult` is not checked against the SQL: it is your word for what comes back. The shortcuts set it for you.

A name outside `Interpolations` does not compile:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT ${'name'} FROM ${'films'}`;
```

### Interpolations

Each value between `${…}` compiles by what it is. The SQL is the built library's `.compile()`.

| Value | Compiles to | Entry |
|---|---|---|
| a string | a quoted name: `'films'` → `"films"`<!-- probe: db.sql`${'films'}` -->, `'public.films'` → `"public"."films"`<!-- probe: db.sql`${'public.films'}` --> | [Identifiers](#identifiers) |
| `param(x, cast?)` | `$1`<!-- probe: db.sql`${db.param('x')}` -->, or `CAST($1 AS "timestamptz")`<!-- probe: db.sql`${db.param('x', 'timestamptz')}` -->; `x` in the values | [`param()`](#param) |
| `raw(s)` | `s`, as it is | [`raw()`](#raw) |
| `cols(o)` / `cols(a)` | the object's keys, sorted, or the array's items, quoted: `"film_id", "tag"`<!-- probe: db.sql`${db.cols({ tag: 'x', film_id: 1 })}` --> | [`cols()`](#cols) |
| `vals(o)` / `vals(a)` | the values, in the order of `cols(o)`, or the array's: `$1, $2`<!-- probe: db.sql`${db.vals({ tag: 'x', film_id: 1 })}` --> | [`vals()`](#vals) |
| any other object | a Whereable of its own enumerable keys, plain or not: `("studio_id" = $1)`<!-- probe: db.sql`${{ studio_id: 1000 }}` -->; `{}` → `TRUE`<!-- probe: db.sql`${{}}` -->; a built-in object, such as a `Date`, throws | [Whereable objects](#whereable) |
| `self` | the current column, in a Whereable's fragment value | [`self`](#self) |
| `parent(c?)` | the column of the parent query: `"studios"."id"`<!-- probe: db.select('studios', db.all, { lateral: { films: db.select('films', { studio_id: db.parent('id') }) } }) --> | [`parent()`](#parent) |
| `Default` | `DEFAULT`<!-- probe: db.sql`${db.Default}` --> | [`Default`](#Default) |
| a `sql` fragment | its own SQL, its parameters numbered on | [Nested fragments](#nested-fragments) |
| an array | each item in turn, nothing between; `[]` → nothing | [Arrays](#arrays) |

Anything else throws while compiling, so `run()` rejects before any query, and the type refuses it (`null` and `undefined` only with `strictNullChecks`): a number or a boolean (`Alien object while interpolating SQL: 42`<!-- message -->), `null`, `undefined`, a symbol such as [`all`](#all).

The global object, which the type lets through, throws too: "Did you use `self` (the global object) where you meant `db.self` (the Zapatos value)?…"<!-- message -->.

## Identifiers {#identifiers}

An interpolated string is a table or column name. It is double-quoted, so its case is kept and a keyword is a name, and split on `.`. It can never close its quotes:

| String | Compiles to | |
|---|---|---|
| `'films'` | `"films"`<!-- probe: db.sql`${'films'}` --> | |
| `'public.films'` | `"public"."films"`<!-- probe: db.sql`${'public.films'}` --> | split on `.` |
| `'a"b'` | `"a""b"`<!-- probe: db.sql`${'a"b'}` --> | a `"` is doubled, as `quote_ident` does |
| `'a""b'` | `"a""b"`<!-- probe: db.sql`${'a""b'}` --> | already escaped by hand: as it is |
| `'"Films"."title"'` | `"Films"."title"`<!-- probe: db.sql`${'"Films"."title"'}` --> | already a well-formed quoted name: as it is |
| `'"films".title."x"'` | `"films".title."x"`<!-- probe: db.sql`${'"films".title."x"'}` --> | well-formed, ending with a quoted part: as it is |
| `'"films".title'` | `"""films"""."title"`<!-- probe: db.sql`${'"films".title'}` --> | not well-formed, as it ends unquoted: each `"` doubled, split on `.` |
| `'"a" \|\| "b"'` | `"""a"" \|\| ""b"""`<!-- probe: db.sql`${'"a" \x7c\x7c "b"'}` --> | not well-formed: one name |

- Well-formed: a quoted identifier, then quoted, `U&` quoted or unquoted ones after each `.`, with or without spaces around it, the last one quoted.
- The cost: a real column named `a""b` compiles to `"a""b"`<!-- probe: db.sql`${'a""b'}` -->, the column `a"b`.
- Zapatos 6.6.1 wrapped the string in `"` without escaping, and wrote as it is any string that started and ended with `"`: a name could splice SQL around it. The generated `Table` and `Column` types already refused such names; the why is in [The security model](/security).

Interpolate names rather than writing them in the literal: they are type-checked, and they follow the schema when you regenerate it.

## `param()` {#param}

```ts
db.param<T>(value: T, cast?: boolean | string): Parameter<T>
```

A numbered parameter: `$1`, `$2`…, numbered across the whole query, and `value` at that place in the values. The value never enters the SQL text.

<CastPanel example="sql_param">

<<< ./examples/sql_param.ts{ts twoslash}

</CastPanel>

The last two rows apply when [`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) or [`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson) is on; both are off by default.

| `cast` | Compiles to | Value sent |
|---|---|---|
| none | `$1`<!-- probe: db.sql`${db.param('x')}` --> | `value`, as `pg` serialises it |
| `'timestamptz'` | `CAST($1 AS "timestamptz")`<!-- probe: db.sql`${db.param('x', 'timestamptz')}` --> | `value` |
| `'pg_catalog"."text'` | `CAST($1 AS "pg_catalog"."text")`<!-- probe: db.sql`${db.param('x', 'pg_catalog"."text')}` --> | `value` |
| `'public.crew_job'`, `'int4[]'` | `CAST($1 AS "public"."crew_job")`<!-- probe: db.sql`${db.param('x', 'public.crew_job')}` -->, `CAST($1 AS "int4"[])`<!-- probe: db.sql`${db.param([1], 'int4[]')}` --> | `value` |
| `true` | `CAST($1 AS "json")`<!-- probe: db.sql`${db.param([1], true)}` --> for an array or a plain object; `$1`<!-- probe: db.sql`${db.param('x', true)}` --> otherwise | `JSON.stringify(value)`; otherwise `value` |
| `false` | `$1`<!-- probe: db.sql`${db.param([1], false)}` --> | `value`, never as JSON |
| none, for an array with `castArrayParamsToJson` on, or a plain object with `castObjectParamsToJson` on | `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2])}`) --> | `JSON.stringify(value)` |
| a string, for an array or a plain object under its option | the cast, as above: `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'jsonb')}`) --> | `JSON.stringify(value)`; under `castArrayParamsToJson`, an array whose cast ends with `[]` or `[n]`, `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'int4[]')}`) -->, sends `value` |

- A string `cast` without a `"` is split on `.`, each part quoted; array bounds at its end, `[]` or `[n]`, follow the quotes: `'public.crew_job[]'` gives `CAST($1 AS "public"."crew_job"[])`<!-- probe: db.sql`${db.param(['writer'], 'public.crew_job[]')}` -->.
- With a `"`, it is written as `"cast"` if that is well-formed (quoted parts joined by `.`), or as it is if it is already quoted that way: a type whose own name holds a `.` is `'"crew.job"'`, as `'crew.job'` is type `job` in schema `crew`.
- Any other string with a `"` is one quoted name, any `"` doubled, so it cannot close its quotes: `'int4") || (SELECT 1) || ("int4'` gives `CAST($1 AS "int4"") || (SELECT 1) || (""int4")`<!-- probe: db.sql`${db.param(1, 'int4") || (SELECT 1) || ("int4')}` -->, a type that does not exist.
- Zapatos 6.6.1 wrote any `cast` as it is between quotes, so `'public.crew_job'` and `'int4[]'` named types that do not exist.
- Each part stays quoted, so a name only the SQL grammar knows is no type here: `'int'`, `'double precision'`, `'varchar(10)'` fail (42704). Give the type's own name (`'int4'`, `'float8'`, `'timestamptz'`), or write the cast in `sql`: `` db.sql`CAST(${db.param(x)} AS varchar(10))` ``.
- Under `castArrayParamsToJson` or `castObjectParamsToJson`, a string cast is the type written, and the value stays the JSON text the option sends (the last row of the table): `param({ a: 1 }, 'jsonb')` reaches `=` and `@>` on a `jsonb` column.
- Under `castArrayParamsToJson`, an array whose cast ends with `[]` or `[n]` goes as an array: `'_int4'` and a domain over an array still send JSON, which Postgres refuses as an array (22P02).
- Zapatos 6.6.1 dropped a string cast under either option for `CAST($1 AS "json")` ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)), so a cast that names another type than its target now applies: `param(arr, 'int4[]')` into a `json` column is refused (42804), into a `text` column stores `{1,2}` for `[1,2]`.
- Without a cast, `castArrayParamsToJson` makes `` db.sql`${db.param(ids)}::int4[]` `` `CAST($1 AS "json")::int4[]`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}::int4[]`) -->, which Postgres rejects (42846): write `db.param(ids, 'int4[]')`, or pass `false`, which keeps the value out of JSON under either option: `$1::int4[]`<!-- probe: db.sql`${db.param([1], false)}::int4[]` -->.
- As a Whereable value or in `vals([…])` (so in [`isIn()`](/conditions#conditions.isIn)), a `Parameter` compiles as it is, with its cast: `{ title: db.param('x', 'text') }` gives `("title" = CAST($1 AS "text"))`<!-- probe: db.sql`${{ title: db.param('x', 'text') }}` -->. Zapatos 6.6.1 wrapped it in a second parameter, sent as JSON (`'{"value":"x","cast":"text"}'`).

### `Parameter` {#Parameter}

```ts
class Parameter<T = any> { value: T; cast?: boolean | string }
```

What `param()` returns. The generated Whereable, Insertable and Updatable types take a `Parameter<T>` of the column's type wherever they take a `T`.

## `raw()` {#raw}

```ts
db.raw(sql: string): DangerousRawString
```

The string, written into the SQL as it is: for syntax a parameter cannot stand for, such as a keyword.

<CastPanel example="sql_raw">

<<< ./examples/sql_raw.ts{ts twoslash}

</CastPanel>

::: warning Security
Whatever reaches `raw()` runs as SQL. Never give it a caller's text; a value is a [`param()`](#param). How to keep hand-written SQL safe: [Write raw SQL safely](/raw-sql).
:::

As a filter value, `raw()` throws while compiling, and so do `cols()` and `vals()`. As a Whereable value, in `isIn()` / `isNotIn()`, and in `vals([…])` within a filter:

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in a Whereable (a filter), nor in `isIn()`: to compare with SQL, use a `sql` fragment value, where `db.self` stands for the column; to compare with a value, give the value itself, or `db.param()`. ``<!-- message -->

As the value of `eq()`, `add()` and the other [conditions](/conditions):

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as the value of `eq()`, `add()` and the other conditions: for SQL, write a `sql` fragment with `db.self` in place of the condition; for a value, give the value itself, or `db.param()`. ``<!-- message -->

In [`vals({…})`](#vals), so as an `insert()`, `upsert()` or `update()` value, and in a `sql` template of your own, in a `lateral` or not:

> `` `db.raw()`, `db.cols()` and `db.vals()` have no meaning as a value in `vals({…})`, so as an `insert()`, `upsert()` or `update()` value: to write SQL, use a `sql` fragment value (in `update()`, `db.self` there stands for the column); to write a value, give the value itself, or `db.param()`. ``<!-- message -->

The type refuses them there and as an `insert()` or `update()` value, on every column it types (a column typed `any`, as a `zapatos/custom` placeholder is, takes anything); it takes them in `vals({…})` of a `sql` template:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'films'} WHERE ${{ title: db.raw("'x'") }}`;
```

- To compare with SQL: a fragment value, `` { title: db.sql`${db.self} = ${db.raw("'x'")}` } ``.
- Zapatos 6.6.1 sent them there as one parameter, as JSON (`'{"value":…}'`): no row on a text or `jsonb` column, every row with `ne()` and `isNotIn()`, an error (22P02) on other types; as a write value, a text or `jsonb` column stored it.
- Outside a filter, `vals([db.raw('x')])` is still a parameter, the wrapper as JSON: `'{"value":"x"}'`, which a text column stores as it is; in `upsert()`'s `updateValues`, `raw()` is SQL ([`upsert()`](/insert#upsert)).

### `DangerousRawString` {#DangerousRawString}

```ts
class DangerousRawString { value: string }
```

What `raw()` returns. A type-only member keeps it from passing as a `Parameter`, and an object of the same shape does not compile in its place (TS2741):

```ts twoslash
// @errors: 2741
import * as db from 'zapatos/db';
// ---cut---
const notRaw: db.DangerousRawString = { value: 'x' };
```

## `cols()` {#cols}

```ts
db.cols<T>(namesOrObject: T): ColumnNames<T>
```

A comma-separated list of quoted names:

- an object: its keys, sorted, `cols({ tag, film_id })` → `"film_id", "tag"`;
- an array: its items in their order, each an [identifier](#identifiers), `cols(['id', 'title'])` → `"id", "title"`.

With `vals()` of the same object, an `INSERT` in which keys and values line up:

<CastPanel example="sql_cols_vals">

<<< ./examples/sql_cols_vals.ts{ts twoslash}

</CastPanel>

With arrays, a `SELECT` of some columns and an `IN` list; `s.films.OnlyCols<…>` is the row type of those columns:

<CastPanel example="sql_cols_vals_arrays">

<<< ./examples/sql_cols_vals_arrays.ts{ts twoslash}

</CastPanel>

As a filter value, and as a value in `vals({…})` (so in a write), `cols()` throws, as [`raw()`](#raw) does.

### `ColumnNames` {#ColumnNames}

```ts
class ColumnNames<T> { value: T }
```

What `cols()` returns. A type-only member keeps it from passing as a `Parameter`.

## `vals()` {#vals}

```ts
db.vals<T>(valuesOrObject: T): ColumnValues<T>
```

A comma-separated list of values. Each value compiles as follows.

| Value | In `vals({…})` | In `vals([…])` |
|---|---|---|
| a plain value | a parameter, `$1` | a parameter, `$1` |
| a `Parameter` | as it is, with its cast | as it is, with its cast |
| a `sql` fragment | its SQL, with its key as the current column (so [`self`](#self) works) | its SQL |
| `Default` | `DEFAULT` | `DEFAULT`; throws in a filter |
| `parent(c?)` | the [parent column](#parent), without `c` the column of its key; throws outside a nested query | the [parent column](#parent) |
| `raw()`, `cols()`, `vals()` | throw | throw in a filter; a parameter outside one |
| `self` | a parameter | throws in a filter; a parameter outside one |

- An object's values come in the order of its sorted keys, as `cols()` lists them.
- "In a filter" is wherever `vals([…])` has a current column: in `isIn()` and `isNotIn()`, and in a fragment value of a Whereable or of `vals({…})`. There:
  - `Default` throws "`` `db.Default` has no meaning in a Whereable (a filter)… ``<!-- message -->";
  - `self` "`` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`… ``<!-- message -->";
  - `raw()`, `cols()` and `vals()` as [`raw()`](#raw) says.
- As a filter value itself, or a value in `vals({…})`, `vals()` throws, as [`raw()`](#raw) does.
- `insert()`, `upsert()` and `update()` compile their values with `vals({…})`, outside a nested query: `parent()`, `raw()`, `cols()` and `vals()` throw there, before any query.
- Zapatos 6.6.1 wrapped a `Parameter`, `Default` and `parent()` in a second parameter in an array: `'{"value":…}'`, `'Symbol(DEFAULT)'`, `'{"value":"id"}'`; and `parent()`, `raw()`, `cols()` and `vals()` in an object, which the writes stored on a text or `jsonb` column.

### `ColumnValues` {#ColumnValues}

```ts
class ColumnValues<T> { value: T }
```

What `vals()` returns. A type-only member keeps it from passing as a `Parameter`.

## Whereable objects {#whereable}

An object is a Whereable of the table: each own enumerable key a column, each value what it must match. The keys are sorted, each pair compiled as below, joined by `AND`, the whole in parentheses; there is no `WHERE`, which you write. An empty object is `TRUE`.

<CastPanel example="sql_whereable">

<<< ./examples/sql_whereable.ts{ts twoslash}

</CastPanel>

| Value | Compiles to |
|---|---|
| a plain value, `null` and arrays included | `("title" = $1)`<!-- probe: db.sql`${{ title: 'x' }}` --> |
| a `Parameter` | `("title" = CAST($1 AS "text"))`<!-- probe: db.sql`${{ title: db.param('x', 'text') }}` -->, as it is |
| a `sql` fragment | `(…)`, compiled with the key as the current column: [`self`](#self) is the column |
| a [condition](/conditions) | the same: a condition is a fragment, `like('The%')` |
| `parent(c?)` | `("studio_id" = "studios"."id")`<!-- probe: db.select('studios', db.all, { lateral: { films: db.select('films', { studio_id: db.parent('id') }) } }) -->, in a `lateral` subquery |
| `Default`, `self` | throws |
| `raw()`, `cols()`, `vals()` | throws ([`raw()`](#raw)) |

- `null` is a parameter too, and `= NULL` matches no row: use [`conditions.isNull`](/conditions#conditions.isNull).
- `Default` throws "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->"; Zapatos 6.6.1 sent it as `'Symbol(DEFAULT)'`.
- The shortcuts take the same object as their `where` ([`select()`](/select#select)).

::: warning Security
An interpolated object that is not one of the other [interpolations](#interpolations) compiles as a Whereable, plain or not: a class instance `{ title }` gives `("title" = $1)`<!-- probe: db.sql`${new (class { title = 'x' })()}` -->, and one with no own enumerable key gives `TRUE`, even of a class that extends a built-in (`class Premiere extends Date {}`). Check what reaches a `where` at run time.
:::

A built-in object throws while compiling, before any query, even with own keys added (`Object.assign(new Date(0), { id: 1 })`): `Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `RegExp`, `Promise`, `Error` and its native subtypes (`TypeError`, …), `ArrayBuffer`, a typed array, `Buffer`, `DataView`, and the boxes `Number`, `String` and `Boolean`:

> `` A built-in `…` has no meaning as a Whereable (a filter): it would compile to its own enumerable keys, and to `TRUE`, every row, when it has none. To compare with a value, give it as `db.param(…)`; to filter, give a plain object (`{ column: value }`); await a `Promise` first. ``<!-- message -->

Zapatos 6.6.1 compiled it as a Whereable of its own keys: `TRUE` for most, so `` db.sql`DELETE FROM ${'films'} WHERE ${new Date()}` `` was `DELETE FROM "films" WHERE TRUE` and deleted every row; `("0" = $1 …)` for a typed array.

The type refuses most of them (TS2345), not where a column shares one of their members: `db.deletes('actors', new Error('x'))` type-checks, since `actors` has a `name` column.

Only the built-ins of the realm that runs pgcast throw, matched by their exact prototype. As in Zapatos 6.6.1:

- a `Date` from another realm, such as `vm.runInNewContext('new Date(0)')` (Jest runs each test file in a `vm` context), gives `TRUE`;
- an instance of a class that extends a built-in keeps its own keys: `new Frames(1)`, with `class Frames extends Uint8Array {}`, gives `("0" = $1)`.

## `self` {#self}

```ts
db.self
```

The current column, in a Whereable's fragment value: `` { runtime_minutes: db.sql`${db.self} > ${db.param(100)}` } `` gives `(("runtime_minutes" > $1))`<!-- probe: db.sql`${{ runtime_minutes: db.sql`${db.self} > ${db.param(100)}` }}` -->. In a fragment value of `vals({…})`, the current column is its key: `` vals({ tag: db.sql`upper(${db.self})` }) `` gives `upper("tag")`<!-- probe: db.sql`${db.vals({ tag: db.sql`upper(${db.self})` })}` -->.

- Where there is no current column, it throws: "The 'self' column alias has no meaning here"<!-- message -->.
- As a filter value it throws: it is the column, not a value to compare with it. Zapatos 6.6.1 sent it as the string `'Symbol(self)'`.
  - As a Whereable value, in `isIn()` / `isNotIn()` and in `vals([…])` within a filter: "`` `db.self` has no meaning as a value in a Whereable (a filter), nor in `isIn()`: compare with a value, or use it in a `sql` fragment value, where it stands for the column. ``<!-- message -->"
  - As the value of `eq()`, `add()` and the other conditions: "`` `db.self` has no meaning as the value of `eq()`, `add()` and the other conditions: it is already the column on the left. To compare the column with itself, write a `sql` fragment with `db.self` on both sides. ``<!-- message -->"

### `SelfType` {#SelfType}

```ts
type SelfType = typeof self
```

## `parent()` {#parent}

```ts
db.parent<T extends Column | undefined = Column | undefined>(x?: T): ParentColumn<T>
```

A column of the parent query's table, in a subquery given to `lateral` ([Join through a lateral](/lateral)): `"<parent table or alias>"."<column>"`.

<CastPanel example="sql_parent">

<<< ./examples/sql_parent.ts{ts twoslash}

</CastPanel>

- Without a column, the column of the filter it sits in: `{ film_id: db.parent() }`, in a `lateral` of `roles`, gives `("film_id" = "roles"."film_id")`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.parent() }) } }) -->. With no filter, it throws "Alien object while interpolating SQL: undefined"<!-- message -->.
- It works as a Whereable value, in a `sql` fragment, in `eq()` and in `vals([…])`, so in `isIn()`: `{ film_id: isIn([db.parent()]) }` gives `(("film_id" IN ("roles"."film_id")))`<!-- probe: db.select('roles', db.all, { lateral: { film: db.selectOne('films', { film_id: db.conditions.isIn([db.parent()]) }) } }) -->. In `vals([…])`, Zapatos 6.6.1 sent it as JSON: `isIn([parent('id')])` compared with `'{"value":"id"}'`.
- In `vals({…})` too, where without a column it takes the column of its key: `` db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` ``, in a `lateral` of `studios`, gives `SELECT "studios"."name" AS result`<!-- probe: db.select('studios', db.all, { lateral: { n: db.sql`SELECT ${db.vals({ name: db.parent() })} AS result` } }) -->. Zapatos 6.6.1 sent it there as JSON too.
- Outside a nested query, it throws "The 'parent' table alias has no meaning here"<!-- message -->, so `run()` rejects before any query. So does every `insert()`, `upsert()` or `update()` value, where Zapatos 6.6.1 stored `{"value":"id"}` on a text column.

### `ParentColumn` {#ParentColumn}

```ts
class ParentColumn<T extends Column | undefined = Column | undefined> { value?: T }
```

What `parent()` returns. A type-only member keeps `cols()` and `vals()` from passing as a `ParentColumn`.

## `Default` {#Default}

```ts
db.Default
```

The keyword `DEFAULT`: a column's default, in an `INSERT` or `UPDATE` value, alone or in `vals()`.

<CastPanel example="sql_default">

<<< ./examples/sql_default.ts{ts twoslash}

</CastPanel>

- In a filter it throws while compiling.
  - As a Whereable value ([above](#whereable)), in `isIn()` / `isNotIn()`, and in `vals([…])` with a current column ([`vals()`](#vals)): "`` `db.Default` has no meaning in a Whereable (a filter): leave the key out, or compare with a value. `DEFAULT` is for INSERT and UPDATE values. ``<!-- message -->"
  - As the value of `eq()`, `add()` and the other conditions: "`` `db.Default` has no meaning as the value of `eq()`, `add()` and the other conditions: compare with a value. To set a column to its default in an UPDATE, give `db.Default` as the value itself: `{ n: db.Default }`. ``<!-- message -->"
- For `add()` and `subtract()`, set the column itself: `{ booked_at: db.Default }`.
- Zapatos 6.6.1 sent it as the string `'Symbol(DEFAULT)'` in all of these, and in `vals([…])`, where it is now `DEFAULT`.

### `DefaultType` {#DefaultType}

```ts
type DefaultType = typeof Default
```

## Nested fragments {#nested-fragments}

A `sql` fragment interpolated in another compiles in place. Its parameters are numbered on from the outer ones, and it inherits the outer parent table and current column. A fragment that compiles to nothing, or an empty array, lets a query grow by condition:

<CastPanel example="sql_nested">

<<< ./examples/sql_nested.ts{ts twoslash}

</CastPanel>

A nested fragment's `RunResult` and `runResultTransform` are not used: only the outer fragment's `run()` counts.

## Arrays {#arrays}

An array's items compile one after the other, each as if interpolated alone, with nothing between them: ``[db.sql`a`, ' ', 'b']`` gives `a" ""b"`<!-- probe: db.sql`${[db.sql`a`, ' ', 'b']}` -->, the string `' '` being a name. An empty array compiles to nothing. To put something between the items, [`mapWithSeparator()`](#mapWithSeparator).

## `mapWithSeparator()` {#mapWithSeparator}

```ts
db.mapWithSeparator<TIn, TSep, TOut>(
  arr: readonly TIn[],
  separator: TSep,
  cb: (x: TIn, i: number, a: readonly TIn[]) => TOut,
): (TOut | TSep)[]
```

Maps `arr` with `cb`, `separator` between each two results; `[]` for no items. A plain array, so it compiles as [one](#arrays):

<CastPanel example="sql_map_with_separator">

<<< ./examples/sql_map_with_separator.ts{ts twoslash}

</CastPanel>

## `all` {#all}

```ts
db.all
```

The `where` of `select()`, `count()` and the other selects that matches every row: `db.select('films', db.all)` writes no `WHERE` ([`select()`](/select#select)). It is not an interpolation: in `sql`, the type refuses it, and it throws.

### `AllType` {#AllType}

```ts
type AllType = typeof all
```

## `SQLFragment` {#SQLFragment}

```ts
class SQLFragment<RunResult = pg.QueryResult['rows'], Constraint = never>
```

What `sql` and every shortcut return: a query, or part of one, not yet compiled. You never construct one with `new`.

| Member | What it is |
|---|---|
| [`run(queryable, force?)`](#run) | compiles, runs, and resolves to `RunResult` |
| [`compile()`](#compile) | `{ text, values }`, the query `run()` sends |
| [`runResultTransform`](#runResultTransform) | turns `pg`'s result into `RunResult` |
| [`prepared(name?)`](#prepared) | makes it a prepared statement |
| `copy(override?)` | a shallow copy, some properties replaced |
| `noop`, `noopResult` | set by `insert()` and `upsert()` given `[]`: `run()` sends nothing and resolves to `noopResult` |
| `parentTable` | set on a `lateral` subquery by its parent, for [`parent()`](#parent) |
| `preparedName` | set by `prepared()` |
| `compileExpression()` | used by `compile()`, internal |

### `run()` {#run}

```ts
fragment.run(queryable: Queryable, force = false): Promise<RunResult>
```

1. Compiles the fragment ([`compile()`](#compile)); an error there rejects, before any query.
2. Calls [`queryListener`](/runtime-config#Config.queryListener) with the query and the transaction's id, if set.
3. Sends the query to `queryable`, and passes `pg`'s result through [`runResultTransform`](#runResultTransform). A `noop` fragment sends nothing and gives `noopResult`, unless `force` is `true`.
4. Calls [`resultListener`](/runtime-config#Config.resultListener) with the result, the transaction's id, the time taken and the query, if set.

A `noop` fragment still compiles, its SQL behind a comment. `force` sends it, and it inserts nothing: `.run()` gives `[]`.

<CastPanel example="sql_run_force">

<<< ./examples/sql_run_force.ts{ts twoslash}

</CastPanel>

### `compile()` {#compile}

```ts
fragment.compile(): SQLQuery
```

The query as `pg` takes it ([`SQLQuery`](/runtime-config#SQLQuery)): `text`, its parameters numbered from `$1`, and `values`, in their order; `name` too, once [prepared](#prepared). It sends nothing, and throws where an interpolation has no meaning. Its arguments are for its own recursion: call it with none.

The text is not a stable API: a minor version may change it, as long as the result does not ([Test code that uses pgcast](/testing#the-sql-text-is-not-a-stable-api)).

<CastPanel example="sql_compile">

<<< ./examples/sql_compile.ts{ts twoslash}

</CastPanel>

### `runResultTransform` {#runResultTransform}

```ts
fragment.runResultTransform: (qr: pg.QueryResult) => any  // default: qr => qr.rows
```

Applied by `run()` to what `pg` returns. The shortcuts set their own (`selectOne()` takes the first row's `result`). Assign one to return something else; `RunResult` must then be the type it returns:

<CastPanel example="sql_run_result_transform">

<<< ./examples/sql_run_result_transform.ts{ts twoslash}

</CastPanel>

It applies only to `run()` on that fragment: not when it is nested in another, nor given to `lateral` or `extras`.

### `prepared()` {#prepared}

```ts
fragment.prepared(name = `_zapatos_prepared_${n}`): this
```

Sets the `name` that `compile()` adds to the query, so that Postgres prepares the statement once per connection and runs it by name after ([node-postgres](https://node-postgres.com/features/queries#prepared-statements)). Without a name, `_zapatos_prepared_0`, `_1`… in the order of the calls.

The values are parameters, not part of the text, so one name serves every call of a query function whose text does not change; without a name, each call prepares another statement:

<<< ./examples/plain/sql_prepared.ts{ts twoslash}

A name stands for one text: on a connection that has prepared `'p'`, a fragment of another text named `'p'` makes `pg` reject with "Prepared statements must be unique - 'p' was used for a different statement".

## `RunResultForSQLFragment` {#RunResultForSQLFragment}

```ts
type RunResultForSQLFragment<F extends SQLFragment<any, any>>
```

The `RunResult` of `F`, with `undefined` read as `null`: a fragment nested as a `lateral` or `extras` value comes back as JSON, where a missing row is `null`. So `selectOne()`'s `crew.JSONSelectable | undefined` becomes `crew.JSONSelectable | null` there:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const mentor = db.selectOne('crew', { id: db.parent('mentor_id') }, { alias: 'mentor' });

type Mentor = db.RunResultForSQLFragment<typeof mentor>;
const nameOf = (row: Mentor) => row?.name ?? 'no mentor';

const crew = await db.select('crew', db.all, { lateral: { mentor } }).run(pool);
const mentors = crew.map(member => nameOf(member.mentor));
```

## `Queryable` {#Queryable}

```ts
type Queryable = pg.ClientBase | pg.Pool
```

What `run()` takes: a pool, a client, or the client a [`transaction()`](/transaction#transaction) gives its callback. Typed so, a query function runs on any of them:

<<< ./examples/plain/sql_queryable.ts{ts twoslash}

`Queryable` takes a transaction's client whatever its level: a function that needs `SERIALIZABLE` takes `pg.Pool | TxnClientForSerializable` instead ([`TxnClientForSerializable`](/transaction#TxnClientForSerializable), [Book inside a larger transaction](/retries#book-inside-a-larger-transaction)).

## `SQL` {#SQL}

```ts
type SQL = SQLExpression | SQLExpression[]
```

The default `Interpolations` of `sql`: an expression, or an array of them. Each table of the generated schema has its own, `s.films.SQL`, which takes the names and Whereables of that table only; `cols()` and `vals()` of any value, as in Zapatos 6.6.1.

So `` db.sql<s.films.SQL>`INSERT INTO ${'films'} (${db.cols({ seat: 1 })}) VALUES (${db.vals({ seat: 1 })})` `` type-checks, and fails only in Postgres (42703: `films` has no `seat`).

### `SQLExpression` {#SQLExpression}

```ts
type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable | any[]>
  | Whereable | Column | ParentColumn | GenericSQLExpression
```

One interpolation: a table or column name of any table, a Whereable, `parent()`, `cols()` / `vals()` of an Updatable, or a [`GenericSQLExpression`](#GenericSQLExpression), which takes `cols()` / `vals()` of any value.

### `GenericSQLExpression` {#GenericSQLExpression}

```ts
type GenericSQLExpression = SQLFragment<any, any> | Parameter | DefaultType | DangerousRawString
  | SelfType | ColumnNames<any> | ColumnValues<any>
```

The interpolations whose type is the same for every table: they fit in any table's `SQL`. `ColumnNames<any>` and `ColumnValues<any>` are among them, so the keys of `cols()` and `vals()` are not checked against the table.

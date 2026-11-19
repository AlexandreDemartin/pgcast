---
description: "Move from Zapatos 6.6.1 to pgcast 6.x, then migrate to 7.0 and check the new defaults, types and install requirements."
---

# Switch from Zapatos or upgrade pgcast

Already on pgcast 6.x? Start with the [7.0 migration](#from-7-0). From Zapatos 6.6.1, follow steps 1–6 on pgcast 6.x first. That release line emits the warnings that help you prepare for 7.0. For a new project, start at [Install](/install).
{.lede}

<AtAGlance>

- One line of `package.json` swaps the package; imports, config and generated files stay as they are.
- A few calls give other rows, or throw: [step 4](#find-the-calls-whose-result-changes) lists them, with what to do.
- A clean warning trace in 6.x still leaves the [7.0 type and install checks](#from-7-0).

</AtAGlance>

## What stays the same

- The module names: `zapatos/db`, `zapatos/schema`, `zapatos/custom` and `zapatos/generate`. No import changes ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
- The generator: `zapatosconfig.json` and its options, and `npx zapatos`, now also `npx pgcast` ([The CLI](/generator#cli)).
- Your placeholders in `zapatos/custom/`: written once, never overwritten.
- A `Config` written for Zapatos 6.6.1: the keys pgcast adds are optional ([`Config`](/runtime-config#Config)).
- The schema's version canary, so a schema that Zapatos 6.6.1 generated compiles as it is ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)).

## 1. Swap the package {#swap-the-package}

For the Zapatos 6.6.1 → pgcast 6.x route, install the 6.x alias so existing imports still resolve.

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast@^6
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast@^6
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6
```

:::

- `package.json` now reads `"zapatos": "npm:@pgcast/pgcast@^…"`, and `node_modules/zapatos` holds pgcast.
- Keep `pg` in your dependencies. From 7.0, if you check types, also declare `typescript` and `@types/pg` in your `devDependencies`. [Install](/install#requirements).
- Not as plain `@pgcast/pgcast`: your `zapatos/*` imports would no longer resolve ([Install](/install#add-the-package), § Why the alias).

## 2. Regenerate the schema {#regenerate-the-schema}

```sh
npx zapatos
```

In pgcast 6.x, `git diff` on your regenerated `zapatos/` folder can show differences from Zapatos 6.6.1, for example when

- a column comment runs over several lines: each line now starts with ` * `;
- a table has a plain index named like another schema's unique index: its `UniqueIndex` no longer borrows that name;
- a table has an `Insertable`: each of its columns takes `db.SQLFragment<any>`, a `sql` fragment whose result is typed, where 6.6.1 wrote `db.SQLFragment`.

## 3. Compile {#compile}

```sh
npx tsc
```

pgcast's types refuse a few calls that Zapatos 6.6.1's took. The one you may meet: `db.raw()`, `db.cols()` or `db.vals()` as the value of a filter or a condition.

Zapatos 6.6.1 took it as a `Parameter`, and sent it as JSON, `{"value":"initcap('the salt orchard')"}`, so it matched no film. pgcast refuses it (2322, with `strict` on or off):

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const films = await db.select('films', {
  title: db.raw("initcap('the salt orchard')"),
}).run(pool);
```

To compare with SQL, give a `sql` fragment as the value, `db.self` for the column and the value as a [`db.param()`](/sql-template#param):

<CastPanel example="switching_raw">

<<< ./examples/switching_raw.ts{ts twoslash}

</CastPanel>

- To compare with a plain value, give the value itself, or `db.param(x)`.
- In a fragment, a plain string is a name, not a value: `${'the salt orchard'}` would be the column `"the salt orchard"`<!-- probe: db.sql`${'the salt orchard'}` --> ([Identifiers](/sql-template#identifiers)).
- [`DangerousRawString`](/sql-template#DangerousRawString), [`ColumnNames`](/sql-template#ColumnNames) and [`ColumnValues`](/sql-template#ColumnValues) no longer match a plain `{ value }`, nor each other: `const r: db.DangerousRawString = { value: 'x' }` fails (2741). Make them with `db.raw()`, `db.cols()` and `db.vals()`.
- As an inserted or updated value of `insert()`, `update()` or `upsert()` (not in `updateValues`), the type refuses them too, and they throw before any query ([`insert()`](/insert#insert)).
- In [`upsert()`](/insert#upsert-options) `updateValues`, `db.cols()` or `db.vals()` of a string or another primitive, `{ title: db.cols('title') }`: the type refuses it (2769). It throws while compiling, and under Zapatos 6.6.1 Postgres refused it (42703, 42601), except `vals()` of one character. Give the value itself, sent as a parameter, or a `sql` fragment.
- In `updateValues` too, `db.cols()` or `db.vals()` of a `Date` or a `Buffer`, `{ booked_at: db.vals(new Date()) }`, and with [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects) of a [`PostgresInterval`](/runtime-config#PostgresInterval): the type refuses it (2769). A `Date` with no own enumerable key and a `Buffer` also throw while compiling, here and in every [`cols()`](/sql-template#cols) or [`vals()`](/sql-template#vals); a `Date` given own fields and an interval compile as before. Under Zapatos 6.6.1 Postgres refused it (42601, 42703), except `vals()` of a one-byte `Buffer`, which stored the number of its byte, `97` for `Buffer.from('a')`; of a `Date` with one own field, which stored that field; and of an interval as `pg` parses it, with one part, which stored its number as seconds, `{ hours: 2 }` as 2 seconds. Give the value itself, sent as a parameter.
- A selected range may now be `'empty'`, as Postgres writes an empty range ([`RangeString`](/runtime-config#RangeString)), so it no longer assigns to a type that starts with a bracket, `` `[${string}` | `(${string}` `` (2322). Check for it first, `if (range !== 'empty')`; in a type, write `Exclude<db.DateRangeString, 'empty'>`.
- From 6.11.0, once the schema is regenerated, a table with a column named like a member of `String`, of a type that member fits (`search` typed `any`, as a `tsvector` is, or a `length` number), no longer takes any string as a name in its `SQL` type (2345): `` db.sql<s.films.SQL>`${'titel'}` ``. Zapatos 6.6.1 took the string as a name, `"titel"`, which Postgres refuses when no column has it (42703). For a name known only at run time, check it, then type it as the table's `Column`.
- From 6.11.0, on such a table, a shortcut's `where`, `select()`'s `having`, `exists()` and `isInSelect()`, and the rows of `insert()`, `upsert()` and `update()`, no longer take a string, a `String` or an array, whatever the schema (2345, 2769): `db.select('films', 'titel')`. Zapatos 6.6.1 ran the string as a column, `WHERE "titel"` (42703 when no column has that name; when it named a boolean column, the query filtered by that column), and sent a string row as its characters, `("0", "1", …)` (42703). Write a Whereable, `{ subtitled: true }`, or a fragment, `` db.sql<s.screenings.SQL>`${'subtitled'}` `` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). On a table whose columns are all optional, one named `length`, `[]`, an array of rows held in a variable, a `readonly` one and an array `as const`, held in a variable or written in the call, given to `insert()` or `upsert()`, are now typed as an array, as they run, not as one row ([#683](https://github.com/AlexandreDemartin/pgcast/issues/683)).


## 4. Find the calls whose result changes {#find-the-calls-whose-result-changes}

pgcast fixes, with no option to turn on, what no code could rely on in Zapatos 6.6.1: a call that Postgres or the type refused, that did the opposite of its name, or that let a string splice SQL. A few such calls did run, and now give other rows, or throw.

Look through your code for the first column of each table below. Each change in What to do gives the same result under Zapatos 6.6.1, so you can make it before you switch; only the `jsonb` one finds its rows under pgcast alone.

### Conditions

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| [`not()`](/conditions#conditions.not) of a fragment with a bare `OR` or `AND`: on `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, so the 1991 film too | `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | for the old rows, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/conditions#conditions.and) of a fragment with a bare `OR` and another operand: `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, so film 1000 too | `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | for the old rows, one fragment: `` db.sql`${'id'} = 1000 OR (${'id'} = 1001 AND ${'studio_id'} = ${db.param(1001)})` `` |
| [`and()`](/conditions#conditions.and) of fragments that split one expression: `` and(db.sql`${'release_year'} BETWEEN 1970`, db.sql`2000`) `` | `(a BETWEEN 1970 AND 2000)`, films 1000 and 1001 | `((a BETWEEN 1970) AND (2000))`<!-- probe: db.conditions.and(db.sql`a BETWEEN 1970`, db.sql`2000`) -->, which Postgres refuses (42601) | one condition: `{ release_year: db.conditions.between(1970, 2000) }` |
| `groupBy` given an `and()` or `or()` with no argument: `count('films', db.all, { groupBy: db.conditions.and() })` | `GROUP BY ()`, the empty grouping set: 4 | `GROUP BY TRUE`<!-- probe: db.count('films', db.all, { groupBy: db.conditions.and() }) -->, which Postgres refuses (42601), `GROUP BY FALSE` for `or()` | leave `groupBy` out: 4 |
| [`db.all`](/sql-template#all) as a condition's value, `{ title: db.all }`, `isIn([db.all])` / `isNotIn([db.all])` or `arrayContains([db.all])`: `deletes('films', { title: db.conditions.ne(db.all) })`; `db.Default`, `db.self`, `raw()`, `cols()`, `vals()`, `param()`, a fragment or `parent()` as an item of [`arrayContains()`](/conditions#conditions.arrayContains), `arrayContainedIn()` or `arrayOverlaps()`: `update('films', { title: 'Gone' }, { genres: db.conditions.not(db.conditions.arrayOverlaps([db.Default])) })` | `'Symbol(all)'`, so every film with a title deleted; the item as its text or JSON in the array, `'{"Symbol(DEFAULT)"}'`, so every film renamed | refused by `tsc` on these columns, accepted on a column typed `any`; throws while compiling | for the same rows, `{ title: db.conditions.isNotNull }`, `{ genres: db.conditions.isNotNull }`; else a value to compare with |

</div>

### `param()` and `parent()`

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| [`db.param()`](/sql-template#param) as a filter value, in [`isIn()`](/conditions#conditions.isIn) and [`isNotIn()`](/conditions#conditions.isNotIn), in a plain object of `upsert()` `updateValues`, or in a [`vals([…])`](/sql-template#vals), hand-written or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON, `{"value":…}`: no row, every row with `isNotIn()`, other booleans in `updateValues`, `'{"value":…}'` stored, or 22P02 | the value, with its cast | nothing |
| `{ data: db.param(x, true) }` on a `jsonb` column | no row | 42883, `jsonb = json` | `{ data: db.param(JSON.stringify(x), 'jsonb') }` |
| [`db.parent()`](/sql-template#parent) in `isIn()`, `isNotIn()` or a `vals([…])`: in a `lateral` subquery, or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON: no row, every row with `isNotIn()`, `'{"value":…}'` stored, or 22P02 | the parent's column; outside a nested query, a write included, it throws | nothing in a `lateral`; in a write, the value itself |

</div>

### `Default`, `self`, `raw()`, `cols()` and `vals()`

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| [`db.Default`](/sql-template#Default) or [`db.self`](/sql-template#self) as a filter value, a condition's (`ne()`, `add()`), or in a `vals([…])` of a filter or a fragment value: `` insert('films', { …, tagline: db.sql`${db.vals([db.Default])}` }) `` | `'Symbol(DEFAULT)'` or `'Symbol(self)'`, sent or stored | throws while compiling | `db.Default` as the value itself, `{ …, tagline: db.Default }`, in `insert()` or `update()`; in a filter, a value to compare with |
| `db.Default` in a `vals([…])` of a query you write: `` db.sql`INSERT INTO films (…) VALUES (${db.vals([…, db.Default])})` `` | `'Symbol(DEFAULT)'` | `DEFAULT`<!-- probe: db.sql`${db.vals([db.Default])}` --> | nothing |
| [`db.all`](/sql-template#all) or [`db.self`](/sql-template#self) as a value of `insert()`, `update()` or `upsert()`, `updateValues` included, past the type, or in a `vals({…})` of a query you write: `insert('films', { …, tagline: db.all })` on a column typed `any`, `` db.sql`… WHERE tagline IN (${db.vals({ tagline: db.all })})` `` | `'Symbol(all)'` or `'Symbol(self)'` stored; in `IN (…)`, compared with that string, so no row but one that holds it; in `updateValues`, a `TypeError` or "The 'self' column alias has no meaning here" | from 6.11.0, throws while compiling | the value itself |
| `db.all`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()` in a `vals([…])` of a query you write or of `upsert()` `updateValues`: `` updateValues: { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | `'Symbol(all)'`, `'Symbol(self)'` or `'{"value":"'Cy'"}'`, sent or stored | from 6.11.0, throws while compiling | the value itself; for SQL, outside `vals([…])`: in `updateValues`, `{ tagline: db.raw("'Cy'") }` |
| `db.raw()`, `db.cols()` or `db.vals()` as a filter value, a condition's, or in a `vals([…])` of a fragment value: `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | sent as JSON, `{"value":"'Cy'"}` stored | refused by `tsc` as a filter value, and throws while compiling | in a filter, a `sql` fragment value ([Compile](#compile)); in a written value, `raw()` in the fragment itself: `` db.sql`${db.raw("'Cy'")}` `` |
| `db.parent()`, `db.raw()`, `db.cols()` or `db.vals()` as a value of `insert()`, `update()` or `upsert()` where the type took it: on a column typed `any`, as a `zapatos/custom` placeholder left as generated is (`{ c: db.parent('id') }`), or in a `vals({…})` of a query you write, `` db.sql`INSERT INTO films (…) VALUES (${db.vals({ …, tagline: db.raw("upper('x')") })})` `` | sent as JSON, `'{"value":…}'` stored | throws before any query | in a write, the value itself, or for SQL a `sql` fragment value, `` db.sql`upper(${db.param('x')})` `` |
| [`db.cols()`](/sql-template#cols) or [`db.vals()`](/sql-template#vals) of a built-in with no own enumerable key, or of a `Buffer`, in a query you write: `` db.sql`SELECT ${db.cols(new Date())} FROM films` ``, `` db.sql`UPDATE films SET title = ${db.vals(Buffer.from('a'))}` `` | `SELECT  FROM films`, rows with no column; `'97'` stored; in an `IN` list, the bytes as numbers | throws while compiling | the column names in an array, `db.cols(['title'])`; the value in one, `db.vals([value])`, or `db.param(value)` |
| `db.parent()` with no column in a `vals({…})` of a `lateral` subquery: `` db.sql`SELECT ${db.vals({ name: db.parent() })}` `` | `'{}'` | the parent's column of its key ([`parent()`](/sql-template#parent)) | nothing |

</div>

### `updateValues` and writes with no column

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| A plain value in [`upsert()`](/insert#upsert-options) `updateValues`: a string, `{ tagline: 'films.title' }`, or an object | a column name, `ROW("films"."title")`, or for an object a condition of its keys (`TRUE` with none) | a parameter, the value itself | for the old result, a fragment: `` db.sql`${'films'}.${'title'}` `` |
| [`update()`](/insert#update) with no column: `update('films', {}, …)` | 42601 from Postgres | throws when called: "nothing to update: an Updatable needs at least one column"<!-- message --> | nothing, unless you catch a `DatabaseError` there |
| [`insert()`](/insert#insert) or [`upsert()`](/insert#upsert) of a row with no column, `{}`, on a table whose every column has a default or takes `NULL`, or past the type | 42601 from Postgres | throws when called: "nothing to insert: an Insertable needs at least one column; …"<!-- message --> | nothing, unless you catch a `DatabaseError` there; for a row of defaults, `DEFAULT VALUES` in a `sql` template |
| [`insert()`](/insert#insert) or [`upsert()`](/insert#upsert) of a `Buffer` row, or a built-in row with no own enumerable key, among other rows, past the type: `[film, new Date()]` | a row of defaults, written; a `Buffer`'s bytes as columns `"0"`, `"1"`… (42703) | throws while compiling | a plain object for each row |

</div>

### `truncate()`

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| The result of [`truncate()`](/insert#truncate)`.run()` | `[]` | `undefined`, as its type says | nothing: it held no rows |
| `truncate()` options in an order Postgres refuses, past the type: `truncate('tags', 'CASCADE', 'RESTART IDENTITY')` | 42601 from Postgres: `.run()` rejects with a `DatabaseError` | throws while compiling: `.run()` rejects with a plain `Error`, "Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not '…'"<!-- message --> | nothing, unless you test for a `DatabaseError` (42601) there: it is now a plain `Error` |

</div>

### Names and keywords

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| A name (a column, a table, a `lateral` key, an `alias`) or a `param()` cast that splices SQL, or holds a comment between its quoted parts: an [`order`](/select#select) of `{ by: 'release_year" DESC, "title', … }` | `ORDER BY "release_year" DESC, "title" ASC` | `ORDER BY "release_year"" DESC, ""title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'release_year" DESC, "title', direction: 'ASC' } }) -->, one name: 42703 | one name per string: `order: [{ by: 'release_year', direction: 'DESC' }, { by: 'title', direction: 'ASC' }]` |
| A [`lock`](/select#lock), a [`truncate()`](/insert#truncate) option, an isolation level, or an `aggregate` that is not a function name | written into the SQL | throws before any query | a value the type takes; for the `aggregate`, a function name (`sum`, `my_schema.my_agg`) |

</div>

### `null` options

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| A `null` option, past the type (from JavaScript, or with `strict` off): `order: null` or `lock: null` in a read shortcut, the aggregates included, `columns: null` or `extras: null` in [`select()`](/select#select), `returning: null` or `extras: null` in a [write](/insert#insert-options): `select('films', db.all, { order: null })` | a `TypeError` at the call, which a `.catch()` chained on `.run()` misses | from 6.7.0, `.run()` rejects with a plain `Error` before any query: "`` `order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them. ``<!-- message -->", and the same for each key | leave the key out: `select('films', db.all)` |

</div>

### Own keys

From 6.7.2, pgcast takes the columns of an array of rows and `upsert()`'s update values from own keys only, and from 6.8.0 the shortcuts' options too. So a key that other code adds to `Object.prototype` is no longer a column, an update value or an option: [Fixes by release](/security#fixes-by-release) says what it did. No code should rely on such a key; without one, only these calls change:

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| A column named `constructor`, `valueOf`, `toString` or `hasOwnProperty` in an [`upsert()`](/insert#upsert) row, which `updateValues` doesn't name | throws while compiling, "Alien object while interpolating SQL: …"<!-- message -->, so `.run()` rejects | from 6.7.2, set from `EXCLUDED` on conflict, as any other column | nothing |
| A column named `__proto__`, an own key as `JSON.parse` gives it: in an `upsert()` row, which `updateValues` doesn't name; in an array of rows given to `insert()` or `upsert()` | `upsert()` sets it to `TRUE` on conflict; in an array, the keys of its value are columns too, and a row without it makes Postgres refuse the query (42601) | from 6.7.2, set from `EXCLUDED`; in an array, a column of its own, `DEFAULT` in a row without it | nothing |
| An [`order`](/select#select) or [`lock`](/select#lock) item that is `null` or `undefined`, past the type: `select('films', db.all, { order: [null] })` | a `TypeError` at the call, "Cannot read properties of null" | from 6.8.0, an `Error` at the call, as for an item without `direction` or `for`: "Direction must be ASC/DESC, not 'undefined'"<!-- message --> | nothing, unless you test for a `TypeError` there |

</div>

### SQL that changes, rows that don't

The text and values of `.compile()` change beyond these rows, where the rows returned don't:

<div class="stack">

| Where | Zapatos 6.6.1 | pgcast |
|---|---|---|
| every `not()`: a pair of parentheses more | `(NOT "release_year" = $2)` | `(NOT ("release_year" = $2))`<!-- probe: db.conditions.not(db.conditions.eq(1974)).compile({ text: '', values: [0] }, undefined, 'release_year') --> |
| every operand of `and()`: a pair each | `(a AND b)` | `((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) --> |
| every `param()` filter value, sent as it is: `{ title: db.param('x', 'text') }` | `$2` with `{"value":"x","cast":"text"}` | `CAST($2 AS "text")`<!-- probe: db.update('films', { tagline: 'x' }, { title: db.param('x', 'text') }) --> with `'x'` |

</div>

- Tests that snapshot SQL fail at [Read the warnings](#read-the-warnings): check the rows first, then update the snapshots.
- Every case of each fix: the [changelog](/changelog), § Fixed and § Security.

## 5. Read the warnings {#read-the-warnings}

On pgcast 6.x, run your tests and your app with deprecation warnings enabled. For example, pgcast 6.7.0 emits this warning the first time Postgres rolls back a commit after the callback caught a query error.

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

To find each call:

1. Run with `--trace-deprecation`: Node prints the stack, and the first line below pgcast's own `dist/db/` frames is yours. A test runner's processes get it from `NODE_OPTIONS`:

   ```sh
   NODE_OPTIONS=--trace-deprecation npm test
   ```

2. Fix the call, or turn on its option (table below).
3. Run again. Each code warns once, so the stack shows only its first call: the next call with the same code warns in turn.

<div class="stack">

| Warning | The call | Fix it, or turn on |
|---|---|---|
| `PGCAST_DEP001` | A batch upsert would update a column missing from a row. | Give every row that key or specify `updateColumns`. |
| `PGCAST_DEP002` | A row supplies `undefined`, or an undefined `updateValues` override alone adds the column to the update. | Use `null` to clear the column or omit the key to leave it untouched on update. See the [`updateValues` rule](/insert#undefined-values). |
| `PGCAST_DEP003` | a [`transaction()`](/transaction#transaction) whose callback catches a query's error and returns: Postgres answers the `COMMIT` with `ROLLBACK`, and nothing is saved ([Let the error through](/retries#let-the-error-through)) | let the error out of the callback, or `ROLLBACK TO` a `SAVEPOINT` before going on; or [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), and such a transaction rejects |
| `PGCAST_DEP004` in 6.x | a [`sum()`, `avg()`, `min()` or `max()`](/select#typed-by-column) with a null or missing result, or a minimum or maximum whose pg value is not a number | turn on [`aggregatesTypedByColumn`](/runtime-config#Config.aggregatesTypedByColumn), declared in [`ConfigTypes`](/runtime-config#ConfigTypes): `tsc` then shows uses incompatible with the new type, and `?? 0` keeps a `0` |
| `PGCAST_DEP005` | a [`transaction()`](/transaction#transaction) given a client you sent `BEGIN` on: its `COMMIT` or `ROLLBACK` ends your transaction ([Your own `BEGIN`](/transaction#your-own-begin)) | open the outer transaction with `transaction()`, or give that call the pool, for a transaction of its own, committed apart from the outer one, which doesn't see the outer one's uncommitted rows, and hangs (unless `lock_timeout` is set) if it writes or locks a row the outer one has written or locked, or inserts a key the outer one has inserted (two `FOR SHARE` locks don't conflict); or [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), and such a call rejects before sending its `START TRANSACTION` |
| `PGCAST_DEP007` | a [`transaction()`](/transaction#transaction) given the client of a transaction at a level that doesn't satisfy its own, `serializable()` given `readCommitted()`'s: its callback runs at the outer level ([Passing a transaction through](/transaction#passing-a-transaction-through)) | open the outer transaction at a level that satisfies the inner one, or give the inner call the pool, for a transaction of its own, committed apart from the outer one, which doesn't see the outer one's uncommitted rows, and hangs (unless `lock_timeout` is set) if it writes or locks a row the outer one has written or locked, or inserts a key the outer one has inserted (two `FOR SHARE` locks don't conflict); or [`transactionRequiresSatisfyingLevel`](/runtime-config#Config.transactionRequiresSatisfyingLevel), and such a call rejects before its callback |

</div>

## 6. Turn on the opt-ins {#turn-on-the-opt-ins}

On 6.x, once a run shows no warning, or each one comes from a call you've checked, turn the options on, once, before the first query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
db.setConfig({
  upsertRequiresSameKeys: true, undefinedMeansMissing: true,
  transactionRequiresCommit: true, transactionRequiresIdleClient: true,
  transactionRequiresSatisfyingLevel: true, aggregatesTypedByColumn: true,
});
```

Run `npx zapatos` on 6.x to see which generator settings would change your schema. Generator migration notes go through `warningListener`.

## Migrate from pgcast 6.x to 7.0 {#from-7-0}

On 6.x, [trace the warnings](#read-the-warnings) and [enable the fixes](#turn-on-the-opt-ins) first. Keep your existing package alias when installing 7.x. Choose the command that matches your imports.

::: code-group

```sh [zapatos/db]
npm install zapatos@npm:@pgcast/pgcast@^7
```

```sh [pgcast/db]
npm install pgcast@npm:@pgcast/pgcast@^7
```

:::

Even after a warning-free 6.x run, check [write batches, aggregates and read-only callbacks](#runtime-migration), [array conditions](#array-condition-types), [generated types](#regenerate-for-7-0) and [optional type peers](/install#requirements). If you check types and relied on automatic peer installation, add only the missing dev dependency (`typescript` or `@types/pg`). Run `npm install --save-dev typescript @types/pg` if both are missing. JavaScript needs only the `pg` peer. [#592](https://github.com/AlexandreDemartin/pgcast/issues/592).

### Check runtime calls {#runtime-migration}

All six settings below now default to `true`. To keep one 6.x behaviour, set the corresponding option to `false` in `db.setConfig()`. Each fallback runs quietly through 7.x and goes in 8.0.

| Temporary setting | What to check in 7.0 | With the 6.x setting |
|---|---|---|
| [`undefinedMeansMissing: false`](/runtime-config#Config.undefinedMeansMissing) | An undefined insert cell takes its column default. An update with `tagline: undefined` leaves the tagline untouched if it also assigns `title`. Use `null` to clear it. | An undefined row value reaches Postgres as `NULL`. See the [`updateValues` rule](/insert#undefined-values). |
| [`upsertRequiresSameKeys: false`](/runtime-config#Config.upsertRequiresSameKeys) | A batch with `tagline` in only one row throws at construction if the implicit update would overwrite that column. A non-enumerable property now counts as missing even with both fixes enabled in 6.x. To write it, use `{ ...row, tagline: row.tagline }`. Check the [conflict target, `updateValues` and `updateColumns` exceptions](/insert#upsert-options). | A missing cell can overwrite a stored value with the column default. |
| [`transactionRequiresCommit: false`](/runtime-config#Config.transactionRequiresCommit) | If a callback catches a failed query and Postgres answers its `COMMIT` with `ROLLBACK`, the promise rejects. [Transaction errors](/transaction#errors). | The promise resolves with the callback result. |
| [`transactionRequiresIdleClient: false`](/runtime-config#Config.transactionRequiresIdleClient) | After your own `BEGIN`, the helper rejects if your client still reports a block after the status recheck. End your block first. Await each helper before starting the next on that client. [Your own `BEGIN`](/transaction#your-own-begin). | The helper can end the caller's transaction. |
| [`transactionRequiresSatisfyingLevel: false`](/runtime-config#Config.transactionRequiresSatisfyingLevel) | A nested `serializable()` inside `readCommitted()` rejects before the inner callback runs. Open the outer transaction at the level you need. [Passing a transaction through](/transaction#passing-a-transaction-through). | The inner callback runs at the outer isolation level. |
| [`aggregatesTypedByColumn: false`](/runtime-config#Config.aggregatesTypedByColumn) | An empty `sum()` returns `null`. A `min()` over a date returns the date value. Handle `null` before arithmetic. [Typed by column](/select#typed-by-column). | A direct `.run()` applies `Number()`, so an empty sum is zero. In `extras`, the same sum is JSON `null` and a date minimum stays a date string. |

<CastPanel example="switching_undefined">

<<< ./examples/switching_undefined.ts{ts twoslash}

</CastPanel>

For numeric results from a direct aggregate call through 7.x, set the literal `false` in both places. Augment the module you import (`pgcast/db` if you use that name).

```ts twoslash
import * as db from 'zapatos/db';

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
db.setConfig({ aggregatesTypedByColumn: false });
```

<div class="stack">

| Your code | Zapatos 6.6.1 and pgcast 6.x | pgcast 7.0 | What to do |
|---|---|---|---|
| A `SelectOneSignatures` or `SelectExactlyOneSignatures` implementation forwarding to `select()` with a mode | Compiles with 6.x numeric signatures | TS2322 (TS2375 with `exactOptionalPropertyTypes`) | Forward to `selectOne()` or `selectExactlyOne()`, respectively. |
| An exported spread of a date minimum with `declaration: true` | Compiles with 6.x numeric signatures | TS4023 | Export the fragment itself. |
| [#694](https://github.com/AlexandreDemartin/pgcast/issues/694) · `db.serializableRO(pool, countSeats)`, where the parameter of `countSeats` is typed `db.TxnClient<db.IsolationLevel.Serializable \| db.IsolationLevel.SerializableRO>` | Compiles | TS2345 under `strictFunctionTypes` (on with `strict`) because TypeScript checks the callback against the wider client type | For `pg`, use [`db.TxnClientForSerializableRO`](/transaction#TxnClientForSerializableRO). For an adapter with client type `C`, use `db.TxnClientLike<C, db.IsolationSatisfying<db.IsolationLevel.SerializableRO>>`. If the helper inspects `_zapatos.isolationLevel`, handle `SerializableRODeferrable` too. Types built on the levels see it too: add the `SerializableRODeferrable` key to a `Record` keyed by `IsolationSatisfying<…>`, widen the client of a handwritten signature, and pass an explicit discriminator where overloads on the ordinary and deferrable client types chose the result, since the two types now coincide. The callbacks of `transaction()`, `savepoint()` and nested calls that keep the client get the wider type too. |

</div>

### Array condition types in 7.0 {#array-condition-types}

Change a saved fragment's scalar constraint from `number` to `number[]`. You can simplify `arrayContains<number[]>([[1]])` to `arrayContains([1])`. Implement both overloads in a mock of the old signature. See [Arrays](/conditions#arrays) for operands and callbacks. [#705](https://github.com/AlexandreDemartin/pgcast/issues/705).

For `arrayContains()`, `arrayContainedIn()` and `arrayOverlaps()` (`c = db.conditions`):

- Drop the type argument on `c.arrayContains(db.parent('genres'))`. Narrow an array-or-parent union before calling.
- To include parents in a derived operand type, use `Parameters<typeof c.arrayContains>[0] | db.ParentColumn`.
- For `xs: T[]` with `T extends number[]`, let the wrapper infer its return type. Its old `db.SQLFragment<boolean | null, T>` annotation fails.

### Regenerate and compile {#regenerate-for-7-0}

Regenerate whenever the generator version or an output option changes. Run `npx pgcast`, then diff the generated schema. The first four old settings below run quietly through 7.x and go in 8.0. The last three are permanent choices.

| 7.0 default | What changes for the caller | Old setting |
|---|---|---|
| [`typeEnumsAcrossSchemas: true`](/generator#generate.typeEnumsAcrossSchemas) | A write to `prints.keeper` takes the foreign label `'archivist'`. The local label `'director'` no longer compiles. Check [name collisions and placeholder imports](#enum-types). | `false` |
| [`enumOrder: 'declared'`](/generator#generate.enumOrder) | `every.crew_job[0]` is `'director'`, the first declared label. Check code that indexes the tuple. | `'alphabetical'` |
| [`uniqueIndexConstraintsOnly: true`](/generator#generate.uniqueIndexConstraintsOnly) | A bare unique index such as `festival_entries_live_idx` drops out of `UniqueIndex`. Choose an eligible constraint for a [named upsert](#named-conflict-targets). | `false` |
| [`domainsTypedByContext: true`](/generator#generate.domainsTypedByContext) | With the generated placeholder and default parsers, a `bigint` domain is a string in a raw row, a number in shortcut JSON, and accepts a `bigint` on write. [Domain types](#domain-and-parser-types). | `false` |
| [`enumArraysTypedAsText: true`](/generator#generate.enumArraysTypedAsText) | A raw enum array is text such as `'{writer,editor}'`. Use the shortcut's array for `.map()`, or select `false` if your parser returns an array. | `false` (permanent) |
| [`intervalsTypedAsObjects: true`](/generator#generate.intervalsTypedAsObjects) | A raw interval has `toPostgres()`. Shortcut JSON keeps the text. Select `false` if your parser returns text. | `false` (permanent) |
| [`rejectOnQueryError: true`](/generator#generate.rejectOnQueryError) | `await generate()` and `await tsForConfig()` reject with the original connection or query error. Rethrow it or set `process.exitCode = 1` if the job must fail. A synchronous listener error also rejects generation. Handle any promise the listener returns. | `false` (permanent immediate exit) |

By default, `await check()` already rejects on database errors. It compares the contents of the schema and any generated custom types index, and checks that each placeholder exists. A failed check returns `false`. Explicit `rejectOnQueryError: false` ends the process on database errors for all three functions. Both CLI names, `pgcast` and `zapatos`, exit 1 on database errors. Their `--check` also exits 1 when that check returns `false`. [Generator errors](/generator#generate.rejectOnQueryError).

Regeneration preserves existing `custom/` placeholders. Generate a second copy into an empty `outDir` outside your TypeScript project, compare its placeholders with yours and merge the changes that fit your parsers. Then run `npx tsc` against the regenerated schema and run your tests.

Three settings keep their own defaults. `selectExactlyOneChecksForSecondRow` stays off. Enabling it checks for a second row only in a standalone query. A nested query or a `.copy()` keeps `LIMIT 1` unless [`withTies`](/select#order-limit-offset-and-withties) includes tied rows. The generator's [`domainsTypedAsUnions`](/generator#generate.domainsTypedAsUnions) stays opt-in and [`moduleNames`](/generator#generate.moduleNames) still defaults to `'zapatos'`.

### Enum types in 7.0 {#enum-types}

In 7.0, `prints.keeper` uses the foreign enum's labels. Check the generator's [name-collision exceptions](/generator#generate.typeEnumsAcrossSchemas). The `every.<name>` tuple follows Postgres declaration order. Regenerate and run `tsc` to find writes with invalid labels and code that depends on a label's position.

- Fresh output omits foreign enum placeholders such as `PgStatus` and `Pg_mood` from `zapatos/custom`. Existing files remain, but their columns no longer use them. Replace each import with the column type, such as `products.Selectable['status']`, or set `typeEnumsAcrossSchemas: false` in 7.x.
- A foreign composite column previously typed as the local enum of the same name now gets its own placeholder. Type it for your parser, or set `typeEnumsAcrossSchemas: false` in 7.x.
- If you pass `columnsTypedByEnumName` to `definitionForRelationInSchema()`, only `typeEnumsAcrossSchemas: false` fills it.

For an existing domain placeholder over a foreign enum, [compare the fresh placeholder](#regenerate-for-7-0) and merge its new labels.

Throughout 7.x, [`typeEnumsAcrossSchemas: false`](/generator#generate.typeEnumsAcrossSchemas) restores lookup in the relation's schema and [`enumOrder: 'alphabetical'`](/generator#generate.enumOrder) restores sorted labels. Each works independently without a migration note. Both legacy behaviours go in 8.0.

### Named conflict targets in 7.0 {#named-conflict-targets}

Regenerate the schema and run `tsc`. For [the `festival_entries` table](/generator#generate.uniqueIndexConstraintsOnly), `constraint()` still accepts `festival_entries_pkey` and `festival_entries_film_festival_key`. Keep these two keys in a `Record<s.festival_entries.UniqueIndex, string>` object literal. Remove `festival_entries_live_idx` and `festival_entries_slot_key`. If an upsert targets either name, choose a constraint usable with `DO UPDATE`.

If a relation's `UniqueIndex` becomes `never`, a `Record` literal typed with that union still compiles with the old key. Check those records by hand.

On Postgres 18, naming a non-deferrable `WITHOUT OVERLAPS` key with `updateColumns: db.doNothing` compiled and worked in 6.x. The 7.0 default rejects the name at compile time. To keep `DO NOTHING`, write an explicit `sql` statement naming the key, or set `uniqueIndexConstraintsOnly: false` through 7.x.

On a partitioned table, the union follows the parent index. A deferrable parent key drops out even when an immediate partition key lets the named upsert work. Use explicit SQL or set `uniqueIndexConstraintsOnly: false` through 7.x. With an immediate parent and a deferrable partition key, the name compiles but Postgres can raise 55000.

This setting restores the 6.x union without a migration note. It alone fills the `uniqueIndexesNotArbiters` out-parameter of `definitionForRelationInSchema()`.

### Domains, enum arrays and intervals in 7.0 {#domain-and-parser-types}

Regenerate with `npx pgcast` and run `tsc`. In 7.0 all three generator settings default to `true` and emit no migration note.

For callers of `definitionForRelationInSchema()`, the four optional arrays still collect columns independently of listener messages.

| Out-parameter | When it collects a column |
|---|---|
| `domainsNotByContext` | `domainsTypedByContext: false`, for a known domain base whose type differs by context |
| `domainsUnderDomains` | The same setting, for a nested domain or array of domains with a known root |
| `enumArraysNotAsText` | `enumArraysTypedAsText` omitted or `null`, for a recognised enum array, including a direct domain over one |
| `intervalsAsText` | `intervalsTypedAsObjects` omitted or `null`, for an interval, its array or a direct domain over either. A resolved interval or interval-array root also counts when `domainsTypedByContext` is on (the 7.0 default). |

- With [`domainsTypedByContext`](/generator#generate.domainsTypedByContext), a `bigint` domain gives a number in shortcut JSON with the default parser. With `customJSONParsingForLargeNumbers: true` and the matching parser, narrow `number | db.Int8String` before calling `.padStart()`.
- A nested domain with an `any` placeholder takes its innermost base type. An array of `bigint` domains narrows from `any` to `number[]` in default shortcut JSON. If rows contain null elements or multiple dimensions, check the shape before using an element. Include those shapes and the raw `string` in the array placeholder, or use `domainsTypedByContext: false` through 7.x. This override goes in 8.0.
- With [`enumArraysTypedAsText`](/generator#generate.enumArraysTypedAsText), a `sql` row holds the array's text. To call `.map()` or write the labels back, use the array returned by a shortcut. Keep `false` if your `pg` parser returns the label array.
- With the 7.0 default, an `isInSelect()` subquery `sub` selecting `c_enum_array` compares as the raw `string` type. TypeScript now rejects `{ c_enum_array: sub }` and accepts a text column that Postgres rejects (42883). Set `enumArraysTypedAsText: false` or write an explicit `sql` condition.
- With [`intervalsTypedAsObjects`](/generator#generate.intervalsTypedAsObjects), a `sql` row holds a `PostgresInterval`. Read its fields or write the object back directly. Shortcut JSON keeps the text. Keep `false` if your parser returns interval text. Both parser settings remain available beyond 8.0.

Context typing compares the placeholder's type with the type a fresh run would generate under the current settings. An old interval-domain `string` stays text. An edit to `db.PostgresInterval` matches the new default, so shortcut JSON becomes text. Switching back to `intervalsTypedAsObjects: false` preserves an existing object placeholder. [Compare your placeholder with fresh output](#regenerate-for-7-0). For a missing `db` import, [add the import](/custom-types#when-a-placeholder-does-not-compile).

Check nested domains even if you enabled all the generator fixes in 6.x:

- Over an enum array, a nested domain with its generated placeholder changes from a label array to `string` in raw rows. Write back the shortcut JSON array, or set `enumArraysTypedAsText: false` for an array-returning parser. For a direct domain over the array, that setting alone restores the 6.x raw placeholder type.
- Over `numeric[]`, the raw nested domain narrows from `any` to `db.NumericString[]`. The default `pg` parser returns numbers. If the arrays have one dimension and non-null elements, type the domain's placeholder as `number[]`.

### Roll back to pgcast 6.x {#roll-back-to-6-x}

Restore the 6.x package and lockfile, reinstall, and restore the runtime and generator settings you used on that release. Revert calls and type annotations that depend on 7.0. Repeat the [regeneration, placeholder comparison and compilation](#regenerate-for-7-0) with the 6.x generator, then run your tests. For Zapatos 6.6.1, follow [Go back](#go-back).

## Go back

```sh
npm install zapatos@6.6.1
```

- First, remove from `setConfig()` the options Zapatos 6.6.1's `Config` doesn't have (2353): `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel`, `selectExactlyOneChecksForSecondRow`, `aggregatesTypedByColumn` and `transactionEventListener`, which TypeScript takes for a misspelt `transactionListener` (2561). Zapatos 6.6.1 never calls that listener: feed a log or a metric from `transactionListener`'s messages instead.
- On [`moduleNames`](/generator#generate.moduleNames) `"pgcast"`, run `npm uninstall pgcast` too: both packages have a `zapatos` command. Your `pgcast/…` imports then no longer resolve, and 6.6.1 writes `zapatos/` but leaves `pgcast/` behind. So change each import back to `zapatos/…`, move the placeholders you edited to `zapatos/custom/`, their `declare module 'pgcast/custom'` renamed `'zapatos/custom'`, and delete `pgcast/`.
- Rename a `pgcastconfig.json` to `zapatosconfig.json`: Zapatos 6.6.1's CLI reads no other file.
- Take [`--check`](/generator#check) out of your scripts. Before the JSON argument, Zapatos 6.6.1's CLI reads it as that argument, and stops with code 1; after it, the CLI ignores it, writes the files and exits with code 0, so the check always passes. [`check()`](/generator#check) too: Zapatos 6.6.1's `zapatos/generate` has no such export, which TypeScript refuses (2305); at run time, `require()` gives `undefined` and the call throws `TypeError: check is not a function`, and an ES module import fails before any code runs.
- Zapatos 6.6.1's CLI prints no usage for `--help` or `-h`: it reads them as the JSON argument, and stops with code 1.
- Regenerate with Zapatos 6.6.1. It ignores `typeEnumsAcrossSchemas`, `enumOrder`, `uniqueIndexConstraintsOnly`, `domainsTypedByContext`, `enumArraysTypedAsText`, `intervalsTypedAsObjects`, `domainsTypedAsUnions` and `moduleNames` in `zapatosconfig.json`, and writes again the `any` types, the sorted labels, the unprefixed comment lines, every unique index in `UniqueIndex`, any borrowed `UniqueIndex` name, each domain's placeholder in all five interfaces, an array of an enum as an array in `Selectable` and each `interval` as a string; a placeholder it finds holding `db.PostgresInterval` stays, though Zapatos 6.6.1's `db` has no such type: the placeholder fails to compile without `skipLibCheck` (TS2694), and under it the column is `any`, silently. Write `string` in it. So does a placeholder that names a domain's union, which Zapatos 6.6.1 no longer declares (TS2305, or TS2694 for one in a schema's namespace): write `string` there too. Its `generate()` doesn't know `rejectOnQueryError` either: TypeScript refuses it in an object literal (2353), and at run time a failed query ends the process again.
- Each change of [Find the calls whose result changes](#find-the-calls-whose-result-changes) runs as it did, but the `jsonb` one, which finds nothing again.

::: warning Security
Code written or left as it is against pgcast's fixes gets Zapatos 6.6.1's results back: each row whose What to do is "nothing", the `not()` row and the `jsonb` row.

`db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` deletes 11 roles under pgcast, and all 12 under Zapatos 6.6.1.

The holes that each release's security fixes closed are open again ([Fixes by release](/security#fixes-by-release)): a caller's string can splice SQL, a filter can match every row, and a key that other code added to `Object.prototype` can change a query.
:::

## See also

- [Read the 6.x warnings](#read-the-warnings) to find the call that triggers each code.
- [Versions](/versions): why pgcast fixes some things outright and others behind an option.
- [Security](/security): why a name or a `raw()` value can no longer splice SQL.

# Switch from Zapatos

Move a project from Zapatos 6.6.1 to pgcast: change one line of `package.json`, regenerate, then let `tsc`, a look through your code and pgcast's warnings show you the few calls whose result changes. It assumes a project that already runs on Zapatos; for a new one, start at [Install](/install).
{.lede}

## Swap the package

::: info Not on npm yet
pgcast hasn't had its first release, so this command will work once it has. Until then, the [README](https://github.com/AlexandreDemartin/pgcast#readme) says where things stand.
:::

Install pgcast under the name Zapatos had:

```sh
npm install zapatos@npm:pgcast
```

`package.json` now reads `"zapatos": "npm:pgcast@^…"`, and `node_modules/zapatos` holds pgcast. pnpm and yarn take the same alias: [Install](/install#add-the-package).

- Nothing else to add: pgcast's peer dependencies are Zapatos 6.6.1's, `pg`, `@types/pg` and TypeScript 4.1 or later.
- Not as plain `pgcast`: your `zapatos/*` imports would no longer resolve ([Install](/install#add-the-package), § Why the alias).

## What stays the same

- The module names: `zapatos/db`, `zapatos/schema`, `zapatos/custom` and `zapatos/generate`. No import changes ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
- The generator: `zapatosconfig.json` and its options, and `npx zapatos`, now also `npx pgcast` ([The CLI](/generator#cli)).
- Your placeholders in `zapatos/custom/`: written once, never overwritten.
- A `Config` written for Zapatos 6.6.1: the keys pgcast adds are optional ([`Config`](/runtime-config#Config)).
- The schema's version canary, so a schema that Zapatos 6.6.1 generated compiles as it is ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)).

## Regenerate the schema

```sh
npx zapatos
```

pgcast's generator is Zapatos 6.6.1's: on the docs schema, it writes the same files, byte for byte, so `git diff` on your `zapatos/` folder should show nothing.

## Compile

```sh
npx tsc
```

pgcast's types refuse a few calls that Zapatos 6.6.1's took. The one you may meet: `db.raw()`, `db.cols()` or `db.vals()` as the value of a filter or a condition. Zapatos 6.6.1 took it as a `Parameter`, and sent it as JSON, `{"value":"initcap('the salt orchard')"}`, so it matched no film. pgcast refuses it (2322, with `strict` on or off):

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
- In a fragment, a plain string is a name, not a value: `${'the salt orchard'}` would be the column `"the salt orchard"` ([Identifiers](/sql-template#identifiers)).
- [`DangerousRawString`](/sql-template#DangerousRawString), [`ColumnNames`](/sql-template#ColumnNames) and [`ColumnValues`](/sql-template#ColumnValues) no longer match a plain `{ value }`, nor each other: `const r: db.DangerousRawString = { value: 'x' }` fails (2741). Make them with `db.raw()`, `db.cols()` and `db.vals()`.
- As a value of `insert()`, `update()` or `upsert()`, the type refuses them too, though the run time still sends them as JSON ([#132](https://github.com/AlexandreDemartin/pgcast/issues/132)).

## Find the calls whose result changes

pgcast fixes, with no option to turn on, what no code could rely on in Zapatos 6.6.1: a call that Postgres or the type refused, that did the opposite of its name, or that let a string splice SQL. A few such calls did run, and now give other rows, or throw. Look through your code for the first column:

| Your code | Zapatos 6.6.1 → pgcast | What to do |
|---|---|---|
| A plain value in [`upsert()`](/insert#upsert-options) `updateValues`: `{ tagline: 'films.title' }` | a column name, `ROW("films"."title")` → a parameter, the string `'films.title'` | for the old result, `` db.sql`${'films'}.${'title'}` `` |
| [`not()`](/conditions#conditions.not) of a fragment with a bare `OR` or `AND`: on `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, so the 1991 film too → `(NOT (a OR b))` | for the old rows, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`db.param()`](/sql-template#param) as a filter value, in [`isIn()`](/conditions#conditions.isIn) and [`isNotIn()`](/conditions#conditions.isNotIn), in a plain object of `upsert()` `updateValues`, or in a [`vals([…])`](/sql-template#vals), hand-written or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON, `{"value":…}`: no row, every row with `isNotIn()`, other booleans in `updateValues`, `'{"value":…}'` stored, or 22P02 → the value, with its cast | nothing |
| `{ data: db.param(x, true) }` on a `jsonb` column | no row → 42883, `jsonb = json` | `{ data: db.param(JSON.stringify(x), 'jsonb') }` |
| [`db.parent()`](/sql-template#parent) in `isIn()`, `isNotIn()` or a `vals([…])`: in a `lateral` subquery, or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON: no row, every row with `isNotIn()`, `'{"value":…}'` stored, or 22P02 → the parent's column; outside a nested query, a write included, it throws | nothing in a `lateral`; in a write, the value itself |
| [`db.Default`](/sql-template#Default) or [`db.self`](/sql-template#self) as a filter value, a condition's (`ne()`, `add()`), or in a `vals([…])` of a filter or a fragment value: `` insert('films', { …, tagline: db.sql`${db.vals([db.Default])}` }) `` | `'Symbol(DEFAULT)'` or `'Symbol(self)'`, sent or stored → throws while compiling | `db.Default` as the value itself, `{ …, tagline: db.Default }`, in `insert()` or `update()`; in a filter, a value to compare with |
| `db.Default` in a `vals([…])` of a query you write: `` db.sql`INSERT INTO films (…) VALUES (${db.vals([…, db.Default])})` `` | `'Symbol(DEFAULT)'` → `DEFAULT` | nothing |
| `db.raw()`, `db.cols()` or `db.vals()` as a filter value, a condition's, or in a `vals([…])` of a fragment value: `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | sent as JSON, `{"value":"'Cy'"}` stored → refused by `tsc` as a filter value, and throws while compiling | in a filter, a `sql` fragment value ([Compile](#compile)); in a written value, `raw()` in the fragment itself: `` db.sql`${db.raw("'Cy'")}` `` |
| A name, or a `param()` cast, that splices SQL: `order: { by: 'release_year" DESC, "title', … }` | `ORDER BY "release_year" DESC, "title" ASC` → `ORDER BY "release_year"" DESC, ""title" ASC`, one name: 42703 | one name per string: `order: [{ by: 'release_year', direction: 'DESC' }, { by: 'title', direction: 'ASC' }]` |
| A [`lock`](/select#lock), a [`truncate()`](/insert#truncate) option, an isolation level or an `aggregate` outside its list | written into the SQL → throws before any query | a value the type takes |
| [`update()`](/insert#update) with no column: `update('films', {}, …)` | 42601 from Postgres → throws when called: "nothing to update: an Updatable needs at least one column" | nothing, unless you catch a `DatabaseError` there |

- Each change in the last column gives the same result under Zapatos 6.6.1, so you can make it before you switch; only the `jsonb` one finds its rows under pgcast alone.
- The text and values of `.compile()` change beyond these rows, where the rows returned don't: every `not()` gains a pair of parentheses, `(NOT ("release_year" = $2))` where it was `(NOT "release_year" = $2)`, and every `param()` filter value is sent as it is, `{ title: db.param('x', 'text') }` giving `CAST($2 AS "text")` with `'x'` where it was `$2` with `{"value":"x","cast":"text"}`. Tests that snapshot SQL fail at [Read the warnings](#read-the-warnings): check the rows first, then update the snapshots.
- Every case of each fix: the [changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md), § Fixed and § Security.

## Read the warnings

Run your tests, then your app. Where Zapatos 6.6.1 did something that code may rely on, pgcast keeps it, and warns once per process the first time a call does it:

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

To find the call, run with `--trace-deprecation`: Node prints the stack, and its first line outside `node_modules/zapatos` is yours. A test runner's processes get it from `NODE_OPTIONS`:

```sh
NODE_OPTIONS=--trace-deprecation npm test
```

Then fix the call, or turn on its option:

| Warning | The call | Fix it, or turn on |
|---|---|---|
| `PGCAST_DEP001` | a multi-row `upsert()` without `updateColumns`, with a key missing from some rows: inserted as `DEFAULT`, it overwrites the existing value ([Rows with different keys](/insert#upsert-different-keys)) | give every row the key (`db.Default` keeps the SQL), or pass `updateColumns`; or [`upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), and such a call throws |
| `PGCAST_DEP002` | an `undefined` value in `insert()`, `update()` or `upsert()`, sent as `NULL` ([An `undefined` value](/insert#undefined-values)) | leave the key out, or give `null` to erase the column; or [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), and `undefined` is a missing key |

## Turn on the opt-ins

Once no warning is left, or each one comes from a call you've checked, turn both options on, once, before the first query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ upsertRequiresSameKeys: true, undefinedMeansMissing: true });
```

Both will be the default in 7.0 ([Versions, opt-ins and warnings](/versions)). With them on, an `undefined` value is left out of an `update()`:

<CastPanel example="switching_undefined">

<<< ./examples/switching_undefined.ts{ts twoslash}

</CastPanel>

- `insert()` sends `DEFAULT` for an `undefined` value, and an `update()` with no other key throws "nothing to update: an Updatable needs at least one column".
- The `upsert()` of `PGCAST_DEP001` throws when called, before any query: "rows have different keys: pass updateColumns, or give every row the same keys".
- Neither option warns. To keep it that way, `NODE_OPTIONS=--throw-deprecation npm test` fails the run at the first warning.

## Go back

```sh
npm install zapatos@6.6.1
```

The generated files are the same, and each change of [Find the calls whose result changes](#find-the-calls-whose-result-changes) runs as it did. Remove the two options from `setConfig()` first: Zapatos 6.6.1's `Config` doesn't have them (2353).

::: warning Security
Code written or left as it is against pgcast's fixes gets Zapatos 6.6.1's results back: each row whose What to do is "nothing", and the `not()` row. `db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` deletes 11 roles under pgcast, and all 12 under Zapatos 6.6.1. The holes of the [changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md)'s § Security are open again: a name, a `lock`, an `aggregate`, a plain value in `updateValues` or a `param()` cast can splice SQL ([The security model](/security)).
:::

## See also

- [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings): each option, its warning and its message.
- [Versions, opt-ins and warnings](/versions): why pgcast fixes some things outright and others behind an option.
- [The security model](/security): why a name or a `raw()` value can no longer splice SQL.

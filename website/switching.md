# Switch from Zapatos

Move a project from Zapatos 6.6.1 to pgcast: change one line of `package.json`, regenerate, then let `tsc`, a look through your code and pgcast's warnings show you the few calls whose result changes. It assumes a project that already runs on Zapatos; for a new one, start at [Install](/install).
{.lede}

## Swap the package

::: info Not on npm yet
pgcast hasn't had its first release, so this command will work once it has. To try the switch today, run `npm ci` then `npm pack` in a clone of the repository, copy the archive it writes into your project, and `npm install zapatos@file:pgcast-<version>.tgz` installs it under the same alias. The [README](https://github.com/AlexandreDemartin/pgcast#readme) says where things stand.
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
- In a fragment, a plain string is a name, not a value: `${'the salt orchard'}` would be the column `"the salt orchard"`<!-- probe: db.sql`${'the salt orchard'}` --> ([Identifiers](/sql-template#identifiers)).
- [`DangerousRawString`](/sql-template#DangerousRawString), [`ColumnNames`](/sql-template#ColumnNames) and [`ColumnValues`](/sql-template#ColumnValues) no longer match a plain `{ value }`, nor each other: `const r: db.DangerousRawString = { value: 'x' }` fails (2741). Make them with `db.raw()`, `db.cols()` and `db.vals()`.
- As an inserted or updated value of `insert()`, `update()` or `upsert()` (not in `updateValues`), the type refuses them too, and they throw before any query ([`insert()`](/insert#insert)).

## Find the calls whose result changes

pgcast fixes, with no option to turn on, what no code could rely on in Zapatos 6.6.1: a call that Postgres or the type refused, that did the opposite of its name, or that let a string splice SQL. A few such calls did run, and now give other rows, or throw. Look through your code for the first column:

| Your code | Zapatos 6.6.1 → pgcast | What to do |
|---|---|---|
| A plain value in [`upsert()`](/insert#upsert-options) `updateValues`: a string, `{ tagline: 'films.title' }`, or an object | a column name, `ROW("films"."title")`, or for an object a condition of its keys (`TRUE` with none) → a parameter, the value itself | for the old result, a fragment: `` db.sql`${'films'}.${'title'}` `` |
| [`not()`](/conditions#conditions.not) of a fragment with a bare `OR` or `AND`: on `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, so the 1991 film too → `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | for the old rows, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/conditions#conditions.and) of a fragment with a bare `OR` and another operand: `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, so film 1000 too → `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | for the old rows, one fragment: `` db.sql`${'id'} = 1000 OR (${'id'} = 1001 AND ${'studio_id'} = ${db.param(1001)})` `` |
| [`db.param()`](/sql-template#param) as a filter value, in [`isIn()`](/conditions#conditions.isIn) and [`isNotIn()`](/conditions#conditions.isNotIn), in a plain object of `upsert()` `updateValues`, or in a [`vals([…])`](/sql-template#vals), hand-written or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON, `{"value":…}`: no row, every row with `isNotIn()`, other booleans in `updateValues`, `'{"value":…}'` stored, or 22P02 → the value, with its cast | nothing |
| `{ data: db.param(x, true) }` on a `jsonb` column | no row → 42883, `jsonb = json` | `{ data: db.param(JSON.stringify(x), 'jsonb') }` |
| [`db.parent()`](/sql-template#parent) in `isIn()`, `isNotIn()` or a `vals([…])`: in a `lateral` subquery, or in a fragment value of `insert()`, `update()` or `upsert()` | sent as JSON: no row, every row with `isNotIn()`, `'{"value":…}'` stored, or 22P02 → the parent's column; outside a nested query, a write included, it throws | nothing in a `lateral`; in a write, the value itself |
| [`db.Default`](/sql-template#Default) or [`db.self`](/sql-template#self) as a filter value, a condition's (`ne()`, `add()`), or in a `vals([…])` of a filter or a fragment value: `` insert('films', { …, tagline: db.sql`${db.vals([db.Default])}` }) `` | `'Symbol(DEFAULT)'` or `'Symbol(self)'`, sent or stored → throws while compiling | `db.Default` as the value itself, `{ …, tagline: db.Default }`, in `insert()` or `update()`; in a filter, a value to compare with |
| `db.Default` in a `vals([…])` of a query you write: `` db.sql`INSERT INTO films (…) VALUES (${db.vals([…, db.Default])})` `` | `'Symbol(DEFAULT)'` → `DEFAULT`<!-- probe: db.sql`${db.vals([db.Default])}` --> | nothing |
| `db.raw()`, `db.cols()` or `db.vals()` as a filter value, a condition's, or in a `vals([…])` of a fragment value: `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | sent as JSON, `{"value":"'Cy'"}` stored → refused by `tsc` as a filter value, and throws while compiling | in a filter, a `sql` fragment value ([Compile](#compile)); in a written value, `raw()` in the fragment itself: `` db.sql`${db.raw("'Cy'")}` `` |
| `db.parent()`, `db.raw()`, `db.cols()` or `db.vals()` as a value of `insert()`, `update()` or `upsert()` where the type took it: on a column typed `any`, as a `zapatos/custom` placeholder left as generated is (`{ c: db.parent('id') }`), or in a `vals({…})` of a query you write, `` db.sql`INSERT INTO films (…) VALUES (${db.vals({ …, tagline: db.raw("upper('x')") })})` ``; and `db.parent()` with no column in a `vals({…})` of a `lateral` subquery, `` db.sql`SELECT ${db.vals({ name: db.parent() })}` `` | sent as JSON, `'{"value":…}'` stored → throws before any query; in the `lateral`, `'{}'` → the parent's column of its key ([`parent()`](/sql-template#parent)) | in a write, the value itself, or for SQL a `sql` fragment value, `` db.sql`upper(${db.param('x')})` ``; nothing in a `lateral` |
| A name (a column, a table, a `lateral` key, an `alias`) or a `param()` cast that splices SQL, or holds a comment between its quoted parts: an [`order`](/select#select) of `{ by: 'release_year" DESC, "title', … }` | `ORDER BY "release_year" DESC, "title" ASC` → `ORDER BY "release_year"" DESC, ""title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'release_year" DESC, "title', direction: 'ASC' } }) -->, one name: 42703 | one name per string: `order: [{ by: 'release_year', direction: 'DESC' }, { by: 'title', direction: 'ASC' }]` |
| A [`lock`](/select#lock), a [`truncate()`](/insert#truncate) option, an isolation level, or an `aggregate` that is not a function name | written into the SQL → throws before any query | a value the type takes; for the `aggregate`, a function name (`sum`, `my_schema.my_agg`) |
| [`update()`](/insert#update) with no column: `update('films', {}, …)` | 42601 from Postgres → throws when called: "nothing to update: an Updatable needs at least one column"<!-- message --> | nothing, unless you catch a `DatabaseError` there |

- Each change in the last column gives the same result under Zapatos 6.6.1, so you can make it before you switch; only the `jsonb` one finds its rows under pgcast alone.
- The text and values of `.compile()` change beyond these rows, where the rows returned don't: every `not()` gains a pair of parentheses, `(NOT ("release_year" = $2))`<!-- probe: db.conditions.not(db.conditions.eq(1974)).compile({ text: '', values: [0] }, undefined, 'release_year') --> where it was `(NOT "release_year" = $2)`, every operand of `and()` one too, `((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) --> where it was `(a AND b)`, and every `param()` filter value is sent as it is, `{ title: db.param('x', 'text') }` giving `CAST($2 AS "text")`<!-- probe: db.update('films', { tagline: 'x' }, { title: db.param('x', 'text') }) --> with `'x'` where it was `$2` with `{"value":"x","cast":"text"}`. Tests that snapshot SQL fail at [Read the warnings](#read-the-warnings): check the rows first, then update the snapshots.
- Every case of each fix: the [changelog](/changelog), § Fixed and § Security.

## Read the warnings

Run your tests, then your app. Where Zapatos 6.6.1 did something that code may rely on, pgcast keeps it, and warns once per process the first time a call does it:

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

To find the call, run with `--trace-deprecation`: Node prints the stack, and the first line below pgcast's own `dist/db/` frames is yours. A test runner's processes get it from `NODE_OPTIONS`:

```sh
NODE_OPTIONS=--trace-deprecation npm test
```

Each code warns once, so the stack shows only its first call: fix it, then run again, and the next call with the same code warns in turn. Fix the call, or turn on its option:

| Warning | The call | Fix it, or turn on |
|---|---|---|
| `PGCAST_DEP001` | a multi-row `upsert()` without [`updateColumns`](/insert#upsert-options), with a key missing from some rows: inserted as `DEFAULT`, it overwrites the existing value ([Rows with different keys](/insert#upsert-different-keys)) | give every row the key (`db.Default` keeps the SQL), or pass `updateColumns`; or [`upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), and such a call throws |
| `PGCAST_DEP002` | an `undefined` value in `insert()`, `update()` or `upsert()`, sent as `NULL` ([An `undefined` value](/insert#undefined-values)) | leave the key out, or give `null` to erase the column; or [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), and `undefined` is a missing key |
| `PGCAST_DEP003` | a [`transaction()`](/transaction#transaction) whose callback catches a query's error and returns: Postgres answers the `COMMIT` with `ROLLBACK`, and nothing is saved ([Let the error through](/retries#let-the-error-through)) | let the error out of the callback, or `ROLLBACK TO` a `SAVEPOINT` before going on; or [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), and such a transaction rejects |

## Turn on the opt-ins

Once a run shows no warning, or each one comes from a call you've checked, turn the options on, once, before the first query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ upsertRequiresSameKeys: true, undefinedMeansMissing: true, transactionRequiresCommit: true });
```

All three will be the default in 7.0 ([Versions, opt-ins and warnings](/versions)). With them on, an `undefined` value is left out of an `update()`:

<CastPanel example="switching_undefined">

<<< ./examples/switching_undefined.ts{ts twoslash}

</CastPanel>

- `insert()` sends `DEFAULT`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.insert('tags', { film_id: 1000, tag: undefined })) --> for an `undefined` value, and an `update()` with no other key throws "nothing to update: an Updatable needs at least one column"<!-- message -->.
- The `upsert()` of `PGCAST_DEP001` throws when called, before any query: "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.
- A `transaction()` whose `COMMIT` Postgres answers with `ROLLBACK` rejects, without a retry ([`transaction()`, Errors](/transaction#errors)).
- No option warns. To keep it that way, `NODE_OPTIONS=--throw-deprecation npm test` fails the run at the first warning.

One more opt-in has no warning to look for, and stays off in 7.0: [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), with which a `selectExactlyOne()` run on its own rejects on a second row, not only on none. Turn it on where your tests show no `selectExactlyOne()` matching two rows.

The generator has an opt-in of its own, [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), whose warning is a note from `npx zapatos`, not from your tests: it names each column whose type is an enum of another schema, and that enum, typed until then as `any`, or as the enum of the same name in the relation's schema. Turn it on in `zapatosconfig.json`, regenerate, and let `tsc` show the values the enum's labels refuse; it will be the default in 7.0.

## Go back

```sh
npm install zapatos@6.6.1
```

The generated files are the same, and each change of [Find the calls whose result changes](#find-the-calls-whose-result-changes) runs as it did, but the `jsonb` one, which finds nothing again. Remove the three options from `setConfig()` first: Zapatos 6.6.1's `Config` doesn't have them (2353). Zapatos 6.6.1 ignores `typeEnumsAcrossSchemas` in `zapatosconfig.json`, and generates the `any` types again.

::: warning Security
Code written or left as it is against pgcast's fixes gets Zapatos 6.6.1's results back: each row whose What to do is "nothing", the `not()` row and the `jsonb` row. `db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` deletes 11 roles under pgcast, and all 12 under Zapatos 6.6.1. The holes of [6.6.2's § Security](/changelog#6.6.2-security) are open again: a name, a `lock`, an `aggregate`, a plain value in `updateValues` or a `param()` cast can splice SQL ([The security model](/security)).
:::

## See also

- [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings): each option, its warning and its message.
- [Versions, opt-ins and warnings](/versions): why pgcast fixes some things outright and others behind an option.
- [The security model](/security): why a name or a `raw()` value can no longer splice SQL.

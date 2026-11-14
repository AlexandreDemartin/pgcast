# Switch from Zapatos

Move a project from Zapatos 6.6.1 to pgcast: change one line of `package.json`, regenerate, then let `tsc`, a look through your code and pgcast's warnings show you the few calls whose result changes. It assumes a project that already runs on Zapatos; for a new one, start at [Install](/install).
{.lede}

<AtAGlance>

- One line of `package.json` swaps the package; imports, config and generated files stay as they are.
- A few calls give other rows, or throw: [step 4](#find-the-calls-whose-result-changes) lists them, with what to do.
- What code may rely on is kept, with a warning, until you turn on its opt-in.

</AtAGlance>

## What stays the same

- The module names: `zapatos/db`, `zapatos/schema`, `zapatos/custom` and `zapatos/generate`. No import changes ([decision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
- The generator: `zapatosconfig.json` and its options, and `npx zapatos`, now also `npx pgcast` ([The CLI](/generator#cli)).
- Your placeholders in `zapatos/custom/`: written once, never overwritten.
- A `Config` written for Zapatos 6.6.1: the keys pgcast adds are optional ([`Config`](/runtime-config#Config)).
- The schema's version canary, so a schema that Zapatos 6.6.1 generated compiles as it is ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)).

## 1. Swap the package {#swap-the-package}

Install pgcast under the name Zapatos had:

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6
```

:::

- `package.json` now reads `"zapatos": "npm:@pgcast/pgcast@^…"`, and `node_modules/zapatos` holds pgcast.
- Nothing else to add: pgcast's peer dependencies are Zapatos 6.6.1's, `pg`, `@types/pg` and TypeScript 4.1 or later.
- Not as plain `@pgcast/pgcast`: your `zapatos/*` imports would no longer resolve ([Install](/install#add-the-package), § Why the alias).

## 2. Regenerate the schema {#regenerate-the-schema}

```sh
npx zapatos
```

pgcast's generator is Zapatos 6.6.1's, with two fixes to what it writes. A `git diff` on your `zapatos/` folder shows nothing, unless:

- a column comment runs over several lines: each line now starts with ` * `;
- a table has a plain index named like another schema's unique index: its `UniqueIndex` no longer borrows that name.

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

## 4. Find the calls whose result changes {#find-the-calls-whose-result-changes}

pgcast fixes, with no option to turn on, what no code could rely on in Zapatos 6.6.1: a call that Postgres or the type refused, that did the opposite of its name, or that let a string splice SQL. A few such calls did run, and now give other rows, or throw.

Look through your code for the first column of each table below. Each change in What to do gives the same result under Zapatos 6.6.1, so you can make it before you switch; only the `jsonb` one finds its rows under pgcast alone.

### Conditions

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| [`not()`](/conditions#conditions.not) of a fragment with a bare `OR` or `AND`: on `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, so the 1991 film too | `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | for the old rows, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/conditions#conditions.and) of a fragment with a bare `OR` and another operand: `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, so film 1000 too | `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | for the old rows, one fragment: `` db.sql`${'id'} = 1000 OR (${'id'} = 1001 AND ${'studio_id'} = ${db.param(1001)})` `` |

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
| `db.raw()`, `db.cols()` or `db.vals()` as a filter value, a condition's, or in a `vals([…])` of a fragment value: `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | sent as JSON, `{"value":"'Cy'"}` stored | refused by `tsc` as a filter value, and throws while compiling | in a filter, a `sql` fragment value ([Compile](#compile)); in a written value, `raw()` in the fragment itself: `` db.sql`${db.raw("'Cy'")}` `` |
| `db.parent()`, `db.raw()`, `db.cols()` or `db.vals()` as a value of `insert()`, `update()` or `upsert()` where the type took it: on a column typed `any`, as a `zapatos/custom` placeholder left as generated is (`{ c: db.parent('id') }`), or in a `vals({…})` of a query you write, `` db.sql`INSERT INTO films (…) VALUES (${db.vals({ …, tagline: db.raw("upper('x')") })})` `` | sent as JSON, `'{"value":…}'` stored | throws before any query | in a write, the value itself, or for SQL a `sql` fragment value, `` db.sql`upper(${db.param('x')})` `` |
| `db.parent()` with no column in a `vals({…})` of a `lateral` subquery: `` db.sql`SELECT ${db.vals({ name: db.parent() })}` `` | `'{}'` | the parent's column of its key ([`parent()`](/sql-template#parent)) | nothing |

</div>

### `updateValues` and an empty `update()`

<div class="stack">

| Your code | Zapatos 6.6.1 | pgcast | What to do |
|---|---|---|---|
| A plain value in [`upsert()`](/insert#upsert-options) `updateValues`: a string, `{ tagline: 'films.title' }`, or an object | a column name, `ROW("films"."title")`, or for an object a condition of its keys (`TRUE` with none) | a parameter, the value itself | for the old result, a fragment: `` db.sql`${'films'}.${'title'}` `` |
| [`update()`](/insert#update) with no column: `update('films', {}, …)` | 42601 from Postgres | throws when called: "nothing to update: an Updatable needs at least one column"<!-- message --> | nothing, unless you catch a `DatabaseError` there |

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

Run your tests, then your app. Where Zapatos 6.6.1 did something that code may rely on, pgcast keeps it, and warns once per process the first time a call does it:

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL, or, in upsert() updateValues, set from EXCLUDED. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
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
| `PGCAST_DEP001` | a multi-row `upsert()` without [`updateColumns`](/insert#upsert-options), with a key missing from some rows: inserted as `DEFAULT`, it overwrites the existing value ([Rows with different keys](/insert#upsert-different-keys)) | give every row the key (`db.Default` keeps the SQL), or pass `updateColumns`; or [`upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), and such a call throws |
| `PGCAST_DEP002` | an `undefined` value in `insert()`, `update()` or `upsert()`, sent as `NULL`, or in `upsert()` `updateValues`, set from `EXCLUDED` ([An `undefined` value](/insert#undefined-values)) | leave the key out, or give `null` to erase the column; or [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), and `undefined` is a missing key |
| `PGCAST_DEP003` | a [`transaction()`](/transaction#transaction) whose callback catches a query's error and returns: Postgres answers the `COMMIT` with `ROLLBACK`, and nothing is saved ([Let the error through](/retries#let-the-error-through)) | let the error out of the callback, or `ROLLBACK TO` a `SAVEPOINT` before going on; or [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), and such a transaction rejects |
| `PGCAST_DEP004` | a [`sum()`, `avg()`, `min()` or `max()`](/select#typed-by-column) whose result `Number()` changes: `0` for no row, a date's milliseconds, `NaN` for a text | turn on [`aggregatesTypedByColumn`](/runtime-config#Config.aggregatesTypedByColumn), declared in [`ConfigTypes`](/runtime-config#ConfigTypes): `tsc` then shows each call whose result is now `null` or the column's type, and `?? 0` keeps a `0` |
| `PGCAST_DEP005` | a [`transaction()`](/transaction#transaction) given a client you sent `BEGIN` on: its `COMMIT` or `ROLLBACK` ends your transaction ([Your own `BEGIN`](/transaction#your-own-begin)) | open the outer transaction with `transaction()`, or give it the pool; or [`transactionRequiresIdleClient`](/runtime-config#Config.transactionRequiresIdleClient), and such a call rejects before sending its `START TRANSACTION` |

</div>

## 6. Turn on the opt-ins {#turn-on-the-opt-ins}

Once a run shows no warning, or each one comes from a call you've checked, turn the options on, once, before the first query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  upsertRequiresSameKeys: true, undefinedMeansMissing: true,
  transactionRequiresCommit: true, transactionRequiresIdleClient: true,
});
```

All four will be the default in 7.0 ([Versions](/versions)). With them on, an `undefined` value is left out of an `update()`:

<CastPanel example="switching_undefined">

<<< ./examples/switching_undefined.ts{ts twoslash}

</CastPanel>

- `insert()` sends `DEFAULT`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.insert('tags', { film_id: 1000, tag: undefined })) --> for an `undefined` value, and an `update()` with no other key throws "nothing to update: an Updatable needs at least one column"<!-- message -->.
- The `upsert()` of `PGCAST_DEP001` throws when called, before any query: "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.
- A `transaction()` whose `COMMIT` Postgres answers with `ROLLBACK` rejects, without a retry ([`transaction()`, Errors](/transaction#errors)).
- A `transaction()` given a client already inside a transaction block rejects, and leaves that transaction open ([Your own `BEGIN`](/transaction#your-own-begin)).
- No option warns. To keep it that way, `NODE_OPTIONS=--throw-deprecation npm test` fails the run at the first warning.

One more opt-in, [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), has no warning to look for, and stays off in 7.0. With it, a `selectExactlyOne()` run on its own rejects on a second row, not only on none. Turn it on where your tests show no `selectExactlyOne()` matching two rows.

The generator has two opt-ins of its own, both to be the default in 7.0. Their warning is a note from `npx zapatos`, not your tests.

The note of [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas) names each column whose type is an enum of another schema, and that enum, typed until then as `any` or as the enum of the same name in the relation's schema:

1. Turn it on in `zapatosconfig.json`.
2. Delete the `zapatos/custom/` placeholder of a domain over such an enum: the generator never overwrites one, so the domain would keep the placeholder it already has, typed the old way. The new one gets the labels.
3. Regenerate, and let `tsc` show the values the enum's labels refuse.

The note of [`enumOrder`](/generator#generate.enumOrder) names each enum whose labels the generator sorts, though Postgres declares them in another order. Set it to `"declared"` and regenerate: for TypeScript, only `every.<name>` changes, so the code to read is the code that takes a label from it by index or compares it with a tuple.

## Go back

```sh
npm install zapatos@6.6.1
```

- First, remove from `setConfig()` the options Zapatos 6.6.1's `Config` doesn't have (2353): `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `transactionRequiresIdleClient`, `selectExactlyOneChecksForSecondRow` and `aggregatesTypedByColumn`.
- On [`moduleNames`](/generator#generate.moduleNames) `"pgcast"`, run `npm uninstall pgcast` too: both packages have a `zapatos` command. Your `pgcast/…` imports then no longer resolve, and 6.6.1 writes `zapatos/` but leaves `pgcast/` behind. So change each import back to `zapatos/…`, move the placeholders you edited to `zapatos/custom/`, their `declare module 'pgcast/custom'` renamed `'zapatos/custom'`, and delete `pgcast/`.
- Regenerate with Zapatos 6.6.1. It ignores `typeEnumsAcrossSchemas`, `enumOrder` and `moduleNames` in `zapatosconfig.json`, and writes again the `any` types, the sorted labels, the unprefixed comment lines and any borrowed `UniqueIndex` name.
- Each change of [Find the calls whose result changes](#find-the-calls-whose-result-changes) runs as it did, but the `jsonb` one, which finds nothing again.

::: warning Security
Code written or left as it is against pgcast's fixes gets Zapatos 6.6.1's results back: each row whose What to do is "nothing", the `not()` row and the `jsonb` row.

`db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` deletes 11 roles under pgcast, and all 12 under Zapatos 6.6.1.

The holes of [6.6.2's § Security](/changelog#6.6.2-security) are open again: a name, a `lock`, an `aggregate`, a plain value in `updateValues` or a `param()` cast can splice SQL ([Security](/security)).
:::

## See also

- [Opt-ins and warnings](/runtime-config#opt-ins-and-warnings): each option, its warning and its message.
- [Versions](/versions): why pgcast fixes some things outright and others behind an option.
- [Security](/security): why a name or a `raw()` value can no longer splice SQL.

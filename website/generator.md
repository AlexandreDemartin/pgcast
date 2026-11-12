# The generator: config and CLI

The generator reads your database's catalog and writes the types of `zapatos/schema`. This page lists how to run it, from the command line or from code, every option of `zapatosconfig.json` and `generate()`, and the files it writes.
{.lede}

## The CLI {#cli}

```sh
npx pgcast [config]
npx zapatos [config]
```

The same program under two names: `pgcast`, and `zapatos`, as in Zapatos 6.6.1. It reads the config, then runs [`generate()`](#generate) with it.

- `zapatosconfig.json`: read from the folder you run it in, if it is there; never from a parent folder. Without it, the config is `{}`.
- `config`: one optional argument, a JSON object, merged over the file key by key: `npx pgcast '{"outDir": "./generated"}'` keeps the file's `db` and replaces its `outDir`. A key given here replaces the file's whole value, so `'{"db": {"application_name": "codegen"}}'` drops the file's `connectionString`.
  The file's variables are filled in before the merge: one it names must be set even when the argument replaces its key, or the CLI stops with `Environment variable 'NAME' is not set`.
- Each string in both, at any depth, has its environment variables filled in ([Environment variables](#environment-variables)).
- There are no flags: `--help` is read as the JSON argument, and fails. Any argument after the first is ignored.
- Paths are relative to the folder you run it in: `outDir`, and so the `zapatos` folder.

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src",
  "schemas": { "public": { "include": "*", "exclude": ["seat_bookings"] } }
}
```

:::

A config it can't read stops it before any query, with code 1, Node printing the error and its stack. The error starts with what it was reading:

- the file: `If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist:`
- the argument: `If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist:`

Then it ends with the cause:

| Cause | Ending |
|---|---|
| not valid JSON | `JSON.parse`'s message, which depends on the input and on Node: on Node 22, `Unexpected end of JSON input` for an empty file, `No number after minus sign in JSON at position 1 (line 1 column 2)` for `--help`, `Expected double-quoted property name in JSON at position 15 (line 1 column 16)` for a trailing comma |
| a variable is not set | `Environment variable 'DATABASE_URL' is not set` |

A query that fails, the connection included, also ends it with code 1, as [`generate()`](#generate) says.

### Environment variables {#environment-variables}

<code v-pre>{{NAME}}</code> in a string of the config is replaced by `process.env.NAME`, before anything else runs.

- Anywhere in a string, several per string: <code v-pre>"postgresql://{{PGUSER}}@localhost/films"</code>.
- Spaces inside the braces are allowed: <code v-pre>{{ DATABASE_URL }}</code>.
- In values only, at any depth of objects and arrays; never in keys: <code v-pre>"schemas": { "{{SCHEMA}}": … }</code> is a schema named <code v-pre>{{SCHEMA}}</code>. Numbers and booleans pass through.
- A variable set to the empty string counts as set, and gives `""`.
- Only the CLI does this, for the file and for its argument. [`generate()`](#generate) takes its config as it is: read `process.env` yourself.

## `generate()` {#generate}

```ts
import { generate, type Config } from 'zapatos/generate';

generate(config: Config): Promise<void>
```

Reads the catalog of `config.db` and writes the [files](#the-files-it-writes) under `config.outDir`. `config` takes the [options](#options) of `zapatosconfig.json`, and also functions where the JSON takes `true` or a name: the three listeners and `customTypesTransform`.

```ts twoslash
import { generate } from 'zapatos/generate';
// ---cut---
await generate({
  db: { connectionString: process.env.DATABASE_URL },
  outDir: './src',
  progressListener: line => console.log(`[types] ${line}`),
  customTypesTransform: name => `Db_${name}`,
});
```

- It opens a `pg.Pool` of its own on `config.db`, and ends it before resolving.
- It sends only `SELECT`s, on `information_schema` and `pg_catalog`: one for the relations of each schema, one for its enums, then two per relation, its columns and its unique indexes.
- A query that fails, the connection included, prints `*** error <n> ***` and the error with `console.log`, then ends the process with `process.exit(1)`, as in Zapatos 6.6.1 ([#183](https://github.com/AlexandreDemartin/pgcast/issues/183)). On a failed query the promise never settles, so a `try`/`catch` around it does not run. Other errors reject it: a write that fails (`ENOTDIR: not a directory, mkdir 'afile/zapatos'` when `outDir` is a file), a malformed [rule](#generate.schemas).
- At run time, a key it doesn't know is ignored: an old `srcMode`, a misspelt `outdir`. In TypeScript, an object literal with one fails to compile (TS2353, or TS2561 with a suggestion for a near-miss such as `outdir`).
- `zapatos/generate` also exports `Config` and the functions `generate()` is built from (`tsForConfig()`, `definitionForRelationInSchema()` and others), with no entry here.

## Options {#options}

Every option is optional. Each one given replaces its default whole: `schemas` without `public` leaves `public` out.

| Option | Default | What it sets |
|---|---|---|
| [`db`](#generate.db) | none: `pg`'s own defaults | the connection |
| [`outDir`](#generate.outDir) | `"."` | where the `zapatos` folder goes |
| [`outExt`](#generate.outExt) | `".d.ts"` | the extension of every file written |
| [`schemas`](#generate.schemas) | `{ "public": { "include": "*", "exclude": [] } }` | the schemas, and the relations of each |
| [`unprefixedSchema`](#generate.unprefixedSchema) | `"public"` | the schema whose names need no prefix |
| [`columnOptions`](#generate.columnOptions) | `{}` | columns left out of `Insertable` and `Updatable`, or optional |
| [`customTypesTransform`](#generate.customTypesTransform) | `"PgMy_type"` | the names of custom types |
| [`schemaJSDoc`](#generate.schemaJSDoc) | `true` | a JSDoc comment on each relation and column |
| [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers) | `false` | the `JSONSelectable` type of `bigint` and `numeric` |
| [`progressListener`](#generate.progressListener) | `false` | where each step is reported |
| [`warningListener`](#generate.warningListener) | `true` | where warnings go |
| [`debugListener`](#generate.debugListener) | `false` | where each query and its result go |

### `db` {#generate.db}

`pg.ClientConfig`: what you'd give `new pg.Pool()`, a `connectionString` or `host`, `user`, `database` and the rest. Without it, `pg` takes its defaults and the `PGHOST`, `PGUSER`, `PGDATABASE`… environment variables.

### `outDir` {#generate.outDir}

`string`, default `"."`. The folder that receives the `zapatos` folder, created if needed: `"./src"` writes `src/zapatos/schema.d.ts`. Relative to the current folder.

### `outExt` {#generate.outExt}

`string`, default `".d.ts"`. The extension of every file written, the placeholders included: `".ts"` writes `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Only the names change; the content is the same `declare module` text. With `".ts"`, the generator skips the check for the [old layout](#the-old-layout-warning).

### `schemas` {#generate.schemas}

`{ [schema]: { include, exclude } }`, each of `include` and `exclude` `"*"` or an array of relation names. The schemas to generate, and which relations of each: tables, views, materialised views and foreign tables.

Both keys are required. In `generate()`, a rule without one fails to compile (TS2741); in the JSON, the CLI stops with `TypeError: Cannot read properties of undefined (reading 'indexOf')` ([#45](https://github.com/AlexandreDemartin/pgcast/issues/45)).

| Rule | Generates |
|---|---|
| `{ "include": "*", "exclude": [] }` | every relation of the schema |
| `{ "include": ["films", "studios"], "exclude": [] }` | `films` and `studios` |
| `{ "include": "*", "exclude": ["seat_bookings"] }` | all but `seat_bookings` |
| `{ "include": ["films", "studios"], "exclude": ["studios"] }` | `films`: `exclude` wins |
| `{ "include": "*", "exclude": "*" }` | no relation; the schema's enums, still |

- Names match exactly, case included. A name the schema doesn't have is ignored, with no error ([#45](https://github.com/AlexandreDemartin/pgcast/issues/45)); a schema the database doesn't have gives an empty namespace.
- The schema's enums are always generated, whatever `include` and `exclude` say.
- The relations of a schema other than [`unprefixedSchema`](#generate.unprefixedSchema) are in its namespace: `archive.screenings`, its `Table` type `'archive.screenings'`.
- A schema, relation or enum whose name is not a TypeScript identifier (`"box office"`) is written as it is, and `schema.d.ts` does not compile (TS1005) ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)). A column's name is quoted, and works.

### `unprefixedSchema` {#generate.unprefixedSchema}

`string | null`, default `"public"`. The schema whose relations are named without their schema: `films`, its `Table` type `'films'`, so `db.select('films', …)` and `"films"` in the SQL, which Postgres finds through its `search_path`.

- `null`: every relation is prefixed, `public.films` its namespace and `'public.films'` its `Table` type.
- Set it to `null` when a schema has the name of a relation of `public`: a schema `films` beside the table `films` makes two `films` namespaces, which TypeScript merges, and `schema.d.ts` fails with TS2300, `Duplicate identifier 'Table'`.
- A schema missing from [`schemas`](#generate.schemas) is allowed: every schema is then prefixed.

### `columnOptions` {#generate.columnOptions}

`{ [table]: { [column]: { insert?, update? } } }`. Changes the `Insertable` and `Updatable` types of a column, as a trigger that fills it would need; nothing else changes, at run time neither.

::: code-group

```json [zapatosconfig.json]
{
  "columnOptions": {
    "*": { "booked_at": { "insert": "excluded", "update": "excluded" } },
    "films": { "tagline": { "insert": "excluded", "update": "excluded" } }
  }
}
```

:::

| Option | Effect on the type |
|---|---|
| `"insert": "auto"`, `"update": "auto"` | none: what the catalog says, the defaults |
| `"insert": "excluded"` | the key leaves `Insertable`: `db.insert('films', { …, tagline: 'x' })` fails to compile (TS2769) |
| `"insert": "optional"` | the key is optional in `Insertable`, its type unchanged: `title?: string \| db.Parameter<string> \| db.SQLFragment` |
| `"update": "excluded"` | the key leaves `Updatable`: `db.update('seat_bookings', { booked_at: … }, …)` fails to compile (TS2353) |

- The table is named as its `Table` type names it: `films`, `archive.screenings`, and `public.films` when [`unprefixedSchema`](#generate.unprefixedSchema) is `null`. `"films"` applies to `public.films` only.
- `"*"` is every table of every schema. It is the whole key only, never part of a name, and not for columns.
- A table's own entry for a column replaces the `"*"` entry for that column, as a whole: with `"*": { "booked_at": { "insert": "excluded", "update": "excluded" } }` and `"seat_bookings": { "booked_at": { "update": "excluded" } }`, `booked_at` is back in `seat_bookings.Insertable`.
- A table with every column excluded gets `[key: string]: never`, as a view that cannot be written to.
- Another value, or a misspelt key, is ignored: the column stays `auto`.

### `customTypesTransform` {#generate.customTypesTransform}

`"PgMy_type" | "my_type" | "PgMyType"`, or in `generate()` a function `(name: string) => string`; default `"PgMy_type"`. The TypeScript name of each type the generator leaves to you: a domain, or a type it can't map, such as `point`. Each one gets a [placeholder](#the-files-it-writes), and the column the type `c.<name>`.

| Value | `seat_label` | `point` | `point[]` |
|---|---|---|---|
| `"PgMy_type"` | `PgSeat_label` | `PgPoint` | `Pg_point` |
| `"my_type"` | `seat_label` | `point` | `_point` |
| `"PgMyType"` | `PgSeatLabel` | `PgPoint` | `Pg_Point` |
| `name => 'Db_' + name` | `Db_seat_label` | `Db_point` | `Db__point` |

- The function gets the domain's name, or Postgres's name for the type, `_point` for an array of `point`.
- An array of a domain or of such a type is a custom type of its own.
- The names are not qualified by schema: the `c` namespace is flat across schemas, so a domain `notes` in `public` and one in `archive` are both `PgNotes`, with one placeholder for the two ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)).

### `schemaJSDoc` {#generate.schemaJSDoc}

`boolean`, default `true`. A JSDoc comment on each relation (its name and kind) and on each column of every interface: its name, its `COMMENT ON COLUMN` if it has one, its Postgres type, then a last line on how it is written. Your editor shows it on hover:

```ts
/**
* **roles.billing**
*
* Position in the credits: 1 is top billing
* - `int4` in database
* - `NOT NULL`, no default
*/
billing: number;
```

- The type line names a domain with its base type: `` `seat_label` (base type: `text`) in database ``.
- The last line is `NOT NULL` or `Nullable` and the default (`` default: `nextval(…)` ``, `no default`, or `identity column` for `GENERATED BY DEFAULT AS IDENTITY`); `Generated column` for a generated or `GENERATED ALWAYS AS IDENTITY` column; `Materialized view column` for one of a materialised view.
- Only the columns of tables and materialised views carry their comment today: a comment on a column of a view, a foreign table or a partitioned table never reaches the JSDoc ([#47](https://github.com/AlexandreDemartin/pgcast/issues/47)).
- A comment holding `*/` ends the JSDoc early, and `schema.d.ts` does not compile (TS1131) ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)).

`false` writes none, so `schema.d.ts` is shorter.

### `customJSONParsingForLargeNumbers` {#generate.customJSONParsingForLargeNumbers}

`boolean`, default `false`. The `JSONSelectable` type of a `bigint` (`int8`) or `numeric` column, for a project that parses JSON with [`enableCustomJSONParsingForLargeNumbers()`](/runtime-config#enableCustomJSONParsingForLargeNumbers):

| Column | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- The other interfaces don't change: `Selectable` is `db.Int8String` or `db.NumericString` either way.
- `true` also silences the warning such a column gives: "Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…".

### `progressListener` {#generate.progressListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `false`. `true` prints each step with `console.log`; a function gets each line.

```txt
(Re)creating schema folder: src/zapatos/schema.d.ts
Writing generated schema: src/zapatos/schema.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgPoint.d.ts
Custom type or domain declaration file already exists: src/zapatos/custom/PgSeat_label.d.ts
Writing custom types file: src/zapatos/custom/index.d.ts
```

### `warningListener` {#generate.warningListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `true`, with `console.log`. `false` silences:

- `Writing new custom type or domain placeholder file: src/zapatos/custom/PgPoint.d.ts`, once per new placeholder;
- the note on `bigint` and `numeric` columns, once per process ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers));
- the [old layout warning](#the-old-layout-warning).

### `debugListener` {#generate.debugListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `false`. Gets each query the generator sends, `>>> query <n> >>>`, its text and its values, then its result as `pg` returns it, as JSON, `<<< result <n> <<<`.

## The files it writes {#the-files-it-writes}

```txt
src/zapatos/
├── schema.d.ts            written again on each run
└── custom/
    ├── index.d.ts         written again on each run
    ├── PgPoint.d.ts       written once, if it is not there
    └── PgSeat_label.d.ts  written once, if it is not there
```

| File | Written | Holds |
|---|---|---|
| `schema.d.ts` | on each run | `declare module 'zapatos/schema'`: a namespace per relation, its `Table`, `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`, `UniqueIndex`, `Column` and `SQL`; the enums; the unions and `*ForTable<T>` lookups; the version canary |
| `custom/index.d.ts` | on each run, when there is a custom type | an empty `declare module 'zapatos/custom'` |
| `custom/<Name>.d.ts` | once: never overwritten | a placeholder, `export type PgSeat_label = string;`, yours to edit |

- A placeholder holds the `Selectable` type of the domain's base type: `string` for `seat_label`, a `text`; `Date` for a `date` domain; `db.JSONValue` for a `json` or `jsonb` one, with its `import type * as db from 'zapatos/db'`. A type the generator can't map (`point`) gets `any`. How to fill one in: [Use custom types and domains](/custom-types).
- A base type mapped to another `db.*` type (`int8`, `numeric`, `time`, ranges…) gives a placeholder that does not compile until you edit it: `export type PgTicket_no = db.Int8String;` comes with no import, and `tsc` fails with TS2503, `Cannot find namespace 'db'` ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)). Add `import type * as db from 'zapatos/db';` above it. A domain over an enum is the same: `export type PgGenre_d = genre;` fails with TS2304 until you add `import type { genre } from 'zapatos/schema';`.
- Nothing is deleted: a placeholder whose type is gone stays, and so does `custom/` once there is no custom type left.
- `schema.d.ts` declares `schemaVersionCanary`, `version: 104`. A `zapatos/db` that expects another version fails to compile there: generate again ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)).
- Each file is a `declare module` of the `zapatos/*` names, so your `tsconfig.json` must include it: `"include": ["src"]`, with `outDir` `"./src"`.

### The old layout warning {#the-old-layout-warning}

Zapatos before 3.0 copied its source into yours. After writing, when `outExt` is not `".ts"`, the generator looks for that layout: `zapatos/schema.ts`, a `zapatos/src` folder, or a file under `zapatos/custom` that does not end in `.d.ts`. If it finds one, it warns, through [`warningListener`](#generate.warningListener), with the steps to convert:

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

So moving from `outExt: ".ts"` back to `".d.ts"` warns too, until you delete the `.ts` files.

Why the types look as they do, a `timestamptz` a `Date` in `Selectable` and a string in `JSONSelectable`: [How types are cast from the catalog](/catalog-types).

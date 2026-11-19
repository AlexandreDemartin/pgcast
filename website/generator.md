# Generator

The generator reads your database's catalog and writes the types of `zapatos/schema`. This page lists how to run it, from the command line or from code, every option of its config file and `generate()`, the files it writes, and how to type several databases.
{.lede}

## The CLI {#cli}

```sh
npx pgcast [--check] [config]
npx zapatos [--check] [config]
npx pgcast --help
```

The same program under two names: `pgcast`, and `zapatos`, as in Zapatos 6.6.1. It reads the config, then runs [`generate()`](#generate) with it, or with [`--check`](#check) compares what it would write with your files.

- The config file: read from the folder you run it in, if it is there; never from a parent folder. Without one, the config is `{}`.
  - `zapatosconfig.json`, as in Zapatos 6.6.1.
  - `pgcastconfig.json`, from 6.7.0, read first: with both there, only `pgcastconfig.json` is read, and the CLI notes it through [`warningListener`](#generate.warningListener) before generating.
- `config`: one optional argument, a JSON object, merged over the file key by key: `npx pgcast '{"outDir": "./generated"}'` keeps the file's `db` and replaces its `outDir`.
  - A key given here replaces the file's whole value, so `'{"db": {"application_name": "codegen"}}'` drops the file's `connectionString`.
  - The file's variables are filled in before the merge: one it names must be set even when the argument replaces its key, or the CLI stops with `Environment variable 'NAME' is not set`.
- Each string in both, at any depth, has its environment variables filled in ([Environment variables](#environment-variables)).
- From 6.8.0, one flag, `--check`, before or after `config`. From 6.12.0, `--help` or `-h` in `config`'s place prints the usage, which names the config files, `config`, the flags and this page, and exits with code 0, before it reads the config.
- From 6.12.0, the CLI skips a bare `--` before or after `config`, without a note. For example, `pgcast -- --help` prints the usage.
- An unrecognised flag starting with `--` in `config`'s place stops it with code 1 before it reads the config. From 6.12.0, it prints `Unknown flag --chek: the flags are --check, --help and -h` and the usage, on stderr; from 6.8.0, Node printed `Unknown flag --chek: the only flag is --check, beside the JSON argument` and its stack. Zapatos 6.6.1 read each of these, `-h` too, as the JSON argument, which failed.
- After `config`, the CLI ignores unrecognised `--` flags and `--help`, as in Zapatos 6.6.1. It emits a [note](#generate.warningListener) for each. A misspelt `npx pgcast '{}' --chek` generates.
- Of the other arguments, the first is `config`; any later one is ignored.
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

- the file, by its name: `If present, zapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist:` (or `pgcastconfig.json`)
- the argument: `If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist:`

Then it ends with the cause:

| Cause | Ending |
|---|---|
| not valid JSON | `JSON.parse`'s message, which depends on the input and on Node: on Node 22, `Unexpected end of JSON input` for an empty file, `No number after minus sign in JSON at position 1 (line 1 column 2)` for `-x`, `Expected double-quoted property name in JSON at position 15 (line 1 column 16)` for a trailing comma |
| a variable is not set | `Environment variable 'DATABASE_URL' is not set` |

If a connection or query fails, the CLI prints `*** error <n> ***` and the error to stdout, then exits with code 1. Both CLI names set [`rejectOnQueryError`](#generate.rejectOnQueryError) to `false` over the config file and the JSON argument, including with `--check`.

### Environment variables {#environment-variables}

<code v-pre>{{NAME}}</code> in a string of the config is replaced by `process.env.NAME`, before anything else runs.

- Anywhere in a string, several per string: <code v-pre>"postgresql://{{PGUSER}}@localhost/films"</code>.
- Spaces inside the braces are allowed: <code v-pre>{{ DATABASE_URL }}</code>.
- In values only, at any depth of objects and arrays; never in keys: <code v-pre>"schemas": { "{{SCHEMA}}": … }</code> is a schema named <code v-pre>{{SCHEMA}}</code>. Numbers and booleans pass through.
- A variable set to the empty string counts as set, and gives `""`.
- Only the CLI does this, for the file and for its argument. [`generate()`](#generate) takes its config as it is: read `process.env` yourself.

### `--check` {#check}

```sh
npx pgcast --check
```

From 6.8.0. It reads the catalog as a run does, builds the files in memory, and compares them with yours. It writes nothing, not even a folder: for CI, after your migrations, or before you call a change done.

| Exit | When | It prints |
|---|---|---|
| 0 | every file matches | `The generated files in src/zapatos are up to date.` |
| 1 | a file differs or is missing | a line per file, then how to write them |

```txt
Out of date: src/zapatos/schema.d.ts
Missing: src/zapatos/custom/PgSeat_label.d.ts
Run the generator without --check to write them.
```

- `schema.d.ts` and, when there is a custom type, `custom/index.d.ts`, which each run then writes again, are compared byte for byte. A placeholder counts only when it is missing: it is yours to edit ([The files it writes](#the-files-it-writes)).
- `outDir`, `outExt` and [`moduleNames`](#generate.moduleNames) name the files, as for a run: `src/pgcast/schema.ts` with `".ts"` and `"pgcast"`.
- The notes of a run come first, through [`warningListener`](#generate.warningListener), but for the placeholders it would write. A failed query ends it with code 1, as it ends a run.

### `check()` {#export-check}

`check()`, from `zapatos/generate`, runs the same check from code, for a script that builds its config there:

```ts
import { check, type Config } from 'zapatos/generate';

check(config: Config): Promise<boolean>
```

```ts twoslash
import { check } from 'zapatos/generate';
// ---cut---
const upToDate = await check({
  db: { connectionString: process.env.DATABASE_URL },
  outDir: './src',
});
if (!upToDate) process.exitCode = 1;
```

- It takes the config of [`generate()`](#generate), and resolves to `true` when every file matches. The exit code is yours to set.
- It reports file comparisons only through the listeners: a line per file that differs or is missing through [`warningListener`](#generate.warningListener), so with `console.log` by default; `The generated files in src/zapatos are up to date.` through [`progressListener`](#generate.progressListener). Not the CLI's last line, `Run the generator without --check to write them.`
- A failed query rejects the promise with the original error. Set [`rejectOnQueryError: false`](#generate.rejectOnQueryError) to print it and exit with code 1.

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
- It sends only `SELECT`s, on `information_schema` and `pg_catalog`: one for the relations of each schema, one for its enums, then two per relation, its columns and its unique indexes, and one for the enums of each other schema a column's type comes from (`pg_catalog` included).
- A connection or query error rejects the promise before any files are written. You can catch the original `pg` error or set [`rejectOnQueryError: false`](#generate.rejectOnQueryError) to keep the 6.x exit.
- Other errors reject it: a write that fails (`ENOTDIR: not a directory, mkdir 'afile/zapatos'` when `outDir` is a file), a malformed [rule](#generate.schemas).
- At run time, a key it doesn't know is ignored: an old `srcMode`, a misspelt `outdir`. In TypeScript, an object literal with one fails to compile (TS2353, or TS2561 with a suggestion for a near-miss such as `outdir`).
- `zapatos/generate` also exports `Config` and the functions `generate()` is built from (`tsForConfig()`, `definitionForRelationInSchema()` and others). `definitionForRelationInSchema()` fills the `columnsTypedByEnumName` array only with `typeEnumsAcrossSchemas: false`.

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
| [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) | `true` | the type of an enum of another schema |
| [`enumOrder`](#generate.enumOrder) | `"declared"` | the order of an enum's labels |
| [`moduleNames`](#generate.moduleNames) | `"zapatos"` | the module names the files declare and import, and their folder |
| [`rejectOnQueryError`](#generate.rejectOnQueryError) | `true` | whether a failed query rejects, or ends the process |
| [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly) | `false` | the names in each relation's `UniqueIndex` |
| [`domainsTypedByContext`](#generate.domainsTypedByContext) | `false` | the type of a domain over `bigint`, `numeric`, `bytea`, `money` or a date, or over an array of one, outside `Selectable`, and of a domain over a domain or an array of a domain |
| [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) | none: an array, with a note | the `Selectable` type of an array of an enum |
| [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) | none: the text, with a note | the type of an `interval` in `Selectable` and in a write |
| [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions) | `false` | the type of a domain over `text` whose `CHECK` lists its values |
| [`progressListener`](#generate.progressListener) | `false` | where each step is reported |
| [`warningListener`](#generate.warningListener) | `true` | where warnings go |
| [`debugListener`](#generate.debugListener) | `false` | where each query and its result go |

### `db` {#generate.db}

`pg.ClientConfig`: what you'd give `new pg.Pool()`, a `connectionString` or `host`, `user`, `database` and the rest. Without it, `pg` takes its defaults and the `PGHOST`, `PGUSER`, `PGDATABASE`… environment variables.

### `outDir` {#generate.outDir}

`string`, default `"."`. The folder that receives the `zapatos` folder, created if needed: `"./src"` writes `src/zapatos/schema.d.ts`. Relative to the current folder. With [`moduleNames`](#generate.moduleNames) `"pgcast"`, the folder is `pgcast`.

### `outExt` {#generate.outExt}

`string`, default `".d.ts"`. The extension of every file written, the placeholders included: `".ts"` writes `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Only the names change; the content is the same `declare module` text. With `".ts"`, the generator skips the check for the [old layout](#the-old-layout-warning).

### `schemas` {#generate.schemas}

[`SchemaRules`](#SchemaRules), `{ [schema]: { include, exclude } }`, each of `include` and `exclude` `"*"` or an array of relation names. The schemas to generate, and which relations of each: tables, views, materialised views and foreign tables.

Both keys are required by the type: in `generate()`, a rule without one fails to compile (TS2741). In the JSON, or in untyped JavaScript, a key left out or set to `null` takes the default rule's value, `"include": "*"` or `"exclude": []`, and the generator notes it, through [`warningListener`](#generate.warningListener); Zapatos 6.6.1 stopped where it read the missing key, with `TypeError: Cannot read properties of undefined (reading 'indexOf')` ([#301](https://github.com/AlexandreDemartin/pgcast/issues/301)). A string other than `"*"`, which the type refuses too (TS2322), is read as a one-name list, `"films"` as `["films"]`, and noted the same way; Zapatos 6.6.1 also matched each relation whose name is part of it, `film` for `"films"` ([#442](https://github.com/AlexandreDemartin/pgcast/issues/442)).

| Rule | Generates |
|---|---|
| `{ "include": "*", "exclude": [] }` | every relation of the schema |
| `{ "include": ["films", "studios"], "exclude": [] }` | `films` and `studios` |
| `{ "include": "*", "exclude": ["seat_bookings"] }` | all but `seat_bookings` |
| `{ "include": ["films", "studios"], "exclude": ["studios"] }` | `films`: `exclude` wins |
| `{ "include": "*", "exclude": "*" }` | no relation; the schema's enums, still |

- Names match exactly, case included. A name of `include` that the schema doesn't have generates nothing, and the generator warns, through [`warningListener`](#generate.warningListener); a schema the database doesn't have gives an empty namespace, and a warning for each name its `include` lists. With `"exclude": "*"`, nothing is checked.
- The relations are those the database role can see: a table or view it has no privilege on is left out, as if it did not exist; a materialised view is always there.
- The schema's enums are always generated, whatever `include` and `exclude` say.
- The relations of a schema other than [`unprefixedSchema`](#generate.unprefixedSchema) are in its namespace: `archive.screenings`, its `Table` type `'archive.screenings'`.
- A schema, relation or enum whose name TypeScript cannot parse there (`"box office"`, `class`) takes a legal identifier, `box_office` or `class_`: each run of characters an identifier cannot hold becomes `_`, a leading digit takes a `_` before it, a reserved word or a type operator (`keyof`) a `_` after it, and so does `as` for an enum. Its `Table` type and the `*ForTable` lookups keep its name: `'box office'`. Two names that become one are noted through [`warningListener`](#generate.warningListener), and so is a relation of `unprefixedSchema` named like another schema's namespace. A column's name is quoted.
- An enum named after one of TypeScript's own types (`string`, `number`…) keeps its name, as in Zapatos 6.6.1: `schema.d.ts` fails to compile without `skipLibCheck` (TS2457), and with it a column of the enum `string` is typed `string`.

With a second schema, `archive`, that holds a `screenings` table of its own:

::: code-group

```json [zapatosconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "schemas": {
    "public": { "include": "*", "exclude": [] },
    "archive": { "include": "*", "exclude": [] }
  }
}
```

:::

A query names its table with the schema, and its rows are `s.archive.screenings.JSONSelectable[]`:

```ts
const past = await db.select('archive.screenings', { film_id: 1000 }).run(pool);
```

Its SQL is [`select()`](/select#select)'s, with the name quoted part by part: `to_jsonb("archive"."screenings".*)`, `FROM "archive"."screenings"`, and the alias `"sq_archive.screenings"`.

### `unprefixedSchema` {#generate.unprefixedSchema}

`string | null`, default `"public"`. The schema whose relations are named without their schema: `films`, its `Table` type `'films'`, so `db.select('films', …)` and `"films"` in the SQL, which Postgres finds through its `search_path`.

- `null`: every relation is prefixed, `public.films` its namespace and `'public.films'` its `Table` type. A query names it so, `db.select('public.films', db.all)`, and the SQL too: `FROM "public"."films"`. `db.select('films', db.all)` no longer compiles.
- Set it to `null` when a schema has the name of a relation of `public`: a schema `films` beside the table `films` makes two `films` namespaces, which TypeScript merges, and `schema.d.ts` fails with TS2300, `Duplicate identifier 'Table'`.
- A schema missing from [`schemas`](#generate.schemas) is allowed: every schema is then prefixed.

### `columnOptions` {#generate.columnOptions}

[`ColumnOptions`](#ColumnOptions), `{ [table]: { [column]: { insert?, update? } } }`. Changes the `Insertable` and `Updatable` types of a column, as a trigger that fills it would need; nothing else changes, at run time neither.

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
| `"insert": "optional"` | the key is optional in `Insertable`, its type unchanged: `title?: string \| db.Parameter<string> \| db.SQLFragment<any>` |
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
- The names are not qualified by schema: the `c` namespace is flat across schemas, so a domain `notes` in `public` and one in `archive` are both `PgNotes`, with one placeholder for the two.
  - The generator says so through [`warningListener`](#generate.warningListener), as for two names that one transform makes one (`seat-label` and `seat_label`), and keeps the name, which an edited placeholder depends on.
- Names that differ only in case, such as `PgSeat_label` and `PgSEAT_LABEL` for domains `seat_label` and `"SEAT_LABEL"`, have two placeholders that are one file on a case-insensitive file system, the default on macOS and Windows: the one written first declares only its own name, and the others are never declared. The generator says so too, wherever it runs, and writes the same files.
- A name whose placeholder is `index.d.ts`, such as `index` for a domain `index` under `"my_type"`, or `Index` on a case-insensitive file system, shares its file with [`custom/index.d.ts`](#the-files-it-writes), which the generator writes over it on every run: that name is never declared. It says so too, and writes the same files.

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
- A comment, a `DEFAULT` or a quoted name over several lines puts each of its lines behind a `*`, whether it breaks them with `\n`, `\r\n` or `\r`.
- Each relation shows its own comments, whatever its kind: Postgres copies none to a partition, an inheriting table or a view, so a view over `roles` shows no comment on `billing`.
- A `*/` in a comment, a name, a type or a `DEFAULT` is written `*\/`, so it does not end the JSDoc; so is the one a name starting with `/` makes with the `**` before it: `**\/reels**`.
- A JSDoc tag in a comment stays a tag: `@deprecated use lead` strikes the column through where your code reads it, and the hover gives `use lead` as the reason. TypeScript starts a tag at an `@` that begins a line, or that follows a space with no space after it, not at the one in `casting@example.com` nor inside an inline `{@link …}`, `{@linkcode …}` or `{@linkplain …}`, which runs on through the next line when its own ends on `{@link` or on the link's name. From the line that holds the tag, the comment goes after the generated lines, behind a `*` line, so the tag does not take them as its own text.
  - The generator moves it only when it is sure of the tag: the first line with an `@` that follows a `{` or no printable ASCII character must start it, at its first character but for spaces and tabs, or after a space or a tab and before a printable ASCII character, and anything starting with `{@link` before the tag on that line must be closed, with no quote, backtick, `/`, `\` or line separator (U+2028, U+2029) in it. Otherwise the comment stays before the generated lines, which the tag then takes as its own text.

`false` writes none, so `schema.d.ts` is shorter.

### `customJSONParsingForLargeNumbers` {#generate.customJSONParsingForLargeNumbers}

`boolean`, default `false`. The `JSONSelectable` type of a `bigint` (`int8`) or `numeric` column, for a project that parses JSON with [`enableCustomJSONParsingForLargeNumbers()`](/runtime-config#enableCustomJSONParsingForLargeNumbers):

| Column | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- The other interfaces don't change: `Selectable` is `db.Int8String` or `db.NumericString` either way.
- `true` also silences the warning such a column gives: "Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…".

### `typeEnumsAcrossSchemas` {#generate.typeEnumsAcrossSchemas}

The 7.0 default, `true`, applies if the key is missing or `null` in the merged config. The JSON argument inherits omitted keys from the file. The generator looks up an enum in its own schema and writes its labels. Set `false` for the 6.x lookup by name in the relation's schema.

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Column of `prints` | `false` | `true` |
|---|---|---|
| `format` | `c.PgPrint_format`, an `any` placeholder | `('nitrate' \| 'safety' \| 'digital')` |
| `formats` | `c.Pg_print_format \| null`, an `any` placeholder | `('nitrate' \| 'safety' \| 'digital')[] \| null` |
| `keeper` | `crew_job \| null`: the labels of `public.crew_job` | `('projectionist' \| 'archivist') \| null` |

- The labels are written out, not named: the enum's schema needn't be in [`schemas`](#generate.schemas). In the order of [`enumOrder`](#generate.enumOrder), as for every enum.
- The generator matches foreign enums by name, so a name shared with a built-in type or another type's Postgres array can give the column the wrong type.
- A domain over such an enum stays a custom type, `c.<name>`. Unless another type shares its placeholder name, a fresh placeholder gets the labels without an import, even when a relation of the enum's own schema uses the domain as well. An existing placeholder is never overwritten.

### `enumOrder` {#generate.enumOrder}

The 7.0 default, `"declared"`, applies if the key is missing or `null` in the merged config. The JSON argument inherits omitted keys from the file. Labels follow the declaration order that Postgres uses for `ORDER BY`, comparisons and `enum_range()`. Set `"alphabetical"` for the 6.x sort order.

```sql
CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');
```

| Type | `"alphabetical"` | `"declared"` |
|---|---|---|
| `crew_job` | `'cinematographer' \| 'composer' \| 'director' \| 'editor' \| 'writer'` | `'director' \| 'writer' \| 'editor' \| 'cinematographer' \| 'composer'` |
| `every.crew_job` | `['cinematographer', 'composer', 'director', 'editor', 'writer']` | `['director', 'writer', 'editor', 'cinematographer', 'composer']` |

- A label added by `ALTER TYPE … ADD VALUE … BEFORE` or `AFTER` takes its place in that order, as `enum_range()` gives it.
- For TypeScript, only `every.<name>` changes: a union is the same type in any order. With [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), the labels written out for a foreign enum follow that order, including in a fresh domain placeholder unless another type shares its name.
- Another value stops the generator before any query, and writes nothing: `enumOrder must be 'declared' (the default) or 'alphabetical', not 'declard'`. In TypeScript, it fails to compile (TS2322, or TS2820 with a suggestion for a near-miss such as `"declard"`).

### `moduleNames` {#generate.moduleNames}

`"zapatos"` or `"pgcast"`, default `"zapatos"`. The module names the generated files declare and import, and the folder they go in. It must match the folder pgcast is installed in, under `node_modules`: `"pgcast"` for a project installed under its own name, `pgcast@npm:@pgcast/pgcast`, from 6.7.0 ([Install](/install#under-its-own-name)); `"zapatos"` for one under the `zapatos` alias, such as a project switched from Zapatos ([Switch from Zapatos](/switching)).

| | `"zapatos"` | `"pgcast"` |
|---|---|---|
| Folder | `zapatos/` | `pgcast/` |
| Declares | `zapatos/schema`, `zapatos/custom` | `pgcast/schema`, `pgcast/custom`, and `zapatos/schema` |
| Imports | `zapatos/db` | `pgcast/db` |
| Version canary comment | `` update by running `npx zapatos` `` | `` update by running `npx pgcast` `` |
| Your imports | `zapatos/db`, `zapatos/schema`, `zapatos/generate` | `pgcast/db`, `pgcast/schema`, `pgcast/generate` |

::: code-group

```json [pgcastconfig.json]
{
  "db": { "connectionString": "{{DATABASE_URL}}" },
  "outDir": "./src",
  "moduleNames": "pgcast"
}
```

```ts [films.ts]
import * as db from 'pgcast/db';
import type * as s from 'pgcast/schema';
```

:::

- `"zapatos"` writes the same files as without the option: it changes nothing until it is `"pgcast"`.
- `"pgcast"` writes the same types, and ends `pgcast/schema.d.ts` with `declare module 'zapatos/schema' { export * from 'pgcast/schema'; }`: `pgcast/db`'s own declarations import `zapatos/schema`. Without it, every type would be `any`: under `skipLibCheck`, silently.
- In the generated files, `zapatos` is left in that line and in the headers' credit to Zapatos. The config file can be `pgcastconfig.json` or `zapatosconfig.json` ([The CLI](#cli)); `npx pgcast` and `npx zapatos` both read the option.
- Another value stops the generator before any query, and writes nothing: `moduleNames must be 'zapatos' (the default) or 'pgcast', not 'pgcats'`. In TypeScript, it fails to compile (TS2322, or TS2820 with a suggestion for a near-miss such as `"pgcats"`).
- The other mode's schema in `outDir`, such as a `zapatos/` folder left from before the switch, is noted through [`warningListener`](#generate.warningListener). With `"pgcast"`, a stale `zapatos/` that `tsconfig.json` includes also declares `zapatos/schema`, which TypeScript merges: it lets a number through for a `text` column under `skipLibCheck`, and fails with TS2307 without it. With `"zapatos"`, a stale `pgcast/` loosens nothing, and its import of `pgcast/db` fails with TS2307 without `skipLibCheck`. Delete the stale folder once the placeholders you edited there are moved to the other, their `declare module 'zapatos/custom'` renamed `'pgcast/custom'`, or the reverse.

### `rejectOnQueryError` {#generate.rejectOnQueryError}

`boolean`, default `true` from 7.0. With the option omitted, set to `null` in JSON, or set to `true`, a failed connection or query rejects `generate()`, `tsForConfig()` and [`check()`](#export-check) with the original error before any files are written. Listener errors also reject the promise, and earlier listener output stays visible.

Set `rejectOnQueryError: false` to print `*** error <n> ***` and the error to stdout, then end the process with code 1 before the promise settles. This is a permanent option and the one [the CLI](#cli) uses.

If generation must fail the job, rethrow the error or set the exit code in your handler.

```ts twoslash
import { generate } from 'zapatos/generate';
// ---cut---
try {
  await generate({ db: { connectionString: process.env.DATABASE_URL }, outDir: './src' });
} catch (err) {
  console.error('types not regenerated:', err);  // ECONNREFUSED, or a pg DatabaseError
  process.exitCode = 1;
}
```

### `uniqueIndexConstraintsOnly` {#generate.uniqueIndexConstraintsOnly}

`boolean`, default `false`; an opt-in, `true` by default from 7.0 ([Versions](/versions)). The names in each relation's `UniqueIndex`, which [`constraint()`](/insert#constraint) takes. `false`, as in Zapatos 6.6.1, lists every unique index; `true` lists only the index of each `UNIQUE` or `PRIMARY KEY` constraint that isn't `DEFERRABLE`, the names Postgres takes in `ON CONFLICT ON CONSTRAINT`:

```sql
CREATE TABLE festival_entries (
  id int PRIMARY KEY,
  film_id int NOT NULL REFERENCES films,
  festival text NOT NULL,
  slot int,
  withdrawn boolean NOT NULL DEFAULT false,
  CONSTRAINT festival_entries_film_festival_key UNIQUE (film_id, festival),
  CONSTRAINT festival_entries_slot_key UNIQUE (festival, slot) DEFERRABLE
);
CREATE UNIQUE INDEX festival_entries_live_idx ON festival_entries (film_id) WHERE NOT withdrawn;
```

| In `UniqueIndex` | `false` | `true` | `ON CONFLICT ON CONSTRAINT … DO UPDATE` |
|---|---|---|---|
| `festival_entries_pkey` | yes | yes | taken |
| `festival_entries_film_festival_key` | yes | yes | taken |
| `festival_entries_slot_key`, `DEFERRABLE` | yes | no | 55000, `ON CONFLICT does not support deferrable unique constraints/exclusion constraints as arbiters` |
| `festival_entries_live_idx`, an index and no constraint | yes | no | 42704, `constraint "festival_entries_live_idx" for table "festival_entries" does not exist` |

- `true` also leaves out a materialised view's unique indexes, and, on Postgres 18, those of a `WITHOUT OVERLAPS` key, which Postgres treats as an exclusion constraint: 42809 with `DO UPDATE`. An `EXCLUDE` constraint is in neither list, since its index isn't unique.
- `true` leaves out, too, a constraint whose index isn't valid yet: a partitioned table's, added with `ALTER TABLE ONLY`, until each partition's index is attached ([Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)). Postgres answers 42P10 meanwhile, `there is no unique or exclusion constraint matching the ON CONFLICT specification`; regenerate once they are.
- A relation left with none gets `never`. `UniqueIndexForTable` and the aggregate `UniqueIndex` types follow.
- `false` notes, through [`warningListener`](#generate.warningListener), each unique index `true` would leave out.

### `domainsTypedByContext` {#generate.domainsTypedByContext}

`boolean`, default `false`; an opt-in, `true` by default from 7.0 ([Versions](/versions)). The type of a column whose domain is over `int8`, `numeric`, `bytea`, `money`, `date`, `timestamp` or `timestamptz`, or over an array of one: types that `pg`, the shortcuts' JSON and a write each give in their own way ([Value types](/runtime-config#value-types)). `false`, as in Zapatos 6.6.1, types it by its placeholder in all five interfaces, which, as generated, holds what `pg` returns; `true` types it by context, as its base type is, while its placeholder holds what the generator wrote for it. Say a booking has a ticket number:

```sql
CREATE DOMAIN ticket_no AS bigint;
ALTER TABLE seat_bookings ADD COLUMN ticket ticket_no;
```

Its placeholder, `PgTicket_no.d.ts`, holds `db.Int8String`. The shortcuts return the ticket as a JSON number, and Postgres takes a number for it:

| `seat_bookings.ticket` | `false` | `true` |
|---|---|---|
| `Selectable`, a row from `pg` | `PgTicket_no`, a string | the same |
| `JSONSelectable`, a row from the shortcuts | `PgTicket_no`, a string | `number` |
| `Whereable`, `Insertable`, `Updatable` | `PgTicket_no`, a string: `insert()` refuses `ticket: 1` (TS2769) | `number \| Int8String \| bigint` |

- `true` writes [`DomainInContext`](/runtime-config#DomainInContext) in the four other interfaces, `db.DomainInContext<c.PgTicket_no, db.Int8String, number>` in `JSONSelectable`; an editor shows `number`.
- A placeholder you edit, to any other type, types the column in all five interfaces, as with `false`: `number | db.Int8String`, a branded type, `any` or `any[]`. Only a placeholder that is exactly the type the generator wrote is typed by context. The option never changes a placeholder, so turning it on or off needs no edit to one.
- A placeholder Zapatos 6.6.1 wrote over `int8` or `numeric` holds the same type without its import, and the generator never rewrites it: the column is `any`, with `false` and `true`, so `insert()` takes `ticket: 'abc'`. Over an array of one, it holds `db.Int8String[]` or `db.NumericString[]`, which is `any[]`, with `false` and `true` too: `insert()` takes `nos: ['abc']` and refuses `nos: 'abc'` (TS2769). In the placeholder, `tsc` says TS2503, and nothing under `skipLibCheck`. Add its import first ([When a placeholder does not compile](/custom-types#when-a-placeholder-does-not-compile)). Over `date`, `timestamp`, `timestamptz`, `bytea` or `money`, 6.6.1's placeholder is the one the generator writes.
- Two domains that share a placeholder, such as `public.ticket_no AS bigint` and `archive.ticket_no AS date`, both `PgTicket_no` ([`customTypesTransform`](#generate.customTypesTransform)), share its one type, as the generator's note `custom types … are both named PgTicket_no` says ([`warningListener`](#generate.warningListener)): `true` types by context the columns of the domain whose type the placeholder holds, and leaves the other's typed by the placeholder in all five interfaces, though `false`'s note names them too. Rename one of the two in the database.
- Each base type takes its own types: `numeric` `number`, then `number | NumericString`; `date`, `timestamp` and `timestamptz` their string type, then that or a `Date`; `bytea` `ByteArrayString`, then that or a `Buffer`; `money` `string`, then `number | string`; an array, its item's, as an array. With [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers), `int8` and `numeric` are `number | Int8String` and `number | NumericString` in `JSONSelectable`.
- Unchanged: a domain typed alike in every context, such as `seat_label`.
- `false` notes, through [`warningListener`](#generate.warningListener), each column of a domain over one of these types, which `true` types by context while its placeholder holds what the generator wrote for it.

A domain over a domain, or an array of a domain, gets a placeholder that holds `any`: the generator reads the inner domain, or the array's type, as a custom type. `true` types it in all five interfaces by the base type of its innermost domain, while its placeholder holds `any`:

```sql
CREATE DOMAIN vip_ticket_no AS ticket_no;
ALTER TABLE seat_bookings ADD COLUMN vip_ticket vip_ticket_no, ADD COLUMN tickets ticket_no[];
```

| `true` | `vip_ticket` | `tickets` |
|---|---|---|
| `Selectable`, a row from `pg` | `Int8String`, as `pg` parses a `bigint` | `string`, the text `pg` returns: `'{1,2}'` |
| `JSONSelectable`, a row from the shortcuts | `number` | `number[]` |
| `Whereable`, `Insertable`, `Updatable` | `number \| Int8String \| bigint` | `(number \| Int8String \| bigint)[]` |

- `false` types both as their placeholder, `any`, in all five interfaces, as Zapatos 6.6.1 does.
- `pg` parses a domain over a domain as its innermost domain's base type, but returns an array of a domain as its text, since it doesn't know that array's type: so does a domain over such an array, directly or through other domains. An array of a domain over an array stays `any`, and so does a domain over one, or a base type the generator can't map, such as `point`.
- An enum under a domain over a domain, or under an array of a domain, is written by its name when it is of the relation's schema, and by its labels when it is of another, with or without [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas): never as the enum of the same name in the relation's schema. A plain domain over an enum of another schema keeps its placeholder in all five interfaces, and a fresh placeholder with an unshared name follows `typeEnumsAcrossSchemas`: the enum's labels by default; with `false`, the enum of the same name in the relation's schema, or `any` if that schema has none.
- A placeholder you edit keeps its type in all five, `unknown` included. One you edit to `any` counts as left as generated: write `unknown`, or leave the option off, to keep such a column untyped.
- `false` notes, through [`warningListener`](#generate.warningListener), each such column, in a note of its own.

### `enumArraysTypedAsText` {#generate.enumArraysTypedAsText}

`boolean`, or left out; an opt-in. The `Selectable` type of a column whose type is an array of an enum, or a domain over one. Postgres numbers such an array's type afresh in each database, so `pg` has no parser for it: a row from `pg`, such as a [`sql`](/sql-template) query's, holds the array's text, while the shortcuts' JSON holds the array. Say a crew member can do other jobs, and keeps those done before in a domain over the array:

```sql
CREATE DOMAIN job_list AS crew_job[];
ALTER TABLE crew ADD COLUMN other_jobs crew_job[] NOT NULL DEFAULT '{}', ADD COLUMN past_jobs job_list;
```

| `crew.other_jobs` | left out, or `false` | `true` |
|---|---|---|
| `Selectable`, a row from `pg` | `crew_job[]`, though `pg` gives `'{writer,editor}'` | `string` |
| `JSONSelectable`, a row from the shortcuts | `crew_job[]`: `['writer', 'editor']` | the same |
| `Whereable`, `Insertable`, `Updatable` | `crew_job[]` | the same |

- Left out, or `null`: the array, as in Zapatos 6.6.1, and the generator notes through [`warningListener`](#generate.warningListener) each column `true` would change. From 7.0, left out means `true` ([Versions](/versions)).
- `false`: the array, with no note, in 7.0 and after: the right type for a project that parses it with `pg.types.setTypeParser`, given the array type's OID (`SELECT 'crew_job[]'::regtype::oid`) and the parser of `text[]`, `pg.types.getTypeParser(1009)`.
- `true`: `string`, the text `pg` returns. The writes still take an array, so a `sql` row's text isn't written back as it is: `insert()` and `update()` refuse it (TS2769, TS2322), though Postgres would take it.
- A domain over such an array, as `crew.past_jobs`, takes `db.DomainInContext<c.PgJob_list, crew_job[], string>` in `Selectable` ([`DomainInContext`](/runtime-config#DomainInContext)): `string` while its placeholder holds what the generator wrote, and a placeholder you edit keeps its type. Its other interfaces and its placeholder don't change.
- An array of an enum of another schema, typed by its labels with [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) or else as the enum of the same name in the relation's schema, is a `string` in `Selectable` too. Without either, it's an `any` placeholder, and stays one. An array of a domain over an enum is [`domainsTypedByContext`](#generate.domainsTypedByContext)'s.

### `intervalsTypedAsObjects` {#generate.intervalsTypedAsObjects}

`boolean`, or left out; an opt-in. The type of an `interval` column, of an `interval[]`, and of a domain over either. `pg`'s default type parser returns an interval as an object of its parts, a [`PostgresInterval`](/runtime-config#PostgresInterval); the shortcuts' JSON gives its text. Say a screening has an intermission:

```sql
ALTER TABLE screenings ADD COLUMN intermission interval;
```

| `screenings.intermission`, `'15 minutes'` | left out, or `false` | `true` |
|---|---|---|
| `Selectable`, a row from `pg` | `string`, though `pg` returns `{ minutes: 15 }` | `PostgresInterval` |
| `JSONSelectable`, a row from the shortcuts | `string`: `'00:15:00'` | the same |
| `Whereable`, `Insertable`, `Updatable` | `string` | `string \| PostgresInterval` |

- Left out, or `null`: as in Zapatos 6.6.1, the text in all five interfaces, and a note through [`warningListener`](#generate.warningListener) names each column `true` would change. From 7.0, left out means `true` ([Versions](/versions)).
- `false`: the text, with no note. It stays in 7.0 and 8.0, for a type parser of your own that returns the text: `pg.types.setTypeParser(1186, v => v)` for `interval`, and `1187` too for `interval[]`, whose own parser `pg` keeps otherwise.
- `true`: a `PostgresInterval` in `Selectable`, an array of them for an `interval[]`. A write takes one back, as `pg` sends it through its `toPostgres()`; `insert()` still refuses a plain object such as `{ minutes: 15 }` (TS2769): Postgres 17 and later refuse it too (22007), and Postgres 16 and earlier store `00:00:15` for it.
- `pg` reads the default `IntervalStyle`, `postgres`, only: under `iso_8601`, `sql_standard` or `postgres_verbose`, its object comes back with parts missing, often `{}`, whatever the type says. The shortcuts give the text, in that style.
- A domain over one follows: a new placeholder holds `db.PostgresInterval`, and with [`domainsTypedByContext`](#generate.domainsTypedByContext) its column is typed by context, as a domain over `date` is. A domain over such a domain takes `PostgresInterval` in `Selectable` with `domainsTypedByContext`; an array of a domain stays `string` there, the text `pg` returns. A placeholder written before holds `string`, and the generator never rewrites it.

### `domainsTypedAsUnions` {#generate.domainsTypedAsUnions}

`boolean`, default `false`; an opt-in, from 6.10.0. A domain over `text` whose `CHECK` lists its values is typed by them: the generator declares their union in the domain's schema, after its enums, with the tuple `every.<name>` in the `CHECK`'s order, and a new placeholder names it ([A domain of values](/custom-types#a-domain-of-values)). Say a film has a certificate:

```sql
CREATE DOMAIN certificate AS text CHECK (VALUE IN ('U', 'PG', '12', '15', '18'));
ALTER TABLE films ADD COLUMN certificate certificate;
```

| `films.certificate` | `false` | `true` |
|---|---|---|
| `zapatos/schema` | nothing | `certificate`, `'U' \| 'PG' \| '12' \| '15' \| '18'`, and `every.certificate` |
| a new `PgCertificate.d.ts` | `string` | `certificate`, imported from `zapatos/schema` |
| all five interfaces | `c.PgCertificate` | the same: `insert()` refuses `certificate: '12A'` (TS2769) |

- Read: one `CHECK` that Postgres stores as `VALUE = ANY (ARRAY['U'::text, …])`, which `VALUE IN ('U', 'PG')` and `VALUE = ANY (ARRAY['U', 'PG'])` both give, or as `VALUE = 'U'::text`, which `VALUE IN ('U')` gives; valid; beside a `NOT NULL` or another `CHECK`, which only narrow the values. A quote, a backslash, a line break or `''` is a value like another; one written twice is in the union once.
- Left out, its placeholder as with `false`: `NULL` among the values, which lets any value through; a domain over `varchar`, `char`, `citext` or another domain; a `CHECK` added `NOT VALID`; `VALUE = 'U' OR VALUE = 'PG'`; two `CHECK`s of the form; with `standard_conforming_strings` off for the database or the role, a value that holds a backslash, which Postgres then writes doubled; a domain of a schema the run doesn't generate; an array of the domain.
- A placeholder on disk is yours, and the generator never rewrites it: one written before, or edited, keeps typing the columns, and a [note](#generate.warningListener) names it on each run while its text is not what the run would write. Delete it, and the next run writes it naming the union. [`--check`](#check) counts it only when missing, as any placeholder.
- Two types of one name share a placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)): it names the union only while the domain is the only type of the run that takes its name. Otherwise it holds the text it would hold with `false`, the base type of the type of the column read last, by schema, then relation, then column, which may not be this domain's: `number`, for a domain over `integer` of that name read by a relation that comes after this domain's. The union is declared all the same.
- With [`customTypesTransform`](#generate.customTypesTransform) `'my_type'`, or a function that keeps the name, a placeholder of [`unprefixedSchema`](#generate.unprefixedSchema) takes the union's own name, and names it with no import: `export type certificate = import('zapatos/schema').certificate;`.
- Under [`schemaJSDoc`](#generate.schemaJSDoc), the union's JSDoc gives its name, `Domain in database`, and its `COMMENT ON DOMAIN`.
- The queries' SQL doesn't change. With `false`, nor does the output, and the generator reads no constraint of a domain. It stays off in 7.0: a placeholder holding the base type is how Zapatos types a domain ([decision 008](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/008-domains-jsonb-validators.md)).

### `progressListener` {#generate.progressListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `false`. `true` prints each step with `console.log`; a function gets each line. From [`check()`](#export-check), one line: `The generated files in src/zapatos are up to date.`

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
- `Note: custom types "archive"."notes" and "public"."notes" are both named PgNotes in TypeScript, so they share one type and one placeholder file, src/zapatos/custom/PgNotes.d.ts. To type them apart, rename one of them in the database.`
  - once per run for each name that two Postgres types share ([`customTypesTransform`](#generate.customTypesTransform)); when their names differ, it adds that a `customTypesTransform` function can keep them apart;
- `Note: relations "public"."film notes" and "public"."film_notes" are both named film_notes in TypeScript, so their declarations clash. To type them apart, rename one of them in the database.`
  - once per run for each TypeScript name that two schemas, relations or enums of one scope take, and with [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions) the unions of domains, beside the enums: `domain "public"."odd_format" and enum "public"."odd format"`;
- `Note: custom types "public"."SEAT_LABEL" (PgSEAT_LABEL) and "public"."seat_label" (PgSeat_label) have TypeScript names that differ only in case: on a case-insensitive file system, the default on macOS and Windows, PgSEAT_LABEL.d.ts and PgSeat_label.d.ts are one placeholder file in src/zapatos/custom, which declares only one of those names. To type them apart, rename one of them in the database, or give customTypesTransform a function that keeps their names apart.`
  - once per run for names that differ only in case, whatever the file system, before the note above for each of those names that two Postgres types share;
- `Note: custom type "public"."index" (index) has the placeholder file index.d.ts in src/zapatos/custom, the file of the custom types' index: the generator writes the index over it on every run, so index is never declared. To declare it, rename it in the database, or give customTypesTransform a function that names it otherwise.`
  - once per run for the names whose placeholder is `custom/index.d.ts`: `index`, and, on a case-insensitive file system, a name that differs from it only in case (`Index`, `INDEX`), after the note above for those;
- `Note: public.certificate is typed by the values of its CHECK as certificate in zapatos/schema (domainsTypedAsUnions), but its placeholder src/zapatos/custom/PgCertificate.d.ts, written before, still types its columns. To type them by the database, delete it: the next run writes it naming the union.`
  - once per run for each placeholder on disk, with [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions), that the run would write naming a union, while its text differs from what the run writes, in the order of the domains, after the notes on shared names; from [`check()`](#export-check) too;
  - in its place, for such a placeholder that names the union already, with an import of its own name that `zapatos/schema` also declares as a type, as 6.10.0 wrote it under [`customTypesTransform`](#generate.customTypesTransform) `'my_type'` ([#661](https://github.com/AlexandreDemartin/pgcast/issues/661)): `Note: rating.rating is typed by the values of its CHECK as rating.rating in zapatos/schema (domainsTypedAsUnions), and its placeholder src/zapatos/custom/rating.d.ts, written before, names it too, but imports rating from zapatos/schema, which also declares a type of that name, the placeholder's own: it fails to compile (TS2440). Delete it: the next run writes it naming the union with no import.`;
- `Note: the include entry "Films" of schema "public" matches no relation there, so it generates nothing. Check its spelling and case, that the relation is in schema "public", and that the database role has a privilege on it: include names tables, views, materialised views and foreign tables.`
  - once per run for each entry of an [`include`](#generate.schemas) list that its schema doesn't have;
- `Note: the schemas rule of "public" has no exclude, so it takes "exclude": [], as the default rule does. Write the key in the rule to silence this note.`
  - after writing, for each rule of [`schemas`](#generate.schemas) that leaves out `include` or `exclude`, or sets it to `null`; for both, `has no include nor exclude, so it takes "include": "*" and "exclude": []`;
- `Note: the schemas rule of "public" gives include as a string, "films", so it is read as the list ["films"]. Zapatos 6.6.1 also matched each relation whose name is part of the string. Write the list to silence this note.`
  - after writing, for each `include` or `exclude` of a rule of [`schemas`](#generate.schemas) given as a string other than `"*"`;
- the note on `bigint` and `numeric` columns, once per process ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers));
- `Note: UniqueIndex lists public.festival_entries.festival_entries_live_idx and public.festival_entries.festival_entries_slot_key, unique indexes of no UNIQUE or PRIMARY KEY constraint, of a DEFERRABLE or WITHOUT OVERLAPS one, or not yet valid: db.constraint() takes them, and Postgres refuses them in ON CONFLICT ON CONSTRAINT ... DO UPDATE, and in ... DO NOTHING except a WITHOUT OVERLAPS key. Set uniqueIndexConstraintsOnly: true to leave them out; it will be the default in pgcast 7.0.`
  - once per run, without [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly), when a generated relation has a unique index it would leave out; one as `lists public.festival_entries.festival_entries_live_idx, a unique index of no UNIQUE or PRIMARY KEY constraint`;
- `Note: public.seat_bookings.ticket (public.ticket_no) has a domain over a type typed by context, such as int8 or date: as generated, its placeholder types it in all five interfaces as pg returns it, though a write takes more and, except for money, the shortcuts' JSON gives another type. Set domainsTypedByContext: true to type it by context while its placeholder holds what the generator wrote for it; it will be the default in pgcast 7.0.`
  - once per run, without [`domainsTypedByContext`](#generate.domainsTypedByContext), when a generated column has such a domain; several as `public.screenings.premiere (public.premiere_day) and public.seat_bookings.ticket (public.ticket_no) have domains over a type typed by context`;
- `` Note: public.seat_bookings.tickets (public.ticket_no[]) and public.seat_bookings.vip_ticket (public.vip_ticket_no) have domains over a domain, or arrays of a domain: as generated, their placeholders type them as `any`. Set domainsTypedByContext: true to type them by the base type of the innermost domain while their placeholders hold `any`; it will be the default in pgcast 7.0. ``
  - once per run, without [`domainsTypedByContext`](#generate.domainsTypedByContext), when a generated column has such a type, over a base type the generator maps; one as `public.seat_bookings.vip_ticket (public.vip_ticket_no) has a domain over a domain, or an array of a domain`;
- `Note: public.crew.other_jobs (public.crew_job[]) is an array of an enum, which pg returns as its text, such as '{a,b}', though Selectable types it as an array. Set enumArraysTypedAsText: true to type it as a string there, or false to keep the array if pg.types.setTypeParser parses it; true will be the default in pgcast 7.0.`
  - once per run, with [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) left out, when a generated column has such a type; several as `public.crew.other_jobs (public.crew_job[]) and public.crew.past_jobs (public.job_list) are arrays of an enum`;
- `Note: public.screenings.intermission (interval) is of interval or of a type that wraps it in arrays or domains: as generated, it is typed as its text, though pg's default type parser returns an interval from a query of your own as an object, a PostgresInterval. Set intervalsTypedAsObjects: true to type it as pg parses it; it will be the default in pgcast 7.0. Set it to false to keep the text, if a type parser of yours returns it.`
  - once per run, with [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) left out, when a generated column is of `interval`, `interval[]` or a domain over either, and, with `domainsTypedByContext`, of any type that wraps `interval` in domains and one array at most, such as a domain over such a domain or an array of a domain over `interval`; several as `… and public.screenings.intermission (interval) are of interval`;
- `Note: src/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. It declares 'zapatos/schema', as src/pgcast/schema.d.ts does, and TypeScript merges the two: types can loosen, silently under skipLibCheck. Delete the folder src/zapatos, once any placeholder you edited there is moved to src/pgcast/custom.`
  - after writing, with [`moduleNames`](#generate.moduleNames) `"pgcast"`, when `outDir` holds a `zapatos/schema.d.ts`; a folder without its `schema.d.ts` is not noted;
- `Note: src/pgcast/schema.d.ts is here too, generated with moduleNames: 'pgcast'. Its import of 'pgcast/db' fails to compile without skipLibCheck. Delete the folder src/pgcast, once any placeholder you edited there is moved to src/zapatos/custom.`
  - the same, with `"zapatos"` and a `pgcast/schema.d.ts`;
- `Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.`
  - from [the CLI](#cli), before generating, when the folder it runs in has both files;
- `Note: flag --chek ignored after the JSON argument: only --check may follow it.`
  - from [the CLI](#cli), before generating or checking, for each argument after `config` that starts with `--` except `--` and `--check`;
- the [old layout warning](#the-old-layout-warning);
- `Out of date: src/zapatos/schema.d.ts` and `Missing: src/zapatos/custom/PgSeat_label.d.ts`
  - from [`check()`](#export-check), for each file that differs or is missing, after the notes of a run.

### `debugListener` {#generate.debugListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `false`. Gets each query the generator sends, `>>> query <n> >>>`, its text and its values, then its result as `pg` returns it, as JSON, `<<< result <n> <<<`. The text is the one sent, less the indentation of pgcast's source, its blank lines kept: with its values, it runs as is.

The relations are read concurrently: with several, the results come back interleaved, and a query's number can change from one run to the next, so `<n>` is what pairs a result with its query.

The unique indexes of `tags`, with `"schemas": { "public": { "include": ["tags"], "exclude": [] } }`, cut after its rows:

```txt
>>> query 4 >>>
SELECT DISTINCT i.indexname
, idx.indisvalid AND NOT idx.indisexclusion AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    WHERE con.conindid = c.oid AND con.conrelid = idx.indrelid
    AND con.contype IN ('p', 'u') AND NOT con.condeferrable
  ) AS "isArbiter"
FROM pg_catalog.pg_indexes i
JOIN pg_catalog.pg_namespace n ON n.nspname = i.schemaname
JOIN pg_catalog.pg_class c ON c.relname = i.indexname AND c.relnamespace = n.oid
JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
WHERE i.tablename = $1 AND i.schemaname = $2
ORDER BY i.indexname
+ ["tags","public"]

<<< result 4 <<<
{
  "command": "SELECT",
  "rowCount": 1,
  "oid": null,
  "rows": [
    {
      "indexname": "tags_pkey",
      "isArbiter": true
    }
  ],
  …
```

The result is `pg`'s whole `Result` object: after `rows` come `fields`, its column types, and about seventy lines of `pg`'s own type parsers, the same for every query.

## Types {#types}

The types of two options, from `zapatos/generate`, for a function of yours that takes or returns them.

### `SchemaRules` {#SchemaRules}

```ts
interface SchemaRules {
  [schema: string]: {
    include: '*' | string[];
    exclude: '*' | string[];
  };
}
```

From 6.9.0. The type of [`schemas`](#generate.schemas): by schema, the relations to generate.

### `ColumnOptions` {#ColumnOptions}

```ts
interface ColumnOptions {
  [k: string]: {  // table name or "*"
    [k: string]: {  // column name
      insert?: 'auto' | 'excluded' | 'optional';
      update?: 'auto' | 'excluded';
    };
  };
}
```

From 6.9.0. The type of [`columnOptions`](#generate.columnOptions): by table, then by column, how `Insertable` and `Updatable` type it.

## The files it writes {#the-files-it-writes}

```txt
src/zapatos/
├── schema.d.ts            written again on each run
└── custom/
    ├── index.d.ts         written again on each run
    ├── PgPoint.d.ts       written once, if it is not there
    └── PgSeat_label.d.ts  written once, if it is not there
```

<div class="stack">

| File | Written | Holds |
|---|---|---|
| `schema.d.ts` | on each run | `declare module 'zapatos/schema'`: a namespace per relation, its `Table`, `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable`, `UniqueIndex`, `Column`, `OnlyCols`, `SQLExpression` and `SQL`; each enum, and its tuple `every.<name>`; `Schema` and the tuple `AllSchemas`; per schema and over all of them, the unions (`Table`, `Selectable`…) and the tuples `AllBaseTables`, `AllForeignTables`, `AllViews`, `AllMaterializedViews` and `AllTablesAndViews`; the `*ForTable<T>` lookups; the version canary |
| `custom/index.d.ts` | on each run, when there is a custom type | an empty `declare module 'zapatos/custom'` |
| `custom/<Name>.d.ts` | once: never overwritten | a placeholder, `export type PgSeat_label = string;`, yours to edit |

</div>

- A placeholder holds the `Selectable` type of the domain's base type: `string` for `seat_label`, a `text`; `Date` for a `date` domain; `db.JSONValue` for a `json` or `jsonb` one, with its `import type * as db from 'zapatos/db'`. A type the generator can't map (`point`) gets `any`. How to fill one in: [Custom types](/custom-types).
- A base type mapped to another `db.*` type (`int8`, `numeric`, `time`, ranges…) gets the same import: `export type PgTicket_no = db.Int8String;` comes with `import type * as db from 'zapatos/db';`. A domain over an enum imports it: `import type { genre } from 'zapatos/schema';` above `export type PgGenre_d = genre;`. Zapatos 6.6.1 imported `db` for `db.JSONValue` alone, so its placeholders over these failed to compile ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)): [When a placeholder does not compile](/custom-types#when-a-placeholder-does-not-compile).
- Nothing is deleted: a placeholder whose type is gone stays, and so does `custom/` once there is no custom type left.
- `schema.d.ts` declares `schemaVersionCanary`, `version: 104`. A `zapatos/db` that expects another version fails to compile there: generate again ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)).
- Each file is a `declare module` of the `zapatos/*` names, so your `tsconfig.json` must include it: `"include": ["src"]`, with `outDir` `"./src"`.
- With [`moduleNames`](#generate.moduleNames) `"pgcast"`, the tree is `src/pgcast/` and the names `pgcast/*`; the rest of this section is the same.

### The old layout warning {#the-old-layout-warning}

Zapatos before 3.0 copied its source into yours. After writing, when `outExt` is not `".ts"`, the generator looks for that layout: `zapatos/schema.ts`, a `zapatos/src` folder, or a file under `zapatos/custom` that does not end in `.d.ts`. If it finds one, it warns, through [`warningListener`](#generate.warningListener), with the steps to convert:

```txt
*** IMPORTANT: ZAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***
```

So moving from `outExt: ".ts"` back to `".d.ts"` warns too, until you delete the `.ts` files.

Why the types look as they do, a `timestamptz` a `Date` in `Selectable` and a string in `JSONSelectable`: [The catalog](/catalog-types).

## Several databases {#several-databases}

Each `schema.d.ts` declares `zapatos/schema`, the one module `zapatos/db` takes its tables from, so a compilation types one database. For two, give each its own TypeScript project, and type by hand what one passes to another. Here, the docs' database, `films`, beside a small `box_office` database with its own `films` table, whose `id` is a `text`, and a `takings` table.

```txt
tsconfig.json
tsconfig.base.json
films/
├── pgcastconfig.json
├── tsconfig.json
└── src/
box_office/
├── pgcastconfig.json
├── tsconfig.json
└── src/
```

- `tsconfig.json` has no files: a reference to each project. `tsconfig.base.json` holds your usual options.
- Each `src/` holds its database's `zapatos/` folder and the queries on that database.

::: code-group

```json [tsconfig.json]
{ "files": [], "references": [{ "path": "films" }, { "path": "box_office" }] }
```

```json [films/tsconfig.json]
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "composite": true, "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

```json [films/pgcastconfig.json]
{ "db": { "connectionString": "{{FILMS_DATABASE_URL}}" }, "outDir": "./src" }
```

:::

```sh
(cd films && npx pgcast)
(cd box_office && npx pgcast)
npx tsc -b
```

- `box_office/` holds the same two files, its config naming <code v-pre>{{BOX_OFFICE_DATABASE_URL}}</code>.
- The CLI reads the config of the folder it runs in ([The CLI](#cli)): run it, and [`--check`](#check) in CI, in each project's folder. Or from the root, with the JSON argument: <code v-pre>npx pgcast '{"db": {"connectionString": "{{FILMS_DATABASE_URL}}"}, "outDir": "./films/src"}'</code>.
- Each project includes its own `src`, so its own `zapatos/` folder only. `tsc -b` builds them one at a time, on TypeScript 5.9 and on 4.1 under `skipLibCheck` ([On an older TypeScript](/install#on-an-older-typescript)). One package and one `node_modules` are enough.
- The pool is chosen at `.run()`, as always, and nothing ties a table to it. Run on the `films` pool, `box_office`'s `takings` query fails, `42P01 relation "takings" does not exist`; its `films` query runs, and returns the docs' rows, an `id` of `1000` typed as a `string`.

::: warning Across projects
A column read from another project's declarations can be `any`, `unknown` or another database's type, by reader and TypeScript version, and `skipLibCheck` hides why: type what crosses by hand.
:::

### Both in one compilation {#both-in-one-compilation}

A root `tsconfig.json` that includes `films/src` and `box_office/src` declares `zapatos/schema` twice.

- In the `.d.ts` files: TS6200, TS2717 and others. Under `skipLibCheck`, these go, silently.
- The file that comes first wins, and the queries on the other are refused: `box_office`'s `db.select('takings', …)`, TS2345 `Argument of type '"takings"' is not assignable to parameter of type 'Table'`; with the folders swapped, `films`'s `{ id }` and `'studios'`.

### Types across projects {#types-across-projects}

An app that wires both, or another package of a monorepo, reads `films`'s emitted declarations. Without a type of yours, they name its tables as TypeScript writes them: by string, `db.JSONOnlyColsForTable<"films", …>`, or by module, `import("zapatos/schema").takings.JSONSelectable`. Each is resolved in the **reader's** compilation:

| The reader | TypeScript 5.5 and later | Before 5.5 |
|---|---|---|
| An app with no schema of its own | `any`: `const title: number = page.title` compiles | the schema a declaration pulls in, else `any`: here `page.title` is `box_office`'s `films.title` |
| A project with its own schema | its own table of that name (`page.id` a `string` in `box_office`), `unknown` for a table it lacks, or `any` | as from 5.5, until a declaration pulls the other's schema in: then both, [in one compilation](#both-in-one-compilation), its own queries refused |

- A misspelt column is still refused, TS2551.
- Before 5.5, a declaration that names a table by module starts with `/// <reference path>` to its project's `schema.d.ts`, which joins the reader's compilation: here `box_office`'s `takings()` brings `box_office`'s, and 4.1, which names every table by module, brings `films`'s too. From 5.5 that line is gone, and a table named by module that the reader lacks is `any`.

Without `skipLibCheck`, the reader's `.d.ts` errors say so: TS2307 on `zapatos/schema` with no schema, TS2344 or TS6200 with one. The way out is a type written out as plain TypeScript, never `s.films.JSONSelectable`:

```ts twoslash [films/src/queries.ts]
import * as db from 'zapatos/db';
import type { Pool } from 'pg';

export interface FilmPage {
  id: number;
  title: string;
  release_year: number;
  studio: { name: string };
}

export const filmPage = (pool: Pool, id: number): Promise<FilmPage> =>
  db.selectExactlyOne('films', { id }, {
    columns: ['id', 'title', 'release_year'],
    lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) },
  }).run(pool);
```

- `films`'s own compilation checks the query against it: `title: number` there fails, TS2322.
- Its declarations name no table, so every reader reads `FilmPage` as written: `const title: number = page.title` fails, TS2322, from 4.1 to 5.9.
- Give each export that crosses its type: one left without brings back the table above.

### In the editor {#in-the-editor}

- With `references`, the editor (tsserver 5.9) loads a referenced project's sources rather than its `.d.ts`, without that project's schema: `page` is `JSONOnlyColsForTable<string, string[]>`, and `page.titel`, which `tsc -b` refuses, passes. It does not agree with `tsc -b`.
- With `"disableSourceOfProjectReferenceRedirect": true` in the reader's `compilerOptions`, after a `tsc -b`, it reads the `.d.ts`, and agrees.
- A type written by hand reads the same either way: `page` is `FilmPage`.

### Out of scope {#several-databases-out-of-scope}

- A query across databases, through `dblink` or a foreign table: one query, one database. A foreign table is generated with the tables of the database that declares it.
- A module per database: `zapatos/db` takes its types from `zapatos/schema` alone, and a copy of it per database was weighed and set aside ([decision 011](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/011-several-databases.md)).

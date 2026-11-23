# Generator

The generator reads your database's catalog and writes the types of `zapatos/schema`. This page lists how to run it, from the command line or from code, and every option of its config file and `generate()`.
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

- `schema.d.ts` and, when there is a custom type, `custom/index.d.ts`, which each run then writes again, are compared byte for byte. A placeholder counts only when it is missing: it is yours to edit ([The files it writes](/generated-files#the-files-it-writes)).
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

Reads the catalog of `config.db` and writes the [files](/generated-files#the-files-it-writes) under `config.outDir`. `config` takes the [options](#options) of `zapatosconfig.json`, and also functions where the JSON takes `true` or a name: the three listeners and `customTypesTransform`.

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
- `zapatos/generate` also exports `Config` and the functions `generate()` is built from (`tsForConfig()`, `definitionForRelationInSchema()` and others). `definitionForRelationInSchema()` fills the `columnsTypedByEnumName` array only with `typeEnumsAcrossSchemas: false`. `tsTypeForPgType()` maps a type name in one context, so an enum array maps to an array. `definitionForRelationInSchema()` applies `enumArraysTypedAsText` to raw reads. See the [relation helper's out-parameters](/switching#domain-and-parser-types).

## Options {#options}

Every option is optional. Each one given replaces its default whole: `schemas` without `public` leaves `public` out.

The everyday settings:

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
| [`moduleNames`](#generate.moduleNames) | `"zapatos"` | the module names the files declare and import, and their folder |
| [`constraintNames`](#generate.constraintNames) | `false` | the names in each relation's `Constraint` type |
| [`domainsTypedAsUnions`](#generate.domainsTypedAsUnions) | `false` | the type of a domain over `text` whose `CHECK` lists its values |
| [`valuesTypedAsAliases`](#generate.valuesTypedAsAliases) | `false` | how each column's value type is written in `Whereable`, `Insertable` and `Updatable` |
| [`progressListener`](#generate.progressListener) | `false` | where each step is reported |
| [`warningListener`](#generate.warningListener) | `true` | where warnings go |
| [`debugListener`](#generate.debugListener) | `false` | where each query and its result go |

These options changed their default in 7.0.0. Each keeps the 6.x behaviour with the value shown. See the [migration guide](/switching#regenerate-for-7-0).

| Option | Default | 6.x value | In 8.0 | What it sets |
|---|---|---|---|---|
| [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) | `true` | `false` | removed | the type of an enum of another schema |
| [`enumOrder`](#generate.enumOrder) | `"declared"` | `"alphabetical"` | removed | the order of an enum's labels |
| [`rejectOnQueryError`](#generate.rejectOnQueryError) | `true` | `false` | stays | whether a failed query rejects, or ends the process |
| [`uniqueIndexConstraintsOnly`](#generate.uniqueIndexConstraintsOnly) | `true` | `false` | removed | the names in each relation's `UniqueIndex` |
| [`domainsTypedByContext`](#generate.domainsTypedByContext) | `true` | `false` | removed | the type of a domain over `bigint`, `numeric`, `bytea`, `money` or a date, or over an array of one, outside `Selectable`, and of a domain over a domain or an array of a domain |
| [`enumArraysTypedAsText`](#generate.enumArraysTypedAsText) | `true` | `false` | stays | the `Selectable` type of an array of an enum |
| [`intervalsTypedAsObjects`](#generate.intervalsTypedAsObjects) | `true` | `false` | stays | the type of an `interval` in `Selectable` and in a write |

### `db` {#generate.db}

`pg.ClientConfig`: what you'd give `new pg.Pool()`, a `connectionString` or `host`, `user`, `database` and the rest. Without it, `pg` takes its defaults and the `PGHOST`, `PGUSER`, `PGDATABASE`… environment variables.

### `outDir` {#generate.outDir}

`string`, default `"."`. The folder that receives the `zapatos` folder, created if needed: `"./src"` writes `src/zapatos/schema.d.ts`. Relative to the current folder. With [`moduleNames`](#generate.moduleNames) `"pgcast"`, the folder is `pgcast`.

### `outExt` {#generate.outExt}

`string`, default `".d.ts"`. The extension of every file written, the placeholders included: `".ts"` writes `zapatos/schema.ts`, `zapatos/custom/PgPoint.ts`. Only the names change; the content is the same `declare module` text. With `".ts"`, the generator skips the check for the [old layout](/generated-files#the-old-layout-warning).

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

`"PgMy_type" | "my_type" | "PgMyType"`, or in `generate()` a function `(name: string) => string`; default `"PgMy_type"`. The TypeScript name of each type the generator leaves to you: a domain, or a type it can't map, such as `point`. Each one gets a [placeholder](/generated-files#the-files-it-writes), and the column the type `c.<name>`.

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
- A name whose placeholder is `index.d.ts`, such as `index` for a domain `index` under `"my_type"`, or `Index` on a case-insensitive file system, shares its file with [`custom/index.d.ts`](/generated-files#the-files-it-writes), which the generator writes over it on every run: that name is never declared. It says so too, and writes the same files.

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

`boolean`, default `false`. The `JSONSelectable` type of a `bigint` (`int8`) or `numeric` column, for a project that parses JSON with [`enableCustomJSONParsingForLargeNumbers()`](/value-types#enableCustomJSONParsingForLargeNumbers):

| Column | `false` | `true` |
|---|---|---|
| `int8` | `number` | `(number \| db.Int8String)` |
| `numeric` | `number` | `(number \| db.NumericString)` |

- The other interfaces don't change: `Selectable` is `db.Int8String` or `db.NumericString` either way.
- `true` also silences the warning such a column gives: "Note: this database has bigint/int8 and/or numeric/decimal columns, for which JSON.parse may lose precision…".

### `typeEnumsAcrossSchemas` {#generate.typeEnumsAcrossSchemas}

From 7.0.0. The default, `true`, applies if the key is missing or `null` in the merged config. The JSON argument inherits omitted keys from the file. The generator looks up an enum in its own schema and writes its labels. Set `false` for the 6.x lookup by name in the relation's schema.

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Column of `prints` | `false` | `true` |
|---|---|---|
| `format` | `c.PgPrint_format`, an `any` placeholder | `('nitrate' \| 'safety' \| 'digital')` |
| `formats` (`Selectable`) | `c.Pg_print_format \| null`, an `any` placeholder | `string \| null` by default, the label array below with `enumArraysTypedAsText: false` |
| `formats` (`JSONSelectable`) | `c.Pg_print_format \| null`, an `any` placeholder | `('nitrate' \| 'safety' \| 'digital')[] \| null` |
| `keeper` | `crew_job \| null`: the labels of `public.crew_job` | `('projectionist' \| 'archivist') \| null` |

- The labels are written out, not named: the enum's schema needn't be in [`schemas`](#generate.schemas). In the order of [`enumOrder`](#generate.enumOrder), as for every enum.
- The generator matches foreign enums by name. An enum named like a built-in type (`int4`) gets that type instead of its labels. An enum named as Postgres would normally name another type's array (`_tag` for `tag`) gives its labels to columns of that array type.
- A domain over such an enum stays a custom type, `c.<name>`. Unless another type shares its placeholder name, a fresh placeholder gets the labels without an import, even when a relation of the enum's own schema uses the domain as well. An existing placeholder is never overwritten.

### `enumOrder` {#generate.enumOrder}

From 7.0.0. The default, `"declared"`, applies if the key is missing or `null` in the merged config. The JSON argument inherits omitted keys from the file. Labels follow the declaration order that Postgres uses for `ORDER BY`, comparisons and `enum_range()`. Set `"alphabetical"` for the 6.x sort order.

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

From 7.0.0. This boolean defaults to `true`. With the option omitted, set to `null` in JSON, or set to `true`, a failed connection or query rejects `generate()`, `tsForConfig()` and [`check()`](#export-check) with the original error before any files are written. A synchronous throw from a listener also rejects generation. Handle any promise the listener returns yourself. Earlier listener output stays visible.

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

From 7.0.0. This boolean defaults to `true`, including for JSON `null`. Each relation's `UniqueIndex` lists its non-deferrable `UNIQUE` and `PRIMARY KEY` constraints backed by valid, non-exclusion indexes. With `false`, the generator lists all of the relation's unique indexes.

[`constraint()`](/insert#constraint) compiles a name such as `screenings.id` as a qualified identifier: `"screenings"."id"` (42601). Use an explicit `sql` statement with `ON CONSTRAINT "screenings.id"`.

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

- `true` also leaves out a materialised view's unique indexes, and, on Postgres 18, those of a `WITHOUT OVERLAPS` key, which Postgres treats as an exclusion constraint. `DO NOTHING` accepts a non-deferrable key and, when there is a row to insert, returns 55000 for a deferrable one. `DO UPDATE` returns 42809 for either declaration. An `EXCLUDE` constraint is in neither list, since its index isn't unique.
- `true` leaves out, too, a constraint whose index isn't valid yet: a partitioned table's, added with `ALTER TABLE ONLY`, until each partition's index is attached ([Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)). Postgres answers 42P10 meanwhile, `there is no unique or exclusion constraint matching the ON CONFLICT specification`; regenerate once they are.
- For a partitioned table, the union follows the parent constraint. Postgres checks the receiving partition's index, so a deferrable key there can still raise 55000. A deferrable parent key is omitted even when the partitions' keys are immediate.
- A relation left with none gets `never`. `UniqueIndexForTable` and the aggregate `UniqueIndex` types follow.
- In 7.x, `false` restores the 6.x union without a migration note. The override goes in 8.0.

### `constraintNames` {#generate.constraintNames}

From 7.1.0. Set `constraintNames` to `true` to generate a `Constraint` type in each relation's namespace. It lists the names of its primary keys, unique constraints, foreign keys, checks, exclusion constraints and all its unique indexes. For the table above, `festival_entries.Constraint` includes both `festival_entries_slot_key` and `festival_entries_live_idx` with either setting of `uniqueIndexConstraintsOnly`.

The type lists the catalogue names whether or not Postgres enforces them. A trigger or function can report a name outside the type. A relation with no matching names gets `never`.

Check `err.constraint` against the names in `Constraint` for `err.schema` and `err.table`. Each partition or inheritance child gets its own names, including inherited checks. A routed write that violates a partition's constraint reports that partition. A delete refused by a foreign key reports the referencing table.

Table `NOT NULL` constraints are excluded. For a not-null violation on a table's column, Postgres reports the column. Domain checks belong to the domain, and a domain's `NOT NULL` violation reports the domain in `err.dataType`.

If the generator includes a relation named `every` from a schema with an enum named `Constraint`, or a domain of that name generated as a union, both declare `every.Constraint`. The option applies to the whole run: to keep it on, exclude that relation or rename either object.

The extra catalogue query and declaration are off unless the merged configuration (file, then JSON argument) sets `constraintNames` to `true`. A JSON `null` in the argument turns a file's `true` off.

### `domainsTypedByContext` {#generate.domainsTypedByContext}

From 7.0.0. This boolean defaults to `true`. JSON `null` also selects the default. The type of a column whose domain is over `int8`, `numeric`, `bytea`, `money`, `date`, `timestamp` or `timestamptz`, or over an array of one: types that `pg`, the shortcuts' JSON and a write each give in their own way ([Value types](/value-types)). `false`, as in Zapatos 6.6.1, types it by its placeholder in all five interfaces, which, as generated, holds what `pg` returns; `true` types it by context, as its base type is, while its placeholder holds what the generator wrote for it. Say a booking has a ticket number:

```sql
CREATE DOMAIN ticket_no AS bigint;
ALTER TABLE seat_bookings ADD COLUMN ticket ticket_no;
```

Its placeholder, `PgTicket_no.d.ts`, holds `db.Int8String`. With the default JSON parser, the shortcuts return the ticket as a number, and Postgres takes a number for it:

| `seat_bookings.ticket` | `false` | `true` |
|---|---|---|
| `Selectable`, a row from `pg` | `PgTicket_no`, a string | the same |
| `JSONSelectable`, a row from the shortcuts | `PgTicket_no`, a string | `number` |
| `Whereable`, `Insertable`, `Updatable` | `PgTicket_no`, a string: `insert()` refuses `ticket: 1` (TS2769) | `number \| Int8String \| bigint` |

- `true` writes [`DomainInContext`](/value-types#DomainInContext) in the four other interfaces, `db.DomainInContext<c.PgTicket_no, db.Int8String, number>` in `JSONSelectable`; an editor shows `number`.
- A placeholder whose type differs from the current generated type supplies all five interfaces. Type identity alone decides this, even for an untouched 6.x file. To compare files, follow the [migration guide](/switching#domain-and-parser-types).
- A placeholder Zapatos 6.6.1 wrote over `int8` or `numeric` holds the same type without its import, and the generator never rewrites it: the column is `any`, with `false` and `true`, so `insert()` takes `ticket: 'abc'`. Over an array of one, it holds `db.Int8String[]` or `db.NumericString[]`, which is `any[]`, with `false` and `true` too: `insert()` takes `nos: ['abc']` and refuses `nos: 'abc'` (TS2769). In the placeholder, `tsc` says TS2503, and nothing under `skipLibCheck`. Add its import first ([When a placeholder does not compile](/custom-types#when-a-placeholder-does-not-compile)). Over `date`, `timestamp`, `timestamptz`, `bytea` or `money`, 6.6.1's placeholder is the one the generator writes.
- Two domains that share a placeholder, such as `public.ticket_no AS bigint` and `archive.ticket_no AS date`, both `PgTicket_no` ([`customTypesTransform`](#generate.customTypesTransform)), share its one type, as the generator's note `custom types … are both named PgTicket_no` says ([`warningListener`](#generate.warningListener)): `true` types by context the columns of the domain whose type the placeholder holds, and leaves the other's typed by the placeholder in all five interfaces. Rename one of the two in the database.
- Each base type takes its own types: `numeric` `number`, then `number | NumericString`; `date`, `timestamp` and `timestamptz` their string type, then that or a `Date`; `bytea` `ByteArrayString`, then that or a `Buffer`; `money` `string`, then `number | string`; an array, its item's, as an array. With [`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers), `int8` and `numeric` are `number | Int8String` and `number | NumericString` in `JSONSelectable`.
- Unchanged: a domain typed alike in every context, such as `seat_label`.
- Generated array types omit [element nullability](/catalog-types#what-the-generator-doesn-t-read). A column's `NOT NULL` applies to the array. Even with a `NOT NULL` domain as the element type, an assignment past the end, such as `a[3] = 3` on `{1}`, stores `{1,NULL,3}`.
- For a plain `numeric[]`, and for a domain rooted in it when the domain is typed by context from a fresh placeholder, `Selectable` declares `db.NumericString[]`. The default `pg` array parser returns numbers.

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

- In 7.x, `false` quietly restores the placeholder type, `any`, in all five interfaces for both columns. This override goes in 8.0.
- `pg` parses a domain over a domain as its innermost domain's base type, but returns an array of a domain as its text, since it doesn't know that array's type: so does a domain over such an array, directly or through other domains. An array of a domain over an array stays `any`, and so does a domain over one, or a base type the generator can't map, such as `point`.
- An enum under a domain over a domain, or under an array of a domain, is written by its name when it is of the relation's schema, and by its labels when it is of another, with or without [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas): never as the enum of the same name in the relation's schema. A plain domain over an enum of another schema keeps its placeholder in all five interfaces, and a fresh placeholder with an unshared name follows `typeEnumsAcrossSchemas`: the enum's labels by default; with `false`, the enum of the same name in the relation's schema, or `any` if that schema has none.
- A placeholder you edit keeps its type in all five, `unknown` included. One you edit to `any` counts as left as generated: write `unknown`, or set the option to `false`, to keep such a column untyped.

### `enumArraysTypedAsText` {#generate.enumArraysTypedAsText}

From 7.0.0. This boolean defaults to `true`. JSON `null` also selects the default. The `Selectable` type of a column whose type is an array of an enum, or a domain over one. Postgres numbers such an array's type afresh in each database, so `pg` has no parser for it: a row from `pg`, such as a [`sql`](/sql-template) query's, holds the array's text, while the shortcuts' JSON holds the array. Say a crew member can do other jobs, and keeps those done before in a domain over the array:

```sql
CREATE DOMAIN job_list AS crew_job[];
ALTER TABLE crew ADD COLUMN other_jobs crew_job[] NOT NULL DEFAULT '{}', ADD COLUMN past_jobs job_list;
```

| `crew.other_jobs` | `false` | `true` (default) |
|---|---|---|
| `Selectable`, a row from `pg` | `crew_job[]`, though `pg` gives `'{writer,editor}'` | `string` |
| `JSONSelectable`, a row from the shortcuts | `crew_job[]`: `['writer', 'editor']` | the same |
| `Whereable`, `Insertable`, `Updatable` | `crew_job[]` | the same |

- `false`: the array, with no note, including beyond 8.0: the right type for a project that parses it with `pg.types.setTypeParser`, given the array type's OID (`SELECT 'crew_job[]'::regtype::oid`) and the parser of `text[]`. Declare `const textArrayOid: number = 1009`, then pass `pg.types.getTypeParser(textArrayOid)`.
- `true`: `string`, the text `pg` returns. The writes still take an array, so a `sql` row's text isn't written back as it is: `insert()` and `update()` refuse it (TS2769, TS2322), though Postgres would take it.
- A domain over such an array, as `crew.past_jobs`, takes `db.DomainInContext<c.PgJob_list, crew_job[], string>` in `Selectable` ([`DomainInContext`](/value-types#DomainInContext)): `string` while its placeholder matches the current generated type, even if edited. A different placeholder type is preserved in all five interfaces.
- An array of an enum of another schema, typed by its labels with [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) or else as the enum of the same name in the relation's schema, is a `string` in `Selectable` too. Without either, it's an `any` placeholder, and stays one. An array of a domain over an enum is [`domainsTypedByContext`](#generate.domainsTypedByContext)'s.

### `intervalsTypedAsObjects` {#generate.intervalsTypedAsObjects}

From 7.0.0. This boolean defaults to `true`. JSON `null` also selects the default. The type of an `interval` column, of an `interval[]`, and of a domain over either. `pg`'s default type parser returns an interval as an object of its parts, a [`PostgresInterval`](/value-types#PostgresInterval); the shortcuts' JSON gives its text. Say a screening has an intermission:

```sql
ALTER TABLE screenings ADD COLUMN intermission interval;
```

| `screenings.intermission`, `'15 minutes'` | `false` | `true` (default) |
|---|---|---|
| `Selectable`, a row from `pg` | `string`, though `pg` returns `{ minutes: 15 }` | `PostgresInterval` |
| `JSONSelectable`, a row from the shortcuts | `string`: `'00:15:00'` | the same |
| `Whereable`, `Insertable`, `Updatable` | `string` | `string \| PostgresInterval` |

- `false` remains available beyond 8.0 for custom parsers. Use `pg.types.setTypeParser(1186, v => v)` for interval text and, for an array of interval strings, `const intervalArrayOid: number = 1187` and `const textArrayOid: number = 1009`, then `pg.types.setTypeParser(intervalArrayOid, pg.types.getTypeParser(textArrayOid))`: literal OIDs fail to compile (TS2345) with TypeScript 5.9 and later.
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
- Left out, its placeholder as with `false`: `NULL` among the values, which lets any value through; a domain over `varchar`, `char`, `citext` or another domain; a `CHECK` added `NOT VALID`; `VALUE = 'U' OR VALUE = 'PG'`; two `CHECK`s of the form; on Postgres 18 and earlier, with `standard_conforming_strings` off for the database or the role, a value that holds a backslash, which Postgres then writes doubled; a domain of a schema the run doesn't generate; an array of the domain.
- A placeholder on disk is yours, and the generator never rewrites it: one written before, or edited, keeps typing the columns, and a [note](#generate.warningListener) names it on each run while its text is not what the run would write. Delete it, and the next run writes it naming the union. [`--check`](#check) counts it only when missing, as any placeholder.
- Two types of one name share a placeholder ([#42](https://github.com/AlexandreDemartin/pgcast/issues/42)): it names the union only while the domain is the only type of the run that takes its name. Otherwise it holds the text it would hold with `false`, the base type of the type of the column read last, by schema, then relation, then column, which may not be this domain's: `number`, for a domain over `integer` of that name read by a relation that comes after this domain's. The union is declared all the same.
- With [`customTypesTransform`](#generate.customTypesTransform) `'my_type'`, or a function that keeps the name, a placeholder of [`unprefixedSchema`](#generate.unprefixedSchema) takes the union's own name, and names it with no import: `export type certificate = import('zapatos/schema').certificate;`.
- Under [`schemaJSDoc`](#generate.schemaJSDoc), the union's JSDoc gives its name, `Domain in database`, and its `COMMENT ON DOMAIN`.
- The queries' SQL doesn't change. With `false`, nor does the output, and the generator reads no constraint of a domain. It stays off in 7.0: a placeholder holding the base type is how Zapatos types a domain ([decision 008](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/008-domains-jsonb-validators.md)).

### `valuesTypedAsAliases` {#generate.valuesTypedAsAliases}

`boolean`, default `false`; an opt-in, from 7.2.0. Each column's value in `Whereable`, `Insertable` and `Updatable` names an alias of `zapatos/db`, [`WhereableValue`](/value-types#WhereableValue), [`InsertableValue`](/value-types#InsertableValue) or [`UpdatableValue`](/value-types#UpdatableValue), rather than spelling out its union. The types are the same, so every call that compiles still does, and every call that fails still fails:

| `films` | `false` | `true` |
|---|---|---|
| `Whereable` | `release_year?: number \| db.Parameter<number> \| db.SQLFragment \| db.ParentColumn \| db.SQLFragment<any, …>;` | `release_year?: db.WhereableValue<number>;` |
| `Insertable` | `tagline?: string \| db.Parameter<string> \| null \| db.DefaultType \| db.SQLFragment<any>;` | `tagline?: db.InsertableValue<string, null \| db.DefaultType>;` |
| `Updatable` | `title?: string \| db.Parameter<string> \| db.SQLFragment \| db.SQLFragment<any, …>;` | `title?: db.UpdatableValue<string>;` |

- The second type argument is `null | db.DefaultType` for a nullable column, `db.DefaultType` for one with a default, and left out otherwise.
- The schema file is smaller, and `tsc` uses less memory: on 300 tables of 20 columns, 5.1 MB rather than 7.0 MB, and 293 MB rather than 387 MB with `skipLibCheck: false`, 196 MB rather than 280 MB with `skipLibCheck: true`.
- An editor's hover and an error name the alias on TypeScript 5.9: `Type 'string' is not assignable to type 'WhereableValue<number> | undefined'`. TypeScript 4.1 shows the union in full.
- The queries' SQL doesn't change. With `false`, nor does the output. It becomes the default in 8.0, and `false` stays ([decision 017](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/017-value-aliases.md)).

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
- `Note: src/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. It declares 'zapatos/schema', as src/pgcast/schema.d.ts does, and TypeScript merges the two: types can loosen, silently under skipLibCheck. Delete the folder src/zapatos, once any placeholder you edited there is moved to src/pgcast/custom.`
  - after writing, with [`moduleNames`](#generate.moduleNames) `"pgcast"`, when `outDir` holds a `zapatos/schema.d.ts`; a folder without its `schema.d.ts` is not noted;
- `Note: src/pgcast/schema.d.ts is here too, generated with moduleNames: 'pgcast'. Its import of 'pgcast/db' fails to compile without skipLibCheck. Delete the folder src/pgcast, once any placeholder you edited there is moved to src/zapatos/custom.`
  - the same, with `"zapatos"` and a `pgcast/schema.d.ts`;
- `Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.`
  - from [the CLI](#cli), before generating, when the folder it runs in has both files;
- `Note: flag --chek ignored after the JSON argument: only --check may follow it.`
  - from [the CLI](#cli), before generating or checking, for each argument after `config` that starts with `--` except `--` and `--check`;
- the [old layout warning](/generated-files#the-old-layout-warning);
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

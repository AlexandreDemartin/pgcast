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
- `config`: one optional argument, a JSON object, merged over the file key by key: `npx pgcast '{"outDir": "./generated"}'` keeps the file's `db` and replaces its `outDir`.
  - A key given here replaces the file's whole value, so `'{"db": {"application_name": "codegen"}}'` drops the file's `connectionString`.
  - The file's variables are filled in before the merge: one it names must be set even when the argument replaces its key, or the CLI stops with `Environment variable 'NAME' is not set`.
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
- It sends only `SELECT`s, on `information_schema` and `pg_catalog`: one for the relations of each schema, one for its enums, then two per relation, its columns and its unique indexes, and one for the enums of each other schema a column's type comes from (`pg_catalog` included).
- A query that fails, the connection included, prints `*** error <n> ***` and the error with `console.log`, then ends the process with `process.exit(1)`, as in Zapatos 6.6.1 ([#183](https://github.com/AlexandreDemartin/pgcast/issues/183)). On a failed query the promise never settles, so a `try`/`catch` around it does not run.
- Other errors reject it: a write that fails (`ENOTDIR: not a directory, mkdir 'afile/zapatos'` when `outDir` is a file), a malformed [rule](#generate.schemas).
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
| [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas) | `false` | the type of an enum of another schema |
| [`enumOrder`](#generate.enumOrder) | `"alphabetical"` | the order of an enum's labels |
| [`moduleNames`](#generate.moduleNames) | `"zapatos"` | the module names the files declare and import, and their folder |
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

`{ [schema]: { include, exclude } }`, each of `include` and `exclude` `"*"` or an array of relation names. The schemas to generate, and which relations of each: tables, views, materialised views and foreign tables.

Both keys are required. In `generate()`, a rule without one fails to compile (TS2741); in the JSON, the CLI stops with `TypeError: Cannot read properties of undefined (reading 'indexOf')` ([#301](https://github.com/AlexandreDemartin/pgcast/issues/301)).

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
- A schema, relation or enum whose name is not a TypeScript identifier (`"box office"`) is written as it is, and `schema.d.ts` does not compile (TS1005) ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)). A column's name is quoted, and works.

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
- The names are not qualified by schema: the `c` namespace is flat across schemas, so a domain `notes` in `public` and one in `archive` are both `PgNotes`, with one placeholder for the two.
  - The generator says so through [`warningListener`](#generate.warningListener), as for two names that one transform makes one (`seat-label` and `seat_label`), and keeps the name, which an edited placeholder depends on.

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
- A comment over several lines puts each of them behind a `*`, whether it breaks them with `\n`, `\r\n` or `\r`.
- Each relation shows its own comments, whatever its kind: Postgres copies none to a partition, an inheriting table or a view, so a view over `roles` shows no comment on `billing`.
- On a table or a materialised view, a comment holding `*/` ends the JSDoc there, so `schema.d.ts` usually does not compile (TS1131), until [#48](https://github.com/AlexandreDemartin/pgcast/issues/48) escapes it. Its lines after the first are written as Zapatos 6.6.1 writes them, with no `*`, so one that compiles under 6.6.1, by opening a comment after its `*/`, still does. On a view, a foreign table or a partitioned table, whose column comments Zapatos 6.6.1 never wrote, such a comment is left out ([#48](https://github.com/AlexandreDemartin/pgcast/issues/48)).
- A comment, or one of its lines, starting with a JSDoc tag (`@deprecated use lead`) becomes that tag in the hover, on every kind of relation, and swallows the generated lines after it ([#309](https://github.com/AlexandreDemartin/pgcast/issues/309)).

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

`boolean`, default `false`; an opt-in, `true` by default from 7.0 ([Versions, opt-ins and warnings](/versions)). The type of a column whose type is an enum of another schema. `false`, as in Zapatos 6.6.1, looks the enum up by name in the schema of the column's relation; `true` looks it up in its own schema, and writes its labels:

```sql
CREATE SCHEMA archive;
CREATE TYPE archive.print_format AS ENUM ('nitrate', 'safety', 'digital');
CREATE TYPE archive.crew_job AS ENUM ('projectionist', 'archivist');  -- public has a crew_job too
CREATE TABLE prints (id int PRIMARY KEY, format archive.print_format NOT NULL, formats archive.print_format[], keeper archive.crew_job);
```

| Column of `prints` | `false` | `true` |
|---|---|---|
| `format` | `c.PgPrint_format`, an `any` placeholder | `('digital' \| 'nitrate' \| 'safety')` |
| `formats` | `c.Pg_print_format \| null`, an `any` placeholder | `('digital' \| 'nitrate' \| 'safety')[] \| null` |
| `keeper` | `crew_job \| null`: the labels of `public.crew_job` | `('archivist' \| 'projectionist') \| null` |

- The labels are written out, not named: the enum's schema needn't be in [`schemas`](#generate.schemas). In the order of [`enumOrder`](#generate.enumOrder), as for every enum.
- A domain over such an enum stays a custom type, `c.<name>`; its new placeholder gets the labels rather than `any`. An existing placeholder is never overwritten.
- `false` notes, through [`warningListener`](#generate.warningListener), the columns `true` would change, each with its type: for a domain, the type under it.

### `enumOrder` {#generate.enumOrder}

`"alphabetical"` or `"declared"`, default `"alphabetical"`; an opt-in, `"declared"` by default from 7.0 ([Versions, opt-ins and warnings](/versions)). The order of an enum's labels. `"alphabetical"`, as in Zapatos 6.6.1, sorts them; `"declared"` keeps the order the enum declares them in, by which Postgres sorts and compares its values (`ORDER BY`, `<`, `enum_range()`):

```sql
CREATE TYPE crew_job AS ENUM ('director', 'writer', 'editor', 'cinematographer', 'composer');
```

| Type | `"alphabetical"` | `"declared"` |
|---|---|---|
| `crew_job` | `'cinematographer' \| 'composer' \| 'director' \| 'editor' \| 'writer'` | `'director' \| 'writer' \| 'editor' \| 'cinematographer' \| 'composer'` |
| `every.crew_job` | `['cinematographer', 'composer', 'director', 'editor', 'writer']` | `['director', 'writer', 'editor', 'cinematographer', 'composer']` |

- A label added by `ALTER TYPE … ADD VALUE … BEFORE` or `AFTER` takes its place in that order, as `enum_range()` gives it.
- For TypeScript, only `every.<name>` changes: a union is the same type in any order. With [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), the labels written out for an enum of another schema, and the new placeholder of a domain over one, take the same order.
- Another value stops the generator before any query, and writes nothing: `enumOrder must be 'alphabetical' (the default) or 'declared', not 'declard'`. In TypeScript, it fails to compile (TS2322, or TS2820 with a suggestion for a near-miss such as `"declard"`).
- `"alphabetical"` notes, through [`warningListener`](#generate.warningListener), each generated enum whose declared order is not alphabetical.

### `moduleNames` {#generate.moduleNames}

`"zapatos"` or `"pgcast"`, default `"zapatos"`. The module names the generated files declare and import, and the folder they go in. It must match the folder pgcast is installed in, under `node_modules`: `"pgcast"` for a new project, installed as `pgcast`; `"zapatos"` for one that switched from Zapatos under the `zapatos` alias ([Switching from Zapatos](/switching)).

| | `"zapatos"` | `"pgcast"` |
|---|---|---|
| Folder | `zapatos/` | `pgcast/` |
| Declares | `zapatos/schema`, `zapatos/custom` | `pgcast/schema`, `pgcast/custom`, and `zapatos/schema` |
| Imports | `zapatos/db` | `pgcast/db` |
| Version canary comment | `` update by running `npx zapatos` `` | `` update by running `npx pgcast` `` |
| Your imports | `zapatos/db`, `zapatos/schema`, `zapatos/generate` | `pgcast/db`, `pgcast/schema`, `pgcast/generate` |

::: code-group

```json [zapatosconfig.json]
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

- `"zapatos"` writes Zapatos 6.6.1's files, byte for byte: the option changes nothing until it is `"pgcast"`.
- `"pgcast"` writes the same types, and ends `pgcast/schema.d.ts` with `declare module 'zapatos/schema' { export * from 'pgcast/schema'; }`: `pgcast/db`'s own declarations import `zapatos/schema`. Without it, every type would be `any`: under `skipLibCheck`, silently.
- In the generated files, `zapatos` is left in that line and in the headers' credit to Zapatos. The config file keeps its name, `zapatosconfig.json` ([#368](https://github.com/AlexandreDemartin/pgcast/issues/368)); `npx pgcast` and `npx zapatos` both read the option.
- Another value stops the generator before any query, and writes nothing: `moduleNames must be 'zapatos' (the default) or 'pgcast', not 'pgcats'`. In TypeScript, it fails to compile (TS2322, or TS2820 with a suggestion for a near-miss such as `"pgcats"`).
- The other mode's schema in `outDir`, such as a `zapatos/` folder left from before the switch, is noted through [`warningListener`](#generate.warningListener). Both declare `zapatos/schema`, which TypeScript merges: with `"pgcast"`, a stale `zapatos/` that `tsconfig.json` includes lets a number through for a `text` column under `skipLibCheck`, and fails with TS2307 without it. Delete it once the placeholders you edited are moved to `pgcast/custom/`, renaming their `declare module 'zapatos/custom'` to `'pgcast/custom'`.

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
- `Note: custom types "archive"."notes" and "public"."notes" are both named PgNotes in TypeScript, so they share one type and one placeholder file, src/zapatos/custom/PgNotes.d.ts. To type them apart, rename one of them in the database.`
  - once per run for each name that two Postgres types share ([`customTypesTransform`](#generate.customTypesTransform)); when their names differ, it adds that a `customTypesTransform` function can keep them apart;
- `Note: the include entry "Films" of schema "public" matches no relation there, so it generates nothing. Check its spelling and case, that the relation is in schema "public", and that the database role has a privilege on it: include names tables, views, materialised views and foreign tables.`
  - once per run for each entry of an [`include`](#generate.schemas) list that its schema doesn't have;
- the note on `bigint` and `numeric` columns, once per process ([`customJSONParsingForLargeNumbers`](#generate.customJSONParsingForLargeNumbers));
- `` Note: public.prints.format (archive.print_format), public.prints.formats (archive.print_format[]) and public.prints.keeper (archive.crew_job) have a type of another schema, which is looked up by name in the schema of their relation: an enum becomes an `any` custom type, or the enum of the same name there. Set typeEnumsAcrossSchemas: true to look it up in its own schema; it will be the default in pgcast 7.0. ``
  - once per run, without [`typeEnumsAcrossSchemas`](#generate.typeEnumsAcrossSchemas), when a column it would change is generated;
- `` Note: every.crew_job lists the labels of enum public.crew_job in alphabetical order, not in their declared order, by which Postgres sorts and compares them. Set enumOrder: 'declared' to keep that order; it will be the default in pgcast 7.0. ``
  - once per run, with [`enumOrder`](#generate.enumOrder) `"alphabetical"`, when a schema of [`schemas`](#generate.schemas) has an enum whose declared order is not alphabetical; several as `every.<name> lists the labels of enums archive.print_format and public.crew_job`;
- `Note: src/zapatos/schema.d.ts is here too, generated with moduleNames: 'zapatos'. It declares 'zapatos/schema', as src/pgcast/schema.d.ts does, and TypeScript merges the two: types can loosen, silently under skipLibCheck. Delete the folder src/zapatos, once any placeholder you edited there is moved to src/pgcast/custom.`
  - after writing, when `outDir` holds the schema of the other [`moduleNames`](#generate.moduleNames), either way; a folder without its `schema.d.ts` is not noted;
- the [old layout warning](#the-old-layout-warning).

### `debugListener` {#generate.debugListener}

`boolean`, or in `generate()` a function `(s: string) => void`; default `false`. Gets each query the generator sends, `>>> query <n> >>>`, its text and its values, then its result as `pg` returns it, as JSON, `<<< result <n> <<<`.

The relations are read concurrently: with several, the results come back interleaved, and a query's number can change from one run to the next, so `<n>` is what pairs a result with its query.

The unique indexes of `tags`, with `"schemas": { "public": { "include": ["tags"], "exclude": [] } }`, cut after its rows:

```txt
>>> query 3 >>>
SELECT DISTINCT i.indexname
FROM pg_catalog.pg_indexes i
JOIN pg_catalog.pg_class c ON c.relname = i.indexname
JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
WHERE i.tablename = $1 AND i.schemaname = $2
ORDER BY i.indexname
+ ["tags","public"]

<<< result 3 <<<
{
  "command": "SELECT",
  "rowCount": 1,
  "oid": null,
  "rows": [
    {
      "indexname": "tags_pkey"
    }
  ],
  …
```

The result is `pg`'s whole `Result` object: after `rows` come `fields`, its column types, and about seventy lines of `pg`'s own type parsers, the same for every query.

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

- A placeholder holds the `Selectable` type of the domain's base type: `string` for `seat_label`, a `text`; `Date` for a `date` domain; `db.JSONValue` for a `json` or `jsonb` one, with its `import type * as db from 'zapatos/db'`. A type the generator can't map (`point`) gets `any`. How to fill one in: [Use custom types and domains](/custom-types).
- A base type mapped to another `db.*` type (`int8`, `numeric`, `time`, ranges…) gives a placeholder that does not compile until you edit it: `export type PgTicket_no = db.Int8String;` comes with no import, and `tsc` fails with TS2503, `Cannot find namespace 'db'` ([#184](https://github.com/AlexandreDemartin/pgcast/issues/184)). Add `import type * as db from 'zapatos/db';` above it.
- A domain over an enum is the same: `export type PgGenre_d = genre;` fails with TS2304 until you add `import type { genre } from 'zapatos/schema';`.
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

Why the types look as they do, a `timestamptz` a `Date` in `Selectable` and a string in `JSONSelectable`: [How types are cast from the catalog](/catalog-types).

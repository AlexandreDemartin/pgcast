# Typed SQL

From `@pgcast/typegen` 0.1.0. Ask Postgres for the row type of a [raw SQL query](/raw-sql) and keep it beside your generated schema.
{.lede}

## 1. Install {#install}

[Install the core](/install#add-the-package), then add the tool. Its peers are `@pgcast/pgcast`, `pg` and `typescript`. Your application's core, its imported alias (`zapatos` or `pgcast`) and the `@pgcast/pgcast` peer resolved by the tool must have the same version.

```sh
npm install --save-dev @pgcast/typegen
```

For generation and checking, the tsconfig passed to `--project` (default `tsconfig.json`) must resolve a [supported TypeScript parser](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md#3-naming-finding-writing-checking). Your application can compile the committed types separately.

## 2. Name the query {#name-the-query}

Import `Row` from the file the tool will generate. Put a literal query name in the second type argument of `db.sql`. Here `Row<'films-by-studio'>` describes one film, and `[]` gives the result of `.run(pool)` its array type.

<CastPanel example="typed_sql_films">

<<< ./examples/typed_sql_films.ts{ts twoslash}

</CastPanel>

## 3. Generate the rows {#generate-the-rows}

From the directory with your pgcast config, connect to the migrated database using `db` (omit `query_timeout`) or pg's environment variables. Use the application's role and `search_path`, with no temporary objects, so names resolve to the same objects in both sessions.

```sh
npx --no-install pgcast-typegen
```

The tool scans the project and asks Postgres to describe the named queries without running them. Commit `<outDir>/zapatos/queries.ts` beside your schema. With `moduleNames: "pgcast"`, import from the generated `pgcast/queries.ts` and use `pgcast/db`.

## 4. Check in CI {#check-in-ci}

```sh
npx --no-install pgcast-typegen --check
```

| Config | What the check compares |
|---|---|
| Omit `db` | Offline, even with pg environment variables set. Compares query names and SQL with placeholders against the committed file and checks its format. Row types stay unchecked. |
| Set `db` to the migrated database | Describes each query again and compares the generated file byte for byte, including its row types. |

Either check leaves the file untouched. A difference or an error exits with code 1. After a query or schema change, regenerate and commit the diff.

## 5. Narrow a column {#narrow-a-column}

The generated `total` is `string | null`: Postgres gives the count no source column. Even for an empty table, `count(*)` returns a number and pg decodes that `bigint` as a string. Use `NotNull` to narrow `total` to `string`.

<CastPanel example="typed_sql_count">

<<< ./examples/typed_sql_count.ts{ts twoslash}

</CastPanel>

## What stays manual

- **Parameters.** Check input values yourself.
- **Decoding.** Row types follow pg's default text parsers. If `setTypeParser` changes a field's type, supply your own row type. You also supply the shape inside a JSON value.
- **Interpolations.** Use literal identifiers or `param()`. Conditions, bare variables, helper calls, `raw()` and nested fragments need a hand-written row type.
- **Parameter forms.** Up to four `param()` calls without a cast or with `true` can vary between plain and JSON forms. At least one form must parse and all successful forms must agree on the row. Give a parameter a literal cast or `false` to fix its form ([full rules](https://github.com/AlexandreDemartin/pgcast/tree/master/tools/typegen#readme)).
- **Nullability.** A field keeps `| null` when the tool cannot prove a non-null table origin. An outer join can loosen every field. Leave the union in place unless the decoded field can never be `null`.
- **Regeneration.** Rerun the command when the SQL or schema changes. From 0.2.0, `--watch` regenerates the rows each time a source file changes and describes only the queries whose text changed. It does not watch the schema: after a migration, one run without `--watch` is enough, and a running `--watch` then describes every query again.

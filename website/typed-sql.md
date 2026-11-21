# Typed SQL

From `@pgcast/typegen` 0.1.0. Ask Postgres for the row type of a [raw SQL query](/raw-sql) and keep it beside your generated schema.
{.lede}

## 1. Install {#install}

In your pgcast project, add the tool as a development dependency once published. Its peers are `@pgcast/pgcast`, `pg` and `typescript`. The core package and the alias you import as `zapatos/db` must have the same version.

```sh
npm install --save-dev @pgcast/typegen
```

Generation and checking use TypeScript's JavaScript parser API. If your compiler falls outside the [supported parser range](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md#3-naming-finding-writing-checking), run the tool with a compatible TypeScript installation in development or CI. Your application can compile the committed types separately.

## 2. Name the query {#name-the-query}

Import `Row` from the file the tool will generate. Put a literal query name in the second type argument of `db.sql`. Here `Row<'films-by-studio'>` describes one film, and `[]` gives the result of `.run(pool)` its array type.

<CastPanel example="typed_sql_films">

<<< ./examples/typed_sql_films.ts{ts twoslash}

</CastPanel>

## 3. Generate the rows {#generate-the-rows}

From the directory with your pgcast config, connect to the migrated database using the config's `db` or pg's environment variables. Use the same role and `search_path` as the application.

```sh
npx --no-install pgcast-typegen
```

The tool scans `tsconfig.json` (or `--project <tsconfig>`) and asks Postgres to describe the named queries without running them. Commit `<outDir>/zapatos/queries.ts` beside your schema. With `moduleNames: "pgcast"`, import from the generated `pgcast/queries.ts` and use `pgcast/db`.

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

The generated `total` is `string | null`: Postgres gives the count no source column. Even for an empty table, `count(*)` returns a number and pg decodes that `bigint` as a string. Use `NotNull` for a field whose **decoded value** you know can never be null.

<CastPanel example="typed_sql_count">

<<< ./examples/typed_sql_count.ts{ts twoslash}

</CastPanel>

## What stays manual

- **Parameters.** Check input values yourself. The tool describes results using pg's default text parsers.
- **Interpolations.** Use literal identifiers or `param()`. A literal cast or `false` fixes the parameter's SQL. At most four calls without a cast or with `true` may vary between plain and JSON forms. For conditions, variables interpolated directly, helper calls, `raw()` or nested fragments, write the row type yourself.
- **Nullability.** A field keeps `| null` when the tool cannot prove a non-null table origin. An outer join can loosen every field. Leave the union in place unless your query guarantees the decoded value.
- **Regeneration.** Rerun the command when the SQL or schema changes. The tool has no `--watch` yet.

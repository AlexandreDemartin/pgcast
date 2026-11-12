# How types are cast from the catalog

Every type pgcast gives you is read from your database; none is written by hand. This page is about how that works: what the generator asks Postgres, why each table comes out as five types rather than one, and how the type of a query's result follows the options you give it.
{.lede}

## Postgres describes itself

A Postgres database knows its own shape, and keeps it in its catalog: the system tables of `pg_catalog`, and the standard views of `information_schema` built over them. When you run `npx pgcast`, the generator asks those tables a handful of questions for each schema, and writes the answers down as TypeScript in `zapatos/schema.d.ts`. It doesn't connect again: from then on, your code is checked against that file alone.

| It reads | From | It becomes |
|---|---|---|
| each relation, its kind, and whether it takes an `INSERT` | `information_schema.tables`, `pg_matviews` | a namespace per table, view, foreign table or materialised view |
| each column's type, or its domain and the domain's base type | `information_schema.columns`; `pg_attribute` and `pg_type` for a materialised view | the column's TypeScript type, once per context ([below](#one-column-five-types)) |
| whether the column may be `NULL` | `is_nullable` | `\| null`, and optional in `Insertable` |
| its default, identity or generated value | `column_default`, `identity_generation`, `is_generated` | optional in `Insertable`; a `GENERATED ALWAYS` column is left out of `Insertable` and `Updatable` |
| its `COMMENT ON COLUMN` | `pg_description` | the JSDoc your editor shows for the column, with its Postgres type and default |
| each enum and its labels | `pg_enum` | a union of strings, and the tuple `every.<name>` |
| each unique index | `pg_indexes`, `pg_index` | `UniqueIndex`, the names [`constraint()`](/insert#constraint) takes |

To watch the queries themselves, set [`debugListener`](/generator#generate.debugListener). A domain, such as `seat_label`, and a type the generator has no mapping for, such as `point`, each get a placeholder in `zapatos/custom/`, yours to fill in ([Use custom types and domains](/custom-types)). And what the catalog can't see, such as a column a trigger fills in, you say in the config: [`columnOptions`](/generator#generate.columnOptions) leaves it out of `Insertable`, or makes it optional there.

### What the catalog doesn't say

The generator reads names, types, nullability and defaults. It doesn't read foreign keys, `CHECK` constraints, or the SQL inside views and functions. So `ratings.stars`, `CHECK (stars BETWEEN 1 AND 5)`, is a `number`; a `seat_label` matching `'^[A-Z][0-9]{1,2}$'` is a `string`; and nothing tells TypeScript that `films.studio_id` points at a studio.

A view is typed as Postgres reports it, and Postgres reports every column of a view as nullable, whatever the tables underneath say. A view of the `id` and `title` of `films` types both as `| null`, and gets an `Insertable` with every column optional, since Postgres can write through it; a view over a join, which it can't write through, gets an `Insertable` and an `Updatable` that take nothing (`[key: string]: never`). A materialised view keeps no `NOT NULL` at all, so its columns are nullable too.

That's how Zapatos works, and pgcast keeps it: a type the database doesn't state would be a guess, and a guess is the one thing a generated type mustn't be. Some gaps in what it reads are known, and described here as they are today:

- Enum labels come out in alphabetical order: `crew_job` is `'cinematographer' | 'composer' | 'director' | 'editor' | 'writer'`, not the order of its `CREATE TYPE` ([#49](https://github.com/AlexandreDemartin/pgcast/issues/49)).
- Comments are read on the columns of tables and materialised views only, not of views, foreign tables or partitioned tables ([#47](https://github.com/AlexandreDemartin/pgcast/issues/47)).
- An enum of another schema becomes an `any` placeholder ([#44](https://github.com/AlexandreDemartin/pgcast/issues/44)).

::: info Coming
Reading more of the catalog, each as an opt-in: foreign keys, for laterals that know their join ([#54](https://github.com/AlexandreDemartin/pgcast/issues/54)); a domain's `CHECK (VALUE = ANY (ARRAY[…]))` as a union of its values ([#55](https://github.com/AlexandreDemartin/pgcast/issues/55)); the result types of hand-written SQL ([#62](https://github.com/AlexandreDemartin/pgcast/issues/62)).
:::

## One column, five types

A value isn't the same thing everywhere it goes. A `timestamptz` read by a plain `SELECT` reaches you as a `Date`, because `pg` parses it; read through JSON, it's a string; in a filter it may be either, or some SQL; in a new row, it may be required, or left to its default. So the generator writes each table five times, once per context, each column typed for that context. Here are two columns of `screenings`, from the generated schema:

| Type | What it describes | `starts_at`, `timestamptz NOT NULL` | `subtitled`, a nullable `boolean` |
|---|---|---|---|
| `Selectable` | a row as `pg` returns it, from your own `sql` query | `Date` | `boolean \| null` |
| `JSONSelectable` | a row as the shortcuts return it | `TimestampTzString` | `boolean \| null` |
| `Whereable` | a filter: every key optional | `TimestampTzString \| Date` | `boolean`, never `null` |
| `Insertable` | a new row | required: `TimestampTzString \| Date` | optional: `boolean`, `null` or `DEFAULT` |
| `Updatable` | changes to a row: every key optional | `TimestampTzString \| Date` | `boolean`, `null` or `DEFAULT` |

Wherever a value goes in, it may also be a [`param()`](/sql-template#param) or a [`sql`](/sql-template#sql) fragment, and in a filter a [`parent()`](/sql-template#parent) column. A `Whereable` refuses `null` because `"subtitled" = NULL` is never true in SQL: given one anyway (the type lets it through when `strictNullChecks` is off), the filter compiles to `"subtitled" = $1`, with `null` as `$1`, and finds nothing. [`conditions.isNull`](/conditions#conditions.isNull) writes the `IS NULL` you meant.

A domain or custom type is the exception: its placeholder is one type, used in all five contexts. That suits `seat_label`, a string everywhere, but not a domain over `int8`, `numeric`, `bytea` or a date, whose JSON differs from what `pg` returns ([#194](https://github.com/AlexandreDemartin/pgcast/issues/194)).

The same row, asked for twice, shows the first two side by side:

<<< ./examples/plain/catalog_types_contexts.ts{ts twoslash}

In a session whose `TimeZone` is `UTC`, the first is the `Date` `2030-03-01T19:30:00.000Z`, the second the string `'2030-03-01T19:30:00+00:00'`. In the `sql` query, `s.screenings.Selectable[]` is your word for what `SELECT *` returns; the shortcut works out its own.

## Why the shortcuts return JSON

Each shortcut is one query, and Postgres builds its result itself: each row as one JSON value, with `to_jsonb()` or `jsonb_build_object()`, each `lateral` nested inside it, and for `select()` the rows gathered into one array with `jsonb_agg()`. That's how `select()` brings back films with their cast already in place, in one round trip, with nothing to assemble in JavaScript afterwards.

The price is that every value travels as JSON, and JSON has no dates, no bytes and one kind of number. `JSONSelectable` says what arrives instead:

- a date or a time, as the ISO 8601 string `to_jsonb()` writes; a `timestamptz` with the session's offset, `+00:00` in `UTC` and `+05:30` in `Asia/Kolkata`;
- a `bytea`, as its hex string, `'\xdeadbeef'`, where `pg` gives a `Buffer`;
- an `int8` or a `numeric`, as a JSON number, where `pg` gives a string. A large one loses precision as `JSON.parse()` reads it: the `int8` `9007199254740993` arrives as `9007199254740992`. The generator warns when a schema has such columns, and [`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers) types them for a parser that keeps them whole.

Zapatos returned JSON from every shortcut that returns rows, even those that could do without it, "in the interests of consistency", as its docs put it: one shortcut's row is the same type as another's. And it typed the strings rather than converting them behind your back: [`TimestampTzString`](/runtime-config#TimestampTzString) and its siblings check a string's shape, and [`toDate()`](/runtime-config#toDate) turns one into a `Date` when you choose to, saying in which time zone to read a string that carries none ([Dates and times](/runtime-config#dates-and-times)).

## How a result type follows the query

A shortcut's result type is never declared: TypeScript works it out from the call. The table gives its `JSONSelectable`; `columns` keeps only those keys; each `extras` key adds the type of its column, or of its `sql` fragment; each `lateral` key adds the result type of its subquery, worked out the same way, one level down. Then the shortcut sets the shape: an array for `select()`, the row or `undefined` for `selectOne()`, the row for `selectExactlyOne()`, a number for `count()`. Hover `films` to see what came of this one:

<CastPanel example="catalog_types_result">

<<< ./examples/catalog_types_result.ts{ts twoslash}

</CastPanel>

Three things in that type are worth a closer look:

- **`studio` may be `null`, not `undefined`.** `selectOne()` can find nothing, and in a nested query nothing is JSON's `null`, so the type turns the `undefined` into `null`. Here it can't find nothing, as `films.studio_id` is `NOT NULL REFERENCES studios`; but the generator doesn't read foreign keys, so say so yourself with `selectExactlyOne()`, and `studio` loses its `| null`. Zapatos's docs list this among their limitations; [#54](https://github.com/AlexandreDemartin/pgcast/issues/54) plans to read it from the catalog.
- **`hours` is a `number` because you said so.** A `sql` fragment's type is its second type argument, here `number`, and pgcast doesn't parse your SQL to check it ([Type arguments](/sql-template#type-arguments)). `year`, a column, takes its type from the schema.
- **`roles` is a `number`**, the type of `count()`, though Postgres counts in `int8`: like Zapatos, pgcast assumes no count comes near `Number.MAX_SAFE_INTEGER`.

All of this needs `strictNullChecks`, or `strict`. Without it, `columns`, `extras` and `lateral` leave the type at the table's full `JSONSelectable[]`, and `films[0].studio` doesn't compile ([`select()` options](/select#options)).

## What pgcast kept, and what it changes

The generator is Zapatos 6.6.1's, unchanged so far: the same queries, and so the same `schema.d.ts` for the same database, its version canary still at 104 ([`SchemaVersionCanary`](/runtime-config#SchemaVersionCanary)). What pgcast changes on the way in is in the run-time library, not in the generated types: [`raw()`](/sql-template#raw), [`cols()`](/sql-template#cols) and [`vals()`](/sql-template#vals) no longer type-check as a value of a `Whereable`, `Insertable` or `Updatable`, where 6.6.1 took them for a `Parameter`, an object of the same shape (`{ value }`); and an `undefined` value can mean a missing key, with [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing) ([An `undefined` value](/insert#undefined-values)). Changes to the output itself will come the same way, each as a fix or an opt-in of its own ([Versions, opt-ins and warnings](/versions)).

What pgcast refuses is a second source of truth: a model class, a schema written in TypeScript, a type declared beside the table it describes. The database has the last word, and the cost is a habit: run the generator again after each migration, and let TypeScript point at the queries that no longer fit ([Your first typed query](/first-query#when-the-schema-changes)).

## Further reading

- The entries this page talks about: [`select()` options](/select#options), [`JSONOnlyColsForTable`](/select#JSONOnlyColsForTable), [`ExtrasResult`](/select#ExtrasResult), [`LateralResult`](/select#LateralResult), [`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment), the [value types](/runtime-config#value-types).
- The generator, its options and the files it writes: [The generator: config and CLI](/generator).
- Filling in a placeholder: [Use custom types and domains](/custom-types).

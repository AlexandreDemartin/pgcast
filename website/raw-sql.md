---
description: "When no shortcut writes the query you need, write it in the sql template, and keep every value that comes from outside out of its text."
---

# Raw SQL

When no shortcut writes the query you need (a join, a window function, an `INSERT … SELECT`), write it in the `sql` template, and keep every value that comes from outside out of its text. You already know the shortcuts from the [tutorial](/tutorial); every interpolation is in [SQL template](/sql-template).
{.lede}

<AtAGlance>

- Names go between `${…}`, checked against the tables you give `sql`; a value from outside goes in as `db.param()` or in a Whereable.
- Syntax a caller chooses, such as a sort direction, is one of your own constants: never give `raw()` a caller's text.
- `.compile()` shows the `text` and `values` a query would send: a test that freezes `text` keeps every value from outside in `values`.

</AtAGlance>

## Write the query, its names interpolated

Write the SQL as you would in `psql`, but put each table and column name between `${…}` instead of in the text. Give `sql` the tables the query may name, then the type of the rows you expect:

<CastPanel example="raw_sql_join">

<<< ./examples/raw_sql_join.ts{ts twoslash}

</CastPanel>

- An interpolated name is quoted, `"films"`<!-- probe: examples/raw_sql_join.ts -->, and checked against the first type argument: here `Tables`, the `SQL` type of each table the query names. Qualify a column as `${'films'}.${'title'}`: the type knows each table's columns, not `'films.title'`, unless you name the pair ([Qualify a column by its alias](#qualify-a-column-by-its-alias)).
- The second type argument is your word for what comes back: nothing checks it against the SQL unless you [generate the row type](/typed-sql). The rows come as `pg` parses them, as a `Selectable` describes them (a `Date` for a `timestamptz`), not as the JSON of the shortcuts' `JSONSelectable`. A `count(*)` is a `bigint`, which `pg` gives as a string: `'4'`.
- Keywords stay in the text. SQL you write yourself is safe there; only what comes from outside needs the steps below.

A name the type doesn't know fails to compile: a query that names `screenings` needs `s.screenings.SQL` in its first type argument.

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'screenings'}`;
```

A write is written the same way. This `INSERT … SELECT` copies one film's tags to another, and `RETURNING *` gives back the rows it added:

<CastPanel example="raw_sql_insert_select">

<<< ./examples/raw_sql_insert_select.ts{ts twoslash}

</CastPanel>

- [`db.cols()`](/sql-template#cols) writes the column list, `"film_id", "tag"`<!-- probe: examples/raw_sql_insert_select.ts -->. `columns`, typed `s.tags.Column[]`, checks the names: `db.cols()` alone takes any, so `'tagz'` would compile, and Postgres refuse it (42703).
- `ON CONFLICT DO NOTHING` skips a tag the film has already. Without it, Postgres refuses the whole `INSERT` with 23505, and adds none.

## Pass each value as a parameter

A value from a caller (a form, a URL, a row you read elsewhere) goes in as [`db.param()`](/sql-template#param), or in a [Whereable object](/sql-template#whereable), which makes a parameter of each value:

<CastPanel example="raw_sql_values">

<<< ./examples/raw_sql_values.ts{ts twoslash}

</CastPanel>

- <code v-pre>${{ studio_id: studioId }}</code> is `("studio_id" = $1)`<!-- probe: examples/raw_sql_values.ts -->: a filter of `films`, as the `where` of [`select()`](/select#select) takes it, so [conditions](/conditions) work in it too: [`gte()`](/conditions#conditions.gte) in `{ release_year: db.conditions.gte(1990) }`.
- `${db.param(genre)}` is `$2`, in `$2 = ANY("genres")`<!-- probe: examples/raw_sql_values.ts -->: a parameter fits wherever SQL takes a value.
- An array is one parameter: `` ${'id'} = ANY(${db.param(ids)}) `` sends `ids` as a Postgres array by default; with `castArrayParamsToJson` on, it does not ([below](#cast-a-parameter-postgres-can-t-type)).
- A part of the query that only some calls need is a nested fragment, or `[]` for nothing ([Nested fragments](/sql-template#nested-fragments)).

A bare string between `${…}` is a name, not a value, so the type refuses it:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
function filmTitled(title: string) {
  return db.sql<s.films.SQL>`SELECT * FROM ${'films'} WHERE ${'title'} = ${title}`;
}
```

If it got past the type (an `any`, a `@ts-ignore`), it would still be a name, and the caller would pick it:

- A real column matches every row: `'title'` compiles to `"title" = "title"`<!-- probe: db.sql`${'title'} = ${'title'}` -->, true wherever `title` is not null, and so do `'films.title'` and `'"title"'`. In a `DELETE`, that deletes them.
- An unknown one fails: `'The Salt Orchard'` gives `"title" = "The Salt Orchard"`<!-- probe: db.sql`${'title'} = ${'The Salt Orchard'}` -->, a column that does not exist (42703).
- It can be any column in scope, a system column such as `xmin` included, and, where a table goes, any relation the role can read, `'schema.table'` included: `` FROM ${'pg_catalog.pg_roles'} `` lists the database's roles.
- Any `"` in it is doubled, so it can't close its quotes (in Zapatos 6.6.1 it could, [Identifiers](/sql-template#identifiers)), but that does not make it a value.

The keys of an interpolated object are names too. The type refuses an unknown key only in an object literal (TS2353): an object built at run time (a `Record<string, string>`, `Object.fromEntries()`, a variable with extra keys) passes it with any key.

::: warning Security
An interpolated object that is not a `param()`, a fragment or another of pgcast's values compiles as a Whereable, a class instance included.

A built-in object of the realm that runs pgcast throws while compiling, before any query; one from another realm, such as a `vm` context, does not. `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, with `when` a `Date` typed `any`, no longer compiles to `DELETE FROM "ratings" WHERE TRUE`, as in Zapatos 6.6.1, which deleted every rating ([Whereable objects](/sql-template#whereable)). Pass a date as `db.param(when)`.

Any object with no keys is `TRUE`, a typed Whereable included: `const where: s.ratings.Whereable = {}`, given a `film_id` only `if (filmId)`, compiles with no error to the same `DELETE`. Check for an empty filter before a `DELETE` or an `UPDATE` ([Whereable objects](/sql-template#whereable)). The check below catches `{}`, not a key whose value compiles to `true`, such as `film_id: db.conditions.isNotIn([])`:

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
function removeRatings(filmId?: number) {
  const where: s.ratings.Whereable = {};
  if (filmId) where.film_id = filmId;
  if (Object.keys(where).length === 0) throw new Error('No filter: that would delete every rating');
  return db.deletes('ratings', where);
}
```

:::

## Cast a parameter Postgres can't type

Postgres gives a parameter a type from where it stands. Compared with a column, it takes the column's type; elsewhere, Postgres may infer another. Give it the type as `param()`'s second argument:

<CastPanel example="raw_sql_cast">

<<< ./examples/raw_sql_cast.ts{ts twoslash}

</CastPanel>

- `$1`, compared with `starts_at` in `"starts_at" >= $1`<!-- probe: examples/raw_sql_cast.ts -->, is a `timestamptz` already.
- `$2`, in `CAST($2 AS "timestamptz") + make_interval(hours => $3)`<!-- probe: examples/raw_sql_cast.ts -->, is added to an `interval`, so without its cast Postgres reads it as one, and fails: `operator does not exist: timestamp with time zone < interval` (42883).
- `db.param(from, 'timestamptz')` writes `CAST($2 AS "timestamptz")`<!-- probe: examples/raw_sql_cast.ts -->; `` ${db.param(from)}::timestamptz `` in the text does the same.
- The cast is the type's catalog name, in lower case (`int4`, `timestamptz`, `crew_job`), each part quoted. `'integer'` gives `CAST($1 AS "integer")`<!-- probe: db.sql`${db.param(1, 'integer')}` -->, a type that does not exist (42704), as do `'int'` and `'TIMESTAMPTZ'`.
- Name a schema as `'public.crew_job'`, which gives `"public"."crew_job"`<!-- probe: db.sql`${db.param(1, 'public.crew_job')}` -->, as `'public"."crew_job'` does. An array type keeps its bounds outside the quotes: `'int4[]'` gives `"int4"[]`<!-- probe: db.sql`${db.param(1, 'int4[]')}` -->.
- With [`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) on, an array parameter is sent as JSON, `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) -->, unless its cast ends with `[]` or `[n]`: `db.param(ids, 'int4[]')` gives `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1], 'int4[]')}`) --> with the array ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)). Any other string cast keeps the JSON, cast to that type, `'_int4'` included.
- With [`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson) on, a plain object is sent as JSON whatever its cast, cast to the type written.

Every form of the cast: [`param()`](/sql-template#param).

## Call a Postgres function

A call is SQL like any other: the function's name in the text, each column between `${…}`, each value a `db.param()`. pgcast reads no function from the catalog, so the result's type is yours to write:

<CastPanel example="raw_sql_function">

<<< ./examples/raw_sql_function.ts{ts twoslash}

</CastPanel>

- `${'title'}` is a column of the shortcut's table, `film_label("title", "release_year")`<!-- probe: examples/raw_sql_function.ts -->, checked against `s.films.SQL`. A value from outside is a [`db.param()`](/sql-template#param); named notation works too, `film_label(year => ${db.param(year)}, title => ${db.param(title)})`.
- Type the result `| null`: no function promises a value. This one gives `NULL` for a `NULL` argument, and a `STRICT` function always does.
- The name stays in the text, so a mixed-case one keeps its quotes there, `"filmCount"(…)`: unquoted, Postgres looks for `filmcount`, and finds none (42883).

What comes back depends on where the call runs. In a shortcut (`extras`, a `lateral`) its value goes through JSON, as a column's does in a `JSONSelectable` ([why](/catalog-types#why-the-shortcuts-return-json)); run on its own, `pg` parses it, as a `Selectable` describes it:

| Postgres gives | In a shortcut | Run on its own, ``sql`SELECT …` `` |
|---|---|---|
| an `int8` | a number | a string |
| a `timestamptz` | a string, `'2030-03-01T19:30:00+00:00'` in UTC | a `Date` |
| two `OUT` parameters | an object, `{ first_at, last_at }` | the record's text, `'("2030-03-01 19:30:00+00",…)'` in UTC; `SELECT * FROM` the call gives its columns |

### Pick an overload

`films_of()` returns a studio's films, `SETOF films`, so it goes in `FROM`, its rows a `Selectable[]`. It takes the studio's id or its name:

<CastPanel example="raw_sql_function_overload">

<<< ./examples/raw_sql_function_overload.ts{ts twoslash}

</CastPanel>

- `pg` sends every value untyped, and Postgres reads an untyped parameter as `unknown`. Among the functions of the call's arity, it picks one that takes a string: uncast, `films_of($1)`<!-- probe: db.sql`films_of(${db.param(1000)})` --> with `1000` looks for a studio named `'1000'`, and finds no film.
- `db.param(studioId, 'int4')` writes `CAST($1 AS "int4")`<!-- probe: examples/raw_sql_function_overload.ts -->, and Postgres calls the `integer` one. The cast takes the catalog's name: `'int'` gives `"int"`, a type that does not exist (42704). Naming the argument picks it too: `films_of(studio_id => ${db.param(studioId)})`.
- A column has a type already: `films_of("studios"."id")`<!-- probe: examples/raw_sql_function_lateral.ts --> picks the `integer` one with no cast ([below](#return-rows-into-a-shortcut)).

The rule Postgres follows for an untyped parameter, by the functions of that name and arity:

| The candidates | Postgres |
|---|---|
| one takes a string (`text`) | calls it |
| none does, one takes its category's preferred type: `float8` beside `int` | calls it |
| any other pair: `int` and `bigint`, `int` and `numeric`, `boolean` and `int` | refuses the call, 42725 `function … is not unique`: cast the parameter |
| `g(x int)` and `g(x int, y int DEFAULT 0)`, which its default lets take one argument | refuses `g($1)`, cast or not (42725); `g($1, $2)` calls the second |
| a polymorphic one, `first_genre(a anyarray)` | refuses the call, 42804 `could not determine polymorphic type`: cast it, `db.param(genres, 'text[]')` |

### Pass an array to `VARIADIC`

`total_runtime()` takes any number of film ids, `VARIADIC film_ids INTEGER[]`. Pass the array with the keyword:

<CastPanel example="raw_sql_function_variadic">

<<< ./examples/raw_sql_function_variadic.ts{ts twoslash}

</CastPanel>

- The array is one parameter, `VARIADIC $1`<!-- probe: examples/raw_sql_function_variadic.ts -->, so the query is the same for any length, `[]` included (a sum of no rows: `null`).
- Without the keyword, Postgres reads the array as the first integer, and refuses it (22P02). Values one by one, `total_runtime($1, $2)`, need no keyword.

### Return rows into a shortcut

A function that returns rows goes in a `lateral`, its rows gathered into one value:

<CastPanel example="raw_sql_function_lateral">

<<< ./examples/raw_sql_function_lateral.ts{ts twoslash}

</CastPanel>

- `jsonb_agg(to_jsonb(f) ORDER BY …)` makes one JSON array of the rows, typed `s.films.JSONSelectable[] | null`: `null` for a studio with no film.
- Never in `extras`: there, the call gives the outer query one row per row it returns. A studio with two films comes back twice, and one with none is gone.

pgcast has no `fn()` and generates no function's signature: calls in real code are few, most take no argument, and a helper could neither write `VARIADIC` nor pick an overload of one arity ([decision 009](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/009-functions.md)).

## Choose SQL at run time from your own constants

Some choices are syntax, not values: a sort direction, the column to sort on. A parameter can't stand for them, so map the caller's choice to one you wrote:

<CastPanel example="raw_sql_order">

<<< ./examples/raw_sql_order.ts{ts twoslash}

</CastPanel>

- [`db.raw()`](/sql-template#raw) writes its string as it is. Here it only ever gets `'DESC'` or `'ASC'`, whatever the caller sent.
- The column is a name: quoted, it can't close its quotes, but the caller's string could name any column in scope, a system column such as `xmin` included, or none (42703, or 42P01 for a table outside the query). `find()` keeps one of yours, typed as the template wants.

::: warning Security
Whatever reaches `raw()` runs as SQL, and its type takes any string. Give it a caller's text, and the caller writes your query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const title = "x' OR TRUE --";  // from the caller
db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.raw(`'${title}'`)}`;
```

<!-- probe: db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.raw("'x' OR TRUE -" + "-'")}` -->
```sql
SELECT "title" FROM "films" WHERE "title" = 'x' OR TRUE --'
```

That returns every film. A value is a `param()`, always: `${db.param(title)}` gives `"title" = $1`<!-- probe: db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.param('x')}` -->, and no film.
:::

## Compare a column with SQL, through `self`

A fragment as a Whereable value compares its column with SQL of your own, [`db.self`](/sql-template#self) standing for the column:

<CastPanel example="raw_sql_self">

<<< ./examples/raw_sql_self.ts{ts twoslash}

</CastPanel>

- `lower(${db.self})` is `lower("title")`<!-- probe: examples/raw_sql_self.ts -->, and the caller's text is still a parameter, `lower($1)`<!-- probe: examples/raw_sql_self.ts -->.
- An equality, unlike [`ilike()`](/conditions#conditions.ilike): a `_` or a `%` in the caller's text matches only itself.
- The same object works as the `where` of [`select()`](/select#select) and the other shortcuts.
- Where it has no column to stand for, `self` throws "The 'self' column alias has no meaning here"<!-- message -->, so [`run()`](/sql-template#run) rejects before any query.

## Reach the outer row, through `parent()`

A hand-written subquery can go in a shortcut's `lateral`, where [`db.parent()`](/sql-template#parent) names a column of the outer query's table:

<CastPanel example="raw_sql_parent">

<<< ./examples/raw_sql_parent.ts{ts twoslash}

</CastPanel>

- `${db.parent('id')}` is `"studios"."id"`<!-- probe: examples/raw_sql_parent.ts -->, the studio of each row.
- The subquery gives one column, named `result`: that is what `lateral` reads. Its type argument, `string | null`, is the key's type: `string_agg()` of no rows is `NULL`.
- With `strict` off, the key is not in the type ([`lateral`](/select#lateral)).
- Outside a `lateral`, `parent()` throws "The 'parent' table alias has no meaning here"<!-- message -->, so [`run()`](/sql-template#run) rejects before any query.

Joins through `lateral`, step by step: [Joins](/lateral).

## Qualify a column by its alias

A table joined to itself needs an alias for one side, or Postgres refuses it (42712). Name the alias in `sql`'s first type argument, as a pair with the table's columns, and each `${'alias.column'}` is checked:

<CastPanel example="raw_sql_alias">

<<< ./examples/raw_sql_alias.ts{ts twoslash}

</CastPanel>

- An interpolated string is split on `.`, each part quoted: `${'mentors.name'}` is `"mentors"."name"`<!-- probe: examples/raw_sql_alias.ts -->. A table's own name pairs the same way, `` `crew.${s.crew.Column}` ``.
- The alias stays bare in the text, `"crew" AS mentors`<!-- probe: examples/raw_sql_alias.ts -->: `${'mentors'}` is neither a table nor a column of the type argument.
- Wilhelmina Strand has no mentor, so the `JOIN` leaves her out: three rows.

A column `crew` lacks, or an alias the type argument doesn't name, fails to compile:

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
type CrewAndMentors = s.crew.SQL | `crew.${s.crew.Column}` | `mentors.${s.crew.Column}`;
// ---cut---
db.sql<CrewAndMentors>`SELECT ${'mentors.title'} FROM ${'crew'} AS mentors`;
db.sql<CrewAndMentors>`SELECT ${'mentor.name'} FROM ${'crew'} AS mentors`;
```

The type checks the pair, not the query; Postgres checks the rest when it runs:

- Write the alias in lower case: unquoted, `AS Mentors` is `mentors` to Postgres, so `${'Mentors.name'}`, quoted, is 42P01.
- Once a table has an alias, its own name no longer qualifies its columns: 42P01.
- Nothing checks the `FROM`: an alias it doesn't define is 42P01.
- A column whose name holds a `.` fits the pair, yet `${'mentors.a.b'}` is `"mentors"."a"."b"`<!-- probe: db.sql`${'mentors.a.b'}` --> (42P01): only the quoted string runs, `${'"mentors"."a.b"'}`, named as it is in the type argument.
- The pair is checked only while the table's `SQL` refuses a bare string. In a schema generated by Zapatos 6.6.1 or by pgcast up to 6.10.0, a column named like a member of `String`, of a type that member fits (`search` typed `any`, `length` a number), lets any string through, as it does a bare column. From 6.11.0, the table's `SQL` refuses it once the schema is generated again: regenerate it ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)). From 6.11.0 too, the shortcuts refuse such a string as a `where` or a row whatever the schema; `db.SQL`, `and()`, `or()`, `not()` and a Whereable given as `sql`'s type argument still take it, by design ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)).

A shortcut's [`alias`](/select#alias) needs none of this: its columns and Whereable keys resolve to the alias, and `db.parent()` reaches the outer query. A `where` or `extras` fragment that names the alias takes the same type argument: `"member"."mentor_id" IS NULL`<!-- probe: db.select('crew', db.sql`${'member.mentor_id'} IS NULL`, { alias: 'member' }) -->.

There is no alias helper: the type argument already checks the pair, with no new export ([decision 010](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/010-aliases-and-with.md#3-qualified-column-names)).

## Put a CTE before a shortcut

From 6.11.0, [`db.withCTEs()`](/sql-template#withCTEs) puts CTEs before a shortcut, or any fragment, and keeps its result: here a number, as `count()` gives.

<CastPanel example="raw_sql_ctes">

<<< ./examples/raw_sql_ctes.ts{ts twoslash}

</CastPanel>

- Each key names a CTE, written as one quoted name: `"recent"`<!-- probe: examples/raw_sql_ctes.ts -->. Name it in lower case, as the literal reads it: a key `Recent` is `"Recent"`<!-- probe: db.withCTEs({ Recent: db.sql`SELECT 1` }, db.sql`SELECT 2`) -->, which `FROM Recent` does not find (42P01).
- The CTEs come in the object's order, so each can read those before it. One that reads a later one is refused (42P01); an integer key comes first, as `Object.keys` gives it.
- `withCTEs({}, query)` gives a copy of `query`, its own SQL. A list of CTEs built at run time needs no branch for the empty case, where a `WITH` that `sql` writes over an empty list is refused (42601).
- Write a CTE's name and its columns in the literal, `SELECT id FROM recent`, as the query's own names: no type knows them, and `db.raw()` of a constant would check no more.
- Name a CTE apart from your tables. `WITH "films" AS (…)` before `select('films', …)` reads the CTE's rows, typed as the table's. A column the CTE lacks is missing from the rows, though the type has it, and is refused (42703) only where the query names it: in `columns`, a Whereable or `order`.

A write shortcut can be a CTE too. It runs, and the main query sees each table as it was before the statement:

<CastPanel example="raw_sql_ctes_insert">

<<< ./examples/raw_sql_ctes_insert.ts{ts twoslash}

</CastPanel>

- `tagsBefore` is `0` on the docs schema: the tag is there once the statement has run. To read the inserted rows, read the CTE, ``db.sql`SELECT result FROM added` ``, each row as JSON in `result`, as the shortcut returns it.
- Postgres runs a data-modifying CTE only at the top level. Nested, in a `lateral` for one, it is refused (0A000).
- An `insert()` or `upsert()` of no row, as the main query or as a CTE, is written `SELECT NULL::jsonb AS result WHERE false`<!-- probe: db.withCTEs({ a: db.sql`SELECT 1` }, db.insert('films', [])) -->, which no table refuses: the CTEs run, and the main query resolves to `[]`.

Nested, `withCTEs()` goes where its query would: in parentheses as an `extras` or `insert()` value, as a subquery in a `lateral`.

A `selectExactlyOne()` as the query keeps its checks. With [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), at the top level, it still asks for a second row (by default `LIMIT $1`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.withCTEs({ r: db.sql`SELECT 1` }, db.selectExactlyOne('films', db.all))) --> with `2`) and rejects on one. Nested, it requests one row plus any ties with `withTies: true`, as a [`copy()`](/sql-template#copy) does. With no row, it rejects with `NotExactlyOneError`, whose `.query` is the shortcut, without the `WITH`.

`withCTEs()` writes neither `RECURSIVE` nor `MATERIALIZED`: write such a `WITH` in `sql`, with its main query. Put all the CTEs in one call: a query that already starts with a `WITH`, a `withCTEs()` result for one, is refused (42601).

The result is never a prepared statement, whatever the query was, `{}` included, so that one name never stands for two texts: call [`prepared()`](/sql-template#prepared) on the result. A list built at run time gives a text per list: name each apart.

## Check the SQL before you run it

[`.compile()`](/sql-template#compile) gives the `text` and `values` that `run()` would send, and sends nothing. Each value from outside belongs in `values`, with a `$n` in its place in `text`. A test that compiles each query with hostile input, expects it in `values` and freezes `text` keeps it that way, here for `listings()` above:

<<< ./examples/plain/raw_sql_test.ts{ts twoslash}

- Here with `test` from `node:test` and `assert` from `node:assert/strict`; any test runner does.
- `text` keeps the line breaks of the template: the test collapses its whitespace, so that only a change to the SQL fails it.
- A search of `text` is not enough: a name compiled from `x" --` is there as `"x"" --"`<!-- probe: db.sql`${'x" -' + '-'}` -->, its `"` doubled, and a lone `'` matches the query's own literals.

## See also

- [SQL template](/sql-template): every interpolation, and what it compiles to.
- [Security](/security): why values are parameters, and what pgcast quotes.
- [Joins](/lateral): subqueries with `parent()`, nested.

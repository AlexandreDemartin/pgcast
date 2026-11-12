# Write raw SQL safely

When no shortcut writes the query you need (a join, a window function, an `INSERT … SELECT`), write it in the `sql` template, and keep every value that comes from outside out of its text. You already know the shortcuts from the [tutorial](/tutorial); every interpolation is in [The `sql` template](/sql-template).
{.lede}

## Write the query, its names interpolated

Write the SQL as you would in `psql`, but put each table and column name between `${…}` instead of in the text. Give `sql` the tables the query may name, then the type of the rows you expect:

<CastPanel example="raw_sql_join">

<<< ./examples/raw_sql_join.ts{ts twoslash}

</CastPanel>

- An interpolated name is quoted, `"films"`, and checked against the first type argument: here `Tables`, the `SQL` type of each table the query names. Qualify a column as `${'films'}.${'title'}`: the type knows each table's columns, not `'films.title'`.
- The second type argument is your word for what comes back: nothing checks it against the SQL. The rows come as `pg` parses them, as a `Selectable` describes them (a `Date` for a `timestamptz`), not as the JSON of the shortcuts' `JSONSelectable`. A `count(*)` is a `bigint`, which `pg` gives as a string: `'4'`.
- Keywords stay in the text. SQL you write yourself is safe there; only what comes from outside needs the steps below.

A name the type doesn't know fails to compile: a query that names `screenings` needs `s.screenings.SQL` in its first type argument.

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.sql<s.films.SQL>`SELECT * FROM ${'screenings'}`;
```

## Pass each value as a parameter

A value from a caller (a form, a URL, a row you read elsewhere) goes in as [`db.param()`](/sql-template#param), or in a Whereable object, which makes a parameter of each value:

<CastPanel example="raw_sql_values">

<<< ./examples/raw_sql_values.ts{ts twoslash}

</CastPanel>

- <code v-pre>${{ studio_id: studioId }}</code> is `("studio_id" = $1)`: a filter of `films`, as the `where` of [`select()`](/select#select) takes it, so [conditions](/conditions) work in it too: `{ release_year: db.conditions.gte(1990) }`.
- `${db.param(genre)}` is `$2`: a parameter fits wherever SQL takes a value.
- An array is one parameter: `` ${'id'} = ANY(${db.param(ids)}) `` sends `ids` as a Postgres array.
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

- A real column matches every row: `'title'` compiles to `"title" = "title"`, true wherever `title` is not null, and so do `'films.title'` and `'"title"'`. In a `DELETE`, that deletes them.
- An unknown one fails: `'The Salt Orchard'` gives `"title" = "The Salt Orchard"`, a column that does not exist (42703).
- Any `"` in it is doubled, so it can't close its quotes (in Zapatos 6.6.1 it could, [Identifiers](/sql-template#identifiers)), but that does not make it a value.

::: warning Security
An interpolated object that is not a `param()`, a fragment or another of pgcast's values compiles as a Whereable, whatever it is. A `Date` has no keys of its own, so it gives `TRUE`: `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, with `when` a `Date` typed `any`, compiles to `DELETE FROM "ratings" WHERE TRUE` and deletes every rating. The type refuses a `Date` (TS2345), not an `any`. Pass a date as `db.param(when)` ([#170](https://github.com/AlexandreDemartin/pgcast/issues/170)).

Any object with no keys is `TRUE`, a typed Whereable included: `const where: s.ratings.Whereable = {}`, given a `film_id` only `if (filmId)`, compiles with no error to the same `DELETE`. Check for an empty filter before a `DELETE` or an `UPDATE` ([Whereable objects](/sql-template#whereable)).
:::

## Cast a parameter Postgres can't type

Postgres gives a parameter a type from where it stands. Compared with a column, it takes the column's type; elsewhere, Postgres may infer another. Give it the type as `param()`'s second argument:

<CastPanel example="raw_sql_cast">

<<< ./examples/raw_sql_cast.ts{ts twoslash}

</CastPanel>

- `$1`, compared with `starts_at`, is a `timestamptz` already.
- `$2` is added to an `interval`, so without its cast Postgres reads it as one, and fails: `operator does not exist: timestamp with time zone < interval` (42883).
- `db.param(from, 'timestamptz')` writes `CAST($2 AS "timestamptz")`; `` ${db.param(from)}::timestamptz `` in the text does the same.
- The cast is the type's catalog name, in lower case (`int4`, `timestamptz`, `crew_job`), quoted as one name. `'integer'` gives `CAST($1 AS "integer")`, a type that does not exist (42704), as do `'int'` and `'TIMESTAMPTZ'`.
- Name a schema as `'public"."crew_job'`, which gives `"public"."crew_job"`: `'public.crew_job'` gives `"public.crew_job"`, and `'int4[]'` gives `"int4[]"`, types that do not exist (42704; [#37](https://github.com/AlexandreDemartin/pgcast/issues/37)). Write an array type in the text: `` ${db.param(ids, false)}::int4[] `` (`false`: below).
- With [`castArrayParamsToJson`](/runtime-config#Config.castArrayParamsToJson) on, an array parameter is sent as JSON, `CAST($1 AS "json")`, even with a string cast ([#171](https://github.com/AlexandreDemartin/pgcast/issues/171)). To send it as an array, pass `false`: `` ${db.param(ids, false)}::int4[] ``. The same goes for a plain object and [`castObjectParamsToJson`](/runtime-config#Config.castObjectParamsToJson).

Every form of the cast: [`param()`](/sql-template#param).

## Choose SQL at run time from your own constants

Some choices are syntax, not values: a sort direction, the column to sort on. A parameter can't stand for them, so map the caller's choice to one you wrote:

<CastPanel example="raw_sql_order">

<<< ./examples/raw_sql_order.ts{ts twoslash}

</CastPanel>

- [`db.raw()`](/sql-template#raw) writes its string as it is. Here it only ever gets `'DESC'` or `'ASC'`, whatever the caller sent.
- The column is a name: quoted, it can't close its quotes, but the caller's string could name any column of the query, or none (42703). `find()` keeps one of yours, typed as the template wants.

::: warning Security
Whatever reaches `raw()` runs as SQL, and its type takes any string. Give it a caller's text, and the caller writes your query:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const title = "x' OR TRUE --";  // from the caller
db.sql`SELECT ${'title'} FROM ${'films'} WHERE ${'title'} = ${db.raw(`'${title}'`)}`;
```

```sql
SELECT "title" FROM "films" WHERE "title" = 'x' OR TRUE --'
```

That returns every film. A value is a `param()`, always: `${db.param(title)}` gives `"title" = $1`, and no film.
:::

## Compare a column with SQL, through `self`

A fragment as a Whereable value compares its column with SQL of your own, [`db.self`](/sql-template#self) standing for the column:

<CastPanel example="raw_sql_self">

<<< ./examples/raw_sql_self.ts{ts twoslash}

</CastPanel>

- `lower(${db.self})` is `lower("title")`, and the caller's text is still `$1`.
- An equality, unlike [`ilike()`](/conditions#conditions.ilike): a `_` or a `%` in the caller's text matches only itself.
- The same object works as the `where` of [`select()`](/select#select) and the other shortcuts.
- Where it has no column to stand for, `self` throws "The 'self' column alias has no meaning here", so `run()` rejects before any query.

## Reach the outer row, through `parent()`

A hand-written subquery can go in a shortcut's `lateral`, where [`db.parent()`](/sql-template#parent) names a column of the outer query's table:

<CastPanel example="raw_sql_parent">

<<< ./examples/raw_sql_parent.ts{ts twoslash}

</CastPanel>

- `${db.parent('id')}` is `"studios"."id"`, the studio of each row.
- The subquery gives one column, named `result`: that is what `lateral` reads. Its type argument, `string | null`, is the key's type: `string_agg()` of no rows is `NULL`.
- With `strict` off, the key is not in the type ([`lateral`](/select#lateral)).
- Outside a `lateral`, `parent()` throws "The 'parent' table alias has no meaning here", so `run()` rejects before any query.

Joins through `lateral`, step by step: [Join through a lateral](/lateral).

## Check the SQL before you run it

[`.compile()`](/sql-template#compile) gives the `text` and `values` that `run()` would send, and sends nothing. Each value from outside belongs in `values`, with a `$n` in its place in `text`:

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
type Listing = Pick<s.films.Selectable, 'title'> & Pick<s.screenings.Selectable, 'starts_at'>;
declare function listings(cinema: string): db.SQLFragment<Listing[]>;
// ---cut---
const { text, values } = listings("x' OR TRUE --").compile();
// text:   … WHERE "cinemas"."name" = $1 ORDER BY "screenings"."starts_at"
// values: [ "x' OR TRUE --" ]
```

A test that compiles each query with hostile input (`'`, `"`, `;`, `--`) and looks for it in `text` keeps it that way.

## See also

- [The `sql` template](/sql-template): every interpolation, and what it compiles to.
- [The security model](/security): why values are parameters, and what pgcast quotes.
- [Join through a lateral](/lateral): subqueries with `parent()`, nested.

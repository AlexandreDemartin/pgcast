# Joins

Get rows with the rows they relate to, in one query and one typed result: a film with its cast, a crew member with their mentor. You nest a shortcut in the [`lateral`](/select#lateral) option of `select()`; it becomes a `LEFT JOIN LATERAL`<!-- probe: examples/lateral_cast.ts -->, and its result a key of each row. You already know `select()` from the [tutorial](/first-query).
{.lede}

## Add the rows that point to it

A film's cast is the `roles` whose `film_id` is the film's `id`. Nest a `select()` of `roles` under a key of `lateral`, and name the film's column with `db.parent()`:

<CastPanel example="lateral_cast">

<<< ./examples/lateral_cast.ts{ts twoslash}

</CastPanel>

- `cast` becomes a key of the film, holding an array: `[]` when no role matches.
- `db.parent('id')` is `"films"."id"`<!-- probe: examples/lateral_cast.ts -->, a column of the query around it ([`parent()`](/sql-template#parent)). When the two columns share a name, `db.parent()` alone takes the column of its filter.
- The subquery takes the options of any `select()`, here `columns` and `order` ([Options](/select#options)).

## Add the row it points to

Each film has one studio: `studio_id` is `NOT NULL REFERENCES studios(id)`, so the row is always there. Nest `selectExactlyOne()`, and the key holds that row, not an array:

<CastPanel example="lateral_studio">

<<< ./examples/lateral_studio.ts{ts twoslash}

</CastPanel>

- The joins come in the sorted order of their keys, whatever order you write them in.
- On a nullable foreign key, nest [`selectOne()`](/select#selectOne): the key holds the row or `null`, as the mentor below.
- In a lateral, `selectExactlyOne()` checks nothing: a missing row gives `null` and no error, though its type has no `null` ([`selectExactlyOne()`](/select#selectExactlyOne)). Keep it for a foreign key that rules the missing row out, and nest `selectOne()` otherwise:
  - its columns `NOT NULL`;
  - validated: a key added `NOT VALID` leaves the rows already there unchecked, so one may point at no row;
  - not `DEFERRABLE`: a deferred key is checked at `COMMIT`, so until then the transaction can hold a row that points at none;
  - its target without row-level security: the key's check bypasses the policies, your query does not, so a policy can hide the row.
- There is no `related()` to read the join from the foreign key: it would save a type, never a line nor the SQL ([decision 007](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/007-related.md)).

## Go through a join table

Films and actors are many-to-many, through `roles`. Nest a lateral in the lateral, to give each role its actor:

<CastPanel example="lateral_actors">

<<< ./examples/lateral_actors.ts{ts twoslash}

</CastPanel>

`db.parent()` names a column of the nearest query around it: in `actor`, `"roles"."actor_id"`<!-- probe: examples/lateral_actors.ts -->. Each role's `actor` is `{ name: string }`. Nest as deep as you need; each level adds a `LEFT JOIN LATERAL`<!-- probe: examples/lateral_actors.ts --> to the same query.

## Keep only the far side

For the actors alone, without the role's columns, give the inner `lateral` one subquery rather than an object: its result takes the place of each role.

<CastPanel example="lateral_passthrough">

<<< ./examples/lateral_passthrough.ts{ts twoslash}

</CastPanel>

The `order` still sorts the roles, so the actors come in billing order. With the role gone, `columns` and `extras` on `roles` would have nothing to add to: the type refuses them, with `strictNullChecks` on.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
db.select('roles', { film_id: 1000 }, {
  columns: ['character'],
  lateral: db.selectExactlyOne('actors', { id: db.parent('actor_id') }),
});
```

## Join a table to itself

A crew member's mentor is another row of `crew`. Give the subquery an `alias`, so that `db.parent()` still reaches the outer `crew`:

<CastPanel example="lateral_mentor">

<<< ./examples/lateral_mentor.ts{ts twoslash}

</CastPanel>

- `mentor` holds the row or `null`: Wilhelmina Strand has no mentor.
- [`count()`](/aggregates#count) gives a number, here each member's protégés.
- Without the aliases, the subquery's `FROM "crew"`<!-- probe: db.select('crew', db.all, { lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }, { columns: ['name'] }) } }) --> hides the outer one, and `"crew"."mentor_id"`<!-- probe: db.select('crew', db.all, { lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }, { columns: ['name'] }) } }) --> is the subquery's own row. Postgres runs it with no error, and every `mentor` comes back `null`, every count `0`:

  ```sql
  SELECT jsonb_build_object($5::text, "name") AS result
  FROM "crew"
  WHERE ("id" = "crew"."mentor_id")
  LIMIT $6
  ```

- One alias on the outer query does for both: with `alias: 'member'` there, `db.parent('mentor_id')` is `"member"."mentor_id"`<!-- probe: db.select('crew', db.all, { alias: 'member', lateral: { mentor: db.selectOne('crew', { id: db.parent('mentor_id') }) } }) --> ([`alias`](/select#alias)).

## Order by a computed value

Each cinema, and the nearest other one: a self-join again, with the distance as an [`extras`](/select#extras) key and as the `order`. A `sql` fragment in a subquery takes `db.parent()` too:

<CastPanel example="lateral_nearest">

<<< ./examples/lateral_nearest.ts{ts twoslash}

</CastPanel>

- `<->` is Postgres's distance between two points: kilometres here, as `location` is in kilometres east and north of the city centre.
- `km` is a `number` because the fragment says so: `db.sql<s.cinemas.SQL, number>`.
- [`ne(db.parent('id'))`](/conditions#conditions.ne) leaves the cinema itself out.
- For the three nearest, nest `select()` with [`limit: 3`](/select#order-limit-offset-and-withties): `nearest` becomes an array.

## Filter, sort and group by a lateral

Each `lateral` key joins as a table of the query, `"lateral_<key>"`, with one column, `result`. A `sql` fragment names it in the `where`, the `order` or the `groupBy` of the query around it:

<CastPanel example="lateral_result">

<<< ./examples/lateral_result.ts{ts twoslash}

</CastPanel>

- `WHERE "lateral_castSize".result >= $3`<!-- probe: examples/lateral_result.ts --> and `ORDER BY "lateral_castSize".result DESC`<!-- probe: examples/lateral_result.ts --> read each film's count of roles.
- Quote the name as pgcast does: unquoted, Postgres folds it to `lateral_castsize`, and refuses the query (42P01). A `"` in a key is doubled, `"lateral_a""b"`<!-- probe: db.select('films', db.all, { lateral: { 'a"b': db.count('roles', { film_id: db.parent('id') }) } }) -->.
- `result` is the subquery's: a number for `count()`, `jsonb` for the others. Read a field with `->>`, as in `ORDER BY "lateral_studio".result->>'name' ASC`<!-- probe: db.select('films', db.all, { columns: ['title'], lateral: { studio: db.selectExactlyOne('studios', { id: db.parent('studio_id') }, { columns: ['name'] }) }, order: { by: db.sql`"lateral_studio".result->>'name'`, direction: 'ASC' } }) -->.

With a `groupBy`, each lateral's result is in the row too, so group by it as well: Postgres refuses the query otherwise (42803). Give both in one fragment, typed so that its columns are checked:

<CastPanel example="lateral_result_group">

<<< ./examples/lateral_result_group.ts{ts twoslash}

</CastPanel>

- `GROUP BY "studio_id", "lateral_studio".result`<!-- probe: examples/lateral_result_group.ts -->: each studio once, with its name and its number of films.
- `db.sql<s.films.SQL>` refuses `${'name'}`, a column of `studios`. An array of columns can't hold the fragment: [`groupBy`](/select#groupby-and-having) takes a column, an array of columns, or one fragment.

## Name the row of a reusable lateral

A lateral that several queries share goes in a function. Name the row it gives from that function's type, rather than with an interface written by hand, which you would keep in step with each change to the query:

<CastPanel example="lateral_row_map">

<<< ./examples/lateral_row_map.ts{ts twoslash}

</CastPanel>

- [`LateralResult`](/select#LateralResult) types each key of the map as its subquery's result: `cast` is an array of `{ character, billing }`.
- `s.films.JSONSelectable` is the film's whole row, as `db.all` with no `columns` gives it. With `columns` or `extras`, name the query's whole row instead (below).

A lateral generic in its columns gives a type per call. Call it, and name that call's result with [`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment):

<<< ./examples/plain/lateral_row_generic.ts{ts twoslash}

- `Mentor` is the mentor's `name` and `job`, or `null`: in a lateral, a `selectOne()` that finds no row gives `null`, where its own `.run()` gives `undefined`.
- Named from `ReturnType<typeof mentorLateral>`, the row would hold every column of `crew`: there, `C` is its constraint, `s.crew.Column`.

For the whole row of one query, its `columns`, `extras` and laterals together, take it from `.run()` (`Awaited` needs TypeScript 4.5):

<<< ./examples/plain/lateral_row_whole.ts{ts twoslash}

## Check the parent column

`db.parent()` takes a column of any table, so a join on the wrong column compiles. Postgres refuses a column the parent doesn't have: `db.parent('billing')` under `films` fails with 42703, "column films.billing does not exist". Give the parent's columns as a type argument, `db.parent<s.films.Column>('id')`, and the type checks the name against them:

```ts twoslash
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';
// ---cut---
db.select('films', db.all, {
  lateral: { cast: db.select('roles', { film_id: db.parent<s.films.Column>('id') }) },
});
db.select('films', db.all, {
  // @ts-expect-error billing is a column of roles, not of films (TS2345)
  lateral: { cast: db.select('roles', { film_id: db.parent<s.films.Column>('billing') }) },
});
```

- It checks the table you name, not the query around it: `db.parent<s.studios.Column>('id')` under `films` compiles too.
- The type doesn't check it unasked: the subquery is built, and typed, before the query around it, so its type doesn't know the parent table. Checking it would slow every compile, and refuse code that runs.
- A helper that gives `db.parent()` a column generic over its table, `s.ColumnForTable<T>`, takes seconds to type-check on a large schema: over 9 s on a synthetic one of 300 tables and views. Take a `db.ParentColumn` instead, and let the caller write `db.parent<s.films.Column>('studio_id')`: under 0.3 s.

## Watch for

- **`strictNullChecks`**: without it (or `strict`), `columns`, `extras` and `lateral` leave the type as the full row, and it refuses nothing ([Strict](/select#options)).
- **An unchecked join**: `db.parent()` takes a column of any table, unless you name the table ([Check the parent column](#check-the-parent-column)).
- **[`withTies`](/select#order-limit-offset-and-withties) in a nested `selectOne()`**: it writes `FETCH FIRST $2 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { lateral: { lead: db.selectOne('roles', { film_id: db.parent('id') }, { order: { by: 'billing', direction: 'ASC' }, withTies: true }) } }) -->, which keeps every tied row: under an outer `select()`, the parent row comes back once per tie; under `selectOne()` or `selectExactlyOne()`, with one of them, though with [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow) `selectExactlyOne()` rejects with `NotExactlyOneError`. In a nested `select()`, the ties stay in the array. As a `lateral` of `count()`, each tie is counted: 6 for two films of three tied roles each. In a `lateral`, unchanged from Zapatos 6.6.1, and kept: it is the SQL `withTies` asks for ([#164](https://github.com/AlexandreDemartin/pgcast/issues/164#issuecomment-6883146644)). As an `extras` value, a tie makes Postgres refuse the query (21000): "more than one row returned by a subquery used as an expression"; Zapatos 6.6.1 refused every shortcut as an `extras` value (42601), tie or not.
- **A `lock`**: without `of`, `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> reaches the subqueries, and Postgres refuses the query (0A000): "FOR UPDATE is not allowed with aggregate functions" under `select()` or `count()`, "FOR UPDATE cannot be applied to the nullable side of an outer join" under `selectOne()`. Name the table ([`lock`](/select#lock)):

<CastPanel example="lateral_lock">

<<< ./examples/lateral_lock.ts{ts twoslash}

</CastPanel>

`FOR UPDATE OF "films"`<!-- probe: examples/lateral_lock.ts --> locks the film's row, and only it, until the transaction ends: run it on a [`txnClient`](/transaction#transaction). The rows of `roles` are read, not locked.

## See also

- [`lateral`](/select#lateral), [`alias`](/select#alias) and [`extras`](/select#extras): each option, the SQL it writes, its type.
- [`parent()`](/sql-template#parent): where it works, and what it compiles to.
- [Why pgcast](/why): why it works this way.

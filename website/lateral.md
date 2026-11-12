# Join through a lateral

Get rows with the rows they relate to, in one query and one typed result: a film with its cast, a crew member with their mentor. You nest a shortcut in the [`lateral`](/select#lateral) option of `select()`; it becomes a `LEFT JOIN LATERAL`, and its result a key of each row. You already know `select()` from the [tutorial](/first-query).
{.lede}

## Add the rows that point to it

A film's cast is the `roles` whose `film_id` is the film's `id`. Nest a `select()` of `roles` under a key of `lateral`, and name the film's column with `db.parent()`:

<CastPanel example="lateral_cast">

<<< ./examples/lateral_cast.ts{ts twoslash}

</CastPanel>

- `cast` becomes a key of the film, holding an array: `[]` when no role matches.
- `db.parent('id')` is `"films"."id"`, a column of the query around it ([`parent()`](/sql-template#parent)). When the two columns share a name, `db.parent()` alone takes the column of its filter.
- The subquery takes the options of any `select()`, here `columns` and `order` ([Options](/select#options)).

## Add the row it points to

Each film has one studio: `studio_id` is `NOT NULL REFERENCES studios(id)`, so the row is always there. Nest `selectExactlyOne()`, and the key holds that row, not an array:

<CastPanel example="lateral_studio">

<<< ./examples/lateral_studio.ts{ts twoslash}

</CastPanel>

- The joins come in the alphabetical order of their keys, whatever order you write them in.
- On a nullable foreign key, nest [`selectOne()`](/select#selectOne): the key holds the row or `null`, as the mentor below.
- In a lateral, `selectExactlyOne()` checks nothing: a missing row gives `null` and no error, though its type has no `null` ([`selectExactlyOne()`](/select#selectExactlyOne)). Keep it for a `NOT NULL` foreign key.

## Go through a join table

Films and actors are many-to-many, through `roles`. Nest a lateral in the lateral, to give each role its actor:

<CastPanel example="lateral_actors">

<<< ./examples/lateral_actors.ts{ts twoslash}

</CastPanel>

`db.parent()` names a column of the nearest query around it: in `actor`, `"roles"."actor_id"`. Each role's `actor` is `{ name: string }`. Nest as deep as you need; each level adds a `LEFT JOIN LATERAL` to the same query.

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
- [`count()`](/select#count) gives a number, here each member's protégés.
- Without the aliases, the subquery's `FROM "crew"` hides the outer one, and `"crew"."mentor_id"` is the subquery's own row. Postgres runs it with no error, and every `mentor` comes back `null`, every count `0`:

  ```sql
  SELECT jsonb_build_object($5::text, "name") AS result FROM "crew" WHERE ("id" = "crew"."mentor_id") LIMIT $6
  ```

- One alias on the outer query does for both: with `alias: 'member'` there, `db.parent('mentor_id')` is `"member"."mentor_id"` ([`alias`](/select#alias)).

## Order by a computed value

Each cinema, and the nearest other one: a self-join again, with the distance as an [`extras`](/select#extras) key and as the `order`. A `sql` fragment in a subquery takes `db.parent()` too:

<CastPanel example="lateral_nearest">

<<< ./examples/lateral_nearest.ts{ts twoslash}

</CastPanel>

- `<->` is Postgres's distance between two points: kilometres here, as `location` is in kilometres east and north of the city centre.
- `km` is a `number` because the fragment says so: `db.sql<s.cinemas.SQL, number>`.
- [`ne(db.parent('id'))`](/conditions#conditions.ne) leaves the cinema itself out.
- For the three nearest, nest `select()` with [`limit: 3`](/select#order-limit-offset-and-withties): `nearest` becomes an array.

## Watch for

- **`strictNullChecks`**: without it (or `strict`), `columns`, `extras` and `lateral` leave the type as the full row, and it refuses nothing ([Strict](/select#options)).
- **An unchecked join**: `db.parent()` takes a column of any table, so a join on the wrong column compiles. Postgres refuses a column the parent doesn't have: `db.parent('billing')` under `films` fails with 42703, "column films.billing does not exist".
- **[`withTies`](/select#order-limit-offset-and-withties) in a nested `selectOne()`**: it writes `FETCH FIRST $1 ROWS WITH TIES`, which keeps every tied row. Under an outer `select()`, the parent row comes back once per tie; under `selectOne()`, with one of them. In a nested `select()`, the ties stay in the array. Unchanged from Zapatos 6.6.1, and open as [#164](https://github.com/AlexandreDemartin/pgcast/issues/164).
- **A `lock`**: without `of`, `FOR UPDATE` reaches the subqueries, and Postgres refuses the query (0A000): "FOR UPDATE is not allowed with aggregate functions" under `select()` or `count()`, "FOR UPDATE cannot be applied to the nullable side of an outer join" under `selectOne()`. Name the table: `lock: { for: 'UPDATE', of: 'films' }` ([`lock`](/select#lock)).

## See also

- [`lateral`](/select#lateral), [`alias`](/select#alias) and [`extras`](/select#extras): each option, the SQL it writes, its type.
- [`parent()`](/sql-template#parent): where it works, and what it compiles to.
- [Why pgcast](/why): why it works this way.

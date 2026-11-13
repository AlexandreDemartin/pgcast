# The security model

What keeps a caller's input from changing the SQL pgcast sends, what it can't guard against, and how to report a flaw. The steps are in [Write raw SQL safely](/raw-sql); this page is the why.
{.lede}

## Values never enter the SQL

Every value pgcast sends, from a filter, an `insert()` or a [`param()`](/sql-template#param), becomes a numbered parameter, `$1`, and travels beside the SQL text rather than inside it. Postgres parses the text first and binds the values after: by then, a value can only be data. pgcast never escapes a value, so there is no escaping to get wrong.

<CastPanel example="security_values">

<<< ./examples/security_values.ts{ts twoslash}

</CastPanel>

Written into the text, that title would close its string and match every film: `("title" = 'x' OR 'a' = 'a')`. As `("title" = $1)`<!-- probe: examples/security_values.ts -->, it is a title no film has, and the query returns none. This is Zapatos's foundation, kept as it was.

The split has a second effect. node-postgres sends a query with values through Postgres's extended protocol, where a query is one statement: `SELECT $1::int; SELECT 2` is refused with "cannot insert multiple commands into a prepared statement" (42601). A query with no values, and no `.prepared()` name, goes as plain text, where a `;` can start a second statement, which is why the holes below were at their worst in a query without parameters.

## Names are quoted, not parameters

A parameter stands for a value, never for a table or a column: `SELECT * FROM $1` is a syntax error (42601). So names go into the text, and pgcast guards them twice. First the type: `Table` and `Column` are unions of the names the generator read from the catalog, so a name you write is one the database has.

Then the quoting, because the type is gone at run time and names can arrive without passing it: the keys of a request's JSON body, given to `select()` as its filter, are column names. Each string pgcast writes as a name is double-quoted and split on `.`, any `"` in it doubled unless it is already a well-formed quoted name (`'"title"'` is `"title"`<!-- probe: db.sql`${'"title"'}` -->, `'a""b'` stays `"a""b"`<!-- probe: db.sql`${'a""b'}` -->), so it can never close its quotes:

<CastPanel example="security_names">

<<< ./examples/security_names.ts{ts twoslash}

</CastPanel>

The key stays one name, a column that does not exist (42703). Zapatos 6.6.1 trusted the type here (its docs warned never to override it), and wrote that key as `("title" = "title" OR TRUE OR "title" = $1)`, which returns every film; without parameters, such a name could run a second statement. The type refuses such a key in an object literal (TS2353). An object built at run time (a `Record<string, string>`, `Object.fromEntries()`, a variable with extra keys) passes the type, as `any` and plain JavaScript do. Every rule of the quoting, a name already quoted by hand included: [Identifiers](/sql-template#identifiers).

## Keywords are checked before any query

Some SQL is neither a value nor a name: `DESC`, `FOR UPDATE`, `SERIALIZABLE`, `RESTART IDENTITY`, the name of an aggregate. pgcast writes these into the text as they are, so it takes them only from a closed list, or, for an aggregate, only a function name. The type says which; at run time pgcast checks again and throws before any query, because a cast, an `any` or a JSON body can hand it anything: a `lock` of `{ for: 'UPDATE; DROP TABLE ratings; --' }` throws "Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not 'UPDATE; DROP TABLE ratings; --'".

Values with no meaning where they stand are refused the same way: `db.Default`, `db.self` or `db.raw()` as a filter value throws while compiling, so `.run()` rejects before anything reaches Postgres. Zapatos 6.6.1 sent them as strings or as JSON: no row matched on a text column, every row under `ne()` and `isNotIn()`, and other types failed. Such a value is a bug in the calling code, and a bug should not become a query.

Each of these errors, with what throws it: [Errors pgcast throws before any query](/transaction#errors-pgcast-throws-before-any-query). Telling them from Postgres's own: [Handle errors](/handle-errors#fix-the-errors-pgcast-throws).

## `raw()` is the one door

[`raw()`](/sql-template#raw) writes its string into the SQL as it is: the one interpolation where a string becomes code, and its type takes any string. That is its job, for syntax no parameter can stand for, chosen by your own code. Given a caller's text, it lets the caller write your query, so it only ever gets your constants, and a caller's choice is mapped to one of them ([Choose SQL at run time from your own constants](/raw-sql#choose-sql-at-run-time-from-your-own-constants)).

pgcast can't check what you put there, which is why `SECURITY.md` leaves SQL written in `raw()` out of its scope.

As a filter value, `raw()` throws. Zapatos 6.6.1 sent it there as a parameter by accident, its wrapper as JSON; compiling it as SQL instead would have turned every `{ title: db.raw(input) }` into an injection. So it is neither: to compare a column with SQL, write a fragment, where `db.self` stands for the column.

## What changed from Zapatos 6.6.1

The characterisation of Zapatos 6.6.1 found seven ways for a caller's string to reach the SQL as code. pgcast closed each, and refuses the values a filter can't use:

| What reaches pgcast | Zapatos 6.6.1 | pgcast |
|---|---|---|
| a `"` in a name: a table, a column, a filter key, `cols()`, `order.by` | closes its quotes | doubled: `'a"b'` is `"a""b"`<!-- probe: db.sql`${'a"b'}` --> |
| a string that starts and ends with `"` | written as it is | as it is only if it is a well-formed quoted name |
| the type of `param(x, cast)` | written between quotes as it is | as it is if well-formed once quoted (`pg_catalog"."int4`); otherwise one quoted name, any `"` doubled |
| a `lateral` key, or the `alias` or table name of `select()` | spliced into `"lateral_…"` and `"sq_…"` | one name there too |
| `lock.for`, `lock.wait`, the options of `truncate()`, the level of `transaction()` | written as it is | checked: anything else throws |
| the `aggregate` of `select()` | written as it is | a function name, or it throws |
| a string in the `updateValues` of `upsert()` | a column name | a parameter |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` or `db.vals()` as a filter value | a string, or JSON | throws |

Zapatos 6.6.1 already checked `order.direction` and `order.nulls`. Each hole, what it let through and the test that pins it: the [characterisation report](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#security); the SQL before and after: [CHANGELOG.md](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## What pgcast can't guard against

pgcast keeps a caller's input from becoming code; it can't tell whether the SQL does what you meant. In the three cases below the SQL is valid, and does the wrong thing.

### A caller's string as a name

Quoted, a name is still the one the caller chose. As a table name, `'schema.table'` included, it is any relation the role can read: given `'pg_catalog.pg_roles'`, `select()` lists the database's roles. As a column name, it is any column in scope, a system column such as `xmin` included, or none (42703). `` ${'title'} = ${title} ``, with `title` typed `any` and set to `'title'`, compiles to `"title" = "title"`<!-- probe: db.sql`${'title'} = ${'title'}` -->, true for every film. Map a caller's choice to a name from your own list, and remember that the keys of a request's body, given as a filter, are names too.

### An empty filter

A filter is its conditions joined by `AND`, and no condition at all is `TRUE`, as in Zapatos. So a filter built from optional fields that are all missing matches every row:

<CastPanel example="security_empty_filter">

<<< ./examples/security_empty_filter.ts{ts twoslash}

</CastPanel>

::: warning Security
In `deletes()` or `update()`, an empty filter is every row: `removeRatings()` deletes them all. Check that a filter built at run time has a key, and no condition that is `TRUE` whatever the row, as `isNotIn([])` is, before you write with it.
:::

### An object that is not a filter

An interpolated object that is not one of pgcast's values compiles as a filter of its own enumerable keys: a class instance gives its fields, and `TRUE` when it has none. A built-in object (`Date`, `Map`, `Promise`, a typed array, …) throws before any query: `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, with `when` a `Date` typed `any`, compiled to `DELETE FROM "ratings" WHERE TRUE` in Zapatos 6.6.1 ([Whereable objects](/sql-template#whereable)). Pass a date as `db.param(when)`.

## Report a flaw

If you think you have found a flaw in pgcast (the SQL it compiles from a caller's input, or the code the generator writes), please report it privately: [report a vulnerability](https://github.com/AlexandreDemartin/pgcast/security/advisories/new) from the repository's Security tab, never in a public issue. Give the call, the SQL its `.compile()` gives, and what an attacker controls; a flaw pgcast shares with Zapatos is reported here too.

You'll hear back within a week. The fix ships in a patch release, with a GitHub security advisory and its CVE, published on a date agreed with you, and credit in it and in the CHANGELOG unless you'd rather not be named. What is in scope, and which versions are supported: [SECURITY.md](https://github.com/AlexandreDemartin/pgcast/blob/master/SECURITY.md).

## Further reading

- [Write raw SQL safely](/raw-sql): the steps, from parameters to `raw()` with your own constants.
- [The `sql` template](/sql-template): every interpolation and what it compiles to, [Identifiers](/sql-template#identifiers) and [Whereable objects](/sql-template#whereable) among them.
- [Handle errors](/handle-errors): pgcast's own errors, and Postgres's.
- [`SECURITY.md`](https://github.com/AlexandreDemartin/pgcast/blob/master/SECURITY.md): scope, threat model and supported versions.

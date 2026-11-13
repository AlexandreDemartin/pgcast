# Why pgcast

Why pgcast works as it does: the idea it keeps from Zapatos, what the fork adds to it, and what it will never do. The steps are in the [guides](/guides), every option in the [reference](/reference).
{.lede}

## Just your database, with type safety

pgcast is Zapatos, kept going. Zapatos's docs open with its aim:

> Postgres and TypeScript are each, individually, fabulous. Zapatos aims to make them work beautifully together. No abstractions, no distractions: just your database, with type safety.

Its case is against ORMs. "It is a truth universally acknowledged that ORMs aren't very good," its author writes, and "abstractions that obscure the underlying SQL, or that prioritise ease of switching to another database tomorrow over effective use of this database today, are a source of misery." VS Code's type checking and autocomplete "speed development, prevent bugs, and simplify refactoring", but "talking to the database is a place where they really don't just happen."

So Zapatos makes three choices, and pgcast keeps all three: the types come from the database, the SQL stays in sight, and nothing happens that you didn't ask for.

## Types cast from the database

Postgres already knows your schema: each column, its type, whether it can be null, whether it has a default, the comment you gave it. The generator asks the catalog (`pg_catalog` and `information_schema`) and writes `zapatos/schema.d.ts`: the types of each table, view, materialised view and foreign table, a union of strings for each enum, and a placeholder for each domain or type it can't map on its own ([Use custom types and domains](/custom-types)). No row type is written by hand, so none can disagree with its table.

Hence the name. In Postgres, a cast (`::`) gives a value its type; in English, a cast is also a mould. pgcast's types are cast from your schema, and these docs' examples, fittingly, are about a film's cast.

A column the table doesn't have is refused before any query runs:

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const films = await db.select('films', { relase_year: 1974 }).run(pool);
```

The types are as fresh as the last run of the generator. Run it again after each migration, and the compiler points at every query that no longer fits. How each Postgres type becomes a TypeScript type, and why a row as JSON differs from a row from `pg`: [How types are cast from the catalog](/catalog-types).

## The SQL you read is the SQL that runs

Each shortcut writes one query, and its reference shows that SQL. Zapatos's docs promise "everyday CRUD queries with no fuss and no surprises, fully and automatically typed". Here, a studio with its films:

<CastPanel example="why_studio">

<<< ./examples/why_studio.ts{ts twoslash}

</CastPanel>

The panel is what you get in your own code: [`.compile()`](/sql-template#compile) gives the same `text` and `values`, and sends nothing. Every value is a parameter, the JSON keys included; every table and column name is quoted. The nesting is Postgres's own work, `jsonb_agg`<!-- probe: examples/why_studio.ts --> in a `LEFT JOIN LATERAL`<!-- probe: examples/why_studio.ts -->: the studio and its films come back as one JSON value, in one round trip, with no rows to stitch together in JavaScript.

TypeScript knows the one column asked for, the films beneath it, and `undefined` when no studio has that `id`: that takes `strict`, as [Your first typed query](/first-query#set-up-the-project) sets it.

When a shortcut doesn't fit, the [`sql`](/sql-template#sql) template is always there. You write the SQL, it interpolates names, values as parameters, and other fragments, and you type the result with the generated types. The shortcuts are built on it.

## Explicit, never hidden

There are no models. A query gives back plain objects, typed: "just (fully-typed) POJOs", in the words of Zapatos's docs. There's no class to extend, no relationship to declare, nothing loaded lazily behind a property, and no state for a later save to write back.

Nor is there a default connection: each `.run()` takes the pool or client to run on, as "Zapatos is always explicit about what client or pool is running your query". A transaction starts only when you call [`transaction()`](/transaction#transaction). It sends `START TRANSACTION`<!-- probe: db.serializable(pool, async () => {}) --> at the isolation level you chose, then `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> or `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, and runs your callback again after a serialisation failure or a deadlock ([Retry a transaction](/retries)).

The same goes for your own functions. Zapatos's docs advise against giving a function's client argument the pool as its default: "I find that way it's too easy to accidentally issue queries outside of transactions." So a function of yours takes its client with no default, and each caller passes the pool or its transaction's client. One that only runs queries takes a [`Queryable`](/sql-template#Queryable). One that opens a transaction takes the pool or the client of its level, `pg.Pool | db.TxnClientForSerializable` for [`serializable()`](/transaction#serializable): a `Queryable` would also take the client of a transaction at a lower level, and the function would run inside it, at that level ([Book inside a larger transaction](/retries#book-inside-a-larger-transaction)).

## What pgcast adds

pgcast starts from Zapatos 6.6.1. Before changing it, the fork pinned what 6.6.1 does, with tests, and that [characterisation](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md) found dozens of surprises, 7 of them about security, all fixed in 6.6.2. A finding pgcast acts on takes one of three paths ([decision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)):

| Path | When | What changes for you | Example |
|---|---|---|---|
| Fix | a security hole; or Postgres or the type already refused the call; or the result contradicts the function's name, type or docs | the call does what it says, or throws an error that says what to do, before any query | [`update()`](/insert#update) with no columns throws `nothing to update: an Updatable needs at least one column`<!-- message -->, where Postgres refused `SET () = ROW()` |
| Opt-in | the result is valid, and code may rely on it | nothing until you turn the option on; the old path warns once per process | [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing): an `undefined` value is a missing key, not `NULL`; warning `PGCAST_DEP002` |
| Document | Postgres works that way, or it was meant | nothing: the docs say so | [`isNotIn()`](/conditions#conditions.isNotIn) with a `NULL` in its list matches no row, as Postgres reads `NOT IN` |

The security fixes came first, in 6.6.2: no name (a table, a column, a key, an alias) and no cast of `param()` can close its quotes, a plain value in [`upsert()`](/insert#upsert)'s `updateValues` is a parameter, and the keywords of a lock, `truncate()` or an isolation level, and the name of an aggregate, are checked before any query ([The security model](/security)). The opt-ins that warn, [`undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys) and [`transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit), and the generator's [`typeEnumsAcrossSchemas`](/generator#generate.typeEnumsAcrossSchemas), become the defaults in 7.0, and their old paths go in 8.0; [`selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow), which never warns, stays off; until then, 6.x is a drop-in for Zapatos 6.6.1 ([Versions, opt-ins and warnings](/versions)).

Zapatos 6.6.1 shipped no test suite of its own (its first consumer's tests exercised "most of the code base at least a little"); its CI linted and built. Its roadmap called one "kind of indispensable", one that tests "not just returned values but also inferred types". pgcast's tests check the SQL each call compiles, run it on Postgres 14, 16 and 18, check the types, accepted and refused, and measure what they cost the compiler.

These docs are the latest addition. Every example compiles against the library at build: its SQL comes from its own `.compile()`, its type from TypeScript, and an example that no longer fits fails the build.

What stays is everything you import. The module names are still `zapatos/db` and `zapatos/schema`, the API is Zapatos's, and so is the behaviour, but for the fixes: installed under the `zapatos` alias, pgcast needs no change to your imports ([Switch from Zapatos](/switching)).

::: info Coming
The aim is Zapatos going the last mile: foreign-key joins, the conditions Postgres offers, CTEs, functions and raw SQL, each with a typed form, so that real code never falls back on `db.raw`, a hand-written row type or a cast. Each comes under the same rules, and the [roadmap](https://github.com/AlexandreDemartin/pgcast#roadmap) gives their order.
:::

## What pgcast will not do

Some changes are refused whatever they'd gain, because each would take away something above:

| pgcast won't add | Because |
|---|---|
| Models, entity classes, relationships declared in TypeScript | a result is "just (fully-typed) POJOs"; the relationships are in the database |
| Lazy loading, an identity map, change tracking, a query cache | each is hidden state: a query would run, or not, without your asking |
| A method chain that builds a query (`.where().join()`) | it hides the SQL; a shortcut writes one query, and the `sql` template yours |
| An implicit, default or global client; a transaction you didn't open | "Zapatos is always explicit about what client or pool is running your query" |
| A connection pool, or migrations | `pg` makes the pool easy, and "Zapatos doesn't handle schema migrations": your migration tool does |
| A layer to switch databases | it costs "effective use of this database today" |
| A type the database doesn't state | a guessed type drifts from the schema |
| A value pasted into the SQL | values are parameters; only [`raw()`](/sql-template#raw) writes a string into the SQL as it is, and it returns a `DangerousRawString` |
| SQL that depends on state, or changes with the values, undocumented | you could no longer read the query from the call |
| Complexity in the core for a niche case, or a gain lost in network latency | "Small is beautiful": it goes to a separate package, or behind an opt-in |

## Further reading

- The entries this page talks about: [`select()`](/select#select), [`selectOne()`](/select#selectOne), the [`sql`](/sql-template#sql) template and [`.compile()`](/sql-template#compile), [`transaction()`](/transaction#transaction), [`Config.undefinedMeansMissing`](/runtime-config#Config.undefinedMeansMissing), [`Config.upsertRequiresSameKeys`](/runtime-config#Config.upsertRequiresSameKeys), [`Config.transactionRequiresCommit`](/runtime-config#Config.transactionRequiresCommit) and [`Config.selectExactlyOneChecksForSecondRow`](/runtime-config#Config.selectExactlyOneChecksForSecondRow).
- The guides: [Join through a lateral](/lateral), [Retry a transaction](/retries), [Switch from Zapatos](/switching).
- Zapatos's own [docs](https://jawj.github.io/zapatos/), for 6.6.1; what pgcast changes, in the [changelog](/changelog).

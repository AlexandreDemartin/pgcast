# Test code that uses pgcast

Three ways to test a function that runs pgcast queries, the most faithful first: against a real Postgres, each test rolled back; on the query it compiles, with no database; on a fake result typed from the schema. It assumes the basics of the [tutorial](/tutorial).
{.lede}

## The function to test

`programme()` lists a studio's films, oldest first, as lines for a poster. The examples below test it, or a function like it:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
async function programme(queryable: db.Queryable, studio_id: number) {
  const films = await db.select('films', { studio_id }, {
    columns: ['title', 'release_year'],
    order: { by: 'release_year', direction: 'ASC' },
  }).run(queryable);
  return films.map(film => `${film.title} (${film.release_year})`);
}
```

It takes a [`Queryable`](/sql-template#Queryable), so a test can hand it any pool or client, or a fake.

## Test against a real database

The approach I recommend: the only one of the three that checks the query itself and what Postgres sends back. pgcast's own suite works this way ([`test/helpers/db.ts`](https://github.com/AlexandreDemartin/pgcast/blob/master/test/helpers/db.ts)).

### Copy a database for each test file

Load your schema once into a template database, with your migrations, then copy it for each test file and drop the copy after its tests:

```sql
CREATE DATABASE films_test_4f1c TEMPLATE films_template;
-- this file's tests
DROP DATABASE films_test_4f1c;
```

- Postgres copies the template as it is: the migrations don't run again. The role needs `CREATEDB`.
- No session may be connected to the template while it is copied: Postgres refuses with 55006 ("source database … is being accessed by other users").
- A random suffix per file lets test files run at once, each on its own database.

### Roll back each test

Each test runs on one client, inside `BEGIN`, rolled back afterwards: what it writes is gone before the next test. It seeds its own rows with [`insert()`](/insert#insert):

<<< ./examples/plain/testing_rolled_back.ts{ts twoslash}

- Here with `test` from `node:test` and `assert` from `node:assert/strict`; any test runner does, and `beforeEach` / `afterEach` hooks can hold the same lines.
- Read a generated value from what `insert()` returns, as `studio.id` here: never write it into the test (below).
- A client whose `ROLLBACK` fails is broken: `release(err)` destroys it rather than handing it to the next test.

### Know what a rollback leaves

| What a test did | After its `ROLLBACK` |
|---|---|
| Rows inserted, updated or deleted; `SET`; a temporary table | undone |
| A `SERIAL` or identity value taken | still taken: the next test's `insert()` gets the next id, 2 after 1, though row 1 is gone |
| `PREPARE`, or a query run with [`prepared()`](/sql-template#prepared) | kept on the connection, for the next test that gets it from the pool |
| A session advisory lock, `pg_advisory_lock()` | still held by that connection |

So an id is read, never hard-coded; and a prepared name stands for one text across every test that shares the pool.

### Give code that commits the pool

Code that opens its own [`transaction()`](/transaction#transaction) can't join the test's. Given the test's client, inside its `BEGIN`, it sends `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, which Postgres answers with a warning (25001, "there is already a transaction in progress"), then ends the test's transaction one of two ways ([#233](https://github.com/AlexandreDemartin/pgcast/issues/233)):

- If the test has run no query yet, or at the session's own level (`readCommitted()`, on a default server), its `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commits the test's transaction, rows and all.
- At another level, after any query, the test's seeds included, Postgres refuses with 25001 ("SET TRANSACTION ISOLATION LEVEL must be called before any query"): its `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> undoes the seeds, and the call rejects.

Either way, the test's `ROLLBACK` has nothing left to undo (25P01). So give such code the pool, and delete what it commits:

<<< ./examples/plain/testing_commits.ts{ts twoslash}

- The `deletes()` in `finally` runs even when an assertion fails.
- Until then, the booking is there for every other connection: a test of the same screening, running at the same moment, can count it.

## Test the query a function builds

For a function whose job is to turn its input into a query, no database is needed: [`compile()`](/sql-template#compile) gives the `text` and `values` that `run()` would send. `filmSearch()` builds a search from a query string:

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
function filmSearch(params: URLSearchParams) {
  const words = params.get('title'), before = params.get('before');
  return db.select('films', {
    ...(words === null ? {} : { title: db.conditions.ilike(`%${words}%`) }),
    ...(before === null ? {} : { release_year: db.conditions.lt(Number(before)) }),
  }, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } });
}
```

For `?title=lantern&before=2000`:

<CastPanel example="testing_search">

<<< ./examples/testing_search.ts{ts twoslash}

</CastPanel>

The test compares its compiled query with the one of the call it should make, compiled by the same pgcast:

<<< ./examples/plain/testing_search_test.ts{ts twoslash}

- It fails when `filmSearch()` makes another call, and not when pgcast writes the same call's SQL another way.
- `values` holds more than your input: `columns` sends each name as a parameter (`$1::text`<!-- probe: examples/testing_search.ts -->), and a filter's keys go in alphabetical order, `"release_year" < $3`<!-- probe: examples/testing_search.ts --> before `"title" ILIKE $4`<!-- probe: examples/testing_search.ts -->. A `values` array written by hand ties the test to both.
- For SQL you write yourself in a `sql` template, freezing its `text` is fine: the text is yours ([Check the SQL before you run it](/raw-sql#check-the-sql-before-you-run-it)).

### The SQL text is not a stable API

pgcast keeps what a query does: the rows it reads or writes, and the type of what `run()` returns. It does not keep the text it compiles: a minor version may change it, a pair of parentheses, the order of clauses, a cast, as long as the result does not. The fix of `not()` is one such change: each condition under `not()` gains a pair of parentheses, and most match the same rows.

So a test that freezes the text of a shortcut's query, or a fake that picks its answer by matching that text, can break on an upgrade with nothing wrong in your code.

## Fake a result typed from the schema

For the logic around a query, with no database at all: a fake `Queryable` returns the rows you give it, and the rows are typed from the schema, so a fake row stops compiling when its table changes. A few lines you write; pgcast ships no fake.

<<< ./examples/plain/testing_fake.ts{ts twoslash}

- `run()` sends the compiled query to `query()` and reads its result from what comes back; the fake ignores the query.
- It is neither a `pg.Pool` nor a client, hence `as unknown as`: a plain `as db.Queryable` does not compile (TS2352).
- A [`transaction()`](/transaction#transaction) given the fake calls its `connect()`, which it doesn't have: a fake for code that opens one also needs `connect()`, returning itself with a `release()`, and gets `START TRANSACTION …` and `COMMIT` as queries too.

Say a migration renames `release_year`: once the generator has run, every fake row that still has it fails to compile. Here, a fake row with a column `films` doesn't have:

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
type Films = db.FullSelectReturnTypeForTable<
  'films', ['title', 'release_year'], undefined, undefined, db.SelectResultMode.Many>;
// ---cut---
const films: Films = [{ title: 'Tidewater', year: 2021 }];
```

With `strict` off, `columns` leaves the type at the table's full `JSONSelectable` ([`select()` options](/select#options)): a fake row then needs every column (TS2739), and `null` fits any of them.

### Type each result

| Query | One result's type | The fake's `rows` |
|---|---|---|
| [`select()`](/select#select) | [`FullSelectReturnTypeForTable`](/select#FullSelectReturnTypeForTable)`<T, C, L, E, M>`, `M` the mode | `[{ result }]`, the whole array in one row; `[{ result: [] }]` for none, as Postgres sends it (`[]` gives `undefined`) |
| [`selectOne()`](/select#selectOne), [`selectExactlyOne()`](/select#selectExactlyOne) | the same | `[{ result }]`; `[]` for none: `undefined` from `selectOne()`, a [`NotExactlyOneError`](/select#NotExactlyOneError) from `selectExactlyOne()` |
| [`count()`](/select#count) and the other aggregates | `number` | `[{ result }]` |
| [`insert()`](/insert#insert), [`update()`](/insert#update), [`deletes()`](/insert#deletes) | [`ReturningTypeForTable`](/insert#ReturningTypeForTable)`<T, C, E>`, for each row | one `{ result }` per row |
| [`upsert()`](/insert#upsert) | [`UpsertReturnableForTable`](/insert#UpsertReturnableForTable)`<T, C, E, RA>`, for each row | one `{ result }` per row |
| A [`sql`](/sql-template#sql) template | [`RunResultForSQLFragment`](/sql-template#RunResultForSQLFragment)`<typeof query>` | the rows themselves |

- `RunResultForSQLFragment` reads `undefined` as `null`, as a nested query comes back in JSON: for a `selectOne()` you run, `FullSelectReturnTypeForTable` with `SelectResultMode.One` keeps its `undefined`.
- The shortcuts read their result from a column named `result`<!-- probe: examples/testing_search.ts -->, part of the SQL they compile: a fake that answers in that shape depends on it, as on the text.

### Know what a fake does not check

- **The query.** A filter on the wrong column, a value Postgres refuses (`stars: 6` in `ratings`, 23514 from its `CHECK`), SQL it can't parse: the fake answers anyway.
- **What Postgres sends back.** Which rows, in which order, which of them `null`: the fake returns what it is given.
  - A `timestamptz` comes back from a shortcut as a string in the session's time zone: `2030-03-01T19:30:00+00:00` in UTC, `2030-03-01T20:30:00+01:00` in Paris. Its type, `TimestampTzString`, takes `2030-03-01T19:30:00Z` too. From a `sql` template, `pg` gives a `Date`.
  - A `bigint` comes back from a shortcut as a JSON number, rounded past 2<sup>53</sup>: 9007199254740993 arrives as 9007199254740992 ([`customJSONParsingForLargeNumbers`](/generator#generate.customJSONParsingForLargeNumbers)). From a `sql` template, `pg` gives a string.

A real database checks both: keep a test against it for each query, and fakes for the logic around them.

## See also

- [Write raw SQL safely](/raw-sql#check-the-sql-before-you-run-it): a test that keeps hostile input in `values`.
- [Retry a transaction](/retries#test-a-retry): a test that makes a transaction run again.
- [`compile()`](/sql-template#compile), [`Queryable`](/sql-template#Queryable), [`transaction()`](/transaction#transaction): what they take and give.
- [Why pgcast](/why): why the database is the source of the types.

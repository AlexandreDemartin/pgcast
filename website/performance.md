# Performance

Keep a read of large or many rows fast. Each shortcut builds its result as JSON in Postgres; where that costs, [`columns`](/select#columns), [`selectRows()`](/select#selectRows), [`cursor()`](/transaction#cursor), [`prepared()`](/sql-template#prepared) and the [`sql`](/sql-template#sql) template keep it down.
{.lede}

## When the JSON costs

Each row is `to_json("films".*)`<!-- probe: examples/select.ts -->, and `select()` gathers the rows into one value, `coalesce(json_agg(result), '[]')`<!-- probe: examples/select.ts -->. Three cases make that cost show:

- **Large values**: `to_json` reads each value whole, a large `jsonb` stored out of line included, and writes it out again. On 10,000 rows with a 4 KB `jsonb`, `select()` takes about 0.4 s, `SELECT *` about 0.2 s.
- **Many rows**: `json_agg` builds the whole result as one value in Postgres's memory, sent and parsed in one piece, up to a [limit](#limits).
- **Nested laterals**: each level builds its rows' `json`, which its parent takes as it is. 1,000 studios with 20 films each take about 20 ms, a third of what 7.x's `jsonb` took, which Postgres parsed again at each level ([8.0 migration](/switching#from-8-0-shortcutsUseJson)).

A page of 50 small rows takes 0.1 to 0.2 ms in every form measured, about one round trip to a local Postgres: there, the JSON is not worth avoiding. These figures are orders of magnitude, timed from the client on Postgres 17.3 on localhost.

## Leave a large column out

The films of a studio without their `details`, a `jsonb` column:

<CastPanel example="performance">

<<< ./examples/performance.ts{ts twoslash}

</CastPanel>

- `json_build_object($1::text, "id", $2::text, "title", $3::text, "release_year")`<!-- probe: examples/performance.ts --> replaces `to_json("films".*)`, so `details` is never turned into JSON. On the 10,000 rows above, the query goes from about 0.4 s to under 20 ms.
- The type keeps only those keys, `{ id: number; title: string; release_year: number }[]`.
- One field of the large column is an [`extras`](/select#extras) fragment: [JSON fields](/json-fields).

## Get one row per result

<CastPanel example="performance_select_rows">

<<< ./examples/performance_select_rows.ts{ts twoslash}

</CastPanel>

- `SELECT to_json("films".*) AS result FROM "films" WHERE ("studio_id" = $1)`<!-- probe: examples/performance_select_rows.ts -->: no `json_agg`, so each row is a value of its own, and no single value holds the whole result.
- The type is `select()`'s, `s.films.JSONSelectable[]`.
- From 7.3.0, for every `select()` run on its own, turn on [`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows): each sends this query, and nested ones keep their aggregate.

## Read in batches

For a result you would rather not hold in memory whole, [`cursor()`](/transaction#cursor) reads a `selectRows()` a batch at a time, `FETCH FORWARD 100 FROM pgcast_cursor_1`<!-- probe: db.readCommitted(pool, async txnClient => { for await (const _ of db.cursor(txnClient, db.selectRows('films', { studio_id: 1000 }), { batchSize: 100 })) { } }) -->, each batch one round trip: [Cursors](/cursors).

## Prepare a nested query run often

Postgres plans a query each time it runs it, 0.6 ms for one with laterals three levels deep. [`prepared()`](/sql-template#prepared) names it, so each connection prepares it once, then runs it by name:

<CastPanel example="performance_prepared">

<<< ./examples/performance_prepared.ts{ts twoslash}

</CastPanel>

- The SQL is the same; `compile()` adds the name, `studio_with_films`.
- That query took about 0.8 ms a call, and a fifth less prepared.
- One name stands for one text: a query function whose text never changes, its values aside.

## Read rows as `pg` returns them

The [`sql`](/sql-template#sql) template builds no JSON at all:

<CastPanel example="performance_sql">

<<< ./examples/performance_sql.ts{ts twoslash}

</CastPanel>

- `SELECT * FROM "films" WHERE ("studio_id" = $1)`<!-- probe: examples/performance_sql.ts -->, as written. On the 10,000 rows of 4 KB, about 0.2 s against 0.4 s with `select()`.
- The type is the one you give, `s.films.Selectable[]`: values as `pg` parses them, a `timestamptz` as a `Date` where `JSONSelectable` has a string ([One column, five types](/catalog-types#one-column-five-types)). Nothing checks it against the query; [Typed SQL](/typed-sql) generates it.

## Limits

- `select()`'s `json_agg` may reach a value's 1 GB: 2,000 rows of 115 KB take about 1.5 s. Through 7.x, `jsonb_agg` failed past 256 MB, with Postgres's 54000, `total size of jsonb array elements exceeds the maximum of 268435455 bytes`. `columns`, `selectRows()` or a `cursor()` keep under it, and so does [`topLevelSelectAsRows`](/runtime-config#Config.topLevelSelectAsRows), from 7.3.0, for a `select()` run on its own.
- `pg` reads each value into one JavaScript string, and Node caps a string at about 512 MB ([node-postgres#2653](https://github.com/brianc/node-postgres/issues/2653)).

## Measure

Time the call from your client, or, on Postgres 17 and later, run `EXPLAIN (ANALYZE, SERIALIZE)` on the query's compiled text:

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const { text, values } = db.selectOne('films', { id: 1000 }).compile();
const plan = await pool.query(`EXPLAIN (ANALYZE, SERIALIZE) ${text}`, values);
```

Plain `EXPLAIN ANALYZE` leaves out turning each row into text for the client, where a `SELECT *` reads its large values: on the 10,000 rows of 4 KB, it gives `SELECT *` 0.4 ms, against 178 ms with `SERIALIZE`. A shortcut builds its JSON inside the plan, so plain `EXPLAIN ANALYZE` counts it, and makes `SELECT *` look far cheaper than it is. Timed from the client, one row by its key takes 0.2 ms with `selectOne()` and 0.1 ms with `SELECT *`.

## See also

- [`select()`](/select#select): every option, the SQL it writes.
- [Why the shortcuts return JSON](/catalog-types#why-the-shortcuts-return-json).
- [`EXPLAIN`](https://www.postgresql.org/docs/current/sql-explain.html), in the Postgres docs.

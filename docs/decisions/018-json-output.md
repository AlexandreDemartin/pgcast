# 018 — How the shortcuts write their JSON: `json` functions, and rows at the top level

- **Status**: accepted (2026-11-24), by delegation from the owner. Each choice below is decided under the philosophy.
- **Scope**: step [#938](https://github.com/AlexandreDemartin/pgcast/issues/938) of Epic [#942](https://github.com/AlexandreDemartin/pgcast/issues/942); built by [#939](https://github.com/AlexandreDemartin/pgcast/issues/939) and [#940](https://github.com/AlexandreDemartin/pgcast/issues/940).
- **In short**:
  - `shortcutsUseJson: true` builds every shortcut's result with `to_json`, `json_agg` and `json_build_object` in place of their `jsonb` twins.
  - `topLevelSelectAsRows: true` compiles a `select()` run on its own to `selectRows()`'s query, one row per result; nested, it keeps its aggregate.
  - The types do not change. Both are off in 7.x, on by default in 8.0, and `false` stays a permanent choice.

## Context

- Today every shortcut builds `jsonb`, and `select()` folds its rows into one `jsonb_agg` value. The Epic's two measures (comments "First measure" and "Second measure") found both to be the main cost of large and nested reads:
  - 1000 studios × 20 films in a `lateral`: 84 → 31 ms with `json`, 27 ms with both (Postgres 17.3).
  - 10 000 rows × 4.6 KB: 635 → 261 ms with both, within 10 % of a native `SELECT *`; 2000 rows × 115 KB fail on `jsonb_agg`'s 256 MB cap (54000).
  - Postgres 19 makes `jsonb` about 25–30 % cheaper, and `json` stays well ahead: with both, the lateral goes from 68 to 26 ms and the 10 000 large rows from 520 to 146 ms. The 256 MB cap still fails.
  - Through a simulated network (`SELECT 1` in 2.6 ms), the gains stay: 108 → 32 ms and 983 → 385 ms. Small queries gain nothing: the round trip is all their cost.
  - The two levers are both needed: `json` alone, or rows alone, leaves half the gain on large reads.
- Kysely, Drizzle, Hasura, PostGraphile v4 and PostgREST's top level build their JSON with `json` (sources in the Epic's first comment).
- On a production app (static count, aggregate figures only): 816 top-level `select()` calls, 469 top-level reads with a `lateral`, 1224 `lateral` keys, 223 reads with `extras`.

## 1. The options

| Key | Values | 7.x | 8.0 |
|---|---|---|---|
| `shortcutsUseJson?: boolean` | `true`: § 2; `false`, or left out in 7.x: today's `jsonb` | off | on; `false` is permanent, for SQL that applies a `jsonb` function, `DISTINCT` or `UNION` to a nested result, or a type parser set for `jsonb` alone |
| `topLevelSelectAsRows?: boolean` | `true`: § 3; `false`, or left out in 7.x: today's aggregate | off | on; `false` is permanent, for code that runs `compile()`'s text with its own client and reads `rows[0].result` |

- **Class** (decision 003 § Rule): opt-in, then the default at the next major, now 8.0, as note 017. Not Fix: today's SQL is valid, and code may read its text or a nested `jsonb`.
- **Names**: flat keys of the runtime `Config`, optional (`?:`) with `false` in its defaults (decision 003 § Rule), each saying what the shortcuts do (`selectExactlyOneChecksForSecondRow`, `aggregatesTypedByColumn`).
- **Two options, not one**: each lever is measured on its own, and each breaks a different reading (a nested value's type; `compile()`'s text).
- **No `DeprecationWarning` in 7.x**, unlike decision 003's 7.0 opt-ins, as note 017: the values are the same, and a warning cannot tell whether a program relies on what changes. 8.0's `CHANGELOG.md` names both options and their `false`.
- **No `ConfigTypes` entry**: the types are the same under both values.

## 2. `shortcutsUseJson`

`json` has no `||`, so a merge cannot stay `to_jsonb(t.*) || jsonb_build_object(…)`. Each piece of today's SQL becomes:

| Piece | Today | With the option |
|---|---|---|
| Every column | `to_jsonb("films".*)` | `to_json("films".*)` |
| `columns` | `jsonb_build_object($1::text, "id", …)` | `json_build_object($1::text, "id", …)` |
| `columns`, with `extras` or a `lateral` map | `jsonb_build_object(…) \|\| jsonb_build_object(…)` | one `json_build_object(…)`: columns, extras, laterals; keys stay parameters |
| Every column, with `extras` or a `lateral` map (a read) | `to_jsonb("studios".*) \|\| jsonb_build_object($1::text, "lateral_films".result)` | `to_json("row_studios".*)` over `(SELECT "studios".*, "lateral_films".result AS "films" …) AS "row_studios"` |
| Every column, with `extras` or `$action` (a write's `RETURNING`) | `to_jsonb("studios".*) \|\| jsonb_build_object(…)` | `(SELECT to_json("row_studios".*) FROM (SELECT "studios".*, … AS "upper") AS "row_studios")` |
| `select()`'s aggregate | `coalesce(jsonb_agg(result), '[]')` | `coalesce(json_agg(result), '[]')` |
| `distinct: true` | `jsonb` rows | the same `jsonb` rows, under `json_agg` |
| `withCTEs()`'s no-op | `SELECT NULL::jsonb AS result WHERE false` | `SELECT NULL::json AS result WHERE false` |

`count()` and the other aggregates build no JSON: their SQL is unchanged.

### SQL before and after

From the probe (§ 5). The "after" SQL is hand-written: #939 builds it.

```sql
-- select('studios', db.all, { order, lateral: { films: select('films', { studio_id: parent('id') }, { order }) } }): today
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("studios".*) || jsonb_build_object($1::text, "lateral_films".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = "studios"."id") ORDER BY "id" ASC) AS "sq_films") AS "lateral_films" ON true ORDER BY "id" ASC) AS "sq_studios"
-- shortcutsUseJson
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_studios".*) AS result FROM (SELECT "studios".*, "lateral_films".result AS "films" FROM "studios" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("films".*) AS result FROM "films" WHERE ("studio_id" = "studios"."id") ORDER BY "id" ASC) AS "sq_films") AS "lateral_films" ON true ORDER BY "studios"."id" ASC) AS "row_studios") AS "sq_studios"

-- the same with columns: ['id', 'name'], and columns: ['id'] in the lateral: today
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($1::text, "id", $2::text, "name") || jsonb_build_object($3::text, "lateral_films".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT jsonb_build_object($4::text, "id") AS result FROM "films" WHERE ("studio_id" = "studios"."id") ORDER BY "id" ASC) AS "sq_films") AS "lateral_films" ON true ORDER BY "id" ASC) AS "sq_studios"
-- shortcutsUseJson
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($1::text, "id", $2::text, "name", $3::text, "lateral_films".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT json_build_object($4::text, "id") AS result FROM "films" WHERE ("studio_id" = "studios"."id") ORDER BY "id" ASC) AS "sq_films") AS "lateral_films" ON true ORDER BY "id" ASC) AS "sq_studios"

-- selectOne('studios', { id: 1 }, { extras: { latest: selectOne('films', …, { order }) } }): today
SELECT to_jsonb("studios".*) || jsonb_build_object($1::text, (SELECT to_jsonb("films".*) AS result FROM "films" WHERE "studio_id" = "studios"."id" ORDER BY "released" DESC LIMIT $2)) AS result FROM "studios" WHERE ("id" = $3) LIMIT $4
-- shortcutsUseJson
SELECT to_json("row_studios".*) AS result FROM (SELECT "studios".*, (SELECT to_json("films".*) AS result FROM "films" WHERE "studio_id" = "studios"."id" ORDER BY "released" DESC LIMIT $1) AS "latest" FROM "studios" WHERE ("id" = $2) LIMIT $3) AS "row_studios"

-- lock: { for: 'UPDATE', of: 'studios' }, with a count() lateral: today
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("studios".*) || jsonb_build_object($1::text, "lateral_films".result) AS result FROM "studios" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "films" WHERE ("studio_id" = "studios"."id")) AS "lateral_films" ON true WHERE ("id" = $2) FOR UPDATE OF "studios") AS "sq_studios"
-- shortcutsUseJson
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("row_studios".*) AS result FROM (SELECT "studios".*, "lateral_films".result AS "films" FROM "studios" LEFT JOIN LATERAL (SELECT count(*) AS result FROM "films" WHERE ("studio_id" = "studios"."id")) AS "lateral_films" ON true WHERE ("id" = $1) FOR UPDATE OF "studios") AS "row_studios") AS "sq_studios"

-- distinct: true: today
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("films".*) AS result FROM "films") AS "sq_films"
-- shortcutsUseJson
SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT DISTINCT to_jsonb("films".*) AS result FROM "films") AS "sq_films"

-- upsert('studios', { id: 1, … }, 'id'): today
… RETURNING to_jsonb("studios".*) || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result
-- shortcutsUseJson
… RETURNING (SELECT to_json("row_studios".*) FROM (SELECT "studios".*, CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END AS "$action") AS "row_studios") AS result

-- upsert(…, 'id', { returning: ['id'] }): today
… RETURNING jsonb_build_object($7::text, "id") || jsonb_build_object('$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result
-- shortcutsUseJson
… RETURNING json_build_object($7::text, "id", '$action', CASE xmax WHEN 0 THEN 'INSERT' ELSE 'UPDATE' END) AS result

-- insert('studios', { … }, { extras: { upper: sql`upper(${'name'})` } }): today
… RETURNING to_jsonb("studios".*) || jsonb_build_object($4::text, upper("name")) AS result
-- shortcutsUseJson
… RETURNING (SELECT to_json("row_studios".*) FROM (SELECT "studios".*, upper("name") AS "upper") AS "row_studios") AS result
```

The other cases swap the function names only: `alias` (`to_json("f".*) … AS "sq_f"`), `distinct` on columns (`DISTINCT ON ("studio_id") to_json("films".*)`), `groupBy` and `having` (`json_build_object($1::text, "studio_id", $2::text, count(*)) … GROUP BY "studio_id" HAVING count(*) > 1`), a passed-through `lateral` (its query's `to_json`), the aggregates under a `lateral` key, `update()` and `deletes()` (`RETURNING to_json("films".*)`).

### Each case settled

- **A key name** (an `extras` or `lateral` key, beside every column): a column alias, since `to_json(x.*)` names its keys after the columns.
  - Written as one quoted identifier, each `"` doubled, never split on `.`, case kept: `a"b`, `a""b`, `a.b`, `année 🎬`, a newline and `$1` all came back as given.
  - Refused as the query compiles, with a message that names the key and the way out (`columns`, whose keys stay parameters, or the option off): an empty key (Postgres: 42601), a NUL (08P01), and one over 63 bytes in UTF-8, which Postgres truncates with only a `NOTICE`.
  - `columns`, `extras` beside `columns`, the lateral `FROM` alias (`"lateral_films"`) and `'$action'` keep today's form. #939 adds the injection tests of skill `sql-safety` for each name the new shape writes.
- **A key equal to a column**: `||` lets the right side win; `to_json` writes both keys, in the order `||` merges them today (columns, then `extras`, then the sorted `lateral` keys, then `$action`), and `JSON.parse`, `json-custom-numbers`, a cast to `jsonb` and `->>` all keep the last. Same value; the duplicate goes over the wire.
- **`order` and `distinct` beside such a key**: in the alias shape, a bare name in `ORDER BY` or `DISTINCT ON` matches an output column first, and two of them fail (42702, "ORDER BY "name" is ambiguous"). So there, a string `order.by` and each string of `distinct` are written after the alias, `ORDER BY "studios"."name"`, unless they already hold a `.`; a fragment is the caller's SQL, written as given. `GROUP BY` takes the input column first: unchanged.
- **Why not a scalar subquery in a read**: `(SELECT to_json(r.*) FROM (SELECT "films".studio_id, count(*) AS n) r)` moves an `extras` aggregate to the subquery's level: `count(*)` gave 1 in place of 20. The read wraps the row level instead; `RETURNING` refuses aggregates (42803), window functions (42P20) and set-returning functions (0A000), so a write can take the scalar subquery.
- **`columns` with a merge**: one `json_build_object`, not the alias shape: keys stay parameters, no `ORDER BY` collision, and it measured the same (§ 5).
  - Postgres takes 100 arguments in a call (`max_function_args`; 102 gave 54023 on 17.3), so 50 keys, where today `columns`, `extras` and the `lateral` keys each have their own `jsonb_build_object`. Over 50 keys, together, are refused as the query compiles, with a message that names the limit, the count and the ways out (fewer keys, or the option off); no fallback to another shape (§ 6). Decided in #939.
- **`alias`**: the row level is `"row_<alias>"` and the aggregate `"sq_<alias>"`, both written as `SQLForAlias` writes `"sq_<alias>"` today.
- **`distinct: true`**: `json` has no equality operator (`DISTINCT` over `to_json` fails, 42883), so that query level keeps today's `jsonb` rows, which `DISTINCT` compares as today; its result type is `jsonb` nested in a `selectOne()`, and `json` under `select()`'s `json_agg`. `distinct` on columns compares columns: `json` rows.
  - Over a passed-through `lateral`, `DISTINCT` compares the subquery's result: one that `select()`, `selectOne()` or `selectExactlyOne()` built as `json` is written `to_jsonb("lateral_passthru".result)`, the rows of the option off; an aggregate's, or a `jsonb` one, stays as it is, so a `count()` keeps its `bigint`. Decided in #939.
- **`groupBy` and `having`**: the same clauses at the row level; `GROUP BY "id"` with every column, and `count(*)` in `extras`, gave the same values.
- **`lock`**: stays in the row level, inside `"row_<alias>"`; Postgres takes `FOR UPDATE` in a sub-`SELECT`, as it does today inside `"sq_<alias>"`.
- **A passed-through `lateral`**: `"lateral_passthru".result` as today, its query built with `json`.
- **The aggregates**: unchanged; under a `lateral` key their value enters `json_build_object` or an alias, a typed `min()`/`max()` included.
- **The writes**: `insert`, `update`, `upsert` and `deletes` take the shapes of § 2's table, `$action` included; `returning: […]` with `'$action'` is one `json_build_object`.

## 3. `topLevelSelectAsRows`

- **Top level**: `select()` compiled on its own (`run()`, `compile()`, and the main query of `withCTEs()`) is `selectRows()`'s query, and `run()` returns `qr.rows.map(r => r.result)`: the same array, `[]` for no row.
- **Nested**: in a `lateral`, a `sql` template, `extras`, a CTE body of `withCTEs()`, it keeps its aggregate, which its parent reads as one value.
- **Mechanism**: `selectExactlyOneChecksForSecondRow`'s (decision 003, R14; `topLevelQuery` in `shortcuts.ts`): `compile()` with no parent result gives the rows form, carrying `parentTable`, `preparedName` and `noop`.
- With `shortcutsUseJson`, the rows are built with `to_json`.

```sql
-- select('films', { studio_id: 1 }, { order: { by: 'id', direction: 'ASC' } }): today
SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1) ORDER BY "id" ASC) AS "sq_films"
-- topLevelSelectAsRows: selectRows()'s text
SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1) ORDER BY "id" ASC
-- both
SELECT to_json("films".*) AS result FROM "films" WHERE ("studio_id" = $1) ORDER BY "id" ASC

-- withCTEs({ s: select('studios', { id: 1 }) }, select('films', …)), both: the CTE keeps its aggregate
WITH "s" AS (SELECT coalesce(json_agg(result), '[]') AS result FROM (SELECT to_json("studios".*) AS result FROM "studios" WHERE ("id" = $1)) AS "sq_studios") SELECT to_json("films".*) AS result FROM "films" WHERE … ORDER BY "id" ASC
```

## 4. What a user can observe

| With | What changes | Who notices |
|---|---|---|
| `shortcutsUseJson` | The values, after `pg` parses them: equal on the Epic's 45 cases and on the 33 of § 5, except two: `-0` in a `float8` (`-0`; `jsonb` gives `0`) and a `json` column's key order (kept as stored, not sorted) | code that tells `-0` from `0` (`Object.is`) |
| | The key order of a row: the table's, then `extras`, then the sorted `lateral` keys (`id,name,founded,films`), not `jsonb`'s, shorter keys first (`id,name,films,founded`) | code that reads `Object.keys()` or compares `JSON.stringify()` |
| | A nested result is `json` (type 114): a `jsonb` function fails on it (`jsonb_array_length(json)`, 42883), and so do `DISTINCT` and `UNION` over it; `->` and `->>` work | SQL around a nested shortcut |
| | A type parser set for `jsonb` (3802) alone no longer applies; `enableCustomJSONParsingForLargeNumbers()` sets both | a custom `pg.types` setup |
| | The SQL text, and the key refusals of § 2 | logs, SQL snapshots |
| | The aggregate's cap: `jsonb_agg` stops at 256 MB (54000), `json_agg` at a value's 1 GB | very large reads |
| `topLevelSelectAsRows` | `compile()` gives the rows query: code that runs it with its own client and reads `rows[0].result` breaks | code that runs `compile()` |
| | No cap for the whole result; each row keeps a value's, and `pg` a single JS string's ~512 MB ([brianc/node-postgres#2653](https://github.com/brianc/node-postgres/issues/2653)) | very large reads |

## 5. The probe

Run on 2026-11-24 on `TEST_DATABASE_URL`'s server, PostgreSQL 17.3 (an x86_64 build), Node 22, a throwaway database of 1000 studios and 20 000 films. Today's SQL compiled by master's build (`0eac9c8b`); the "after" SQL hand-written. Each case ran both ways, writes in a rolled-back transaction, and compared deep-equal, key order aside: 33 cases, all equal.

Client medians in ms, 9 interleaved rounds after 2 warm-ups; timings move about ±30 % between runs:

| Scenario | Today | `json` | Rows | Both |
|---|---:|---:|---:|---:|
| 1000 studios × 20 films, every column, `lateral` | 109.5 | 37.0 | 92.8 | 34.3 |
| The same with `columns` | 93.9 | 33.5 (`json_build_object`); 32.8 (aliases) | | |
| `upsert()` of 1000 new rows, every column and `$action` | 5.3 | 5.1 | | |
| `insert()` of 1000 rows | 3.5 | 3.4 | | |
| `upsert()` of 1000 rows of 4.4 KB (another run) | 103.0 | 82.8 | | |
| `insert()` of 1000 rows of 4.4 KB (another run) | 109.8 | 101.8 | | |

## 6. Refused

| Option | Why not |
|---|---|
| One option for both | each lever is measured, and breaks a reading, on its own |
| `json` inside, `\|\|` merge in `jsonb` | keeps the cost: 99 against 37 ms all `json` (the Epic's first measure) |
| `json_build_object` of every column, for `*` | the runtime does not know a table's columns; a generated list would be runtime data from the codegen |
| A scalar subquery for a read's merge | moves an `extras` aggregate or window function to its own level (`count(*)` gave 1) |
| A bare `ORDER BY` name in the alias shape | 42702 when a key equals the column it orders by |
| Falling back to `jsonb` for a key that cannot be an alias | a second SQL chosen by a key's length, hidden |
| Writes left on `jsonb` | two rules for one option, and a nested write's result would stay `jsonb`; large rows gain (103 → 83 ms) |
| A `DeprecationWarning` in 7.x | the values are the same, so it would warn every program for what few rely on |
| Native rows and `Selectable` results | the Epic's § Ruled out: 5–10 % for a type change of every result |

## 7. In 8.0

Both options become `true` by default; `false` keeps today's SQL, with no warning, after 8.0 too (decision 003 § An explicit old value is kept). Nothing else is removed.

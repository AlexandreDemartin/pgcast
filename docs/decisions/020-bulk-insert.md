# 020 — One JSON parameter for `insert()` of many rows

- **Status**: accepted (2026-11-25), by delegation from the owner: ruled out. No function of its own, no option; the `sql` form is documented in `website/batches.md`.
- **Scope**: step [#941](https://github.com/AlexandreDemartin/pgcast/issues/941) of Epic [#942](https://github.com/AlexandreDemartin/pgcast/issues/942), judged under note [019](./019-one-behaviour.md) § 8.
- **In short**:
  - `insert()` and `upsert()` keep `VALUES`, one parameter per cell.
  - A JSON parameter read by `json_populate_recordset` does not give the same rows: a missing key and `undefined` give `NULL` in place of `DEFAULT`, a `Date` shifts in a `timestamp` or a `date`, and a `Buffer`, a `sql` fragment or `param()` is stored as its JSON text, silently.
  - A function of its own would need its own row type and a check of every cell, for a gain of about 2 ms per thousand rows (§ 2). The `sql` template already writes the query in one line, where the caller sees what a missing key gives.

## Context

- #941 measured, on Postgres 17.3, one JSON parameter in place of `VALUES`: 1000 rows 9.5 → 2.2 ms, 10 000 rows 44 → 18 ms, and no 65 535-parameter cap.
- Note 019 § 8: it cannot be `insert()`'s sole form, and a config key would be a permanent opt-in. This note weighs a function of its own, or rules it out.
- A corpus of real usage (static count, aggregate figures only): 168 `insert()` calls take an object literal, about 35 a plural variable or a `.map()`; of `upsert()`, 67 and about 70. 11 files that call `insert()` or `upsert()` split rows into chunks, of 100 to 4000 rows. No `json_populate_recordset`, `json_to_recordset` nor `unnest` writes rows.
- The market: Slonik documents bulk inserts as a recipe, `jsonb_to_recordset` in its `sql`, with no helper; PostgREST sends a JSON body to Postgres as is and gives a missing key `NULL` unless the request sets `Prefer: missing=default`.

## 1. Each case, on both forms

Run on master's build (`bae051fd`), Postgres 17.3, `pg` 8.23.1, Node 22, `TZ=Europe/Paris`, in a throwaway database (§ 4). The JSON form is the query of #941 § What, its value `JSON.stringify(rows)`.

```sql
-- VALUES: insert('k', [{ id: 1, title: 'a', note: 'given' }, { id: 2, title: 'b' }])
INSERT INTO "k" ("id", "note", "title") VALUES ($1, $2, $3), ($4, DEFAULT, $5) RETURNING to_jsonb("k".*) AS result
-- JSON
INSERT INTO "k" AS t ("id", "title", "note") SELECT "id", "title", "note" FROM json_populate_recordset(null::"k", $1) RETURNING to_jsonb(t.*) AS result
```

| Case | `VALUES` (`insert()` today) | JSON |
|---|---|---|
| A key missing from row 2, `note text DEFAULT 'none'` | `'none'` | `NULL` |
| The same, `created_at timestamptz NOT NULL DEFAULT …` | the default | 23502, `null value in column "created_at" … violates not-null constraint` |
| `note: undefined` | `'none'` (`DEFAULT`) | `NULL` (the key is dropped) |
| A `GENERATED ALWAYS` column, in the row type, not listed | — | computed |
| `new Date('2030-06-01T22:30:00Z')` into `timestamp` | `2030-06-02 00:30:00` (local time) | `2030-06-01 22:30:00` (UTC) |
| The same into `date` | `2030-06-02` | `2030-06-01` |
| The same into `timestamptz` | `2030-06-02 00:30:00+02` | the same |
| `Buffer.from([0xde, 0xad, 0xbe, 0xef])` into `bytea` | `deadbeef` | the bytes of `{"type":"Buffer","data":[222,173,190,239]}`, no error |
| `9007199254740993n` into `int8` | `9007199254740993` | `TypeError: Do not know how to serialize a BigInt`, before any query |
| `'9007199254740993'` into `int8` | `9007199254740993` | the same |
| `0.1 + 0.2` into `numeric` | `0.30000000000000004` | the same |
| `['x', 'y"z', null]` into `text[]`, `[[1, 2], [3, 4]]` into `int4[]` | as given | as given |
| `[1, { a: 2 }]` into `jsonb` | 22P02, `invalid input syntax for type json` | `[1,{"a":2}]` |
| `{ a: [1, 2] }` into `jsonb` | as given | as given |
| A NUL in `text` | 22021 | 22P05 |
| `` sql`upper(${param('a')})` `` as a value | `upper($2)`: `'A'` | the fragment's JSON as text: `{"literals":["upper(",")"],…}`, no error |
| `param('b', 'text')` as a value | `CAST($4 AS "text")`: `'b'` | `{"value":"b","cast":"text"}`, no error |
| `Default` as a value | `DEFAULT`: `'none'` | `NULL` (`JSON.stringify` drops a symbol) |
| 30 000 rows × 3 columns | 08P01, `bind message has 24465 parameter formats but 0 parameters` | 30 000 rows |
| `RETURNING` order, 30 000 rows | — | the input order; Postgres promises no order to either form |

- **`castArrayParamsToJson: true`**: `VALUES` then takes `[1, { a: 2 }]` into `jsonb`, and refuses `['x']` into `text[]` (42804, `column "tags" is of type text[] but expression is of type json`). The JSON form does not read the key: arrays and `jsonb` both land as given.
- **`upsert()`**: the JSON form takes the same `ON CONFLICT ("id") DO UPDATE SET … = ROW(EXCLUDED."title")` and `xmax` test: `[1, 'a2', 'UPDATE'], [5, 'e', 'INSERT']` on both. The same key twice fails the same way on both (21000).
- **Today's `sql` template** already writes the JSON form, typed by the caller's `sql<…>`:

```ts
db.sql`INSERT INTO ${'k'} (${db.cols(['id', 'title', 'note'])}) SELECT ${db.cols(['id', 'title', 'note'])} FROM json_populate_recordset(null::${'k'}, ${db.param(rows, true)}) RETURNING to_jsonb(${'k'}.*) AS result`
// INSERT INTO "k" ("id", "title", "note") SELECT "id", "title", "note" FROM json_populate_recordset(null::"k", CAST($1 AS "json")) RETURNING to_jsonb("k".*) AS result
```

## 2. Timings

Two runs of `time.mjs`, ms, client side, `run()` to rows: a pool of one client, `TRUNCATE` before each insert, the four forms interleaved, then in reversed order, median of 16 after 2 warm-ups. The machine was loaded (load average 10 to 11), so the two runs differ by up to 25 %.

| Rows | `VALUES`, every column back | JSON, every column back | `VALUES`, `returning: ['id']` | JSON, `RETURNING id` |
|---|---|---|---|---|
| 10 | 0.70 / 0.48 | 0.54 / 0.40 | 0.69 / 0.49 | 0.51 / 0.51 |
| 100 | 1.16 / 0.97 | 0.82 / 0.72 | 1.16 / 0.89 | 0.68 / 0.63 |
| 1000 | 4.49 / 5.01 | 3.15 / 3.30 | 3.76 / 3.84 | 2.02 / 2.18 |
| 10 000 | 45.0 / 57.1 | 26.9 / 33.0 | 37.8 / 44.5 | 17.2 / 22.2 |

- Like for like, the JSON form saves 1.3 to 2.4 ms per thousand rows, 30 to 54 %; 10 rows gain at most 0.2 ms. #941's "9.5 → 2.2 ms" set `insert()` with every column back against the JSON form with `RETURNING id`.
- Sent over the wire, 10 000 rows of 3 columns: about 576 KB for `VALUES` (its text and 30 000 parameters), 447 KB for the JSON text: the JSON form sends less, so latency does not erase its gain, which stays about 2 ms per thousand rows.

## 3. Options weighed

| Option | Why not |
|---|---|
| `insert()` picks JSON past some row count | SQL that changes with the values, and different rows past the count (principle 3; § 1) |
| A config key | a permanent opt-in (note 019 § 1) |
| A function of its own (`insertJson('films', rows)`) | see below |
| A function that keeps `DEFAULT` for a missing key | `DEFAULT` is refused in a `SELECT` list; it would need one `INSERT` per key set, SQL that changes with the values |
| **Ruled out; the `sql` form documented** | chosen |

A function of its own, weighed:

- **Not the same rows** as `insert()` given the same array (§ 1): it would need its own row type, `Insertable` without `SQLFragment`, `Parameter`, `Default`, `Buffer` nor `bigint`, for every table of the schema.
- **Silent corruption** otherwise: a `Buffer`, a fragment or `param()` stored as JSON text. So it would walk every cell at run time to refuse them; or convert them as `pg` does, which relies on `pg`'s serialisation (skill `simple-big-wins`: shaky).
- **The gain**: § 2; about 2 ms per thousand rows; the cap, its other gain, is met by chunks (`website/batches.md`) or by the `sql` form.
- **Minimal surface** (principle 4): a second way to insert, a synonym of `insert()` with other rules (skill `zero-abstraction` § Naming). The `sql` form costs nothing in the core, and its SQL says what it does.

## 4. Probes

Scripts in the PR's scratch folder, nothing committed: `probe.mjs` (§ 1), `time.mjs` (§ 2), `count.mjs` (the corpus). Each creates `pgcast_test_<pid>_941_*` and drops it at the end.

## 5. What follows

- `website/batches.md` § Split under the parameter limit, and its French page, gain one bullet: the `sql` form, its `NULL` for a missing key and its `JSON.stringify`.
- No sub-issue: no code.

# 015 — Recipes: the list, the format, the place and the schema

- **Status**: accepted (2026-11-22), by delegation from the owner. Each choice below is decided under the philosophy.
- **Scope**: step [#894](https://github.com/AlexandreDemartin/pgcast/issues/894) of Epic [#891](https://github.com/AlexandreDemartin/pgcast/issues/891), and the recipe batches that follow it.
- **In short**:
  - The site gets 19 recipes, in four batches. Each recipe answers one need with the API as it is today.
  - They sit in a *Recipes* group of their own, after *How-to guides*.
  - The film schema stays as it is.
  - Needs the site already answers get a link from the *Recipes* page, not a new page.
  - Four needs that pgcast lacks are listed as needs only, two of them with no documented way at all (§ 7).

## Context

- The Epic decided with the owner (2026-11-22) that the site gets a *Recipes* section, with one need per page. Each example runs in CI on the docs' film schema, opens in the playground, and shows the SQL it writes and its typed result. The list is chosen from real usage, with Zapatos's demo project as a checklist.
- The site already holds 15 how-to guides and a full reference. A recipe must not explain twice what a page already says, so each one names what the site covers and links to it.
- Diátaxis treats a recipe as a how-to guide: "written from the perspective of the user, not of the machinery". The market keeps such guides apart from its reference. Kysely has *Recipes* by use case, and Drizzle has task guides.

## Corpus

The corpus is real usage of Zapatos: about two thousand non-test files that import `zapatos/db`. It was read with regular expressions (skill `consumer-usage`), so each count below is an order of magnitude only. No project, extract or business name is cited, and every example is invented in the film world.

- **Scored on two axes**: how often a pattern appears, and whether a newcomer would guess the way to write it. A home-made helper, a cast or a guard repeated in many files counts as "not guessed".
- **Most of the home-made helpers now have a pgcast answer**:
  - list conditions: `eqAny()`, `likeAny()` and `ilikeAny()`;
  - array conditions typed on the column, from 7.0;
  - JSON conditions: `jsonbContains()` and `jsonbPathExists()`;
  - subqueries: `exists()` and `isInSelect()`;
  - full text: `websearchToTsquery()`;
  - CTEs: `withCTEs()`;
  - locks: `advisoryXactLock()`;
  - an empty `and()`, which is `TRUE`, where Zapatos 6.6.1 wrote `()`.

  The corpus still carries its own versions of these helpers, and a newcomer would not find them from the reference alone. That is the recipes' main job.
- **The most frequent workaround** filters or sorts on a lateral's result, about a hundred times. Note [007](./007-related.md) § 3 documented `"lateral_<key>".result`, and `lateral.md` shows it, so it gets a link, not a page.

## 1. Place in the outline

| Option | For | Against |
|---|---|---|
| **A. A *Recipes* group of its own**, after *How-to guides* | A guide covers a subject in several steps (*Pagination*, *Retries*). A recipe answers one need with one query, and a list of 19 such needs shows what pgcast can do at a glance. Kysely does this. | One more entry in the nav. |
| B. Inside *How-to guides* | One group for every how-to. | The group would go from 15 entries to 34, folded, mixing long guides with one-query pages. |
| C. Under *Reference*, as examples | Each one sits next to its API. | A recipe starts from the reader's need, not from an export: Diátaxis's how-to, not its reference. |

**Choice: A.**
- The outline (after [#893](https://github.com/AlexandreDemartin/pgcast/issues/893)) becomes Tutorial, Reference, How-to guides, Recipes, Explanation.
- The group is folded, like the guides, since a reader arrives from search or a link. Its nav label is *Recipes* (*Recettes* in French).
- Its landing page, `recipes.md`, lists the recipes, then § Answered elsewhere with links to the existing sections (§ 4).

## 2. Format

| Part | Rule |
|---|---|
| Title | The need, as a verb phrase of at most four words with no code: *Filter by optional fields*. It is also the outline entry's text. `website/README.md` § Conventions (one or two words, the concept's name) gets an exception for this group, as the Epic names recipes by need. |
| Lede | One or two sentences giving the need and the API it uses, with the function names, so that search finds them. |
| Example | One cast panel: a module `examples/<page>_<case>.ts` in the film world, run by `docs:examples` and opened by its *Open in playground* link. The panel shows the SQL Postgres runs and the type TypeScript gives (`website/README.md` § Examples). |
| Under the panel | Bullets: what the SQL does, with its probes; the typed result; the pitfall a newcomer would hit. Each option links to its reference entry, and nothing in the entry is repeated. |
| Variants | One `##` section per variant, each with its own panel if it sends a query. A recipe that takes several queries (a loop, a transaction) shows its one-query core in a panel, then the whole in `examples/plain/` (no playground link, README § Examples). |
| Zapatos 6.6.1 | One line, only where a switcher would write it differently: "With Zapatos 6.6.1, an empty `and()` wrote `()`, which Postgres refuses". |
| Template | `templates/how-to.md`, ending with § See also. |
| Not shown | Extensions (`unaccent`, `pg_trgm`). They are named in prose with a link to the Postgres docs, but have no example: the docs schema is plain Postgres, loaded as it is in the playground. |

## 3. Schema

The film schema already has every column the list needs, so it does not change.

| Need | Column |
|---|---|
| JSON | `films.details`, `jsonb`, with `format` and `prizes` |
| Text to search | `films.title`, `films.tagline` (nullable) |
| Full text | `films.title_search`, a generated `tsvector` with its GIN index |
| Arrays | `films.genres`, `text[]` |
| A tree | `crew.mentor_id`, three levels deep in the seed |
| Dates | `screenings.starts_at`, with fixed dates in March 2030 |
| A value set once | `screenings.subtitled`, `NULL` until the cinema says |
| A counter | `ratings.votes` |

- No change means the generated `zapatos/`, the examples that exist and the playground's seed all stay as they are.
- If a batch finds that a recipe needs a seeded row, a change to `schema.sql` gets its own sub-issue, filed before that batch. The batch does not carry it.

## 4. Answered elsewhere

These needs are frequent in the corpus or in the demo, and a page already answers them. `recipes.md` links each one, and no recipe repeats it.

| Need | Page and section |
|---|---|
| Filter, sort or group by a related row's value | `lateral.md` § Filter, sort and group by a lateral |
| Go through a join table, join a table to itself | `lateral.md` § Go through a join table, § Join a table to itself |
| Name the row of a reusable lateral | `lateral.md` § Name the row of a reusable lateral |
| Sort by distance | `lateral.md` § Order by a computed value |
| A page and its total | `paginate.md` § Count the total |
| The next page from the last row | `paginate.md` § Fetch the next page from the last row |
| Insert many rows, skip the ones already there | `batches.md` |
| Queue writes with a lock | `retries.md` § Queue the requests with a lock |
| Type a `jsonb` column | `custom-types.md` § A `jsonb` domain |
| A CTE before a shortcut | `raw-sql.md` § Put a CTE before a shortcut |
| Tell which constraint refused a write | `handle-errors.md` |
| Type a hand-written query | `typed-sql.md` |
| Read a large result in chunks | `cursors.md` |
| Run pgcast on a migration tool's client | `sql-template.md` § `QueryableLike` |

## 5. The list

The batches run in order, the most useful and least guessed first. "Seen" is the corpus's order of magnitude.

### Batch 1: filters ([#898](https://github.com/AlexandreDemartin/pgcast/issues/898))

| Page | Need | pgcast API | Links to | Site today | Seen |
|---|---|---|---|---|---|
| `optional-filters` | Filter by optional fields: build a filter from the fields a request gives. | `conditions.and(...parts)`, a list built with `if`s; an empty `and()` is `TRUE`; a key added only when its value is there, since `{ tagline: undefined }` is `= NULL` | `conditions.md` § `and()`, `sql-template.md` § Whereable objects, `security.md` § An empty filter | The reference entries, and the warning for writes; no task page | about 150 lists of conditions built at run time; a guard against an empty `and()` in about 80 files |
| `related-rows` | Filter on related rows: rows that have, or lack, a related row. | `exists()`, `not(exists())`, `isInSelect()`; `NOT IN` against a `NULL` | `conditions.md` § Subqueries, `sql-template.md` § `parent()` | The reference entries | over a hundred, home-made or raw `IN (SELECT …)` |
| `array-columns` | Filter on array columns: a film in a genre, in any of several, or in only these. | `arrayContains()`, `arrayOverlaps()`, `arrayContainedIn()`; a value in the array, `` sql`${param(v)} = ANY(${self})` ``; `eqAny()` for a list against a plain column | `conditions.md` § Arrays, § `eqAny()` | The reference entries | a few hundred, home-made helpers and raw `= ANY` |
| `text-search` | Search what users type: a substring of one or several columns. | `ilike()` with `%`, `_` and `\` escaped; `or()` over columns; `ilikeAny()` for several patterns; accents through `unaccent`, in prose only | `conditions.md` § `ilike()`, § `likeAny()` | One line on escaping, in `likeAny()` | about two hundred `ILIKE`s, almost none escaping the input |
| `update-in-place` | Update from the current value: a counter, a value set once, a JSON merge, an array item added. | `update()` with a `sql` fragment on `db.self`: `${self} + 1`, `coalesce(${self}, …)`, `${self} \|\| ${param(patch, 'jsonb')}`, `array_append(${self}, …)`; `conditions.add()` | `insert.md` § `update()`, `sql-template.md` § `self`, `conditions.md` § Arithmetic | The rule that `self` is the column; no task page | over a hundred set-once updates; dozens of JSON merges |

Batch 1 also adds the group to `outline.ts`, the landing page `recipes.md` with § Answered elsewhere, and the title exception to `website/README.md` § Conventions. It waits for #893, which also edits `outline.ts`.

### Batch 2: JSON, groups and search ([#899](https://github.com/AlexandreDemartin/pgcast/issues/899))

| Page | Need | pgcast API | Links to | Site today | Seen |
|---|---|---|---|---|---|
| `json-fields` | Query JSON fields: read a field into the result, sort by it, filter on it. | `extras` with `` sql<s.films.SQL, string \| null>`${'details'}->>'format'` ``; `order` on the same fragment; `jsonbContains()`, `jsonbPathExists()` with `vars` | `conditions.md` § jsonb, `select.md` § `extras`, `custom-types.md` § A `jsonb` domain | Filtering, in the reference's table; not reading or sorting | a few hundred `->>` and `#>>` |
| `count-per-group` | Count per group: a count per value, part of a count, a count per array item. | `select()` with `columns`, `extras` and `groupBy`; `count(*) FILTER (WHERE …)` in `extras`; facets over `unnest(genres)` in `sql`, its row typed | `select.md` § `groupBy` and `having`, § `count()` | `groupBy` and `count(DISTINCT)` in the reference; no `FILTER`, no facets | over a hundred grouped selects; about a hundred facet counts |
| `rank-results` | Rank search results: the best matches first, with the match highlighted. | `websearchToTsquery()` on `title_search`; `order` by `ts_rank()` and `extras` with `ts_headline()`, in `sql`; a weighted vector over `title` and `tagline` as a variant | `conditions.md` § Full-text search | The condition alone | a few, on a stored vector |
| `prefix-search` | Search as users type: match the start of each word typed so far. | `` sql`${self} @@ to_tsquery('english', ${param(q)})` `` with `q` built from the cleaned words, each with `:*`, as one parameter; `ilike()` on a prefix as a variant | `conditions.md` § Full-text search, § `ilike()` | Nothing | about a hundred on-the-fly searches, through home-made helpers |
| `join-without-key` | Join without a foreign key: on an array, a JSON key, a computed value. | `lateral` with `parent()`: `eqAny(db.parent('genres'))`, `` sql`${self} && ${parent('genres')}` ``, a JSON key equal to the parent's column | `lateral.md` § Order by a computed value, `sql-template.md` § `parent()`, `raw-sql.md` § Reach the outer row | Distance, and `eqAny(parent())` in the reference | about a hundred |

### Batch 3: sorting, latest rows and writes ([#900](https://github.com/AlexandreDemartin/pgcast/issues/900))

| Page | Need | pgcast API | Links to | Site today | Seen |
|---|---|---|---|---|---|
| `user-sort` | Sort by a user's choice: a column and a direction from the request, safely. | A map from allowed keys to `OrderSpecForTable<'films'>`; `nulls`; `id` last as a tie-breaker | `select.md` § `order`, § `OrderSpecForTable`, `security.md` § A caller's string as a name, `paginate.md` | The option; the tie-breaker in pagination | dozens, with order types written by hand |
| `latest-row` | Get the latest row: each film's next screening, or the latest per cinema. | `selectOne()` in a `lateral` with `order`; `distinct: 'cinema_id'` with an `order` that starts on it | `lateral.md`, `select.md` § `distinct` | `DISTINCT ON` in the reference | dozens |
| `insert-or-update` | Insert or update: save a row that may exist, and know which happened. | `upsert()` and `$action`; `updateColumns` to keep a column; `doNothing`, which returns no row for one already there, then a select | `insert.md` § `upsert()`, § `UpsertAction`, `batches.md` § Skip the rows already there | The options, each in the reference | over a hundred upserts |
| `count-across-joins` | Count across joins: a studio's roles, through its films. | `count()` in a `lateral`, filtered by `isInSelect()` or `exists()` on the outer row | `conditions.md` § Subqueries, `select.md` § `lateral`, note [006](./006-subquery-conditions.md) | A count one join away | dozens of counts and sums in laterals |
| `date-filters` | Filter by date: a day, a period, a day in a time zone. | `and(gte(start), lt(end))` on one column; `between()` and why a day is half-open; `AT TIME ZONE` in `sql`; explicit dates, never `now()` | `conditions.md` § Dates and times, § Ranges, `runtime-config.md` § Dates and times | The conditions, one by one | about a hundred date windows |

### Batch 4: raw SQL and jobs ([#901](https://github.com/AlexandreDemartin/pgcast/issues/901))

| Page | Need | pgcast API | Links to | Site today | Seen |
|---|---|---|---|---|---|
| `walk-a-tree` | Walk a tree: each crew member's mentors, up the chain. | `WITH RECURSIVE` in `sql`, its row typed; the `CYCLE` clause against a loop | `raw-sql.md` § Put a CTE before a shortcut, `typed-sql.md` | One line: `withCTEs()` writes no `RECURSIVE` | rare |
| `combine-tables` | Combine two tables: actors and crew in one list, sorted and paged. | `UNION ALL` in `sql`, its row typed by hand or by `@pgcast/typegen` | `raw-sql.md`, `typed-sql.md`, `paginate.md` | Nothing | about a dozen |
| `delete-in-batches` | Delete in batches: remove many rows without one long lock. | `deletes()` with `` sql`${self} IN (SELECT … ORDER BY … LIMIT ${param(n)})` ``, as Postgres has no `DELETE … LIMIT`; a loop in `examples/plain/`, one transaction per batch | `insert.md` § `deletes()`, `batches.md`, `transaction.md` | Nothing | a handful |
| `one-worker` | Run on one worker: skip a job another worker is already running. | `pg_try_advisory_xact_lock()` in `sql`, inside `transaction()`; `advisoryXactLock()` when waiting is fine | `transaction.md` § `advisoryXactLock()`, `retries.md` § Queue the requests with a lock | The lock that waits | a handful |

## 6. Zapatos's demo project, as a checklist

The demo is [zapatos-demo](https://github.com/jawj/zapatos-demo)'s `demo.ts`. It was read, and none of it was copied.

| Demo section | Here |
|---|---|
| Manual `SELECT` and `INSERT`, a fragment in a Whereable | `sql-template.md`, `raw-sql.md` |
| One-to-many and multi-level joins, raw or through shortcuts; many-to-many; self-joins with `alias` | `lateral.md` (§ 4) |
| Joins beyond foreign keys (nearest stores) | `lateral.md` § Order by a computed value, recipe `join-without-key` |
| Joins with nothing returned | `select.md` § `lateral` |
| Update with a fragment in an Updatable | recipe `update-in-place` |
| Upsert, `updateValues` | recipe `insert-or-update` |
| Aggregates, `GROUP BY` and `HAVING` | recipe `count-per-group` |
| `DISTINCT` | recipe `latest-row` |
| Joins with counts and sums | recipe `count-across-joins` |
| Order by a lateral's result | `lateral.md` § Filter, sort and group by a lateral |
| `undefined` in a filter, `or` | recipe `optional-filters` |
| Dates | recipe `date-filters`, `runtime-config.md` § Dates and times |
| Transactions, composed or on a client | `transaction.md`, `retries.md` |
| `IN` with `vals()`, `RETURNING`, `WITH TIES`, `LIMIT` and `OFFSET`, prepared statements, extras as aliases, JSON result types | the reference (`sql-template.md`, `insert.md`, `select.md`, `catalog-types.md`) |
| `FOR UPDATE` and other locking clauses | left out: `select.md` § `lock` covers it, and the corpus has no row lock at all, relying on serializable transactions and advisory locks |
| Geometry and casts | `custom-types.md` |
| Triggers and generated columns, several schemas, odd column names, numbered issue checks | left out: these are tests of edge cases, not a reader's task |

## 7. Needs pgcast lacks

These are written as needs only, never designed (skill `zero-abstraction`). The orchestrator files them as chapter-10 candidates where the last column says so.

| Need | Documented way today | Weighed |
|---|---|---|
| A `RECURSIVE` or `MATERIALIZED` `WITH` before a shortcut, keeping the shortcut's typed result | None. The whole query goes in `sql`, its row typed by hand or by `@pgcast/typegen` | Note [010](./010-aliases-and-with.md) kept both keywords out, as the corpus writes each one once. A candidate only with new evidence. |
| A CTE's columns checked by type in the query that reads it | None. Its names are written in the literal and are not checked | Note 010 § 4 sets this aside for later. `@pgcast/typegen` types the result, but not the names. A candidate. |
| Try an advisory lock and go on if it is taken | `pg_try_advisory_xact_lock()` in `sql` (recipe `one-worker`). `advisoryXactLock()` only waits | This is the try twin of an existing helper, and the corpus has a handful. Recipe first; a candidate if it recurs. |
| React to a `NOTIFY` | Sending works with `pg_notify()` in `sql`. Listening needs `pg`'s own `client.on('notification')` on a client of its own | Holding a long-lived connection is the driver's job, and pgcast does not manage connections (`AGENTS.md` § What pgcast does not do). Not a candidate. |

The following were weighed and stay as they are:
- **A lateral's result referenced with its key checked.** Note 007 § 3 (R0) set this, and it is documented.
- **A substring match with no wildcard to escape.** Escaping is documented. Postgres has no such operator, so a helper would name nothing that Postgres has (skill `zero-abstraction` § Naming). The `text-search` recipe puts the escaping first, since the corpus forgets it almost everywhere.

Recipe `optional-filters` also checks which element type holds the conditions of several tables with no `any`. If none does, that need is added here.

## 8. Gaps in pages that exist

- `paginate.md` shows a keyset cursor on an integer key only. The corpus reads a `timestamptz` cursor as text, which keeps the microseconds that a JavaScript `Date` drops. This belongs in `paginate.md` rather than in a recipe, and is left for the orchestrator to file.

## Consequences

- There are four sub-issues of #891, one per batch, in order: [#898](https://github.com/AlexandreDemartin/pgcast/issues/898) to [#901](https://github.com/AlexandreDemartin/pgcast/issues/901). Each one is in EN and FR, with a distinct French proofreader and `docs:translated`, at Risk `low`. Epic step 5, the split of the reference, waits for the last batch.
- A recipe links to reference anchors. A reference split moves them behind the redirect of Epic step 5.
- Each count above is an order of magnitude from regular expressions. A later note that cites one recounts it first (skill `consumer-usage` § Rules).

## Sources

- Diátaxis, [How-to guides](https://diataxis.fr/how-to-guides/); [Kysely recipes](https://kysely.dev/docs/category/recipes); [Drizzle guides](https://orm.drizzle.team/docs/guides).
- Zapatos's demo, [jawj/zapatos-demo](https://github.com/jawj/zapatos-demo), `demo.ts`.
- Postgres: [`WITH` queries](https://www.postgresql.org/docs/current/queries-with.html), [text search controls](https://www.postgresql.org/docs/current/textsearch-controls.html), [advisory lock functions](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS), [`LIKE`](https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE).

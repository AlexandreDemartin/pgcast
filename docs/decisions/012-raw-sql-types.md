# 012 — Raw SQL types: how a hand-written `sql` query gets its types from Postgres

- **Status**: accepted 2026-11-18. Revised 2026-11-20 under the owner's delegation after [#798](https://github.com/AlexandreDemartin/pgcast/issues/798).
- **Scope**: feature [#62](https://github.com/AlexandreDemartin/pgcast/issues/62), its step [#710](https://github.com/AlexandreDemartin/pgcast/issues/710) (this note) and its planned PRs; the chapter's epic [#21](https://github.com/AlexandreDemartin/pgcast/issues/21).
- **In short**: the first release of `@pgcast/typegen` is results-only. `Row<'name'>` opts a hand-written `sql` query into a committed row type that `--check` verifies. The separate tool describes static SQL and supported `param()` and literal identifier interpolations over `pg`, without executing the query. Every field follows the default `pg` text parser for its RowDescription type OID. Choice 2 governs column nullability. Parameter checking and composed conditions are deferred.

## Context

What the code gives today:

- **A row type written by hand.** `sql<Interpolations, RunResult>`: "The second type variable, `RunResult` … describes what will be returned if we call `run()`"; its default is `any[]` ([Zapatos's docs](https://jawj.github.io/zapatos/) § sql template strings). Zapatos's own pitch: "write arbitrary SQL using tagged templates, and manually apply the right types to what goes in and what comes back". Note [010](./010-aliases-and-with.md) documents that type argument as the way.
- **Composition at run time.** A `Whereable`, `and()`, `db.cols()` or a `param()` is compiled into the text when the query runs: one call site has many texts. A fragment's text is sent as written, so it can reach past the condition it stands in: `` sql`true GROUP BY ROLLUP (owner_id)` `` after `WHERE` changes the rows' shape (§ Replays).
- **What the generator has.** A `pg` connection (`db` in the config), `pg_catalog` reads, `tsTypeForPgType()` (exported by `zapatos/generate`), and `--check`. `typescript` and `pg` are peers already.
- **TypeScript cannot see the text.** A tagged template's strings are typed `TemplateStringsArray`, never a literal tuple (probed on 5.9.3: TS2322 against `readonly ['SELECT …', '']`), so no type-level parser can read `` sql`…` `` as written. Types must be found outside the compiler.
- **The market's pain**, from the sources below: wrong nullability on outer joins (pgTyped#201, SQLx#367, 23 👍), on `COALESCE` and `UNION` (Prisma#25168, #25268); a live database at build time (Prisma#25124, 104 👍); dynamic queries refused (pgTyped#170, sqlc#3414, 51 👍).

## Corpus

Two projects of real usage (skill `consumer-usage`; no project named; counted with TypeScript's parser over each project's `.ts` files, then a keyword scan of each template's static text, with literals and comments stripped):

| What | Count |
|---|---|
| `sql` tagged templates | 3,480 |
| … whose text starts with `SELECT` or `WITH` | 143 |
| … with a type argument | 101 |
| … with a row type (a second type argument) | **58** |
| … of those, fully static text | 20 |
| … with interpolations, each a `param()` or a string literal | 7 |
| … with interpolations, each one of those or a fragment after `WHERE`, `AND`, `OR`, `ON` or `HAVING` | 13 more (16 fragments: 6 variables, 7 calls of the project's own helpers, 1 ternary, and 2 `Whereable` literals, each with something opaque inside) |
| … with a fragment in the select list (`db.cols()`, a computed column) | 8 |
| … with an outer join | 6 |
| … with `UNION`, `INTERSECT` or `EXCEPT` | 3 |
| … with `ROLLUP`, `CUBE` or `GROUPING SETS` | 1 |
| … holding one of choice 2's guard words, matched as it says | 6 (the outer joins) |
| … with a `param()`, each cast-less | 12 (41 calls; one template holds 22) |

So 27 of the 58 hand-written row types are within reach of option A as decided below: the 20 static ones and the 7 whose interpolations are `param()` and string literals only, each `sql` and `param` bound to its import as choice 3 requires. The 13 whose fragments sit in a condition stay manual, as do the rest; compiling a condition written in place would reach none of them (§ Deferred). The keyword scan is approximate (a fragment's position is read from the static text before it).

## Interfaces

Two documented Postgres interfaces describe a query without running it. Both were replayed (§ Replays):

| | `PREPARE` + `pg_prepared_statements` | Parse / Describe (extended protocol) |
|---|---|---|
| **What Postgres gives** | `parameter_types` and `result_types`, `regtype[]` ([docs](https://www.postgresql.org/docs/current/view-pg-prepared-statements.html)); `result_types` from Postgres 16 ([16.0 release notes](https://www.postgresql.org/docs/release/16.0/)), `NULL` for a statement without result | ParameterDescription (type OIDs) and RowDescription: per field, its type OID and, "if the field can be identified as a column of a specific table", that table's OID and the column's attribute number, "otherwise zero" ([protocol docs](https://www.postgresql.org/docs/current/protocol-message-formats.html)) |
| **Column origin** | none: nullability cannot be proven, so every column is nullable | yes, for a bare column, through CTEs, subqueries and laterals; zero for an expression, an aggregate and a set operation |
| **Domains** | the domain's name (`email`) | the base type (`ext.citext`); the domain is read from the origin column's `atttypid` |
| **Over `pg`** | two plain queries | `pg` has no public Describe; its documented Submittable ("If you pass an object to `client.query` and the object has a `.submit` function on it, the client will pass it's PostgreSQL server connection to the object", [node-postgres](https://node-postgres.com/apis/client), "how pg-cursor and pg-query-stream work") sends `parse`, `describe` and `sync` on that connection, as pg-cursor does; ParameterDescription is read from the connection's `parameterDescription` event. `pg` clears its active query on an ErrorResponse, so a failed Describe never gets `handleReadyForQuery`: the describer settles in `handleError` too, once, and removes its listeners (replayed: 67 Describes, 4 settled by `handleError`, no timeout fired). Auth, TLS and the pool stay `pg`'s. The prototype ran on `pg` 8.23.1 |
| **Safety** | the user's text is concatenated into a statement: over the simple protocol, `PREPARE p AS SELECT 1; CREATE TABLE probe_710 ()` **created the table** (replayed) | one statement or refused: "cannot insert multiple commands into a prepared statement"; `CREATE TABLE`, `DO`, `EXPLAIN ANALYZE INSERT` and `pg_sleep(3)` are only described (nothing created, no row, under 2 ms). Parse takes the statement's locks: behind an `ACCESS EXCLUSIVE` lock, a Describe of an `INSERT` waits, and under `lock_timeout = '1s'` it failed after 1,075 ms. So the tool sets `lock_timeout` and describes inside `BEGIN READ ONLY` … `ROLLBACK`, a second guard should an Execute ever be sent |

The other routes are refused by the issue's constraints, and this note keeps that: `EXPLAIN (VERBOSE, FORMAT JSON)` (SQLx's), whose format moves and which a comment on SQLx#367 still reports wrong on hash and merge joins; `pg_rewrite.ev_action` or a temporary view's `information_schema.view_column_usage` (`@pgkit/typegen`'s), which creates an object; running the query under `LIMIT 0`, which executes; the `pg_describe` extension, which needs Postgres 17 and an extension install; `pg-protocol` alone, which would mean writing the startup and SCRAM auth again, as pgTyped does.

## Replays

On the fixture database (`test/fixtures/schema.sql` and its rows, Postgres 17.3, `pg` 8.23.1, a probe database created and dropped `WITH (FORCE)` by one process), each text described by both interfaces: `PREPARE` in a rolled-back transaction, Describe inside `BEGIN READ ONLY` with `lock_timeout`. Then each is run, rolled back, to see its `NULL`s. `param()` is compiled by master's `sql`, as are the conditions of § Deferred. "Origin" is Describe's table and column, with that column's `attnotnull`; "truth" is whether a value can be `NULL`, from the query's form and its columns' `NOT NULL` (foreign keys not read), and no run contradicted it; "rule" is choice 2's verdict.

| Case | Text (abridged) | `PREPARE` result types | Describe: type, origin | Truth | Rule |
|---|---|---|---|---|---|
| Inner join | `SELECT u.id, u.manager_id, a.balance FROM users u JOIN accounts a ON …` | `integer`, `integer`, `numeric` | each from its column: `users.id` not null, `users.manager_id` null, `accounts.balance` not null | as the origins | exact |
| Left join | `SELECT u.id, a.id AS account_id, a.balance FROM users u LEFT JOIN accounts a …` | `integer`, `bigint`, `numeric` | `accounts.id`, `accounts.balance` **not null** at their origin | `account_id`, `balance` nullable | all nullable (`LEFT`): sound, `id` loose |
| Right join | `SELECT u.display_name, a.balance FROM users u RIGHT JOIN accounts a …` | `text`, `numeric` | both not null at their origin | `display_name` nullable | all nullable: `balance` loose |
| Full join | same, `FULL JOIN` | `text`, `numeric` | both not null at their origin | both nullable | exact |
| `COALESCE` | `SELECT COALESCE(a.ratio, 0) AS ratio, COALESCE(a.ratio, NULL) AS still_null …` | `double precision` ×2 | origin 0 | `ratio` not null | nullable: `ratio` loose |
| Aggregates, empty set | `SELECT count(*) AS n, max(balance) AS top, sum(balance) AS total FROM accounts WHERE false` | `bigint`, `numeric`, `numeric` | origin 0 | run: `n` `'0'`, `top` and `total` `NULL` | nullable: `n` loose |
| `UNION` | `SELECT id, display_name AS label FROM users UNION SELECT id, body FROM extra.articles` | `integer`, `text` | origin 0 | both not null | nullable: loose |
| CTE | `WITH rich AS (SELECT owner_id, balance FROM accounts) SELECT owner_id, balance FROM rich` | `integer`, `numeric` | through the CTE: `accounts.owner_id`, `accounts.balance`, not null | not null | exact |
| `json_agg` | `SELECT u.id, (SELECT json_agg(a.*) FROM accounts a WHERE …) AS accounts FROM users u` | `integer`, `json` | `accounts`: `json`, origin 0 | `NULL` for a user with no account | `db.JSONValue \| null`: exact, the shape inside untyped |
| Lateral, left | `… LEFT JOIN LATERAL (SELECT to_jsonb(a.*) AS result …) l ON true` | `integer`, `jsonb` | `id` from `users.id`, not null; `result` origin 0 | `result` nullable | all nullable (`LEFT`): `id` loose |
| Lateral, cross | `… CROSS JOIN LATERAL (SELECT a.balance FROM accounts a …) l` | `integer`, `numeric` | through the lateral: `accounts.balance`, not null | not null | exact |
| A view | `SELECT email, mood FROM active_users` | `email`, `mood` | `active_users.email`, a view column, `attnotnull` false; type `ext.citext` | `email` not null | nullable: loose |
| `GROUP BY ROLLUP` | `SELECT owner_id, sum(balance) AS total FROM accounts GROUP BY ROLLUP (owner_id)` | `integer`, `numeric` | `accounts.owner_id` **not null** at its origin | `owner_id` `NULL` on the total row | nullable (`ROLLUP`): exact |
| Inheritance | `SELECT x FROM par`, its child `chi` after `ALTER TABLE chi ALTER x DROP NOT NULL`, and `FROM chi` itself; `SELECT x FROM par2` after `ALTER TABLE ONLY par2 ALTER x SET NOT NULL` over a child's `NULL` | `integer` | `par.x`, `par2.x`, **not null** at their origin; `chi.x` null | `NULL` from the child | not proved (a child's `x` is not `attnotnull`): exact |
| Foreign table | `SELECT id, label FROM ft_nn` (file_fdw, `id int NOT NULL, label text NOT NULL`, a CSV line `1,`) | `integer`, `text` | `ft_nn.id`, `ft_nn.label`, **not null**, `relkind` `f` | `label` `NULL`: Postgres does not enforce `NOT NULL` on a foreign table | not proved (`f`): exact |
| Foreign partition | `SELECT id, label FROM pt`, a foreign partition below; `pt2`, one two levels down | `integer`, `text` | `pt.label`, `pt2.label`, **not null**, `relkind` `p` | `label` `NULL` | not proved (a partition is `f`): exact |
| Partitioned, plain partitions | `SELECT id, occurred_on, kind, payload FROM events` (three `r` partitions) | `bigint`, `date`, `text`, `jsonb` | `events.*`, `relkind` `p` | as the origins | proved: exact |
| `MERGE … RETURNING` | `MERGE INTO tgt t USING src s ON … WHEN MATCHED THEN UPDATE … WHEN NOT MATCHED BY SOURCE THEN DELETE RETURNING t.label AS kept, s.id, s.label` | `text`, `integer`, `text` | `tgt.label`, `src.id`, `src.label`, **not null** | `s.id`, `s.label` `NULL` on the `DELETE` row | all nullable (`MERGE`): `kept` loose |
| A keyword the old lexer skipped | `SELECT a.balance, E'\'' AS q FROM users u LEFT JOIN accounts a …`; `SELECT a.balance AS b$x$ … LEFT JOIN … WHERE 'b$x$' <> ''` | `numeric`, `text`; `numeric` | `accounts.balance`, not null | `balance` `NULL` | nullable (`LEFT`, nothing skipped): `q` loose |
| A keyword in lower case | `select id, balance from users u full join accounts a using (id)`; `… group by grouping sets ((owner_id), ())` | `bigint`, `numeric`; `integer`, `numeric` | `balance`, `owner_id` not null at their origin | `balance`, `owner_id` `NULL` | nullable (`full`, `grouping`): `id` loose |
| A keyword in a literal | `SELECT u.id, u.display_name FROM users u WHERE u.display_name <> 'left'` | `integer`, `text` | both not null | not null | nullable (`left`): both loose |
| A fragment past its condition | `` sql`SELECT owner_id FROM accounts WHERE ${sql`true GROUP BY ROLLUP (owner_id)`}` ``; the same with `` sql`true UNION ALL SELECT NULL::int` `` and `raw('true UNION ALL SELECT NULL')` | `integer` | as `WHERE $1`: `$1` `boolean`, `owner_id` from `accounts.owner_id`, not null | the run sends the fragment's own text: `owner_id` `NULL` | **refused** (neither a `param()` nor a string literal); a boolean `$1` would be wrong |
| A fragment in the select list | `` sql`SELECT ${db.cols(['id', 'email'])} FROM users` `` and `db.cols(['display_name'])` | `integer, email`; `text` | two columns, then one | the shape changes with the value | **refused**: left manual |
| Parameters | `WHERE id = $1 AND display_name LIKE $2 AND created_at > $3` | `integer`, `text`, `timestamp with time zone` | the same OIDs | — | read, not written (§ 3) |
| … untyped, cast | `SELECT $1 AS x`; `SELECT $1::int8[] AS ids` | `text`; `bigint[]` | the same | — | the same |
| `param(x, 'int4')` | `` sql`SELECT ${param(5, 'int4')} AS n` `` → `SELECT CAST($1 AS "int4") AS n`, under each setting; `param(undefined, 'int4')` compiles to the same text; `'int4[]'` → `CAST($1 AS "int4"[])` | — | `integer`; `integer[]`, origin 0 | — | neutralised as compiled |
| `param(x)`, `param(x, true)` | `param([1, 2])` → `$1` by default, `CAST($1 AS "json")` under `castArrayParamsToJson`; `param({ a: 1 })` the same under `castObjectParamsToJson`; `param(x, true)` → `CAST($1 AS "json")` for an array or a plain object, `$1` for `'x'`; `param(x, false)` → `$1` always | — | `SELECT $1 AS n`: `text`; `SELECT CAST($1 AS "json") AS n`: `json`; `u.id = CAST($1 AS "json")` and `settings \|\| CAST($1 AS "json")`: refused by Parse | — | both forms described: `text` against `json` **refused**; a form Parse refuses is dropped |
| A cast that is not a literal | `` const t = 'int4' `` then `'text'`: `param(5, t)` → `CAST($1 AS "int4")`, then `CAST($1 AS "text")` | — | — | the text changes with the value | **refused** |
| `INSERT … RETURNING` | `INSERT INTO extra.spools (label) VALUES ($1) RETURNING id, length` | `integer`, `integer` | `spools.id` not null, `spools.length` null | as the origins | exact |
| No result | `UPDATE extra.spools SET label = $1 WHERE id = $2` | `NULL` | NoData | — | no row type |
| Two statements | `SELECT 1; CREATE TABLE probe_710 ()` | `PREPARE` ran the `CREATE TABLE` | refused, nothing run | — | refused |

What the replays show, over the table's 30 texts with a typed result and their 59 columns:

- Describe's origin alone, the rule pgTyped and sqlc's database analyser apply, is **wrong** on 20 columns of 14 texts: a column `NOT NULL` at its origin comes back `NULL` (outer joins, `ROLLUP`, inheritance, foreign tables and partitions, `MERGE`).
- This note's first reading (`attnotnull`, the six join and grouping words matched case-sensitively) was still wrong on 12 columns of 8 texts: inheritance, the foreign cases, `MERGE`, the two lower-case texts. A lexer that skips literals also misses the two texts of the row "A keyword the old lexer skipped".
- With choice 2 as it stands, no column is wrong. 13 are loose, in 11 texts: nullable where the value never is, each narrowed by an override (choice 4).
- `PREPARE` alone gives no origin, so every column is nullable.

Also replayed, outside the table: a scalar subquery, inner `USING` and `NATURAL` joins, an inner lateral, `CASE`, `UPDATE … FROM … RETURNING` and `MERGE … INSERT … RETURNING`. None is wrong; the last has its 3 columns loose.

### Driver value types (replayed 2026-11-20)

These runs used Postgres 17.3 and `pg` 8.23.1. They are separate from the 59-column nullability sample.

| Field or query | RowDescription and decoded value |
|---|---|
| `SELECT ARRAY['G','PG']::rating[]` for `CREATE TYPE rating AS ENUM ('G', 'PG')` | Origin 0/0, unregistered enum-array OID, string `"{G,PG}"`. In the `Selectable` context, `tsTypeForPgType('_rating', { rating: ['G', 'PG'] }, 'Selectable', {})` gives `rating[]`. Passing `true` as its fifth argument (`inlineEnums`) gives `('G' \| 'PG')[]`. A bare column of scalar type `rating` returned the strings `'G'` and `'PG'`. |
| `int4[] NOT NULL` and `SELECT ARRAY[[1,NULL],[2,3]]::int4[]` | OID 1007 for both. `SELECT ARRAY[1,NULL]::int4[]` also returned `[1, null]` with origin 0/0. The same column held `[1, null]` and then `[[1, null], [2, 3]]`. Both `selectExactlyOne` and raw `sql` returned the flat value. Reading the matrix with `scores.forEach(x => x?.toFixed())` threw a `TypeError`. |
| `numeric[]` and a domain `AS numeric[]` | Both bare columns reported OID 1231 and returned `[1.25, null]` and `[2.5, null]` respectively. A computed value of the domain also reported 1231. |
| `timestamptz` | OID 1184. A finite timestamp decoded to a `Date`. Stored `'infinity'` and `'-infinity'` decoded to the numbers `Infinity` and `-Infinity`. |
| `pg_catalog.pg_class.relname` for `'films'::regclass` and `id` from a schema omitted by the generator | The catalogue field had origin 1259/2 and returned `'films'`. The other field had a column origin and returned `1` (OID 23). Neither relation has a namespace in the public-only schema. |
| `SELECT 1::int8` | The same raw query returned `'1'` with the default parser and `1n` after `client.setTypeParser(20, BigInt)`. |

## 1. Whether to build it, and where

**Status**: Revised 2026-11-20, by delegation.

| | A. A tool beside the codegen | B. A SafeQL plugin | C. No inference, as today |
|---|---|---|---|
| **What it is** | `@pgcast/typegen`: finds opted-in `sql` templates, neutralises each `param()`, describes each query, writes a committed `.ts` keyed by name | a package for SafeQL, an ESLint plugin ("It's a plugin, not an SQL library"): it checks the row type you write and suggests a fix | the row type written by hand, `sql`'s type argument (note 010) |
| **The core** | the CLI imports the public compiler from its core peer during generation and offline checking (below) | unchanged | unchanged |
| **Dependencies for the user** | `pg`, `@pgcast/pgcast` and a `typescript` with the JavaScript parser API for the scan (choice 3) | SafeQL, ESLint, `postgres` (postgres.js, its connection) and `libpg-query` (1.8 MB unpacked, `npm view`) | none |
| **Database** | at generation only, the generator's; compiling needs none (committed file) | at every lint run, or a "shadow database" built from migrations; no offline mode | none |
| **Composed queries** | a `param()` or a string literal is compiled into the text as `core.ts` compiles it; any other interpolation refuses the query | "Conditional fragment selection" ❌ in its own postgres.js matrix; `onExpression` may inline a string or skip the query | typed by hand, unchecked |
| **Nullability** | Describe's origin and a guard (choice 2) | its AST walk over libpg-query, `attnotnull` as fallback | as written |
| **API stability** | pgcast's own | its plugin API is marked "EXPERIMENTAL" | — |
| **Cost** | a package: a TypeScript-parser scan, a guard-word match, a Submittable, a writer, `--check`; maintained with the core's quality (note 013) | a package bound to an experimental API of another project, and its lint-time database | nothing; the 58 row types stay unchecked |

**Choice: A**, in its own package.

- **Security first.** A never executes a query: Parse / Describe refuses a second statement, where `PREPARE` over the simple protocol ran it (§ Replays). B's checks run through postgres.js, not `pg`.
- **Compat with Zapatos 6.6.1.** A adds nothing to the core: a query you do not opt in is today's, and an opted-in one is still `sql<…, RunResult>` with a type argument, as 6.6.1 takes it.
- **The principles.** The database is the source of truth (principle 1); the `sql` text is unchanged and sent as written (principle 3); a separate package, opt-in (principle 4); the tool is a CLI that reads the database and writes a file (principle 5).
- **Core peer.** Decision 013 gives adapters structural types and permits an explicit core peer for types or config. This tool also needs that peer's public runtime exports during generation and `--check`. With `@pgcast/pgcast/db` 7.1.0, compiling a literal identifier and `param(undefined, 'int4')` gave `SELECT CAST($1 AS "int4") FROM "films"`. The preview requires `@pgcast/pgcast` `>=7.1.0 <8` and uses the application's installed peer so both compile the same SQL. Importing the generated row types requires no compiler at run time. [Decision 013](./013-package-model.md#the-model)
- **Editing loop.** SafeQL's ESLint rule runs in the editor and in CI. Its autofix writes an inline type annotation that can be committed. After the four preview PRs, `--watch` will regenerate pgcast's separate file of named rows on source edits, so offline `--check` can compare the source with that committed file. [SafeQL autofix](https://safeql.dev/guide/configuration.html#example-1-single-database-connected-to-your-app)
- **Why not C.** It is the baseline A keeps: every query not opted in, every refused one.

## 2. Nullability

**Status**: accepted (2026-11-18), by delegation.

A result column is `NOT NULL` only when both hold; otherwise `T | null`:

- **The origin proves it.** Describe gives the column an origin, and that relation and every relation below it in `pg_inherits` is a table (`relkind` `r`) or a partitioned table (`p`) whose column of the same name is `attnotnull`. A view, a materialised view or a foreign table never proves. Replayed: proved for a plain table (`users`) and for `events`, whose partitions are all `r`; not proved under a foreign partition, even two levels down, or below an inheritance parent:

  ```sql
  WITH RECURSIVE tree (relid) AS (
    SELECT $1::oid                                -- the origin's table OID
    UNION
    SELECT i.inhrelid FROM pg_inherits i JOIN tree t ON i.inhparent = t.relid
  )
  SELECT bool_and(c.relkind IN ('r', 'p') AND coalesce(a.attnotnull, false)) AS proved
  FROM tree t
  JOIN pg_class c ON c.oid = t.relid
  LEFT JOIN pg_attribute a ON a.attrelid = t.relid AND NOT a.attisdropped
    AND a.attname = (SELECT attname FROM pg_attribute WHERE attrelid = $1 AND attnum = $2)  -- $2: its attribute number
  ```

  On Postgres 14 to 17, `attnotnull` alone proves nothing below a parent: a child can `DROP NOT NULL`, `ALTER TABLE ONLY parent … SET NOT NULL` leaves a child's `NULL` in place, and Postgres does not enforce `NOT NULL` on a foreign table or partition (§ Replays).
- **No guard word.** The query's text after neutralisation (choice 3) holds none of `LEFT`, `RIGHT`, `FULL`, `ROLLUP`, `CUBE`, `GROUPING`, `MERGE`, `OLD`, `NEW`. The match ignores case and skips nothing: literals, quoted identifiers and comments are read too. A word is cut where a Postgres identifier could not go on, `/(?<![a-z_])(left|right|full|rollup|cube|grouping|merge|old|new)(?![a-z0-9_$])/i`. A digit may come before it, since Postgres 14 reads `1LEFT` as `1` then `LEFT` ("Previously, query text like `123abc` would be interpreted as `123` followed by a separate token `abc`", [15.0 release notes](https://www.postgresql.org/docs/release/15.0/); 17.3 refuses it, "trailing junk after numeric literal").
  - `MERGE`: `WHEN NOT MATCHED BY SOURCE … RETURNING` null-extends the source with no join word (§ Replays).
  - `OLD` and `NEW`: Postgres 18's `RETURNING old.*` and `new.*`, where "typically old values will be `NULL` for an `INSERT`, and new values will be `NULL` for a `DELETE`" ([docs](https://www.postgresql.org/docs/18/dml-returning.html)); `RETURNING WITH (OLD AS o)` still holds the word. Not replayed here (17.3): the first PR replays them in CI's matrix, on Postgres 18.

The guard only removes proofs, never adds one: a word in a literal or a comment (`'left'`) only loosens a column (§ Replays). No guessed type (principle 1). What a parser would buy: libpg-query, as an optional peer, could tell an outer join's preserved side, which recovers 3 columns of the replays (`id` under `LEFT JOIN` and under `LEFT JOIN LATERAL`, `balance` under `RIGHT JOIN`) and touches the 6 of the corpus's 58 queries that hold a guard word. Not worth a 1.8 MB optional peer and its own reading of the tree; it can come back as a revision of this note.

## 3. Naming, finding, writing, checking

**Status**: Revised 2026-11-20, by delegation.

| Point | Design |
|---|---|
| **Opt-in and name** | the row type names the query: `` sql<s.films.SQL, Row<'films-by-studio'>[]>`…` ``, `Row` imported from the generated file; nothing in the SQL text (a marker in an alias, pgTyped's and SQLx's `AS "title!"`, would change the key `pg` returns) |
| **Finding** | TypeScript's parser (`ts.createSourceFile`, no checker), over the files of the user's `tsconfig.json`: a tagged template whose tag is `sql` or a property `sql` (`` db.sql<…>`…` ``, a namespace import, as Zapatos's docs write it), and whose type argument holds `Row<'…'>` from the generated file anywhere (`Row<'…'>[]`, `NotNull<Row<'…'>, …>`). Two names in one type argument, or two templates of one name and different texts: an error |
| **Binding** | two forms only, for the tag and for each `param()` callee. **`sql` and `param`**, each a value import from pgcast's `db` module whose imported name is the local one (`import { sql, param }`). **`<ns>.sql` and `<ns>.param`**, where `<ns>` is a value namespace import of that module (`import * as db`). Each name is the file's one declaration of it. Any other tag or callee refuses the query: `this.sql`, `<ns>.sql` from another module, `db.x.sql`, `import * as sql`, `const { sql } = db`, `raw as param`, a type-only import, or a `param` declared as a parameter, a local, a destructured name, a `catch` binding, a function or an import from elsewhere. A callee or tag of one's own would otherwise be described from the text the tool builds while the run sends another: with `raw as param` and `x = 'true GROUP BY ROLLUP (owner_id)'`, the tool describes `WHERE $1`, `owner_id` proved not null, and the run returns an `owner_id` `NULL`; a `this.sql` that appends `GROUP BY ROLLUP (owner_id)` is described from its static text and returns a `NULL` too. Replayed: 19 forms refused, each one above among them, with `this.param`, a `param` the file never declares and a `db` parameter; 5 accepted, named and namespace imports (`db`, `zdb`) from `zapatos/db` and `pgcast/db`; the corpus's 27 all pass |
| **Neutralising** | per interpolation, by its syntax, as `core.ts` compiles it (the list below); a refusal names the template and the placeholder. The static chunks are read cooked, as the tag receives them (the parser's `text`, `head.text` and each span's `literal.text`), never as source: `` /*\x2a\x2f \x4cEFT \x2f\x2a*/ JOIN `` shows no guard word in source, but the run sends `/**/ LEFT /**/ JOIN` and returns a `NULL` `balance`; read cooked, the guard finds `LEFT` (replayed) |
| **Output** | one committed `.ts`, a plain module beside the schema (no `declare module`, so note 002's names are untouched): `export interface Queries { 'films-by-studio': { text: '…'; row: { … } } }` and `type Row<N extends keyof Queries>`. `text` is the neutralised text, readable in review, as a string literal type: a JSDoc cannot hold it, since a text may hold `*/` (skill `codegen-output`). It is written by `JSON.stringify`, U+2028 and U+2029 escaped, since TypeScript 4.1.6 ends a string at a raw one (TS1002); a text holding `*/`, `$$`, quotes, backticks and both separators reads back equal through the parser of 4.1.6 and 5.9.3 |
| **Column types** | For every field, start with the value returned by the default `pg` text parser for its RowDescription type OID. An unregistered OID gives `string`. Built-in `json` and `jsonb` give `db.JSONValue`, including JSON `null` and the result of `json_agg`. Choice 2 governs SQL `NULL`. [node-postgres data types](https://node-postgres.com/features/types) |
| **Column origins** | Use the origin for choice 2. A generated column type may refine the value only if it admits every possible decoded value, as the catalogue labels do for a scalar enum decoded as text. For catalogue or excluded relations, use the OID type directly without indexing `Selectable`. |
| **SQL arrays** | For Postgres arrays that decode to JavaScript arrays, the generated file declares `export type PgArray<T> = (T \| null \| PgArray<T>)[]`, with `T` the decoded element type. Postgres does not enforce declared dimensions. The preview has no separate proof of rank or non-null elements. A proved non-null `int4[]` gives `PgArray<number>`, an originless one `PgArray<number> \| null`. [Postgres array declarations](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-DECLARATION) |
| **Parameters** | Results only. Describe reads parameter OIDs, but the generated contract contains only the query text and row type. See § Deferred for call-site parameter checking. |
| **`--check`** | without a database: each found template's neutralised text against the stored `text`, so a changed, new, renamed or removed query fails (an entry no template names is stale); with one, each query described again, so a schema change fails too. A renamed query not regenerated also fails to compile: `Row<'old-name'>` gives TS2344 (5.9.3 and 4.1.6) |
| **What stays manual** | any interpolation but a `param()` or a string literal (a condition, a variable, a helper's call, `raw()`, a `sql` template, `db.cols()`), wherever it sits, a shape inside `json`/`jsonb`, a loose column (choice 4), a query not opted in, or a row whose client overrides a relevant parser with an incompatible return type |

**Compatibility.** This opt-in row deliberately differs from the schema where the observed values require it. For the replayed columns, `Selectable` gives `db.NumericString[]` for both numeric arrays and `Date` for the timestamp. The named row gives `PgArray<number>` and `Date | number` respectively. For the same flat `[1, null]`, both `Selectable` and the shortcut's `JSONSelectable` give `number[]`, while the named row admits the null element and additional dimensions. Existing schema users keep the inherited types.

Each interpolation is neutralised as `core.ts` compiles it (§ Replays), which this note reads and does not change:

- **`param(x, '…')`**, a string literal or a template literal without substitutions: compiled by `core.ts` itself from `param(undefined, '…')`, so its quoting is the run's. `param(x, 'int4')` gives `CAST($1 AS "int4")`, described `integer`, under each setting. A cast `core.ts` throws on (`''`) refuses the query, with its message.
- **`param(x, false)`**: `$n`, whatever the settings.
- **`param(x)` and `param(x, true)`**: `$n` or `CAST($n AS "json")`, by the value and by `castArrayParamsToJson` / `castObjectParamsToJson` at run time. `true` casts an array or a plain object, not a string; a setting casts a cast-less array or plain object. So the query is described in every combination of these parameters:
  - a combination Parse refuses is dropped, since that run fails and returns no rows (`u.id = CAST($1 AS "json")`, `settings || CAST($1 AS "json")`);
  - the query is refused if two kept combinations give different rows (`SELECT $1` is `text`, `SELECT CAST($1 AS "json")` `json`), or if none is kept;
  - above 4 such parameters (16 Describes), it is refused: the hint gives each a cast, or `false`. In the corpus, 1 of the 12 templates with a `param()` is above it.
- **A cast that is not a literal** (`param(x, t)`): refused, since the text changes with the value (`CAST($1 AS "int4")`, then `CAST($1 AS "text")`).
- **A string literal**: the identifier `sql` compiles it to.
- **Any other interpolation** (a `Whereable`, a call to `and()`, `or()` or `not()`, a variable, `raw()`, a `sql` template, a ternary, another call): refused, and the query stays typed by hand; the refusal names the placeholder. A boolean `$k` in its place would describe another text than the run's: after `WHERE $1`, `owner_id` is proved not null, and `` sql`true GROUP BY ROLLUP (owner_id)` `` returns it `NULL` (§ Replays).

**Measured** (`tsc --extendedDiagnostics`, the bench's options on the fixture's schema, net of an empty floor): 50 calls `` sql<s.users.SQL, R[]>`… ${whereable} … ${param(i)}` `` (`${whereable}`, which choice 3 refuses, stands in for any interpolation: a row type does not depend on them, and each variant runs the same calls), each row of 5 columns read, cost **+2,007** Instantiations and +810 Types with hand-written interfaces; **+2,507** and +970 with a generated `Queries` (each entry its `text` and `row`) and `Row<'…'>`; +2,357 and +970 with `Queries['…']['row']` spelled out: about 10 Instantiations per call above today's. `bench:types` is unchanged: nothing in the core or the bench moves.

**Array compile cost.** A second 5.9.3 probe used the bench options and fixture schema for 50 named queries, each reading five fields including one array. Against the same floor, the flat `(number | null)[]` cost 1,224 instantiations and 918 types. The recursive alias cost 1,235 and 927 respectively (+11 instantiations, +9 types across all 50 calls). For #807, 50 five-field calls reading one array element gave the following counts in instantiations / types. The empty floor cost 48,648 / 49,597, hand-written recursive rows 53,616 / 54,942 (net 4,968 / 5,345), generated flat rows 54,795 / 55,071 (net 6,147 / 5,474) and generated recursive rows 54,830 / 55,109 (net 6,182 / 5,512). The generated recursive rows added 1,214 instantiations and 167 types against hand-written rows, or 35 and 38 against flat rows.

**TypeScript floor.** On both 4.1.6 and 5.9.3, a consumer imported `PgArray` and `Row`, assigned both replayed array shapes and narrowed a numeric leaf with `typeof x === 'number'`. Both compilers rejected an unchecked `x?.toFixed()`, a nested string leaf and a whole-column null assigned to a non-null array. In the original row probe, a renamed key (TS2344), a nullable column read as `number` (TS2322), a misspelt column (TS2339) and another `text` (TS2322) were refused on both versions.

**Running the scan.** Generation and `--check` need a `typescript` installation with the JavaScript parser API (`ts.createSourceFile`, versions 4.1 to 6). A project with only TypeScript 7 can run the tool in a separate development or CI installation with `typescript@6`, then compile the committed row types with 7. [TypeScript's side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0)

## 4. Overrides

**Status**: Revised 2026-11-20, by delegation.

- A loose column (`COALESCE(x, 0)`, `count(*)`, a `UNION`, a view) is narrowed by the caller, in TypeScript, at the call site: `NotNull<Row<'films-by-studio'>, 'runtime_minutes'>`, a type the generated file exports, its key checked by `keyof`: probed on 5.9.3 and 4.1.6, a misspelt column gives TS2344 and the other columns keep `| null` (TS2322). Explicit, visible in review, and never sent to Postgres.
- Narrow the array in TypeScript at the call site, visible in review. For example, `typeof x === 'number'` lets the caller use `x.toFixed()` on that element. `NotNull` narrows only the whole column and leaves the element type and dimensions intact.
- No override in the SQL text, and no config file of overrides: the reason sits where the query is.

## Deferred: checking parameters

**Status**: Revised 2026-11-20, by delegation. The first release generates result types only.

Postgres describes the type of each `$n`, but `sql` accepts its interpolations without a per-position input type. Checking a value at this tag would require relating each `param(value)` to its described position and the values `pg` accepts as input. Enforcing that relationship in `src/db/core.ts` is a stop point requiring owner approval.

| Tool | Where the caller's input is checked |
|---|---|
| pgTyped | The generated query type gives each named parameter a TypeScript type. The caller passes those values in an object to `.run()`. [Typed queries](https://pgtyped.dev/docs/ts-file) |
| sqlc | sqlc's `query_parameter_limit` setting for Go controls how many typed parameters a method takes individually. Its default of 1 gives a struct for two parameters. With a limit of 2, sqlc's generated `CreateNotice` takes `cnt int32` and `createdAt time.Time` separately. [Generated method](https://github.com/sqlc-dev/sqlc/blob/main/internal/endtoend/testdata/query_parameter_limit_param_only/postgresql/go/query.sql.go) · [sqlc configuration](https://docs.sqlc.dev/en/latest/reference/config.html#go) |
| SQLx | The Rust `query!` macro checks binds against live or saved query metadata by default. On Postgres, `value as _` skips the inferred placeholder-type check for that bind. [SQLx bind overrides](https://docs.rs/sqlx/latest/sqlx/macro.query.html#type-overrides-bind-parameters-postgres-only) |
| Prisma TypedSQL | Generation against Postgres infers the types of positional parameters in a SQL file. Its generated TypeScript function checks the arguments at the call site. [Passing arguments](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/typedsql) |

## Deferred: a condition written in place

**Status**: not accepted. An idea kept with its replays; no planned PR carries it.

The idea: compile a `Whereable` object literal, or a call to `and()`, `or()` or `not()`, written in place with nothing opaque inside, into the described text, each value as a cast-less `param()`, so choice 2 reads the text the run sends. It reaches none of the corpus's 58 row types (§ Corpus): their 16 condition fragments are variables, helpers' calls, a ternary, and 2 `Whereable` literals with something opaque inside.

What the replays showed of it, compiled by master's `sql` on the fixture database (10 texts, 15 columns):

| Case | Text (abridged) | `PREPARE` result types | Describe: type, origin | Truth | Rule |
|---|---|---|---|---|---|
| A `Whereable` | `` sql`… WHERE ${{ display_name: 'Ann', mood: dc.isNotNull }}` `` → `WHERE ("display_name" = $1 AND ("mood" IS NOT NULL))`; `{ id: 3 }` → `WHERE ("id" = $1)` | `integer`, `text` for both, and for `WHERE TRUE` | the same two origins for each text | unchanged by the condition | the same |
| `and()` | `` and({ owner_id: 1 }, sql`…`) `` → `WHERE ((("owner_id" = $1)) AND ("balance" > $2))`; `and()` → `WHERE TRUE` | `bigint`, `double precision` for both | the same origins | unchanged | the same |
| … inside `or()`, `and()`, `not()` or a `Whereable` | `` or(sql`true) GROUP BY ROLLUP (owner_id`) `` → `WHERE (true) GROUP BY ROLLUP (owner_id)`; the same in `and()`, `not()` and a `Whereable`'s `sql` value; `` or(sql`true) UNION ALL SELECT (NULL::int`) `` | `integer` | the compiled text: `accounts.owner_id`, not null, under `ROLLUP`; origin 0 under `UNION` | `owner_id` `NULL` | nullable (`ROLLUP`; origin 0): exact. Described as `$1`, all 5 would be wrong |

Over these 15 columns, Describe's origin alone is wrong on 4, one per `ROLLUP` text; compiled into the text, none is wrong and none loose.

Before a PR could accept it, each of these would need settling, each replayed on Postgres 17.3 with `pg` 8.23.1, every compile under the default settings and with both casts on, and 6 texts described and run:

1. **Each name bound to pgcast's export.** A scan that matches `and`, `dc.and`, `self`, `param`, a nested `sql` tag or `db` by its text accepts a name of one's own. Replayed: a local `dc.and` returning `` sql`true GROUP BY ROLLUP (owner_id)` `` is accepted; the tool describes `WHERE ((("owner_id" = $1)))`, `owner_id` proved not null, while the run returns an `owner_id` `NULL`. Binding each name takes the checker (`getSymbolAtLocation`, `getAliasedSymbol`) over a `Program`, or a scope walk of the tool's own, wider than choice 3's two names.
2. **Each literal compiled as written, with a rule per `db.conditions` export.** The tool's compile (every value a cast-less `param()`) differs from the run's, under the default settings and with both casts on:
   - `eqAny`, `likeAny`, `ilikeAny`, `arrayContains`, `arrayContainedIn`, `arrayOverlaps`, `jsonbContains`, `jsonbPathExists` and `websearchToTsquery` throw on a `param()`, where the run compiles (`"owner_id" = ANY($1)`);
   - `exists('accounts', …)` and `isInSelect('accounts', …, 'owner_id')` turn their names into `$n`: `SELECT $1 FROM $2`, refused by Parse (`42601`), where the run reads `"owner_id"` from `"accounts"`;
   - under `castArrayParamsToJson`, `{ tags: ['a'] }` runs `CAST($1 AS "json")`, and the tool compiles `$1`;
   - the limit of 4 counts every value, so `{ a: 1, b: 2, c: 3, d: 4, e: 5 }` (5 `$n`) is refused, though a string, a number or a boolean never takes the JSON cast: only a non-literal `param(x)`, or an array or object literal, can change form.
3. **A plain key only.** `` { __proto__: sql`…` } `` is a property assignment to the parser, and accepted; JavaScript makes it the prototype, so the run sends the bare fragment, `WHERE true UNION ALL SELECT NULL::int` (origin 0, a `NULL` row), while a key-wise compile gives `WHERE ((true UNION ALL …))`, refused by Parse. A getter or a method runs code, and a shorthand is a variable: each would be refused too.
4. **What counts as a literal, named.** `-1` is a unary expression, and `x as T`, `x!` and `x satisfies T` wrap any value, so none is a literal unless the rule says so; `new Date()` is a call; `db.Default` and `db.all` throw in a `Whereable`, and `parent()` outside a lateral. `isIn(ids)` with a variable array would be refused: `isIn([1, 2])` compiles `IN ($1, $2)`, `isIn([1, 2, 3])` `IN ($1, $2, $3)`, and `isIn([])` `false`, so the text follows the value.

A PR that takes it up revises this section and replays each point at its first commit.

## What changes in the plan

#62 has four planned PRs in `tools/typegen/` under note 013. Each is `high` and receives every review lens.

1. Generate result types only for named queries. The scanner binds imports and neutralises the supported interpolations in choice 3. Parse / Describe supplies field origins and OIDs. Every value type follows the default `pg` text parser for its field OID. Apply choice 3's rules for schema refinements, origins outside the schema and recursive arrays, and choice 2 for SQL nullability.
2. Add `--check` for source drift offline and schema drift against the database.
3. Add `NotNull` to narrow a described column at the call site.
4. Document typed raw SQL in English and French, with the TypeScript, SQL and result type side by side.

- **After those four PRs**, add `--watch` to regenerate the committed types on source edits.
- No PR compiles a condition written in place: § Deferred holds the idea, unaccepted, and what a PR would first have to settle.
- **#62's Order** and **#21's Order**: they no longer need ⑦ (Epic #20, drivers): types are found at generation time over `pg`, which the generator already uses.
- **Note 001**'s TypeScript 6 / 7 reassessment: answered for this tool by § 3's floor; the core's toolchain is not touched.

## Risks

- **The Submittable's connection methods** (`parse`, `describe`, `sync`, the `parameterDescription` event) are what pg-cursor uses, not a documented API of their own: a `pg` major could move them. The tool's peer is `pg >= 8.6.0`, against the core's `>= 7.18.2`: `pg` parses ParameterDescription only from `pg-protocol` 1.5.0, which 8.6.0 is the first to ask for (8.5.1 asks `^1.4.0`, and 1.4.0's parser has none; 7.18.2's `connection.js` has none either). It is tested at that floor and at the latest.
- **Column nullability.** Choice 2's origin proof and whole-query guard together left 13 of 59 columns unnecessarily nullable. Even without a guard word, `SELECT count(*) FROM films WHERE false` had origin 0/0 and returned `'0'`. Callers can use `NotNull`. If users need greater precision, revisit optional `libpg-query` analysis for the three preserved-side columns identified in choice 2.
- **A `NOT NULL` that does not hold**: Postgres 18 accepts `NOT NULL … NOT VALID`, which does not check old rows; the first PR replays what `attnotnull` says then, and proves only a validated constraint (`pg_constraint.convalidated`).
- **The scan is syntactic**: a `sql` renamed on import (`import { sql as q }`), or a row type behind an alias, is not found; the query stays as typed by hand, and the docs say how a query is opted in. A `sql` or `param` declared anywhere in the file but in a form choice 3 accepts refuses the query (its binding), even where that declaration does not reach the template.
- **Coverage**: 27 of the corpus's 58 row types, the static ones and those with `param()` and string literals only. A condition, written in place, built in a variable or by a helper (the corpus's usual form), stays typed by hand: describing it as a boolean `$k` would type a text the run does not send (§ Replays), which principle 1 forbids.
- **Replayed on Postgres 17.3 only**; Parse / Describe exists on every supported version, and the first PR runs CI's matrix (14 and later), with `OLD` and `NEW` on 18 and `1LEFT` on 14.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § sql template strings (`RunResult`) and its home page ("manually apply the right types to what goes in and what comes back").
- pgTyped: [`packages/query/src/actions.ts`](https://github.com/adelsz/pgtyped/blob/master/packages/query/src/actions.ts) (its own startup and SCRAM auth, Parse / Describe, `attnotnull` by origin), [adelsz/pgtyped#201](https://github.com/adelsz/pgtyped/issues/201) ("Outer joins and nullable", closed with nullability overrides), [#170](https://github.com/adelsz/pgtyped/issues/170) ("Dynamic queries don't work", open, 16 👍), [its SQL-file overrides](https://pgtyped.dev/docs/sql-file).
- SafeQL: [repository](https://github.com/ts-safeql/safeql), [`ast-describe.ts`](https://github.com/ts-safeql/safeql/blob/main/packages/generate/src/ast-describe.ts), [`generate.ts`](https://github.com/ts-safeql/safeql/blob/main/packages/generate/src/generate.ts), its docs `docs/guide/plugins.md` (plugin API, experimental) and `docs/compatibility/postgres.js.md`, `slonik.md` (matrices).
- Prisma TypedSQL: [docs](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql) ("requires an active database connection"), [prisma/prisma#25124](https://github.com/prisma/prisma/issues/25124) (open, 104 👍), [#25168](https://github.com/prisma/prisma/issues/25168) (`COALESCE`, 13 👍), [#25268](https://github.com/prisma/prisma/issues/25268) (`UNION`, 4 👍).
- sqlc: [managed databases](https://docs.sqlc.dev/en/latest/howto/managed-databases.html), [configuration](https://docs.sqlc.dev/en/latest/reference/config.html) (`analyzer.database`), [`analyzer/analyze.go`](https://github.com/sqlc-dev/sqlc/blob/main/internal/engine/postgresql/analyzer/analyze.go) (prepare, `attnotnull` where `TableOID > 0`), [sqlc-dev/sqlc#3414](https://github.com/sqlc-dev/sqlc/issues/3414) ("Support dynamic queries", open, 51 👍).
- SQLx: [`query!`](https://docs.rs/sqlx/latest/sqlx/macro.query.html) and offline mode (`cargo sqlx prepare`, `.sqlx`, `--check`; `SQLX_OFFLINE` in [sqlx-cli's README](https://github.com/launchbadge/sqlx/blob/main/sqlx-cli/README.md)), [`describe.rs`](https://github.com/transact-rs/sqlx/blob/main/sqlx-postgres/src/connection/describe.rs) (`EXPLAIN (VERBOSE, FORMAT JSON)` for outer joins), [launchbadge/sqlx#367](https://github.com/launchbadge/sqlx/issues/367) (left joins, open, 23 👍), [#875](https://github.com/launchbadge/sqlx/issues/875) (generalised placeholders, open, 116 👍).
- [`@pgkit/typegen`](https://github.com/mmkal/pgkit/tree/main/packages/typegen): `psql`'s `\gdesc`, `pg_prepared_statements` for parameters, a temporary view and `pgsql-ast-parser` for nullability.
- [`pg_describe`](https://pgxn.org/dist/pg_describe/) ([how it works](https://pgxn.org/dist/pg_describe/docs/how-it-works.html)): a C extension, Postgres 17, `parse_analyze_varparams` and a walk of the join tree.
- Postgres: [`pg_prepared_statements`](https://www.postgresql.org/docs/current/view-pg-prepared-statements.html), [16.0 release notes](https://www.postgresql.org/docs/release/16.0/), [message formats](https://www.postgresql.org/docs/current/protocol-message-formats.html). node-postgres: [`client.query` with a Submittable](https://node-postgres.com/apis/client).
- Notes [001](./001-build-and-test-tooling.md) (TypeScript 6 / 7), [002](./002-module-names.md) (module names), [010](./010-aliases-and-with.md) (`sql`'s type argument), [013](./013-package-model.md) (the package model).

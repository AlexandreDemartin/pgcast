# 012 — Raw SQL types: how a hand-written `sql` query gets its types from Postgres

- **Status**: accepted (2026-11-18), decided alone under the owner's delegation: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#62](https://github.com/AlexandreDemartin/pgcast/issues/62), its step [#710](https://github.com/AlexandreDemartin/pgcast/issues/710) (this note) and its planned PRs; the chapter's epic [#21](https://github.com/AlexandreDemartin/pgcast/issues/21).
- **In short**: **option A, in a separate package**, `@pgcast/typegen` (`tools/typegen/`, note [013](./013-package-model.md)). Opted-in queries are found by the row type they name, `Row<'name'>`; each dynamic fragment becomes a parameter that Postgres must type `boolean`, or the query is refused; the query is described, never executed, by the extended protocol's Parse / Describe over `pg`; a result column is `NOT NULL` only where its origin column is proved so, down every inheritance child, and no guard word (an outer join, a grouping set, `MERGE`, `OLD`, `NEW`) sits in the text; the types land in a committed file that `--check` compares. The core, the default codegen output and the bench are unchanged; Epic #20 (drivers) is not needed.

## Context

What the code gives today:

- **A row type written by hand.** `sql<Interpolations, RunResult>`: "The second type variable, `RunResult` … describes what will be returned if we call `run()`"; its default is `any[]` ([Zapatos's docs](https://jawj.github.io/zapatos/) § sql template strings). Zapatos's own pitch: "write arbitrary SQL using tagged templates, and manually apply the right types to what goes in and what comes back". Note [010](./010-aliases-and-with.md) documents that type argument as the way.
- **Composition at run time.** A `Whereable`, `and()`, `db.cols()` or a `param()` is compiled into the text when the query runs: one call site has many texts. The result's shape depends only on its select list and its `FROM` / `JOIN`; a condition never changes it (§ Replays).
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
| … with interpolations, each a `param()`, a string literal or a fragment after `WHERE`, `AND`, `OR`, `ON` or `HAVING` | 20 (7 of them `param()` and string literals only) |
| … with a fragment in the select list (`db.cols()`, a computed column) | 8 |
| … with an outer join | 6 |
| … with `UNION`, `INTERSECT` or `EXCEPT` | 3 |
| … with `ROLLUP`, `CUBE` or `GROUPING SETS` | 1 |
| … holding one of choice 2's guard words, matched as it says | 6 (the outer joins) |

So about 40 of the 58 hand-written row types are within reach of option A as decided below: the static ones, and those whose fragments sit in a condition; the rest stay manual. The keyword scan is approximate (a fragment's position is read from the static text before it).

## Interfaces

Two documented Postgres interfaces describe a query without running it. Both were replayed (§ Replays):

| | `PREPARE` + `pg_prepared_statements` | Parse / Describe (extended protocol) |
|---|---|---|
| **What Postgres gives** | `parameter_types` and `result_types`, `regtype[]` ([docs](https://www.postgresql.org/docs/current/view-pg-prepared-statements.html)); `result_types` from Postgres 16 ([16.0 release notes](https://www.postgresql.org/docs/release/16.0/)), `NULL` for a statement without result | ParameterDescription (type OIDs) and RowDescription: per field, its type OID and, "if the field can be identified as a column of a specific table", that table's OID and the column's attribute number, "otherwise zero" ([protocol docs](https://www.postgresql.org/docs/current/protocol-message-formats.html)) |
| **Column origin** | none: nullability cannot be proven, so every column is nullable | yes, for a bare column, through CTEs, subqueries and laterals; zero for an expression, an aggregate and a set operation |
| **Domains** | the domain's name (`email`) | the base type (`ext.citext`); the domain is read from the origin column's `atttypid` |
| **Over `pg`** | two plain queries | `pg` has no public Describe; its documented Submittable ("If you pass an object to `client.query` and the object has a `.submit` function on it, the client will pass it's PostgreSQL server connection to the object", [node-postgres](https://node-postgres.com/apis/client), "how pg-cursor and pg-query-stream work") sends `parse`, `describe` and `sync` on that connection, as pg-cursor does; ParameterDescription is read from the connection's `parameterDescription` event. Auth, TLS and the pool stay `pg`'s. The prototype ran on `pg` 8.23.1 |
| **Safety** | the user's text is concatenated into a statement: over the simple protocol, `PREPARE p AS SELECT 1; CREATE TABLE probe_710 ()` **created the table** (replayed) | one statement or refused: "cannot insert multiple commands into a prepared statement"; nothing runs |

The other routes are refused by the issue's constraints, and this note keeps that: `EXPLAIN (VERBOSE, FORMAT JSON)` (SQLx's), whose format moves and which a comment on SQLx#367 still reports wrong on hash and merge joins; `pg_rewrite.ev_action` or a temporary view's `information_schema.view_column_usage` (`@pgkit/typegen`'s), which creates an object; running the query under `LIMIT 0`, which executes; the `pg_describe` extension, which needs Postgres 17 and an extension install; `pg-protocol` alone, which would mean writing the startup and SCRAM auth again, as pgTyped does.

## Replays

On the fixture database (`test/fixtures/schema.sql` and its rows, Postgres 17.3, `pg` 8.23.1, a probe database created and dropped `WITH (FORCE)` by one process), each text described by both interfaces: `PREPARE` in a rolled-back transaction, Describe inside `BEGIN READ ONLY` with `lock_timeout`. Then each is run, rolled back, to see its `NULL`s. Conditions and `param()` are compiled by master's `sql`. "Origin" is Describe's table and column, with that column's `attnotnull`; "truth" is whether a value can be `NULL`, from the query's form and its columns' `NOT NULL` (foreign keys not read), and no run contradicted it; "rule" is choice 2's verdict.

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
| Inheritance | `SELECT x FROM par`, its child `chi` after `ALTER TABLE chi ALTER x DROP NOT NULL`; `SELECT x FROM par2` after `ALTER TABLE ONLY par2 ALTER x SET NOT NULL` over a child's `NULL` | `integer` | `par.x`, `par2.x`, **not null** at their origin | `NULL` from the child | not proved (a child's `x` is not `attnotnull`): exact |
| Foreign table | `SELECT id, label FROM ft_nn` (file_fdw, `id int NOT NULL, label text NOT NULL`, a CSV line `1,`) | `integer`, `text` | `ft_nn.id`, `ft_nn.label`, **not null**, `relkind` `f` | `label` `NULL`: Postgres does not enforce `NOT NULL` on a foreign table | not proved (`f`): exact |
| Foreign partition | `SELECT id, label FROM pt`, a foreign partition below; `pt2`, one two levels down | `integer`, `text` | `pt.label`, `pt2.label`, **not null**, `relkind` `p` | `label` `NULL` | not proved (a partition is `f`): exact |
| Partitioned, plain partitions | `SELECT id, occurred_on, kind, payload FROM events` (three `r` partitions) | `bigint`, `date`, `text`, `jsonb` | `events.*`, `relkind` `p` | as the origins | proved: exact |
| `MERGE … RETURNING` | `MERGE INTO tgt t USING src s ON … WHEN MATCHED THEN UPDATE … WHEN NOT MATCHED BY SOURCE THEN DELETE RETURNING t.label AS kept, s.id, s.label` | `text`, `integer`, `text` | `tgt.label`, `src.id`, `src.label`, **not null** | `s.id`, `s.label` `NULL` on the `DELETE` row | all nullable (`MERGE`): `kept` loose |
| A keyword the old lexer skipped | `SELECT a.balance, E'\'' AS q FROM users u LEFT JOIN accounts a …`; `SELECT a.balance AS b$x$ … LEFT JOIN … WHERE 'b$x$' <> ''` | `numeric`, `text`; `numeric` | `accounts.balance`, not null | `balance` `NULL` | nullable (`LEFT`, nothing skipped): `q` loose |
| A keyword in lower case | `select id, balance from users u full join accounts a using (id)`; `… group by grouping sets ((owner_id), ())` | `bigint`, `numeric`; `integer`, `numeric` | `balance`, `owner_id` not null at their origin | `balance`, `owner_id` `NULL` | nullable (`full`, `grouping`): `id` loose |
| A keyword in a literal | `SELECT u.id, u.display_name FROM users u WHERE u.display_name <> 'left'` | `integer`, `text` | both not null | not null | nullable (`left`): both loose |
| A `Whereable` | `` sql`… WHERE ${{ display_name: 'Ann', mood: dc.isNotNull }}` `` → `WHERE ("display_name" = $1 AND ("mood" IS NOT NULL))`; `{ id: 3 }` → `WHERE ("id" = $1)` | `integer`, `text` for both, and for `WHERE TRUE` | the same two origins for each text | unchanged by the condition | the same |
| `and()` | `` and({ owner_id: 1 }, sql`…`) `` → `WHERE ((("owner_id" = $1)) AND ("balance" > $2))`; `and()` → `WHERE TRUE` | `bigint`, `double precision` for both | the same origins | unchanged | the same |
| A fragment as a placeholder | `WHERE $1 AND u.id > $2`; `ON a.owner_id = u.id AND $1`; `SELECT ($1 AND u.id > 0) AS ok` | params `boolean, integer`; `boolean`; `boolean` | the select list's origins unchanged; `ok` origin 0 | — | accepted: each placeholder typed `boolean` |
| … where no condition goes | `SELECT $1 AS x, u.id …`; `ORDER BY $1`; `WHERE u.id = $1` | params `text`; `text`; `integer` | — | — | **refused**: a placeholder not typed `boolean` |
| A fragment in the select list | `` sql`SELECT ${db.cols(['id', 'email'])} FROM users` `` and `db.cols(['display_name'])` | `integer, email`; `text` | two columns, then one | the shape changes with the value | **refused** (as a placeholder, `text`): left manual |
| Parameters | `WHERE id = $1 AND display_name LIKE $2 AND created_at > $3` | `integer`, `text`, `timestamp with time zone` | the same OIDs | — | written as the query's `params` |
| … untyped, cast | `SELECT $1 AS x`; `SELECT $1::int8[] AS ids` | `text`; `bigint[]` | the same | — | the same |
| `INSERT … RETURNING` | `INSERT INTO extra.spools (label) VALUES ($1) RETURNING id, length` | `integer`, `integer` | `spools.id` not null, `spools.length` null | as the origins | exact |
| No result | `UPDATE extra.spools SET label = $1 WHERE id = $2` | `NULL` | NoData | — | no row type |
| Two statements | `SELECT 1; CREATE TABLE probe_710 ()` | `PREPARE` ran the `CREATE TABLE` | refused, nothing run | — | refused |

What the replays show, over the table's 38 texts with a typed result and their 73 columns:

- Describe's origin alone, the rule pgTyped and sqlc's database analyser apply, is **wrong** on 20 columns of 14 texts: a column `NOT NULL` at its origin comes back `NULL` (outer joins, `ROLLUP`, inheritance, foreign tables and partitions, `MERGE`).
- This note's first reading (`attnotnull`, the six join and grouping words matched case-sensitively) was still wrong on 12 columns of 8 texts: inheritance, the foreign cases, `MERGE`, the two lower-case texts. A lexer that skips literals also misses the two texts of the row "A keyword the old lexer skipped".
- With choice 2 as it stands, no column is wrong. 13 are loose, in 11 texts: nullable where the value never is, each narrowed by an override (choice 4). Of the first 25 texts, 8 of 48 columns are loose, in 7.
- `PREPARE` alone gives no origin, so every column is nullable.

Also replayed, outside the table: a scalar subquery, inner `USING` and `NATURAL` joins, an inner lateral, `CASE`, `UPDATE … FROM … RETURNING` and `MERGE … INSERT … RETURNING`. None is wrong; the last has its 3 columns loose.

## 1. Whether to build it, and where

**Status**: accepted (2026-11-18), by delegation.

| | A. A tool beside the codegen | B. A SafeQL plugin | C. No inference, as today |
|---|---|---|---|
| **What it is** | `@pgcast/typegen`: finds opted-in `sql` templates, neutralises the dynamic fragments, describes each query, writes a committed `.ts` keyed by name | a package for SafeQL, an ESLint plugin ("It's a plugin, not an SQL library"): it checks the row type you write and suggests a fix | the row type written by hand, `sql`'s type argument (note 010) |
| **The core** | unchanged; a peer on `@pgcast/pgcast` for `tsTypeForPgType()` | unchanged | unchanged |
| **Dependencies for the user** | none new: `pg`, `typescript`, `@pgcast/pgcast` | SafeQL, ESLint, `postgres` (postgres.js, its connection) and `libpg-query` (1.8 MB unpacked, `npm view`) | none |
| **Database** | at generation only, the generator's; compiling needs none (committed file) | at every lint run, or a "shadow database" built from migrations; no offline mode | none |
| **Composed queries** | a fragment in a condition becomes a `boolean` parameter; anything else refuses the query | "Conditional fragment selection" ❌ in its own postgres.js matrix; `onExpression` may inline a string or skip the query | typed by hand, unchecked |
| **Nullability** | Describe's origin and a guard (choice 2) | its AST walk over libpg-query, `attnotnull` as fallback | as written |
| **API stability** | pgcast's own | its plugin API is marked "EXPERIMENTAL" | — |
| **Cost** | a package: a TypeScript-parser scan, a guard-word match, a Submittable, a writer, `--check`; maintained with the core's quality (note 013) | a package bound to an experimental API of another project, and its lint-time database | nothing; the 58 row types stay unchecked |

**Choice: A**, in its own package.

- **Security first.** A never executes a query: Parse / Describe refuses a second statement, where `PREPARE` over the simple protocol ran it (§ Replays). B's checks run through postgres.js, not `pg`.
- **Compat with Zapatos 6.6.1.** A adds nothing to the core: a query you do not opt in is today's, and an opted-in one is still `sql<…, RunResult>` with a type argument, as 6.6.1 takes it.
- **The principles.** The database is the source of truth (principle 1); the `sql` text is unchanged and sent as written (principle 3); a separate package, opt-in (principle 4); the tool is a CLI that reads the database and writes a file (principle 5).
- **Why not B.** It types nothing: it checks what you wrote, at lint time, against a live database, through a second driver, on an experimental API; the shape the market asks for, a committed output (Prisma#25124), it cannot give.
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
- **No guard word.** The query's text after neutralisation holds none of `LEFT`, `RIGHT`, `FULL`, `ROLLUP`, `CUBE`, `GROUPING`, `MERGE`, `OLD`, `NEW`. The match ignores case and skips nothing: literals, quoted identifiers and comments are read too. A word is cut where a Postgres identifier could not go on, `/(?<![a-z_])(left|right|full|rollup|cube|grouping|merge|old|new)(?![a-z0-9_$])/i`. A digit may come before it, since Postgres 14 reads `1LEFT` as `1` then `LEFT` ("Previously, query text like `123abc` would be interpreted as `123` followed by a separate token `abc`", [15.0 release notes](https://www.postgresql.org/docs/release/15.0/); 17.3 refuses it, "trailing junk after numeric literal").
  - `MERGE`: `WHEN NOT MATCHED BY SOURCE … RETURNING` null-extends the source with no join word (§ Replays).
  - `OLD` and `NEW`: Postgres 18's `RETURNING old.*` and `new.*`, where "typically old values will be `NULL` for an `INSERT`, and new values will be `NULL` for a `DELETE`" ([docs](https://www.postgresql.org/docs/18/dml-returning.html)); `RETURNING WITH (OLD AS o)` still holds the word. Not replayed here (17.3): the first PR replays them in CI's matrix, on Postgres 18.

The guard only removes proofs, never adds one: a word in a literal or a comment (`'left'`) only loosens a column (§ Replays). No guessed type (principle 1). What a parser would buy: libpg-query, as an optional peer, could tell an outer join's preserved side, which recovers 3 columns of the replays (`id` under `LEFT JOIN` and under `LEFT JOIN LATERAL`, `balance` under `RIGHT JOIN`) and touches the 6 of the corpus's 58 queries that hold a guard word. Not worth a 1.8 MB optional peer and its own reading of the tree; it can come back as a revision of this note.

## 3. Naming, finding, writing, checking

**Status**: accepted (2026-11-18), by delegation.

| Point | Design |
|---|---|
| **Opt-in and name** | the row type names the query: `` sql<s.films.SQL, Row<'films-by-studio'>[]>`…` ``, `Row` imported from the generated file; nothing in the SQL text (a marker in an alias, pgTyped's and SQLx's `AS "title!"`, would change the key `pg` returns) |
| **Finding** | TypeScript's parser (`ts.createSourceFile`, no checker), over the files of the user's `tsconfig.json`: a tagged template whose tag is `sql` and whose type argument is `Row<'…'>` from the generated file. Two templates of one name and different texts: an error |
| **Neutralising** | per interpolation, by its syntax: a `param(…)` call becomes `$n`, typed by Postgres; a string literal becomes the identifier `sql` compiles it to; anything else becomes `$k`, and the query is refused unless Postgres types every `$k` `boolean` (§ Replays). A refusal names the template and the placeholder |
| **Output** | one committed `.ts`, a plain module beside the schema (no `declare module`, so note 002's names are untouched): `export interface Queries { 'films-by-studio': { params: [number]; row: { … } } }` and `type Row<N extends keyof Queries>`, each entry under a JSDoc holding its neutralised text, readable in review |
| **Column types** | a column with an origin is the schema's own type, `s.films.Selectable['title']`, plus `\| null` where choice 2 says; any other through `tsTypeForPgType()`; `json`, `jsonb` and `json_agg` are `db.JSONValue`, never a shape the database does not state |
| **Parameters** | written as `params`, from ParameterDescription; not checked at the call site, since `sql` takes its interpolations untyped, and checking them would need a change to `core.ts` (a stop point) |
| **`--check`** | without a database: each found template's neutralised text against the stored one, so a changed query, a new one or a renamed one fails; with one, each query described again, so a schema change fails too. A renamed query not regenerated also fails to compile: `Row<'old-name'>` gives TS2344 (5.9.3 and 4.1.6) |
| **What stays manual** | a fragment outside a condition (select list, `ORDER BY`, `FROM`), a shape inside `json`/`jsonb`, a loose column (choice 4), a query not opted in |

**Measured** (`tsc --extendedDiagnostics`, the bench's options on the fixture's schema, net of an empty floor): 50 calls `` sql<s.users.SQL, R[]>`… ${whereable} … ${param(i)}` ``, each row of 5 columns read, cost **+2,007** Instantiations and +810 Types with hand-written interfaces; **+2,507** and +969 with a generated `Queries` and `Row<'…'>`; +2,357 and +969 with `Queries['…']['row']` spelled out: about 10 Instantiations per call above today's. `bench:types` is unchanged: nothing in the core or the bench moves.

**TypeScript floor**: the generated file is interfaces, string-literal keys and one indexed-access alias, as the schema already is; on 4.1.6 it compiles, and a renamed key (TS2344), a nullable column read as `number` (TS2322), a misspelt column (TS2339) and a wrong `params` value (TS2322) are refused, as on 5.9.3. The tool itself reads TypeScript's parser of the user's install, which every version since 4.1 has; TypeScript 7's port has no JS API yet (note 001), so the tool runs on a `typescript` that has one (4.1 to 6).

## 4. Overrides

**Status**: accepted (2026-11-18), by delegation.

- A loose column (`COALESCE(x, 0)`, `count(*)`, a `UNION`, a view) is narrowed by the caller, in TypeScript, at the call site: `NotNull<Row<'films-by-studio'>, 'runtime_minutes'>`, a type the generated file exports, its key checked by `keyof`: probed on 5.9.3 and 4.1.6, a misspelt column gives TS2344 and the other columns keep `| null` (TS2322). Explicit, visible in review, and never sent to Postgres.
- No override in the SQL text, and no config file of overrides: the reason sits where the query is.

## What changes in the plan

- **#62**, its planned PRs, each `high`, every lens, in `tools/typegen/` (note 013):
  1. "Describe each fully static named sql query against the database" (the package, the scan, Parse / Describe, the nullability rule, the writer);
  2. "Neutralise conditions in named sql queries as boolean parameters";
  3. "Fail --check when a named sql query is out of date" (offline, then with the database);
  4. "Add NotNull to narrow a described column";
  5. "Document typed raw SQL" (EN and FR, the TypeScript, the SQL and the type side by side).
- **#62's Order** and **#21's Order**: they no longer need ⑦ (Epic #20, drivers): types are found at generation time over `pg`, which the generator already uses.
- **Note 001**'s TypeScript 6 / 7 reassessment: answered for this tool by § 3's floor; the core's toolchain is not touched.

## Risks

- **The Submittable's connection methods** (`parse`, `describe`, `sync`, the `parameterDescription` event) are what pg-cursor uses, not a documented API of their own: a `pg` major could move them. The tool pins its `pg` range and tests it at its floor and latest.
- **Nullability is loose by design**: 13 of the replays' 73 columns need `NotNull`; the docs show it beside each case.
- **A `NOT NULL` that does not hold**: Postgres 18 accepts `NOT NULL … NOT VALID`, which does not check old rows; the first PR replays what `attnotnull` says then, and proves only a validated constraint (`pg_constraint.convalidated`).
- **The scan is syntactic**: a `sql` renamed on import, or a row type behind an alias, is not found; the query stays as typed by hand, and the docs say how a query is opted in.
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

# 010 — Table aliases and `with()`: qualified column names and CTEs before a shortcut

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#57](https://github.com/AlexandreDemartin/pgcast/issues/57) and its three planned PRs, under note [007](./007-related.md) § 3's rule for references.
- **In short**: **nothing is built in the core.** A qualified column is typed today by `sql`'s own type argument: with `` sql<s.users.SQL | `managers.${s.users.Column}`> ``, `${'managers.display_name'}` compiles to `"managers"."display_name"` and a column `users` lacks is refused; the docs show it (§ 3). A CTE before a shortcut is `sql` and one assignment, the shortcut's `runResultTransform`, its result typed `Awaited<ReturnType<typeof query.run>>`: the same SQL and the same type as a helper, for 5 calls in the corpus (§ 1). What a revival would build is written down (§ 2). What #57 keeps: one docs task.

## Context

What the code gives today:

- **An interpolated string is split on `.` and quoted** (`compileExpression`, `src/db/core.ts`): `${'managers.display_name'}` gives `"managers"."display_name"`. The type refuses it under a table's `SQL`, which names columns, not pairs; `sql`'s first type argument takes any type, so a template literal type, `` `managers.${s.users.Column}` ``, adds the pairs (probed below).
- **The shortcuts' `alias` option** writes `FROM "users" AS "managers"`, `to_jsonb("managers".*)`, `"sq_managers"`, and `"managers"` for each `parent()` of a `lateral` subquery; listed columns and `Whereable` keys stay unqualified, and resolve to the alias. Zapatos's self-join example puts the `alias` on the `lateral` subquery and writes no qualified column (jawj/zapatos#12: "I think you need the `alias` option").
- **A `WITH` is `sql`.** A fragment's `runResultTransform` defaults to `qr => qr.rows`, so ``sql`WITH r AS (…) ${db.select(…)}` `` returns `[{ result: [...] }]` until the shortcut's transform is assigned to it. `copy()` keeps the transform, and takes `literals` and `expressions` (`website/sql-template.md` § `copy()`).
- **`with` is a reserved word.** `export { withCTEs as with }` compiles, and `require('zapatos/db').with` is the function; `gen-esm-wrapper` writes only valid identifiers into `db.mjs` (`isValidIdentifier`), so under ESM `import * as db` gives `db.with` `undefined`, `db.default.with` the function (probed on a build). Zapatos named `deletes()` the same way.
- **Zapatos was asked.** jawj/zapatos#56, "CTE examples" (2020): "I don't think there should be anything much different about this than any other query". Its own answer in jawj/zapatos#96 writes `"my_join"."result"` in the literal and `${"chapters"}.${"id"}` for a table's column.

How Postgres answers each form, replayed on Postgres 17.3 through the built runtime, on probe databases with `users (id, display_name, manager_id)` and `accounts`:

| Written | Compiled | Postgres |
|---|---|---|
| ``sql`… ${'managers.display_name'} … JOIN ${'users'} AS ${'managers'} ON ${'managers.id'} = ${'users.manager_id'}` `` | `"managers"."display_name"`, `"users" AS "managers"` | the self-join's rows |
| `"managers"."display_name"`, the `FROM` without that alias | | 42P01 `missing FROM-clause entry for table "managers"` |
| `"users"."display_name"` once the table is `AS "u"` | | 42P01 `invalid reference to FROM-clause entry` |
| a table joined to itself with no alias | | 42712 `table name "users" specified more than once` |
| `"Managers"."display_name"` beside `AS Managers` unquoted | | 42P01: the unquoted alias is folded to `managers` |
| ``select('users', sql`${'managers.manager_id'} IS NULL`, { alias: 'managers' })`` | `FROM "users" AS "managers" WHERE "managers"."manager_id" IS NULL` | runs |
| ``sql`WITH r AS (${cte}) ${db.select(…)}` `` | `WITH r AS (…) SELECT coalesce(jsonb_agg(result), '[]') …` | `[{ result: [...] }]`; with the shortcut's `runResultTransform` assigned, the rows |
| the W1 prototype (§ 1) over `count()` and `selectOne()` | `WITH "recent_reports" AS (…) SELECT count(*) AS result …` | `2`, `{ id: 3 }` |
| `WITH "users" AS (SELECT 99 AS id, …)` before `select('users', …)` | `FROM "users"` | **the CTE's rows**, typed as the table's; a column the CTE lacks: 42703 |
| the same CTE before `public.users`, or `UPDATE` of that name | | the table |
| `WITH a AS (SELECT * FROM b), b AS (…)` | | 42P01; with `RECURSIVE`, runs |
| a self-referencing CTE | | 42P01 without `RECURSIVE`; `RECURSIVE` on a CTE that does not recurse runs |
| `AS MATERIALIZED (…)`, `AS NOT MATERIALIZED (…)` | | run; `NOT MATERIALIZED` on a data-modifying CTE runs, ignored |
| `WITH d AS (UPDATE …)` with no `RETURNING`, never read | | runs: the row is updated; read, 0A000 `does not have a RETURNING clause` |
| `WITH eve AS (${db.insert('users', …)}) ${db.select('users', …)}` | `INSERT … RETURNING … AS result` | the insert runs; the select returns the rows as they were before it |
| ``WITH eve AS (${db.insert(…)}) SELECT result FROM eve`` | | the inserted row |
| a data-modifying CTE inside a `lateral` | `LEFT JOIN LATERAL (WITH "d" AS (UPDATE …) …)` | 0A000 `WITH clause containing a data-modifying statement must be at the top level` |
| a `WITH` fragment as an `extras` value | written as given | 42601; in parentheses, runs |
| ``sql`WITH d AS (DELETE … RETURNING …) ${db.insert('accounts', [])}` `` | `WITH d AS (…) /* marked no-op … */ INSERT … SELECT null WHERE false` | the `DELETE` runs, the result is `[]` |
| `WITH "a"."b" AS (…)`; two CTEs of one name | | 42601; 42712 |

## Corpus

Two projects of real usage (skill `consumer-usage`; no project named, examples invented). App code only, tests, benchmarks and migrations apart: a TypeScript AST scan of each `sql` tagged template and each `raw()` call, the template's text read with its interpolations kept apart. References are found by a pattern over that text: about 7 decimal numbers count among the 260 below.

| What | Count |
|---|---|
| `sql` templates | 3,301 in one project, 111 in the other |
| `WITH` clauses in `sql` | **6**: 5 in one project (27 CTEs: three of one, one of 6, one of 18), 1 in the other (2 CTEs). **All 6 end in a main query written in the literal**, never a shortcut; 1 `RECURSIVE`, 1 `MATERIALIZED`, no data-modifying CTE; every name written bare in the literal; 5 type their result by hand |
| CTEs before a shortcut | **a home-grown helper**, in one project: a `select()` and a `count()` variant that write `WITH … <shortcut>` with `sql`, then copy the shortcut's `runResultTransform`. The `count()` variant casts its result (`as unknown as`); the `select()` one returns a union with `any[]`. **5 calls**, in 2 files, plus 3 in a benchmark script; its `materialized` flag is never set |
| `db.raw()` | 79 in one project, 7 in the other |
| … a CTE's name | 11, in one project: 2 inside the helper, the name it defines; 9 of a constant, in 2 files, where the query reads the CTE (`FROM`) or names a derived table when there is no CTE |
| … a column that a CTE or a derived table gives | 45, in the same 2 files |
| … the rest | 23 in one project (an operator or a keyword chosen at run time, column lists, a lateral's result, names of another database's tables), and the other's 7 (channel names, a seed script's names) |
| table aliases defined in `sql` | 101 in one project: 55 `${'films'} AS f`, 43 in the literal, 3 other; none in the other's app code (17 in its tests) |
| … in a template that reads one table twice, where an alias is needed | 9 templates |
| column references qualified by an alias | **about 430 in one project, in 65 templates**: 166 `f.${'title'}`, the column interpolated, so checked against the template's type argument; about 260 `f.title`, wholly in the literal. 45 of the 65 templates have no type argument, so an interpolated column is any table's. The other project: 9, and 53 in tests |
| qualified by a table's name | 180 in one project, 162 of them Zapatos's `${'films'}.${'title'}`; 19 in the other |
| qualified by `"lateral_<key>"` or `"sq_<alias>"` | 113, in one project: note 007 § 3's |
| the shortcuts' `alias` option | 3 and 2 |

## 1. A CTE before a shortcut

**Status**: accepted (2026-11-17), by delegation.

| | W0. `sql`, documented | W1. `db.withCTEs(ctes, query)` | W2. A `with` option on the read shortcuts, as the corpus's helper has |
|---|---|---|---|
| **The caller writes** | ``const q = sql<s.films.SQL, Awaited<ReturnType<typeof films.run>>>`WITH recent AS (${recent}) ${films}`; `` then `q.runResultTransform = films.runResultTransform;` | `db.withCTEs({ recent }, films)` | `db.select('films', …, { with: { recent } })` |
| **SQL** | `WITH recent AS (…) SELECT coalesce(jsonb_agg(result), '[]') …` | `WITH "recent" AS (…) SELECT …`, the same but the quoted name | the same as W1 |
| **What the type checks** | the result, the shortcut's; not that the transform line is there | the result; it cannot forget the transform | the result |
| **What it adds** | a docs section | a public helper and its tests, a name that is no reserved word (§ Context), and the points of § 2 | an option on `select()` and its kin, with § 2's points; a data-modifying CTE before an `insert()` needs one on each write shortcut too |
| **Compile cost** (measured below) | H's 4 CTE queries, +593 Instantiations | its declaration +0 Instantiations, +5 Types; its 4 calls 250 Instantiations fewer than W0's | its declaration +0, +2 Types; its 4 calls 275 fewer |
| **Corpus calls it serves** | all 5 | the helper's 5 calls; not the 6 literal `WITH`s, whose main query is SQL, nor the 45 `db.raw()` of a CTE's columns (§ 4) | the same 5 |

**Measured** (`npm run bench:types`, prototypes over `src/db` in a scratch copy, never committed). Master is 15,824 Instantiations and 7,469 Types, +1.1 % and +3.8 % on the baseline. Each prototype adds the same 7 queries on the fixture: 3 joins written with `sql`, with 5 aliases and 15 qualified references (a self-join on `users.manager_id`, `accounts` and its owner, `transfers` and its two accounts), and 4 CTE queries, a CTE before `select()`, `count()` and `selectOne()`, and an `insert()` as a CTE before a `select()`; every result read.

| Prototype | Instantiations | Types |
|---|---|---|
| H: the 7 queries as the corpus writes them, aliases in the literal (`managers.${'display_name'}`), the CTEs as W0 | 16,508 (+684 on master) | 7,724 (+255) |
| … H's 3 joins alone | 15,915 (+91) | 7,503 (+34) |
| … H's 4 CTE queries alone | 16,417 (+593) | 7,690 (+221) |
| W1 declared, H's calls | 16,508 (+0 on H) | 7,729 (+5) |
| W1: the 4 CTE queries through `withCTEs()` | 16,258 (−250) | 7,645 (−79) |
| W2 declared, H's calls | 16,508 (+0) | 7,726 (+2) |
| W2: the 4 CTE queries through the option | 16,233 (−275) | 7,644 (−80) |
| A1: the 15 references as `${'managers.display_name'}`, each join's aliases in its type argument (§ 3) | 16,642 (+134) | 7,823 (+99) |
| A2 declared, H's calls | 16,511 (+3) | 7,736 (+12) |
| A2: the 15 references and 5 aliases through `db.alias()` | 16,669 (+161) | 7,793 (+69) |

So W0's cost is its type argument, `Awaited<ReturnType<…>>`, about 60 Instantiations a query more than a helper's inference: compile time is no reason either way. The types check out (probed): W1 and W0 give `{ id: number }[]`, `{ id: number } | undefined` and `number` over `select()`, `selectOne()` and `count()`, none `any`, and W1 refuses a CTE that is no fragment; W2's calls compile, their results read as H's.

**Market standard**:

- **Kysely**: `db.with('recent', (db) => db.selectFrom(…))` adds the CTE to the database type for the rest of the chain, so `.selectFrom('recent')` is typed (`QueryCreatorWithCommonTableExpression`); `withRecursive()` makes the whole clause recursive, as its first call decides; a callback names it `materialized()` or `notMaterialized()`. A data-modifying query is a CTE like any other.
- **Drizzle**: `const sq = db.$with('sq').as(db.select()…)`, then `db.with(sq).select().from(sq)`: a CTE is a table of the chain. `buildWithCTE()` writes `with "sq" as (…)`, with neither `recursive` nor `materialized` (0.45.4).
- **Slonik**: no CTE helper in its `sql` tag (`array`, `fragment`, `identifier`, `join`, `type`, `unnest`…): a `WITH` is written in `sql`, its result typed by a Zod schema, `sql.type(schema)`.
- **Zapatos**: jawj/zapatos#56, "nothing much different … than any other query".

So the two query builders give a CTE to type the query that reads it, as a table of their chain. pgcast has no chain: a shortcut takes a `Table`, so a CTE cannot be its table (§ 4), and what a helper would type is the main query's result, which the shortcut already types.

**Choice: W0.** Nothing is built: #57's planned PR 1 is crossed out, and the docs show the pattern (§ What changes in the plan).

- **The written rule decides.** "A need is worth an API if it is general to Postgres … and if it recurs in the corpus" (skill `consumer-usage`). CTEs are general; a CTE before a shortcut is 5 calls in one project, against 6 `WITH`s whose main query is SQL, which no helper serves.
- **What a helper would save is one line.** W0's SQL is the helper's, but for the quoted name; its type is the shortcut's, derived, not written by hand. What it can miss is the assignment, and the docs will show what that gives: `[{ result: … }]` under the shortcut's type.
- **What the corpus's helper lacks, W0 has.** Its `count()` variant casts; `Awaited<ReturnType<typeof count.run>>` types it with no cast (probed).
- **What W1 would cost.** A public helper kept forever with its tests, a name that cannot be `with`, and the points of § 2 that a helper must get right, where `sql` leaves them visible: an empty `insert()` that makes it a no-op, `selectExactlyOneChecksForSecondRow`, parentheses in `extras`, a CTE named as the shortcut's table.
- **W2 is worse than W1**: an option on every read shortcut, and on the write shortcuts for a data-modifying CTE, where one function serves all.
- **Small is beautiful**: "no complexity for a niche case nor for a performance gain drowned in network latency" (skill `code-style`); here the gain is one line, at 5 calls in about 3,400 templates.
- **For a revival**: a project that puts CTEs before shortcuts in many places, or typed CTEs as tables (§ 4), which would need a helper anyway. Then W1, as § 2 writes it: it comes back as a revision of this note.

## 2. `withCTEs()`'s signature and SQL, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow. Nothing below is built while choice 1 stands.

| Point | Decision | SQL, or what Postgres does (replayed above) |
|---|---|---|
| **Name** | not `with`, a reserved word that `db.mjs` leaves out (§ Context), as Zapatos wrote `deletes()`; `withCTEs()`, after the clause and its Postgres name, common table expressions | — |
| **Shape** | `db.withCTEs(ctes, query)`: an object of fragments, keyed by name, and the main query; a fragment out, like `sql`, never a chain | `WITH "recent" AS (…), "older" AS (…) <query>` |
| **Order** | the object's, as `Object.keys` gives it: a CTE reads one before it. A key that is an integer comes first (`{ b, 2, a }` gives `2, b, a`), so the revival's type refuses it | a CTE that reads a later one: 42P01 |
| **The name** | one identifier, `"` doubled as `quote_ident` does, never split on `.`, as `"lateral_<key>"` is (R7): `SQLForAlias()` with no prefix | `"a.b""c"`; a qualified name is 42601 |
| **Result** | the main query's `RunResult` and `runResultTransform`; `select()`'s mark, so that `extras`, `insert()` and `update()` write it in parentheses (#262, #656) | `(WITH "r" AS (…) SELECT count(*) AS result …)` |
| **A no-op main query** | the result is never a no-op: an empty `insert()` is one, and a copy of it skips its CTEs (probed: the `DELETE` never ran) | `WITH "d" AS (DELETE …) INSERT … SELECT null WHERE false`: the `DELETE` runs, `[]` |
| **A data-modifying CTE** | any shortcut as a CTE: the write shortcuts write `RETURNING`, so the main query reads their rows; the docs say the main query sees each table as it was before the statement | the select returns the rows as they were; in a `lateral`, 0A000 |
| **`RECURSIVE`, `MATERIALIZED`** | out, as #57 scopes recursion: `sql` writes both, and the corpus writes each once, in a literal `WITH` | — |
| **`selectExactlyOne()` with `selectExactlyOneChecksForSecondRow`** | nested, it compiles to `LIMIT 1`, so the check never sees a second row; documented, as for `copy()` | `WITH "r" AS (…) SELECT … LIMIT $1`, `1` |
| **A CTE named as the shortcut's table** | the docs say to name a CTE apart from the tables: the shortcut reads the CTE, typed as the table | the CTE's rows; 42703 for a column it lacks; `UPDATE` of that name writes the table |
| **Compile cost** | measured in § 1 | — |
| **Class** ([decision 003](./003-fixes-and-deprecation.md)) | a new export | — |

## 3. Qualified column names

**Status**: accepted (2026-11-17), by delegation.

| | A0. As the corpus writes them | A1. The alias in `sql`'s type argument, documented | A2. A helper, `db.alias(table, name)` |
|---|---|---|---|
| **The caller writes** | ``sql<s.crew.SQL>`SELECT mentors.${'name'} FROM ${'crew'} JOIN ${'crew'} AS mentors ON mentors.${'id'} = ${'crew'}.${'mentor_id'}` `` | ``sql<s.crew.SQL \| `mentors.${s.crew.Column}`>`SELECT ${'mentors.name'} FROM ${'crew'} JOIN ${'crew'} AS mentors ON ${'mentors.id'} = ${'crew'}.${'mentor_id'}` `` | `const mentors = db.alias('crew', 'mentors');` then ``sql<s.crew.SQL>`SELECT ${mentors('name')} FROM ${'crew'} JOIN ${mentors.table} ON ${mentors('id')} = …` `` |
| **SQL** | `mentors."name"` | `"mentors"."name"` | `"mentors"."name"`, `"crew" AS "mentors"` |
| **What the type checks** | the column, against the type argument's tables; not the alias | the alias and its column, as a pair: on the fixture, `${'managers.balance'}` and `${'manager.display_name'}` refused (probed) | the column, against the helper's table; the alias is the helper's |
| **What it adds** | nothing | a docs section; no export | a public helper, a callable object with a property, and its injection tests |
| **Compile cost** (§ 1) | H's | +134 Instantiations and +99 Types for 3 joins, 5 aliases, paid where written | +161 and +69, its declaration's +3 and +12 among them, paid by every project |
| **Corpus references it serves** | — | the 430 alias-qualified and the 180 table-qualified, one template at a time | the same, and the 101 aliases' definitions |

Under note 007 § 3's rule, A1 and A2 both check by what the call names (A1 its type argument, A2 its table argument), never through the enclosing query. Neither checks that the `FROM` defines the alias: a reference to an alias it lacks is 42P01 (replayed), as a `parent<s.films.Column>` of the wrong table is found by running the query.

**Market standard**:

- **Kysely**: `selectFrom('person as p')`, the alias parsed from the string by a template literal type (`` `${string} as ${infer TA}` ``); then `'p.first_name'` is typed, as `` `${T}.${keyof DB[T]}` `` (`AnyColumnWithTable`), through the chain. A subquery takes `.as('sub')`.
- **Drizzle**: `const parent = alias(users, 'parent')` (`drizzle-orm/pg-core`): a proxy of the table whose name is the alias, so its columns compile as `"parent"."id"`. That is A2, over table objects declared in TypeScript (principle 2).
- **Slonik**: `sql.identifier(['managers', 'name'])` gives `"managers"."name"`, each part's `"` doubled; nothing checks the pair.

**Choice: A1.** No export: #57's planned PR 2 is crossed out, and the docs show the type argument.

- **A1 is Kysely's type with no chain.** The pair `` `mentors.${s.crew.Column}` `` is the template literal type Kysely builds; pgcast has no chain to carry the alias, so the caller names it once, in the type argument `sql` already has. The runtime already compiles the dotted string: nothing is new but the page.
- **A2 is Drizzle's helper.** It checks no more than A1 (the alias is whatever the call says), costs more per query and on every project, and adds a public object with a property: a synonym of an interpolation that already works (skill `zero-abstraction` § Naming).
- **The corpus writes A0** in 65 templates, 45 of them with no type argument, so their interpolated columns are any table's: a page that shows A1 gives them the pair; no API would reach them without an edit to each template either.
- **The shortcuts need no qualified column.** Their `alias` option qualifies `to_jsonb("crew".*)` and each `parent()`, and leaves the rest to resolve to it; a `where` or `extras` fragment that names the alias takes A1's type argument too.
- **The docs' rules**, each replayed: an alias in lower case, as the film world writes names, since `AS Mentors` unquoted is `mentors` to Postgres and `${'Mentors.name'}` quotes it (42P01); a table joined to itself needs one (42712); once a table is aliased, its name no longer qualifies (42P01).

## 4. A CTE typed as a table, out of scope

**Status**: accepted (2026-11-17), by delegation.

#57 sets it aside: "Typed CTE columns (a CTE used as a table in a shortcut): later". The corpus's measure of it is the 45 `db.raw()` of a CTE's columns, in 2 files, and the 9 of its name: neither goes until a CTE is typed. Meanwhile the docs say to write a CTE's name and its columns in the literal, as the query's own names, where `db.raw()` of a constant adds nothing a reader can check.

A revival would need one of:

- **A shortcut over a CTE**: its first argument widened from `Table`, the most used type of the API, and the `*ForTable<T>` lookups that key on it, as note [009](./009-functions.md) § 5 refused for a set-returning function; and the CTE's row type carried from `withCTEs()` (§ 2) to the shortcut, which is the chain Kysely and Drizzle have and pgcast does not.
- **The types of raw SQL** ([#21](https://github.com/AlexandreDemartin/pgcast/issues/21)): their first scope is "`sql` whose text is entirely static, since queries are composed at run time". The corpus's 6 literal `WITH`s are such queries if their text is static; a CTE before a shortcut, composed at run time, is outside that scope. #21 has no milestone and a very high risk.

## What changes in the plan

- **#57's planned PR 1** ("Add with() to prefix a query with CTEs"): crossed out, pointing to § 1.
- **PR 2** ("Add typed table aliases and qualified column names"): crossed out, pointing to § 3.
- **PR 3** ("Document with() and table aliases") becomes a docs task:
  - `website/raw-sql.md`, EN and FR: § Qualify a column by its alias, A1, a self-join of `crew` and its mentors, the SQL and the type side by side, with § 3's rules; § Put a CTE before a shortcut, W0, the pattern and its type, what `run()` gives without the transform line, an `insert()` as a CTE and the rows the main query sees, `RECURSIVE` and `MATERIALIZED` in the literal, a CTE named apart from the tables, a CTE's name and columns in the literal, a `WITH` in `extras` in parentheses, a data-modifying CTE at the top level only; one line on why there is no `with()`, linking this note.
  - `website/why.md`, EN and FR, § Coming, and `README.md`'s goal: CTEs leave what is coming; a CTE is `sql`, and a qualified column is typed by `sql`'s type argument.
  - `README.md`'s roadmap: "CTEs" leaves chapter 2's list.
  - `CHANGELOG.md`, § Changed: the docs.
- **#19**, the chapter's epic: its ⑥ line says not built in the core, documented with `sql`, pointing here.

## Risks

- **The corpus is two projects**, and 5 of the 6 `WITH`s and every CTE before a shortcut sit in one. A project that puts CTEs before shortcuts in many places writes the line by hand until a revival; the docs section is its answer meanwhile.
- **W0's transform line can be left out**: `run()` then returns `[{ result: … }]` under the shortcut's type, and no type finds it. The docs show it, and a test that runs the query does.
- **A1 checks the type argument, not the `FROM`**: an alias the query does not define, or one typed in the wrong case, is 42P01 at run time.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § `lateral` and `alias`; [jawj/zapatos#12](https://github.com/jawj/zapatos/issues/12), [jawj/zapatos#56](https://github.com/jawj/zapatos/issues/56), [jawj/zapatos#96](https://github.com/jawj/zapatos/issues/96).
- Postgres: [`WITH` Queries (Common Table Expressions)](https://www.postgresql.org/docs/current/queries-with.html) (`RECURSIVE`, `MATERIALIZED`, data-modifying statements in `WITH`, which run on the main query's snapshot); [table and column aliases](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-TABLE-ALIASES).
- Kysely 0.29.9: `query-creator.d.ts` (`with`, `withRecursive`), `parser/with-parser.d.ts` (`QueryCreatorWithCommonTableExpression`), `query-builder/cte-builder.d.ts`, `parser/table-parser.d.ts` (`ExtractAliasFromTableExpression`), `util/type-utils.d.ts` (`AnyColumnWithTable`).
- Drizzle 0.45.4: `pg-core/db.d.ts` (`$with`, `with`), `pg-core/dialect.js` (`buildWithCTE`), `pg-core/alias.js` and `alias.js` (`TableAliasProxyHandler`).
- Slonik 47.3.2: `@slonik/sql-tag`'s `types.d.ts` (`SqlTag`), `createIdentifierSqlFragment.js`.
- `gen-esm-wrapper` (`isValidIdentifier`), probed on a build.
- Notes [007](./007-related.md) § 3 (the rule for references) and [009](./009-functions.md) (the shape of a cut, § 5).

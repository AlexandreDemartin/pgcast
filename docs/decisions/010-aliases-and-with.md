# 010 — Table aliases and `withCTEs()`: qualified column names and CTEs before a shortcut

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#57](https://github.com/AlexandreDemartin/pgcast/issues/57) and its three planned PRs, under note [007](./007-related.md) § 3's rule for references.
- **In short**: **one helper, `db.withCTEs(ctes, query)`**, and no alias helper. `withCTEs()` puts CTEs before a query and keeps its result, `WITH "recent" AS (…) <query>`, and with no CTE gives the query itself (§ 1, § 2): the corpus passes a CTE list built at run time, which can be empty, and with `sql` that is a home-grown helper, not a line. A qualified column is typed today by `sql`'s own type argument: with `` sql<s.users.SQL | `managers.${s.users.Column}`> ``, `${'managers.display_name'}` compiles to `"managers"."display_name"`, and a column `users` lacks is refused, as long as the table's `SQL` refuses a bare string ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)); the docs show it (§ 3). What #57 keeps: `withCTEs()` with its docs, and a docs task for qualified columns.

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
| ``sql<s.users.SQL \| `managers.${s.users.Column}`>`… ${'managers.display_name'} … JOIN ${'users'} AS managers ON ${'managers.id'} = ${'users'}.${'manager_id'}` `` | `"managers"."display_name"`, `"users" AS managers` | the self-join's rows |
| `"managers"."display_name"`, the `FROM` without that alias | | 42P01 `missing FROM-clause entry for table "managers"` |
| `"users"."display_name"` once the table is `AS "u"` | | 42P01 `invalid reference to FROM-clause entry` |
| a table joined to itself with no alias | | 42712 `table name "users" specified more than once` |
| `"Managers"."display_name"` beside `AS Managers` unquoted | | 42P01: the unquoted alias is folded to `managers` |
| ``select('users', sql<s.users.SQL \| `managers.${s.users.Column}`>`${'managers.manager_id'} IS NULL`, { alias: 'managers' })`` | `FROM "users" AS "managers" WHERE "managers"."manager_id" IS NULL` | runs |
| ``sql`WITH r AS (${cte}) ${db.select(…)}` `` | `WITH r AS (…) SELECT coalesce(jsonb_agg(result), '[]') …` | `[{ result: [...] }]`; with the shortcut's `runResultTransform` assigned, the rows |
| ``sql`WITH ${db.mapWithSeparator(ctes, sql`, `, …)} ${query}` ``, `ctes` empty | `WITH  SELECT …` | 42601 |
| `withCTEs()`'s prototype (§ 2) over `count()` and `selectOne()`, two CTEs, the second reading the first | `WITH "recent" AS (…), "rich" AS (SELECT id FROM recent) SELECT count(*) AS result …` | `2`, `{ id: 3 }` |
| … with `{}` | the query's own SQL | the query's result |
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
| CTEs before a shortcut | **a home-grown helper**, in one project: a `select()` and a `count()` variant that write `WITH … <shortcut>` with `sql`, then copy the shortcut's `runResultTransform`. The `count()` variant casts its result (`as unknown as`); the `select()` one returns a union with `any[]`. **5 calls**, in 2 files, plus 3 in a benchmark script. Each passes a CTE list that a `where` builder fills at run time and can leave empty: the helper then returns the shortcut, with no `WITH`, and one call site names a derived table instead of a CTE. Its `materialized` flag is never set |
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

**Status**: accepted (2026-11-17), by delegation; revised the same day after review, from W0 to W1.

| | W0. `sql`, documented | W1. `db.withCTEs(ctes, query)` | W2. A `with` option on the read shortcuts, as the corpus's helper has |
|---|---|---|---|
| **The caller writes, one fixed CTE** | ``const q = sql<s.films.SQL, typeof films extends db.SQLFragment<infer R, any> ? R : never>`WITH recent AS (${recent}) ${films}`; `` then `q.runResultTransform = films.runResultTransform;` | `db.withCTEs({ recent }, films)` | `db.select('films', …, { with: { recent } })` |
| **… a CTE list built at run time, as the corpus's 5 calls** | the same, the CTEs joined by `mapWithSeparator()`, and a branch that returns `films` when the list is empty (42601 otherwise): the corpus's helper | `db.withCTEs(ctes, films)`: `{}` gives `films` | the same as W1 |
| **SQL** | `WITH recent AS (…) SELECT coalesce(jsonb_agg(result), '[]') …` | `WITH "recent" AS (…) SELECT …`, the same but the quoted name | the same as W1 |
| **What the type checks** | the result, the shortcut's; not that the transform line is there | the result; it cannot forget the transform | the result |
| **What it adds** | a docs section | a public helper, its tests and docs, a name that is no reserved word (§ Context), and the points of § 2 | an option on `select()` and its kin, with § 2's points; a data-modifying CTE before an `insert()` needs one on each write shortcut too |
| **Compile cost** (measured below) | its 4 queries: +295 Instantiations, +123 Types | its declaration +0 and +5 Types on every project; its 4 calls +48 and +19 over W0's | its declaration +0 and +2; its 4 calls +23 and +18 over W0's |
| **Corpus calls it serves** | all 5, through a helper per project | the helper's 5 calls, which it replaces; not the 6 literal `WITH`s, whose main query is SQL, nor the 45 `db.raw()` of a CTE's columns (§ 4) | the same 5 |

**Measured** (`npm run bench:types`, prototypes over `src/db` in a scratch copy, never committed). Master is 15,824 Instantiations and 7,469 Types, +1.1 % and +3.8 % on the baseline. Each prototype adds the same 7 queries on the fixture: 3 joins written with `sql`, with 5 aliases and 15 qualified references (a self-join on `users.manager_id`, `accounts` and its owner, `transfers` and its two accounts), and 4 CTE queries, a CTE before `select()`, `count()` and `selectOne()`, and an `insert()` as a CTE before a `select()`; every result read.

| Prototype | Instantiations | Types |
|---|---|---|
| H: the 7 queries as the corpus writes them, aliases in the literal (`managers.${'display_name'}`), the CTEs as W0 with the `infer` form | 16,210 (+386 on master) | 7,626 (+157) |
| … H's 3 joins alone | 15,915 (+91) | 7,503 (+34) |
| H′: the CTEs as W0 with `Awaited<ReturnType<typeof films.run>>`, which needs TypeScript 4.5 (the `typescript` peer is `>=4.1`: TS2304 on 4.1.6) | 16,508 (+298 on H) | 7,724 (+98) |
| W1 declared, H's calls | 16,210 (+0 on H) | 7,631 (+5) |
| W1: the 4 CTE queries through `withCTEs()` | 16,258 (+48) | 7,645 (+19) |
| W2 declared, H′'s calls | 16,508 (+0 on H′) | 7,726 (+2) |
| W2: the 4 CTE queries through the option | 16,233 (−275 on H′, +23 on H) | 7,644 (+18 on H) |
| A1: H′'s 15 references as `${'managers.display_name'}`, each join's aliases in its type argument (§ 3) | 16,642 (+134 on H′) | 7,823 (+99) |
| A2 declared, H′'s calls | 16,511 (+3) | 7,736 (+12) |
| A2: H′'s 15 references and 5 aliases through `db.alias()` | 16,669 (+161) | 7,793 (+69) |

So compile time is no reason either way: W0's `infer` form costs 12 Instantiations a query less than W1's inference, its `Awaited` form 62 more. The types check out (probed on TypeScript 4.1.6, check:floor's, and on 5.9): W1 and W0's `infer` form give `{ id: number }[]`, `{ id: number } | undefined`, `{ id: number }` and `number` over `select()`, `selectOne()`, `selectExactlyOne()` and `count()`, none `any`; W1 gives the query's type with `{}` and with a run-time `{ [name: string]: SQLFragment }`, is typed as a read shortcut in `extras` and `lateral`, and refuses a CTE or a main query that is no fragment; W2's calls compile, their results read as H's.

**Market standard**:

- **Kysely**: `db.with('recent', (db) => db.selectFrom(…))` adds the CTE to the database type for the rest of the chain, so `.selectFrom('recent')` is typed (`QueryCreatorWithCommonTableExpression`); `withRecursive()` makes the whole clause recursive, as its first call decides; a callback names it `materialized()` or `notMaterialized()`. A data-modifying query is a CTE like any other.
- **Drizzle**: `const sq = db.$with('sq').as(db.select()…)`, then `db.with(sq).select().from(sq)`: a CTE is a table of the chain. `buildWithCTE()` writes `with "sq" as (…)`, with neither `recursive` nor `materialized` (0.45.4), and nothing for an empty list (`if (!queries?.length) return void 0`).
- **Slonik**: no CTE helper in its `sql` tag (`array`, `fragment`, `identifier`, `join`, `type`, `unnest`…): a `WITH` is written in `sql`, its result typed by a Zod schema, `sql.type(schema)`.
- **Zapatos**: jawj/zapatos#56, "nothing much different … than any other query", of a `WITH` whose main query is SQL.

So the two query builders give a CTE to type the query that reads it, as a table of their chain, and Drizzle drops an empty list. pgcast has no chain: a shortcut takes a `Table`, so a CTE cannot be its table (§ 4); what a helper types is the main query's result, and what it writes is the `WITH` around it.

**Choice: W1**, `db.withCTEs(ctes, query)`, as § 2 writes it; #57's planned PR 1 stays, as [#671](https://github.com/AlexandreDemartin/pgcast/issues/671) (§ What changes in the plan).

- **The corpus's need is a run-time list.** Each of its 5 calls passes CTEs that a `where` builder adds or not. With `sql`, that is a `mapWithSeparator()`, an empty-list branch (42601 without it, replayed), the transform and its type argument: the helper the corpus wrote, with `db.raw()` for each name and a cast in its `count()` variant. W0 is one assignment only for a fixed CTE, which the corpus never puts before a shortcut.
- **The written rule holds.** A CTE is general to Postgres; the workaround is one that skill `consumer-usage` names, "a rewritten `runResultTransform`", in a helper of its own that each project would write again. `withCTEs()` replaces it without changing the SQL but for the quoted name, and makes the empty case valid (skill `zero-abstraction`: a valid empty case).
- **The SQL stays visible (principle 3).** One SQL per call, `WITH "name" AS (…), … <query>`, written in the JSDoc and frozen by a test; the one other shape is the documented empty case, the query's own SQL, as `isIn([])` is `false`.
- **Small is beautiful**: about 15 lines in `src/db/shortcuts.ts` over `copy()`, `mapWithSeparator()` and `SQLForAlias()`, nothing in `core.ts`, +5 Types on every project and 12 Instantiations a call over W0. Against that, a helper in each project that gets the empty case, the transform and the names right, which the corpus's got right only by a cast.
- **What W0 would cost, had it won**: nothing in the core, and the helper above in each project, or a docs section that teaches it.
- **W2 is worse than W1**: an option on every read shortcut, and on the write shortcuts for a data-modifying CTE, where one function serves all.
- **`RECURSIVE` and `MATERIALIZED` stay out** (§ 2): the corpus writes each once, in a literal `WITH`; its helper's `materialized` flag is never set.

## 2. `withCTEs()`'s signature and SQL

**Status**: accepted (2026-11-17), by delegation; each row replayed on the prototype (§ Context).

| Point | Decision | SQL, or what Postgres does |
|---|---|---|
| **Name** | not `with`, a reserved word that `db.mjs` leaves out (§ Context), as Zapatos wrote `deletes()`; `withCTEs()`, after the clause and its Postgres name, common table expressions | — |
| **Shape** | `db.withCTEs(ctes, query)`: an object of fragments, keyed by name, and the main query; a fragment out, like `sql`, never a chain; `<RunResult, Constraint>(ctes: { [name: string]: SQLFragment<any, any> }, query: SQLFragment<RunResult, Constraint>) => SQLFragment<RunResult, Constraint>` | `WITH "recent" AS (…), "rich" AS (…) <query>` |
| **Empty** | `withCTEs({}, query)` returns `query` itself, as Drizzle drops an empty list, so a run-time list needs no branch | the query's own SQL |
| **Order** | the object's, as `Object.keys` gives it: a CTE reads one before it. A key that is an integer comes first (`{ b, 2, a }` gives `2, b, a`): documented, not checked | a CTE that reads a later one: 42P01 |
| **The name** | the key, as a `lateral` key is: one identifier, `"` doubled as `quote_ident` does, never split on `.`, as `"lateral_<key>"` is ([R7](../CHARACTERISATION-REPORT.md)): `SQLForAlias()` with no prefix. Injection tests on each hostile input of skill `sql-safety` | `"a.b""c"`; `'x" AS (SELECT 1); DROP TABLE users; --'` stays one name and the query one statement; `'"q"'` is `"""q"""`, the name with its quotes |
| **Result** | a `copy()` of the main query: its `RunResult`, `runResultTransform`, `parentTable` and `select()`'s mark, so that `extras`, `insert()` and `update()` write it in parentheses (#262, #656) | `(WITH "recent" AS (…) SELECT count(*) AS result …)` in `extras` and as an `insert()` value; in a `lateral`, `LEFT JOIN LATERAL (WITH …)` |
| **A no-op main query** | the copy is never a no-op (`noop: false`): an empty `insert()` is one, and a copy that kept it would skip its CTEs | `WITH "d" AS (DELETE …) INSERT … SELECT null WHERE false`: the `DELETE` runs, `[]` |
| **A data-modifying CTE** | any shortcut as a CTE: the write shortcuts write `RETURNING`, so the main query reads their rows; the docs say the main query sees each table as it was before the statement | the select returns the rows as they were; in a `lateral`, 0A000 |
| **`RECURSIVE`, `MATERIALIZED`** | out, as #57 scopes recursion: `sql` writes both | — |
| **`selectExactlyOne()`** | nested, it compiles to `LIMIT 1`, so `selectExactlyOneChecksForSecondRow` never sees a second row: documented, as for `copy()`. With no row, `NotExactlyOneError`, whose `.query` is the shortcut, without the `WITH` | `WITH "r" AS (…) SELECT … LIMIT $1`, `1` |
| **A CTE named as the shortcut's table** | the docs say to name a CTE apart from the tables: the shortcut reads the CTE, typed as the table | the CTE's rows; 42703 for a column it lacks; `UPDATE` of that name writes the table |
| **Compile cost** | measured in § 1 | — |
| **Class** ([decision 003](./003-fixes-and-deprecation.md)) | a new export | — |

## 3. Qualified column names

**Status**: accepted (2026-11-17), by delegation; its reach corrected the same day after review ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)).

| | A0. As the corpus writes them | A1. The alias in `sql`'s type argument, documented | A2. A helper, `db.alias(table, name)` |
|---|---|---|---|
| **The caller writes** | ``sql<s.crew.SQL>`SELECT mentors.${'name'} FROM ${'crew'} JOIN ${'crew'} AS mentors ON mentors.${'id'} = ${'crew'}.${'mentor_id'}` `` | ``sql<s.crew.SQL \| `mentors.${s.crew.Column}`>`SELECT ${'mentors.name'} FROM ${'crew'} JOIN ${'crew'} AS mentors ON ${'mentors.id'} = ${'crew'}.${'mentor_id'}` `` | `const mentors = db.alias('crew', 'mentors');` then ``sql<s.crew.SQL>`SELECT ${mentors('name')} FROM ${'crew'} JOIN ${mentors.table} ON ${mentors('id')} = …` `` |
| **SQL** | `mentors."name"` | `"mentors"."name"` | `"mentors"."name"`, `"crew" AS "mentors"` |
| **What the type checks** | the column, against the type argument's tables; not the alias | the alias and its column, as a pair: on the fixture, `${'managers.balance'}` and `${'manager.display_name'}` refused (probed). Only while the table's `SQL` refuses a bare string: a column named like a member of `String` whose type that member fits, `any` or `length?: number`, makes any string a `Whereable` of the table ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)), so under the fixture's `products` (`search`, a `tsvector` typed `any`), `${'p.nmae'}` compiles | the column, against the helper's table (`ColumnForTable`), under such a table too; the alias is the helper's |
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
- **A2 is Drizzle's helper.** It checks more than A1 only under a table whose `SQL` takes any string, and that hole (#670) also opens every query typed by that table's `SQL`, aliased or not: it is closed in the type, where all of them gain, not by a helper beside it. Elsewhere A2 checks what A1 does (the alias is whatever the call says), costs more per query and on every project, and adds a public object with a property: a synonym of an interpolation that already works (skill `zero-abstraction` § Naming).
- **The corpus writes A0** in 65 templates, 45 of them with no type argument, so their interpolated columns are any table's: a page that shows A1 gives them the pair; no API would reach them without an edit to each template either.
- **The shortcuts need no qualified column.** Their `alias` option qualifies `to_jsonb("crew".*)` and each `parent()`, and leaves the rest to resolve to it; a `where` or `extras` fragment that names the alias takes A1's type argument too.
- **The docs' rules**, each replayed: an alias in lower case, as the film world writes names, since `AS Mentors` unquoted is `mentors` to Postgres and `${'Mentors.name'}` quotes it (42P01); a table joined to itself needs one (42712); once a table is aliased, its name no longer qualifies (42P01).

## 4. A CTE typed as a table, out of scope

**Status**: accepted (2026-11-17), by delegation.

#57 sets it aside: "Typed CTE columns (a CTE used as a table in a shortcut): later". The corpus's measure of it is the 45 `db.raw()` of a CTE's columns, in 2 files, and the 9 of its name: neither goes until a CTE is typed. Meanwhile the docs say to write a CTE's name and its columns in the literal, as the query's own names, where `db.raw()` of a constant adds nothing a reader can check.

A revival would need one of:

- **A shortcut over a CTE**: its first argument widened from `Table`, the most used type of the API, and the `*ForTable<T>` lookups that key on it, as note [009](./009-functions.md) § 5 refused for a set-returning function; and the CTE's row type carried from `withCTEs()` (§ 2) to the shortcut, which is the chain Kysely and Drizzle have and pgcast does not.
- **The types of raw SQL** ([#21](https://github.com/AlexandreDemartin/pgcast/issues/21)): their first scope is "`sql` whose text is entirely static, since queries are composed at run time". The corpus's 6 literal `WITH`s are such queries if their text is static; a CTE before a shortcut, composed at run time, is outside that scope. #21 has no milestone and a very high risk; of ⑥ it needs nothing more in the core, a typed CTE being its own scope.

## What changes in the plan

- **#57**, retitled as #56 was: "Add withCTEs() and document qualified column names (decision 010: no alias helper)".
- **Its planned PR 1** ("Add with() to prefix a query with CTEs") becomes [#671](https://github.com/AlexandreDemartin/pgcast/issues/671), `withCTEs()` as § 2 writes it, risk `high`, lenses `sql` and `types`:
  - `src/db/shortcuts.ts`, its JSDoc with the SQL; tests of the compiled SQL (`text` and `values`), of each § 2 row on Postgres, the injection tests of the name (skill `sql-safety`), the types positive and negative, on TypeScript 4.1 too (`check:floor`); `bench:types`.
  - `website/raw-sql.md`, EN and FR, § Put a CTE before a shortcut: `withCTEs()` and its SQL, `{}`, an `insert()` as a CTE and the rows the main query sees, `RECURSIVE` and `MATERIALIZED` in `sql`, a CTE named apart from the tables, a CTE's name and columns in the literal, a data-modifying CTE at the top level only, `selectExactlyOne()` nested; its entry beside `copy()` in `website/sql-template.md`.
  - `website/why.md`, EN and FR, § Coming, and `README.md`'s goal and roadmap: CTEs leave what is coming; `CHANGELOG.md`, § Added.
- **PR 2** ("Add typed table aliases and qualified column names"): crossed out, pointing to § 3.
- **PR 3** ("Document with() and table aliases") becomes a docs task for qualified columns only ([#667](https://github.com/AlexandreDemartin/pgcast/issues/667)): `website/raw-sql.md`, EN and FR, § Qualify a column by its alias, A1, a self-join of `crew` and its mentors, the SQL and the type side by side, with § 3's rules and its reach (#670); `CHANGELOG.md`, § Changed.
- **#19**, the chapter's epic: its ⑥ line names `withCTEs()` and the docs task, pointing here.
- **#21**: its line on ⑥ says what it still needs (§ 4).

## Risks

- **The corpus is two projects**, and 5 of the 6 `WITH`s and every CTE before a shortcut sit in one: `withCTEs()` serves 5 calls of one project, against a new export for all. Its SQL is the corpus's helper's, and its empty case Drizzle's.
- **`withCTEs()` puts a fragment of the caller's before a shortcut** and keeps the shortcut's type: a CTE that changes the rows the shortcut reads (one named as its table, § 2) is not seen by the type. The docs say to name a CTE apart from the tables.
- **A1 checks the type argument, not the `FROM`**: an alias the query does not define, or one typed in the wrong case, is 42P01 at run time.
- **A1 checks nothing under a table whose `SQL` takes any string** ([#670](https://github.com/AlexandreDemartin/pgcast/issues/670)): until that is fixed, a misspelt pair compiles there, as a misspelt bare column already does. The docs' schema has no such column, so #667's examples hold.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § `lateral` and `alias`; [jawj/zapatos#12](https://github.com/jawj/zapatos/issues/12), [jawj/zapatos#56](https://github.com/jawj/zapatos/issues/56), [jawj/zapatos#96](https://github.com/jawj/zapatos/issues/96).
- Postgres: [`WITH` Queries (Common Table Expressions)](https://www.postgresql.org/docs/current/queries-with.html) (`RECURSIVE`, `MATERIALIZED`, data-modifying statements in `WITH`, which run on the main query's snapshot); [table and column aliases](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-TABLE-ALIASES).
- Kysely 0.29.9: `query-creator.d.ts` (`with`, `withRecursive`), `parser/with-parser.d.ts` (`QueryCreatorWithCommonTableExpression`), `query-builder/cte-builder.d.ts`, `parser/table-parser.d.ts` (`ExtractAliasFromTableExpression`), `util/type-utils.d.ts` (`AnyColumnWithTable`).
- Drizzle 0.45.4: `pg-core/db.d.ts` (`$with`, `with`), `pg-core/dialect.js` (`buildWithCTE`), `pg-core/alias.js` and `alias.js` (`TableAliasProxyHandler`).
- Slonik 47.3.2: `@slonik/sql-tag`'s `types.d.ts` (`SqlTag`), `createIdentifierSqlFragment.js`.
- `gen-esm-wrapper` (`isValidIdentifier`), probed on a build.
- Notes [007](./007-related.md) § 3 (the rule for references) and [009](./009-functions.md) (the shape of a cut, § 5).

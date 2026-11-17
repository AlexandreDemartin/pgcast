# 009 — Postgres functions: signatures, `fn()` and set-returning functions

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#56](https://github.com/AlexandreDemartin/pgcast/issues/56) and its four planned PRs.
- **In short**: **not built in the core**. The corpus calls a function of its own schemas 7 times in about 3,400 `sql` templates: 6 with no argument, all 7 as a column's value in an `insert()` or an `update()`, where a typed result checks nothing, or is refused by the generated `Insertable`. A typed `fn()` costs a generated lookup that `src/db` reads, so a canary increment, for a name and arguments that Postgres checks on the first run (42883). What #56 keeps: a docs section on calling a function with `sql` (values, the cast an overload or a polymorphic type needs, `VARIADIC`, `OUT`, set-returning functions in `FROM` and in a `lateral`), and "functions" leaves the lists of what is coming.

## Context

What the code gives today:

- **The generator never reads `pg_proc`**, in Zapatos 6.6.1 as in pgcast (`git grep pg_proc v6.6.1 -- src`, and on master: nothing). The fixture holds each kind of function, so that a run proves they leave no trace: `full_name(first text, last text)`, `account_balance(bigint)`, `reports_of(int) RETURNS SETOF users`, `extra.transfer_totals(since timestamptz DEFAULT …) RETURNS TABLE (…)`, `split_email(address text, OUT local_part text, OUT domain text)`, `sum_all(VARIADIC int[])`, three overloads of `describe()`, `extra.search_key(text)` and a procedure (`test/fixtures/schema.sql`).
- **The `sql` template writes a call already.** `${'extra.transfer_totals'}` compiles to `"extra"."transfer_totals"`, quoted and qualified as a table name is; `db.param()` sends a value, with an optional cast; the result is typed by hand, `sql<s.users.SQL, string | null>`.
- **The generated `Insertable` takes `db.SQLFragment`**, which is `SQLFragment<any[]>`: a fragment whose result is typed, `sql<s.users.SQL, string>`, is refused as a value of `insert()` and `upsert()` (TS2769, probed); `Updatable`, `Whereable` and `extras` take any fragment.
- **A lookup in `zapatos/schema` that `src/db` reads** makes the generator write it even without its opt-in, and the canary go up, so every consumer regenerates; declaring it into `zapatos/db` from `schema.d.ts` hides that module (note [007](./007-related.md) § 1, option E, probed there).
- **Zapatos was asked for it**: jawj/zapatos#58, "Functions and Procedures support", open since December 2020, 17 comments. Zapatos first answered that routine names in the `SQL` types "would make VS Code's autocomplete much less useful", then "it's definitely on the TODO list". Its users asked for typed wrappers of functions that hold business logic, `json` in and `json` out, or `SETOF` a table. For a `VARIADIC` function (jawj/zapatos#145), Zapatos suggested `mapWithSeparator()`, then exported it (`609bc94`).

How Postgres answers each form, replayed on Postgres 17.3 through the built runtime, on a probe database with the fixture's functions and a few more:

| Written with `sql` | Compiled | Postgres |
|---|---|---|
| ``sql`full_name(${db.param('Ada')}, ${db.param('Lovelace')})` `` | `full_name($1, $2)` | `'Ada Lovelace'` |
| ``sql`full_name(last => ${db.param('Lovelace')}, first => ${db.param('Ada')})` `` | named notation | the same |
| ``sql`full_name(${db.param(null)}, …)` ``, or `RETURNS text` giving no value | | `null`: a function's result has no `NOT NULL`; `STRICT` gives `null` on a `null` argument |
| `full_name(DEFAULT, $1)` | | 42601 `DEFAULT is not allowed in this context` |
| `bookCount($1)` for `"bookCount"` | unquoted | 42883; `` ${'bookCount'}(…) `` gives `"bookCount"($1)`, which runs |
| `extra.totals()`, its one argument `DEFAULT 0` | | runs, with the default |
| `describe($1)`, with `1` or with `'a'` | `$1` untyped, as `pg` sends every value | the `text` overload both times: `'text 1'` |
| `describe(${db.param(1, 'int4')})` | `describe(CAST($1 AS "int4"))` | `'int 1'`. The cast takes the catalog's name: `'int'` gives `"int"`, 42704 |
| `describe($1, $2)` | | `'pair 1,2'`: an arity is never ambiguous |
| `sum_all($1, $2, $3)` | | `6` |
| ``sum_all(VARIADIC ${db.param([1, 2, 3])})`` | the array one parameter | `6`; with `[]`, `0` |
| `sum_all($1)`, the array without `VARIADIC` | | 22P02 `invalid input syntax for type integer: "{"1","2","3"}"`; `sum_all()`, 42883 |
| `first_of($1)`, `anyarray` → `anyelement` | | 42804 `could not determine polymorphic type because input has type unknown`; with `db.param([5, 6], 'int4[]')`, `CAST($1 AS "int4"[])`, `5` |
| `SELECT split_email($1)` (two `OUT`) | | the record's text, `'(a,b.c)'`; `SELECT * FROM split_email($1)` gives `local_part` and `domain` |
| `bump($1)` (`INOUT n int, step int DEFAULT 1`) | | `2`, the `INOUT` value |
| `SELECT ts_now()` (`timestamptz`), `SELECT big()` (`int8`) | | a `Date`, and the string `'9007199254740993'` |
| the same two in a shortcut's `extras` | `jsonb_build_object($2::text, big())` | the JSON string `'2026-01-02T04:04:05+01:00'`, and the number `9007199254740992`, rounded |
| `split_email($1)` in `extras` | | `{ "domain": "b.c", "local_part": "a" }` |
| `reports_of("id")` in `extras` of `select('users', …)` | | **one row per report**: the user with two reports comes back twice, the user with none is gone |
| ``SELECT … FROM reports_of(${db.param(1)}) AS r``, in a `lateral` with `jsonb_agg(to_jsonb(r))` | | the reports as an array, one row per user |
| `db.fn('bookCount', [db.parent('id')])`, #56's sketch, as `sql` in a top-level `extras` | | throws while compiling: `The 'parent' table alias has no meaning here`; ``${'id'}`` gives `"bookCount"("id")` |

## Corpus

Two projects of real usage (skill `consumer-usage`; no project named, examples invented). Functions read from each database's `pg_proc`, outside `pg_catalog` and `information_schema`, extension members apart (`pg_depend.deptype = 'e'`); calls counted in app code, migrations and tests apart, with a TypeScript AST scan, and the 7 calls of § 1 read one by one.

| What | Count |
|---|---|
| functions of the projects' own schemas | **8**, in one project's database: all `plpgsql`, all `RETURNS text`, 0 or 1 argument (5 with none); no overload, default, `VARIADIC`, `OUT`, `INOUT`, polymorphic type or `SETOF`. Plus 1 trigger function; 5 functions in another database of the same project, which app code never calls; 4 `pg_temp` functions inside one migration. The other project: **none** |
| calls from app code | **7**, in 6 files of one project: 6 as a column's value in an `insert()` (2 through a helper that returns the fragment), 1 in an `update()`'s values. 6 with no argument, 1 with a column. 1 types its result by hand (`sql<…, string>`), the `update()`'s. None in `extras`, a `where`, `order`, a `lateral` or a query of its own; none through `db.raw()` or `pool.query()` |
| … what a typed result would check there | nothing: the 6 `insert()` values would be refused once typed (§ Context); the `update()`'s column takes `string` already |
| extension functions in a generated schema | `pg_trgm` (31) and `unaccent` (4, 2 names overloaded) in one project's `public`; `unaccent` in the other's. A generator reading `public`'s `pg_proc` writes them too, unless it leaves extension members out |
| … their calls from app code | **105**, 103 in one project and 2 in the other: 98 `unaccent()`, 7 `similarity()` or `word_similarity()`. 91 of the 103 are the argument of another call, 80 of them inside `to_tsvector()`; a home-grown helper returns the full-text query built around one, called about 70 times |
| `sql` templates in app code | about 3,400 |

## 1. Whether to build it

**Status**: accepted (2026-11-17), by delegation.

| | F0. `sql`, as today, documented | F1. Signatures only, opt-in | F2. Signatures and `fn()` | F3. A package of its own |
|---|---|---|---|---|
| **The caller writes** | ``sql<s.users.SQL, string \| null>`full_name(${'display_name'}, ${db.param('x')})` `` | the same, its result named: ``sql<s.users.SQL, s.SignatureForFunction<'full_name'>['result']>`…` `` | ``db.fn('full_name', [sql<s.users.SQL>`${'display_name'}`, 'x'])`` | F2's call, imported from the package |
| **What the type checks** | the columns (`${'display_name'}`); the result is the caller's | the result, from the catalog; not the name in the text, nor the arguments | the name, the arguments' number and types, the result | the same as F2 |
| **What it adds** | a docs section | a generated interface and its key; `src/db` reads nothing | F1, and a public helper in `zapatos/db` that reads `Function` and `SignatureForFunction` from `zapatos/schema`: written even without the key, a change to the default output, and a canary increment (stop points) | F1, a published package (`exports`, `files`, a release: stop points) and a generated runtime file, or F2's lookup |
| **Compile cost** (measured below) | +0 | +75 Types for the fixture's 10 signatures, 6 to 8 per signature; +0 Instantiations | about 56 Instantiations per call (+2.9 points for 8), +215 Types; +78 and +159 when the caller names the signature (`fn<S>()`) | as F2 |
| **Corpus calls it serves** | all | 1 of 7: the `update()`, whose result is typed by hand | 1 of 7, the `update()`; the 6 `insert()` values would be refused, typed; 12 of the 103 extension calls if extension members are read, the other 91 nested in another call | as F2 |

**Measured** (`npm run bench:types`, prototypes over `test/generated` in a scratch copy, never committed). Master is 15,824 Instantiations and 7,433 Types, +1.1 % and +3.3 % on the baseline. Each prototype adds a bench file with 9 calls on the fixture's functions: 6 in `extras` of `select('users', …)` (two arguments, each overload, `VARIADIC`, `OUT`), one in `extras` of `accounts`, one in a `where` fragment, and a `SELECT * FROM extra.transfer_totals()` run on its own; every result read.

| Prototype | Instantiations | Types |
|---|---|---|
| H: the 9 calls written with `sql`, each result typed by hand (today, like for like) | 16,290 (+466 on master) | 7,566 (+133) |
| F1: H, and the fixture's 8 functions declared as one interface, `FunctionSignatures` (§ 2, G2) | 16,290 (+0 on H) | 7,641 (+75) |
| F1, declared as a namespace per function in its schema's namespace (§ 2, G1) | 16,290 (+0) | 7,652 (+86) |
| F1 (G2), plus 43 signatures at one project's count: its 8 functions and its extensions' 35 | 16,290 (+0) | 7,912 (+346) |
| F2: G2, and the 8 `fn()` calls in place of H's, the overload picked from the arguments' types | 16,741 (+451) | 7,781 (+215) |
| F2 over G1 | 16,759 (+469) | 7,785 (+219) |
| F2 with the signature named by the caller, `fn<s.FunctionSignatures['full_name']>('full_name', …)`, no lookup | 16,368 (+78) | 7,725 (+159) |

So signatures cost 6 to 8 Types each, once, and nothing per query (271 for one project's 43); a call that picks its overload from its arguments costs about 56 Instantiations, one that is told its signature about 10. The prototype's types check out (probed): `fn('describe', [1])` is `SQLFragment<string | null>`, an `OUT` pair is its object, and `fn('full_name', [1, 2])`, `fn('describe', [true])`, `fn('describ', [1])` and a missing argument are refused, none of them `any`.

**Market standard**:

- **PostgREST** reads every function of an exposed schema (`prokind = 'f'`, no trigger), extension members included, and calls it in `FROM`, always in named notation, each value cast to its argument's type: `"full_name"("first" := …::text, "last" := …::text)`, `VARIADIC` written before the variadic argument (`callPlanToQuery`). It picks an overload by the names of the arguments sent; two that take the same names are PGRST203, "Could not choose the best candidate function" (`findProc`).
- **Supabase's generator**, PostgREST's TypeScript, writes `Functions: { full_name: { Args: { first: string; last: string }; Returns: string } }`: overloads as a union, `Returns: T[]` for a set, `Record<PropertyKey, never>` for no argument, extension functions of `public` among them; `Returns` without `| null`, which no function promises.
- **Kanel** generates every routine by default (`makeRoutineGenerator('function')` and `('procedure')` in `makePgTsGenerator`): an interface `<name>_params`, every parameter neither nullable nor optional, `OUT` ones included, and `<name>_return_type`, a `RETURNS TABLE` read by splitting `pg_get_function_result()` on commas; `returnsSet` is read but not used, so `SETOF text` is `string`; overloads share one name. Kanel writes types only: no call.
- **kysely-codegen** reads no function (no `pg_proc` in its source). **Kysely**'s `fn<string>('upper', ['first_name'])` takes any name, its result type written by the caller, its arguments column references, `val()` for a value.
- **Zapatos**: jawj/zapatos#58, never built.

**Choice: F0.** Nothing is built in the core: no signatures, no `fn()`. #56's planned PRs 1 to 3 are crossed out, and 4 becomes a docs section (§ What changes in the plan).

- **No call the corpus writes gets a check.** 6 of its 7 calls have no argument, so a signature would check the name alone, which Postgres refuses on the first run with 42883, `function … does not exist`, naming it. Typed, the 6 `insert()` values would no longer compile, since the generated `Insertable` takes only an untyped fragment; the `update()` checks nothing more than its column's `string`. Its 105 extension calls sit mostly inside `to_tsvector()` and full-text helpers, where a call returns no row of its own.
- **F2 pays the most for it.** A public helper kept forever, a lookup in every `zapatos/schema` and a canary increment, so every consumer regenerates, for a check that `fn<S>()` makes without the lookup only by having the caller name the function twice. A call with `sql` is already as short as `fn()`'s, and its SQL is in the text.
- **F1 types a result** that the caller writes today in one place, and only after a name that nothing checks, in a fragment that the `Insertable` refuses once typed; for 6 to 8 Types per signature on every compile, extension members included.
- **The need is real elsewhere.** jawj/zapatos#58's users keep business logic in functions, `json` in and out, where a signature gives `JSONValue` both ways; `SETOF` a table is their other case, which § 5 leaves to `sql`. PostgREST's projects call functions as an API: that is its design, not Zapatos's.
- **The types of raw SQL** ([#21](https://github.com/AlexandreDemartin/pgcast/issues/21)) will type a function's result where it is called, as Postgres resolves it, overload, polymorphic type and `OUT` included, from a separate, opt-in tool: no lookup, no new helper in the core.
- **Small is beautiful**: a core helper must pay for itself in the core, and here it serves one call in 3,400 templates.
- **For a revival**: a project that calls functions with arguments from `extras`, `where` or a query of its own, as jawj/zapatos#58 describes; then F1 first, opt-in, as § 2 to 4 write it. `fn()` would need the default output and canary change named above, which is the owner's (`AGENTS.md` § Stop points), or `fn<S>()`, which needs neither. It comes back as a revision of this note.

## 2. The generated output, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow. Nothing below is built while choice 1 stands.

| | G1. A namespace per function, in its schema's | G2. One interface, keyed by name |
|---|---|---|
| **Generated** | `export namespace functions { export namespace full_name { export type Function = 'full_name'; export type Signature = { … } } … }` in each schema, then `SignatureForFunction<F>`, a lookup as `SelectableForTable<T>` is | in the global part: `export interface FunctionSignatures { "full_name": { args: […]; result: string \| null; row: never }; "extra.transfer_totals": …; }`, `export type Function = keyof FunctionSignatures`, `export type SignatureForFunction<F extends Function> = FunctionSignatures[F]` |
| **A name that is no TypeScript identifier** | `tsIdentifier()`, and two names that it makes one (#42) | a string key, as written |
| **Beside a table** | the namespace `functions` sits with the tables, in the unprefixed schema, and merges with a table of that name | apart |
| **Compile cost** (measured above) | +86 Types, +469 Instantiations for the 8 calls | +75 Types, +451 Instantiations |

**Choice for a revival: G2**, under `functionSignatures: true` (`OptionalConfig`, read `?? false`), in a `/* === functions === */` section before the lookups; off, the output is master's.

- **Keys** are the function's name as `Table` names a table: `'full_name'` in an unprefixed schema, `'extra.transfer_totals'` in a prefixed one.
- **Read**: `prokind = 'f'`, the generated schemas only, trigger and event-trigger functions left out, extension members left out (`pg_depend.deptype = 'e'`): they come with an extension's version, not from the schema, and the corpus's 35 would cost about 210 Types for 12 calls a helper could reach. Procedures and user-defined aggregates are out, as #56 says. One query per run, sorted by schema, name and identity arguments (`pg_get_function_identity_arguments()`).
- **Arguments** take an `Insertable` column's value of their type, without `db.DefaultType` (42601 in a call), with `null` (any function takes one) and `db.ParentColumn`: `string | db.Parameter<string> | db.SQLFragment | db.ParentColumn | null`. A tuple, each element named after its argument: `[first: …, last: …]`.
- **`result`** is the `JSONSelectable` form, `| null`: a function is called inside a shortcut, where its value goes through `jsonb_build_object()`, and no function promises a value (replayed above). `int8` is `number` there, `timestamptz` a `db.TimestampTzString`, as in a `JSONSelectable`.
- **`row`** is the `Selectable` form of the row it returns in `FROM`, for `OUT`, `RETURNS TABLE` and `SETOF`: `never` for a scalar function, the table's `Selectable` for `SETOF users`, its columns each `| null` otherwise, as Postgres says nothing of their nullability.
- **`COMMENT ON FUNCTION`** becomes the signature's JSDoc, through `jsdocText()`.
- **Class** ([decision 003](./003-fixes-and-deprecation.md)): opt-in without switch-over; nothing to deprecate.

## 3. Overloads, defaults, `VARIADIC`, `OUT`, `INOUT` and polymorphic types, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow.

| Case | Typed as | What a call must write, replayed above |
|---|---|---|
| **Overloads** | one member of the union per arity; overloads of the same arity merged into one, their arguments and results each the union of theirs | an arity picks alone. Of the same arity, the value does not pick: an untyped parameter goes to the `text` one, so `describe(1)` runs `describe(text)`, where TypeScript would pick `describe(int)`. The call casts, `db.param(1, 'int4')`, which the type cannot see (`Parameter<number>`) |
| **Defaults** | the trailing arguments optional: `[] \| [since: …]` | nothing: Postgres fills them |
| **`VARIADIC`** | the last argument the array: `[nums: number[] \| …]` | `VARIADIC $1`, the array one parameter; without the keyword, 22P02 |
| **`OUT`** | not an argument; one is the result, several are an object of them, each `\| null` | in `FROM` for its columns; in a select list, the record's text |
| **`INOUT`** | an argument, and the result | nothing more |
| **Polymorphic** (`anyelement`, `anyarray`, `anycompatible`, `"any"`) | `unknown`, argument and result: the type is the call's, not the catalog's | a cast on the argument, `db.param([5, 6], 'int4[]')`; untyped, 42804 |
| **Unnamed arguments** | `$1`, `$2` as their names | positional only |
| **A type the generator cannot map** | its placeholder, as a column of it | as for a column |

## 4. `fn()`'s signature and SQL, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow, under the stop point of choice 1.

| Point | Decision | SQL |
|---|---|---|
| **Shape** | `db.fn(name, args)`, the name typed `Function`, the arguments a tuple, as #56 sketched; a `SQLFragment<result>` | `db.fn('full_name', ['Ada', 'Lovelace'])`: `"full_name"($1, $2)` |
| **Name** | quoted and qualified as `sql` quotes `${'extra.transfer_totals'}` | `"extra"."transfer_totals"()` |
| **Positional, not named** | Postgres's default; named notation needs every argument named, and the corpus's 7 calls take at most one. Named calls stay `sql` | — |
| **A value** | a parameter, as everywhere in Zapatos; `db.param()` for a cast; a fragment as is | `"sum_all"(VARIADIC $1)` for the variadic array |
| **A column** | a fragment, ``sql<s.users.SQL>`${'display_name'}` ``; `parent()` only inside a `lateral`, where it has a table | `"full_name"("display_name", $1)` |
| **Casts** | none written by `fn()`: Postgres picks the overload from the SQL, and the value cannot say which one TypeScript picked | — |
| **Set-returning functions** | refused: `Function` names them, `fn()` does not take them (§ 5) | — |

## 5. Set-returning functions as the source of a `select`

**Status**: accepted (2026-11-17), by delegation.

| | S0. `sql` | S1. The shortcuts take a call as their table |
|---|---|---|
| **The caller writes** | ``sql<s.users.SQL, s.users.Selectable[]>`SELECT * FROM reports_of(${db.param(1)})` ``; in a `lateral`, `jsonb_agg(to_jsonb(r))` over it | `db.select(db.fn('reports_of', [1]), db.all, { columns: ['display_name'] })` |
| **What it changes** | nothing | every shortcut's first argument, typed `Table` today, and the `*ForTable<T>` lookups that key on it |

**Choice: S0.** The corpus has no set-returning function of its own; jawj/zapatos#58 names one. A select over a function would widen the first argument of every shortcut, the most used type of the API, for a query that `sql` writes in one line with its SQL visible (principle 3). In `extras`, a set-returning call multiplies or drops the outer rows (replayed above): the docs say to write it in `FROM` or in a `lateral`.

## What changes in the plan

- **#56's planned PRs 1 to 3** (signatures, `fn()`, set-returning functions as a source): crossed out, pointing here.
- **PR 4** ("Document fn()") becomes a docs task, with its own issue:
  - `website/raw-sql.md`, EN and FR, § Call a Postgres function: a value as a parameter, a column in a typed fragment, named notation, the result typed by hand and its two forms (`.run()` on its own, or inside a shortcut: `int8`, `timestamptz`, an `OUT` record), the cast an overload of the same arity or a polymorphic type needs, by the catalog's name, `VARIADIC` with one array, a quoted name, a set-returning function in `FROM` or in a `lateral`, never in `extras`; one line on why there is no `fn()`.
  - `website/why.md`, EN and FR, § Coming, and `README.md`'s goal: functions leave what is coming; their typed form is the fragment's result type, and later the types of raw SQL (#21).
  - `README.md`'s roadmap: "functions" leaves chapter 2's list.
  - `CHANGELOG.md`, § Changed: the docs.

## Risks

- **The corpus is two projects**, with few functions and none with arguments that matter. A project that keeps its logic in functions gets nothing new from pgcast until #21 or a revival; the docs section is its answer meanwhile.
- **The `Insertable` refuses a typed fragment** (§ Context): a fragment written ``sql<…, string>`…` `` for an `insert()` value does not compile, so the docs section keeps such a value untyped. Changing that is a change to the default output, outside this note.
- **A typo in a function's name** stays a run-time error, 42883, as in Zapatos; a test that runs the query finds it.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § `runResultTransform` (`db.sql<never, Date>` over `SELECT now()`); [jawj/zapatos#58](https://github.com/jawj/zapatos/issues/58), [jawj/zapatos#145](https://github.com/jawj/zapatos/issues/145) and `609bc94`, `git log upstream/master`; `git grep` on `v6.6.1`.
- Postgres: [Function Overloading](https://www.postgresql.org/docs/current/xfunc-overload.html), [Type Conversion: Functions](https://www.postgresql.org/docs/current/typeconv-func.html) (an `unknown` argument prefers the string category), [Calling Functions](https://www.postgresql.org/docs/current/sql-syntax-calling-funcs.html) (positional, named and mixed notation), [`VARIADIC`](https://www.postgresql.org/docs/current/xfunc-sql.html#XFUNC-SQL-VARIADIC-FUNCTIONS), [polymorphic types](https://www.postgresql.org/docs/current/extend-type-system.html#EXTEND-TYPES-POLYMORPHIC), [`pg_proc`](https://www.postgresql.org/docs/current/catalog-pg-proc.html).
- PostgREST: [`SchemaCache.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/SchemaCache.hs) (the functions' query), [`QueryBuilder.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Query/QueryBuilder.hs) (`callPlanToQuery`), [`Plan.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Plan.hs) (`findProc`), [`Error.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Error.hs) (PGRST203).
- Supabase: postgres-meta's [`test/server/typegen.ts`](https://github.com/supabase/postgres-meta/blob/master/test/server/typegen.ts) (the generated `Functions`).
- Kanel: [`makeRoutineGenerator.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/generators/makeRoutineGenerator.ts), [`makePgTsGenerator.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/generators/makePgTsGenerator.ts), [`default-metadata-generators.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/default-metadata-generators.ts); extract-pg-schema's [`extractFunction.ts`](https://github.com/kristiandupont/extract-pg-schema/blob/main/src/kinds/extractFunction.ts).
- Kysely: [`function-module.ts`](https://github.com/kysely-org/kysely/blob/master/src/query-builder/function-module.ts); kysely-codegen: [repository](https://github.com/RobinBlomberg/kysely-codegen) (no `pg_proc`).
- Notes [007](./007-related.md) (the schema export `src/db` would read, the shape of a cut) and [008](./008-domains-jsonb-validators.md).

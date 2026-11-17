# 009 — Postgres functions: signatures, `fn()` and set-returning functions

- **Status**: accepted (2026-11-17), by delegation from the owner: each choice below is decided under the philosophy, and carries its own status.
- **Scope**: feature [#56](https://github.com/AlexandreDemartin/pgcast/issues/56) and its four planned PRs.
- **In short**: **not built in the core**, because the need does not recur in the corpus. It calls a function of its own schemas 7 times in about 3,400 `sql` templates: 6 with no argument, all 7 as a column's value in an `insert()` or an `update()`, and the 6 `insert()` values cannot take a typed fragment ([#654](https://github.com/AlexandreDemartin/pgcast/issues/654)). What F0 costs: a function's result is typed by hand, against principle 1. What building would have cost: no change to the default output nor the canary (an opt-in module file can augment `zapatos/db`, § 2, G3), but a `pg_proc` reader, its mapping and its tests kept forever in the generator, and for `fn()` a public helper. What #56 keeps: a docs section on calling a function with `sql` (values, the rule Postgres follows for an overload and the cast it may need, `VARIADIC`, `OUT`, set-returning functions in `FROM` and in a `lateral`), and "functions" leaves the lists of what is coming.

## Context

What the code gives today:

- **The generator never reads `pg_proc`**, in Zapatos 6.6.1 as in pgcast (`git grep pg_proc v6.6.1 -- src`, and on master: nothing). The fixture holds each kind of function, so that a run proves they leave no trace: `full_name(first text, last text)`, `account_balance(bigint)`, `reports_of(int) RETURNS SETOF users`, `extra.transfer_totals(since timestamptz DEFAULT …) RETURNS TABLE (…)`, `split_email(address text, OUT local_part text, OUT domain text)`, `sum_all(VARIADIC int[])`, three overloads of `describe()`, `extra.search_key(text)` and a procedure (`test/fixtures/schema.sql`).
- **The `sql` template writes a call already.** `${'extra.transfer_totals'}` compiles to `"extra"."transfer_totals"`, quoted and qualified as a table name is; `db.param()` sends a value, with an optional cast; the result is typed by hand, `sql<s.users.SQL, string | null>`.
- **The generated `Insertable` takes `db.SQLFragment`**, which is `SQLFragment<any[]>`: a fragment whose result is typed and not an array, `sql<s.users.SQL, string>`, is refused as a value of `insert()` and `upsert()` (TS2769, probed), where `sql<…, string[]>` and `sql<…, any>` pass. `Updatable`, `upsert()`'s `updateValues`, `Whereable` and `extras` take it (#654).
- **Two ways for `src/db` to see generated signatures.**
  - A `zapatos/schema` export that `src/db` reads: the generator writes it even without its key, and the canary goes up, so every consumer regenerates (note [007](./007-related.md) § 1, option E).
  - The register pattern, as i18next's `CustomTypeOptions` and TanStack Router's `Register` use it: `src/db` declares an empty `export interface FunctionSignatures {}` and types `fn()` over it, and an opt-in generated **module** file augments it: `import type * as db from 'zapatos/db'; declare module 'zapatos/db' { interface FunctionSignatures { … } }`. Probed on master's fixture output: with the file, `fn('full_name', ['Ada', 'Lovelace'])` is `SQLFragment<string | null>`, and a wrong name or argument is refused; without it, the output is master's, it compiles unchanged, and `fn()` takes no name. The same block in a script file, as `schema.d.ts` is one, hides `zapatos/db` (TS2305): that is the case note 007 probed.
- **Zapatos was asked for it**: jawj/zapatos#58, "Functions and Procedures support", open since December 2020, 17 comments. Zapatos first answered that routine names in the `SQL` types "would make VS Code's autocomplete much less useful", then "it's definitely on the TODO list". Its users asked for typed wrappers of functions that hold business logic, `json` in and `json` out, or `SETOF` a table. For a `VARIADIC` function (jawj/zapatos#145), Zapatos suggested `mapWithSeparator()`, then exported it (`609bc94`).

How Postgres answers each form, replayed on Postgres 17.3 through the built runtime, on probe databases with the fixture's functions and a few more:

| Written with `sql` | Compiled | Postgres |
|---|---|---|
| ``sql`full_name(${db.param('Ada')}, ${db.param('Lovelace')})` `` | `full_name($1, $2)` | `'Ada Lovelace'` |
| ``sql`full_name(last => ${db.param('Lovelace')}, first => ${db.param('Ada')})` `` | named notation | the same |
| ``sql`full_name(${db.param(null)}, …)` ``, or `RETURNS text` giving no value | | `null`: a function's result has no `NOT NULL`; `STRICT` gives `null` on a `null` argument |
| `full_name(DEFAULT, $1)` | | 42601 `DEFAULT is not allowed in this context` |
| `bookCount($1)` for `"bookCount"` | unquoted | 42883; `` ${'bookCount'}(…) `` gives `"bookCount"($1)`, which runs |
| `extra.totals()`, its one argument `DEFAULT 0` | | runs, with the default |
| `describe($1)`, overloads on `int` and `text`, with `1` or with `'a'` | `$1` untyped, as `pg` sends every value | the `text` overload both times: `'text 1'` |
| `describe(${db.param(1, 'int4')})` | `describe(CAST($1 AS "int4"))` | `'int 1'`. The cast takes the catalog's name: `'int'` gives `"int"`, 42704 |
| `f($1)`, overloads on `int` and `bigint`, `int` and `numeric`, or `boolean` and `int` | | 42725 `function f(unknown) is not unique` |
| `f($1)`, overloads on `int` and `float8` | | the `float8` one, its category's preferred type |
| `describe($1, $2)` | | `'pair 1,2'`: another arity picks alone |
| `g($1)`, with `g(x int)` and `g(x int, y int DEFAULT 0)` | | 42725, and so does `g(CAST($1 AS "int4"))`: the one-argument call can never run; `g($1, $2)` runs the second |
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

Two projects of real usage (skill `consumer-usage`; no project named, examples invented). Functions read from each database's `pg_proc`, outside `pg_catalog` and `information_schema`, extension members apart (`pg_depend.deptype = 'e'`); calls counted in app code, migrations and tests apart, with a TypeScript AST scan, and the 7 calls read one by one.

| What | Count |
|---|---|
| functions of the projects' own schemas | **8**, in one project's database: all `plpgsql`, all `RETURNS text`, 0 or 1 argument (5 with none); no overload, default, `VARIADIC`, `OUT`, `INOUT`, polymorphic type or `SETOF`. Plus 1 trigger function; 5 functions in another database of the same project, which app code never calls; 4 `pg_temp` functions inside one migration. The other project: **none** |
| calls from app code | **7**, in 6 files of one project: 6 as a column's value in an `insert()` (2 through a helper that returns the fragment), 1 in an `update()`'s values. 6 with no argument, 1 with a column. 1 types its result by hand (`sql<…, string>`), the `update()`'s. None in `extras`, a `where`, `order`, a `lateral` or a query of its own; none through `db.raw()` or `pool.query()` |
| … what a typed result would check there | nothing: the 6 `insert()` values would be refused once typed (§ Context, #654); the `update()`'s column takes `string` already |
| calls inside the databases | one of the 8 in a generated column; an extension function in one view and in one function's body. None is TypeScript's to type |
| extension functions in a generated schema | `pg_trgm` (31) and `unaccent` (4, 2 names overloaded) in one project's `public`; `unaccent` in the other's. A generator reading `public`'s `pg_proc` writes them too, unless it leaves extension members out |
| … their calls from app code | **105**, 103 in one project and 2 in the other: 98 `unaccent()`, 7 `similarity()` or `word_similarity()`. 91 of the 103 are the argument of another call, 80 of them inside `to_tsvector()`; a home-grown helper returns the full-text query built around one, called about 70 times |
| `sql` templates in app code | about 3,400 |

## 1. Whether to build it

**Status**: accepted (2026-11-17), by delegation.

| | F0. `sql`, as today, documented | F1. Signatures only, opt-in | F2. Signatures and `fn()` | F3. A package of its own |
|---|---|---|---|---|
| **The caller writes** | ``sql<s.users.SQL, string \| null>`full_name(${'display_name'}, ${db.param('x')})` `` | the same, its result named: ``sql<s.users.SQL, db.FunctionSignatures['full_name']['result']>`…` `` | ``db.fn('full_name', [sql<s.users.SQL>`${'display_name'}`, 'x'])`` | F2's call, imported from the package |
| **What the type checks** | the columns (`${'display_name'}`); the result is the caller's | the result, from the catalog; not the name in the text, nor the arguments | the name, the arguments' number and types, the result | the same as F2 |
| **What it adds** | a docs section | in the generator, for good: a `pg_proc` query, the mapping of overloads, defaults, `VARIADIC`, `OUT`, `INOUT`, polymorphic and set-returning functions (§ 3), an opt-in module file under `--check`, a `variants` snapshot and their tests; in `src/db`, the empty interface | F1, and a public helper in `zapatos/db`, with its injection tests. No change to the default output, no canary increment (G3) | F1, and a published package (`exports`, `files`, a release: stop points) whose `fn()` reads the same augmentation: nothing in `src/db` |
| **Compile cost** (measured below) | +0 | for a project with the key on, 8 to 10 Types per signature (+100 for the fixture's 10, beside `fn()`'s 21 in the G3 prototype), +29 Instantiations; with the key off, +0 | with the key on, about 75 Instantiations per call (+625 for 8); with the key off, `fn()`'s declaration alone, +9 and +21 Types, on every project | F2's with the key on; +0 on a project without the package |
| **Corpus calls it serves** | all | 1 of 7: the `update()`, whose result it types by hand as `string`, which the catalog says is `string \| null` | 1 of 7, the `update()`; the 6 `insert()` values only once #654 is fixed, and with no argument `fn()` checks their name alone. 12 of the 103 extension calls if extension members are read, the other 91 nested in another call | as F2 |

**Measured** (`npm run bench:types`, prototypes over `test/generated`, and over `src/db` for `fn()`'s declaration, in a scratch copy, never committed). Master is 15,824 Instantiations and 7,433 Types, +1.1 % and +3.3 % on the baseline. Each prototype adds a bench file with 9 calls on the fixture's functions: 6 in `extras` of `select('users', …)` (two arguments, each overload, `VARIADIC`, `OUT`), one in `extras` of `accounts`, one in a `where` fragment, and a `SELECT * FROM extra.transfer_totals()` run on its own; every result read.

| Prototype | Instantiations | Types |
|---|---|---|
| H: the 9 calls written with `sql`, each result typed by hand (today, like for like) | 16,290 (+466 on master) | 7,566 (+133) |
| `fn()` and the empty `FunctionSignatures` declared in `zapatos/db`, no signature file (the key off), H's calls | 16,299 (+9 on H) | 7,587 (+21) |
| F1 over G3: the same, and the opt-in module file with the fixture's 8 functions (10 signatures), H's calls | 16,319 (+29) | 7,687 (+121) |
| F1 over G3, plus 43 signatures at one project's count: its 8 functions and its extensions' 35 | 16,405 (+115) | 8,039 (+473) |
| F2 over G3: the 8 `fn()` calls in place of H's, the overload picked from the arguments' types | 16,915 (+625) | 7,971 (+405) |
| F1 over G2, one interface in `zapatos/schema`, H's calls | 16,290 (+0) | 7,641 (+75) |
| F1 over G1, a namespace per function, H's calls | 16,290 (+0) | 7,652 (+86) |
| F1 over G2, plus the 43 signatures | 16,290 (+0) | 7,912 (+346) |
| F2 over G2 | 16,741 (+451) | 7,781 (+215) |
| F2 over G1 | 16,759 (+469) | 7,785 (+219) |
| F2 over G2, the signature named by the caller, `fn<s.FunctionSignatures['full_name']>('full_name', …)`, no lookup | 16,368 (+78) | 7,725 (+159) |

So a signature costs 6 to 10 Types, once, paid only by a project that turns the key on; a call that picks its overload from its arguments costs 56 (G2) to 75 (G3) Instantiations, one told its signature about 10. Under G3, `fn()`'s declaration costs every project 9 Instantiations and 21 Types, the key off. The prototypes' types check out (probed): `fn('describe', [1])` is `SQLFragment<string | null>`, an `OUT` pair is its object, and `fn('full_name', [1, 2])`, `fn('describe', [true])`, `fn('describ', [1])` and a missing argument are refused, none of them `any`; under G3 without the file, `fn('full_name', …)` is refused.

**Market standard**:

- **PostgREST** reads each function of an exposed schema (`prokind = 'f'`, no trigger), extension members included, but one it cannot call: two unnamed arguments or more, or one unnamed argument that is not `bytea`, `json`, `jsonb`, `text` or `xml` (`callable`, in the functions' query). It calls it in `FROM`, in named notation, each value cast to its argument's type, `"full_name"("first" := …::text, "last" := …::text)`, `VARIADIC` written before the variadic argument; a function of one unnamed argument, positionally (`OnePosParam`, `callPlanToQuery`). It picks an overload by the names of the arguments sent; two that take the same names are PGRST203, "Could not choose the best candidate function" (`findProc`).
- **Supabase's generator**, PostgREST's TypeScript, writes `Functions: { full_name: { Args: { first: string; last: string }; Returns: string } }`: overloads as a union, `Returns: T[]` for a set, `Record<PropertyKey, never>` for no argument, extension functions of `public` among them; `Returns` without `| null`, which no function promises.
- **Kanel** generates every routine by default (`makeRoutineGenerator('function')` and `('procedure')` in `makePgTsGenerator`): an interface `<name>_params`, every parameter neither nullable nor optional, `OUT` ones included, and `<name>_return_type`, a `RETURNS TABLE` read by splitting `pg_get_function_result()` on commas; `returnsSet` is read but not used, so `SETOF text` is `string`; overloads share one name. Kanel writes types only: no call.
- **kysely-codegen** reads no function (no `pg_proc` in its source). **Kysely**'s `fn<string>('upper', ['first_name'])` takes any name, its result type written by the caller, its arguments column references, `val()` for a value.
- **Zapatos**: jawj/zapatos#58, never built.

So three of the tools read write function types by default: PostgREST, whose API calls functions as endpoints, its generator Supabase's, and Kanel. The two query builders, Kysely and Zapatos, leave a call's types to the caller.

**Choice: F0.** Nothing is built in the core: no signatures, no `fn()`. #56's planned PRs 1 to 3 are crossed out, and 4 becomes a docs section (§ What changes in the plan).

- **The written rule decides.** "A need is worth an API if it is general to Postgres (a pattern every application meets) and if it recurs in the corpus" (skill `consumer-usage`). Calling a function is general to Postgres; it does not recur in the corpus. Its 7 calls are column values of an `insert()` or an `update()`, 6 with no argument, so a signature would check a name that Postgres refuses on the first run with 42883, `function … does not exist`, naming it; and the 6 `insert()` values cannot take a typed fragment today (#654). Its 105 extension calls sit mostly inside `to_tsvector()` and full-text helpers. The other project has no function of its own.
- **What F0 costs principle 1.** A function's result is typed by hand, ``sql<s.users.SQL, string | null>`…` ``, not derived from the catalog. The corpus does it once, and writes `string` where the catalog gives no `NOT NULL`. The docs section (#652) gives the rule, always `| null`; that is the whole of the price at the corpus's one typed call.
- **What F1 would have cost.** Nothing to a project that leaves the key off, and no change to the default output nor the canary: G3 is a separate file. But the generator would keep for good a `pg_proc` reader and its mapping, where Postgres's own rules leave holes (§ 3: overloads of one arity it may refuse, an arity a `DEFAULT` makes unreachable, `VARIADIC`, polymorphic types), a new file under `--check`, a `variants` snapshot and their tests: a feature the size of `domainsTypedAsUnions`, for a result that a caller would then name, `db.FunctionSignatures['full_name']['result']`, rather than write, `string | null`.
- **What F2 would have cost.** F1, and a public helper kept forever with its injection tests, whose declaration costs every project 9 Instantiations and 21 Types, the key off, and 75 Instantiations a call, the key on. It checks the name and the arguments; the corpus passes at most one. It cannot write `VARIADIC`, as it reads nothing at run time, nor the cast an overload needs.
- **The market types functions where they are the call.** PostgREST exposes each function as an endpoint, and Supabase's types follow it; Kanel declares parameters and results with no call to use them. A query builder calls a function as one expression in a query, which `sql` writes as Postgres reads it: Kysely leaves its type to the caller, as Zapatos does.
- **Small is beautiful**: what the generator gains it keeps; here it would serve one call in 3,400 templates.
- **Not a reason**: the types of raw SQL ([#21](https://github.com/AlexandreDemartin/pgcast/issues/21)) scope first "`sql` whose text is entirely static, since queries are composed at run time". A static query that calls a function would get its result's type from Postgres there; a call composed into a shortcut, as all 7 of the corpus's are, is outside that scope. #21 has no milestone and a very high risk.
- **For a revival**: a project that calls functions with arguments, from `extras`, a `where` or a query of its own, as jawj/zapatos#58 describes; #654 first if the calls are `insert()` values. Then F2 over G3, opt-in, as § 2 to § 4 write it, with no change to the default output: it comes back as a revision of this note.

## 2. The generated output, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow. Nothing below is built while choice 1 stands.

| | G1. A namespace per function, in its schema's | G2. One interface in `zapatos/schema`, keyed by name | G3. One interface in `zapatos/db`, augmented by an opt-in module file |
|---|---|---|---|
| **Generated** | `export namespace functions { export namespace full_name { export type Function = 'full_name'; export type Signature = { … } } … }` in each schema, then `SignatureForFunction<F>`, a lookup as `SelectableForTable<T>` is | in `schema.d.ts`'s global part: `export interface FunctionSignatures { "full_name": { args: […]; result: string \| null; … }; "extra.transfer_totals": …; }`, `export type Function = keyof FunctionSignatures` | `zapatos/functions.d.ts`, only with the key: `import type * as db from 'zapatos/db'; declare module 'zapatos/db' { interface FunctionSignatures { "full_name": { … }; … } }`, over `export interface FunctionSignatures {}` in `src/db` |
| **A name that is no TypeScript identifier** | `tsIdentifier()`, and two names that it makes one (#42) | a string key, as written | a string key, as written |
| **Beside a table** | the namespace `functions` sits with the tables, in the unprefixed schema, and merges with a table of that name | apart | apart, in its own file |
| **A `fn()` in `src/db` reading it** | a `zapatos/schema` export: the default output and the canary change (note 007 § 1) | the same | the empty interface: the default output is master's, and the canary stays |
| **Compile cost** (measured above) | +86 Types; +469 Instantiations for the 8 calls | +75 Types; +451 Instantiations | +121 Types (21 of them `fn()`'s declaration, paid with the key off too); +625 Instantiations |

**Choice for a revival: G3**, under `functionSignatures: true` (`OptionalConfig`, read `?? false`); off, the files are master's.

- **G3 over G2**: G2 is cheaper by about 170 Instantiations for 8 calls, but a `fn()` over it needs a `zapatos/schema` export that every schema declares, so the default output and the canary change; F1 alone would serve over either, and G3 keeps one shape for both.
- **The file** is a module, never a script: declared from `schema.d.ts`, a script, the same block hides `zapatos/db` (TS2305). Under `moduleNames: 'pgcast'` it augments the module name the output imports; that case is replayed in the revival's PR, as only `zapatos/db` was probed.
- **Keys** are the function's name as `Table` names a table: `'full_name'` in an unprefixed schema, `'extra.transfer_totals'` in a prefixed one.
- **Read**: `prokind = 'f'`, the generated schemas only, trigger and event-trigger functions left out, extension members left out (`pg_depend.deptype = 'e'`): they come with an extension's version, not from the schema, and the corpus's 35 would cost about 300 Types for 12 calls a helper could reach. Procedures and user-defined aggregates are out, as #56 says. One query per run, sorted by schema, name and identity arguments (`pg_get_function_identity_arguments()`).
- **Arguments** take an `Insertable` column's value of their type, without `db.DefaultType` (42601 in a call), with `null` (any function takes one) and `db.ParentColumn`: `string | db.Parameter<string> | db.SQLFragment | db.ParentColumn | null`. A tuple, each element named after its argument: `[first: …, last: …]`.
- **Three result forms**, as a call's value differs by where it runs (replayed above):
  - `result`, inside a shortcut (`extras`, a `lateral`, a `where`), where its value goes through `jsonb_build_object()`: the `JSONSelectable` form, `int8` a `number`, `timestamptz` a `db.TimestampTzString`, two `OUT` an object; this is what `fn()` returns;
  - `selectable`, for a call run on its own in a select list, ``sql`SELECT full_name(…)` ``, as `pg` parses it: the `Selectable` form, `int8` a `db.Int8String`, `timestamptz` a `Date`, two `OUT` the record's text, a `string`;
  - `row`, for a call in `FROM`: the `Selectable` form of each row, for `OUT`, `RETURNS TABLE` and `SETOF`, `never` for a scalar function, the table's `Selectable` for `SETOF users`, its columns each `| null` otherwise, as Postgres says nothing of their nullability.
  
  Each is `| null`: no function promises a value.
- **`COMMENT ON FUNCTION`** becomes the signature's JSDoc, through `jsdocText()`.
- **Class** ([decision 003](./003-fixes-and-deprecation.md)): opt-in without switch-over; nothing to deprecate.

## 3. Overloads, defaults, `VARIADIC`, `OUT`, `INOUT` and polymorphic types, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow.

Postgres's rule for an untyped parameter, an `unknown` argument as `pg` sends every value (Type Conversion § Functions, replayed above): among the candidates of the call's arity, one of the string category wins; else one of the category's preferred type (`float8` beside `int`); else 42725, `function … is not unique` (`int` and `bigint`, `int` and `numeric`, `boolean` and `int`). A cast picks exactly, unless a `DEFAULT` makes two candidates of one arity: then neither can be called at it.

| Case | Typed as | What a call must write |
|---|---|---|
| **Overloads of different arities** | each a member of the union under the name | nothing: the arity picks |
| **Overloads of one arity** | left out of the signatures, with a note naming them: the type cannot say which one Postgres runs, nor whether it runs one | `sql`, with a cast by the catalog's name, `db.param(1, 'int4')` |
| **An arity a `DEFAULT` makes ambiguous** | left out at that arity: `g(x int)` beside `g(x int, y int DEFAULT 0)` keeps only `g`'s two-argument form | nothing can run it: 42725, cast or not |
| **Defaults** | the trailing arguments optional: `[] \| [since: …]` | nothing: Postgres fills them |
| **`VARIADIC`** | the last argument the array: `[nums: number[] \| …]`, for a call written with `sql`; `fn()` does not take the function (§ 4) | `VARIADIC $1`, the array one parameter; without the keyword, 22P02 |
| **`OUT`** | not an argument; one is the result, several are an object of them, each `\| null` (§ 2's three forms) | in `FROM` for its columns; in a select list, the record's text |
| **`INOUT`** | an argument, and the result | nothing more |
| **Polymorphic** (`anyelement`, `anyarray`, `anycompatible`, `"any"`) | `unknown`, argument and result: the type is the call's, not the catalog's | a cast on the argument, `db.param([5, 6], 'int4[]')`; untyped, 42804 |
| **Unnamed arguments** | `$1`, `$2` as their names | positional only |
| **A type the generator cannot map** | its placeholder, as a column of it | as for a column |

## 4. `fn()`'s signature and SQL, for a revival

**Status**: accepted (2026-11-17), by delegation, as the design a revival would follow.

| Point | Decision | SQL |
|---|---|---|
| **Shape** | `db.fn(name, args)`, the name a key of `db.FunctionSignatures`, the arguments a tuple, as #56 sketched; a `SQLFragment` of the signature's `result` | `db.fn('full_name', ['Ada', 'Lovelace'])`: `"full_name"($1, $2)` |
| **Name** | quoted and qualified as `sql` quotes `${'extra.transfer_totals'}`; the name is the SQL, so `fn()` reads nothing at run time | `"extra"."transfer_totals"()` |
| **Positional, not named** | Postgres's default; named notation needs every argument named, and the corpus's 7 calls take at most one. Named calls stay `sql` | — |
| **A value** | a parameter, as everywhere in Zapatos; `db.param()` for a cast; a fragment as is | `"full_name"($1, $2)` |
| **A column** | a fragment, ``sql<s.users.SQL>`${'display_name'}` ``; `parent()` only inside a `lateral`, where it has a table | `"full_name"("display_name", $1)` |
| **Casts** | none written by `fn()`: Postgres picks among different arities alone, and same-arity overloads are not in the signatures (§ 3) | — |
| **`VARIADIC` functions** | refused by the type: `VARIADIC $1` needs the keyword before the variadic argument, which a helper that reads nothing at run time cannot place. They stay `sql` | — |
| **Set-returning functions** | refused by the type (§ 5) | — |

## 5. Set-returning functions as the source of a `select`

**Status**: accepted (2026-11-17), by delegation.

| | S0. `sql` | S1. The shortcuts take a call as their table |
|---|---|---|
| **The caller writes** | ``sql<s.users.SQL, s.users.Selectable[]>`SELECT * FROM reports_of(${db.param(1)})` ``; in a `lateral`, `jsonb_agg(to_jsonb(r))` over it | `db.select(db.fn('reports_of', [1]), db.all, { columns: ['display_name'] })` |
| **What it changes** | nothing | every shortcut's first argument, typed `Table` today, and the `*ForTable<T>` lookups that key on it |

**Choice: S0.** The corpus has no set-returning function of its own; jawj/zapatos#58 names one. A select over a function would widen the first argument of every shortcut, the most used type of the API, for a query that `sql` writes in one line with its SQL visible (principle 3). In `extras`, a set-returning call multiplies or drops the outer rows (replayed above): the docs say to write it in `FROM` or in a `lateral`.

## What changes in the plan

- **#56's planned PRs 1 to 3** (signatures, `fn()`, set-returning functions as a source): crossed out, pointing here.
- **PR 4** ("Document fn()") becomes a docs task, [#652](https://github.com/AlexandreDemartin/pgcast/issues/652):
  - `website/raw-sql.md`, EN and FR, § Call a Postgres function: a value as a parameter, a column in a typed fragment, named notation, the result typed by hand, always `| null`, and its two forms (run on its own, or inside a shortcut: `int8`, `timestamptz`, an `OUT` record), an `insert()` value left untyped (#654), Postgres's rule for an overload and the cast by the catalog's name, an arity a `DEFAULT` makes ambiguous, a polymorphic argument's cast, `VARIADIC` with one array, a quoted name, a set-returning function in `FROM` or in a `lateral`, never in `extras`; one line on why there is no `fn()`.
  - `website/why.md`, EN and FR, § Coming, and `README.md`'s goal: functions leave what is coming; a call is a `sql` fragment whose result type is written by hand.
  - `README.md`'s roadmap: "functions" leaves chapter 2's list.
  - `CHANGELOG.md`, § Changed: the docs.

## Risks

- **The corpus is two projects**, with few functions and none with arguments that matter. A project that keeps its logic in functions gets nothing new from pgcast until a revival; the docs section is its answer meanwhile.
- **The `Insertable` refuses a typed fragment** whose result is not an array ([#654](https://github.com/AlexandreDemartin/pgcast/issues/654)): a fragment written ``sql<…, string>`…` `` for an `insert()` value does not compile, so the docs section keeps such a value untyped.
- **A typo in a function's name** stays a run-time error, 42883, as in Zapatos; a test that runs the query finds it.

## Sources

- Zapatos: [docs](https://jawj.github.io/zapatos/) § `runResultTransform` (`db.sql<never, Date>` over `SELECT now()`); [jawj/zapatos#58](https://github.com/jawj/zapatos/issues/58), [jawj/zapatos#145](https://github.com/jawj/zapatos/issues/145) and `609bc94`, `git log upstream/master`; `git grep` on `v6.6.1`.
- Postgres: [Function Overloading](https://www.postgresql.org/docs/current/xfunc-overload.html), [Type Conversion: Functions](https://www.postgresql.org/docs/current/typeconv-func.html) (an `unknown` argument: the string category, then the preferred type), [Calling Functions](https://www.postgresql.org/docs/current/sql-syntax-calling-funcs.html) (positional, named and mixed notation), [`VARIADIC`](https://www.postgresql.org/docs/current/xfunc-sql.html#XFUNC-SQL-VARIADIC-FUNCTIONS), [polymorphic types](https://www.postgresql.org/docs/current/extend-type-system.html#EXTEND-TYPES-POLYMORPHIC), [`pg_proc`](https://www.postgresql.org/docs/current/catalog-pg-proc.html).
- PostgREST: [`SchemaCache.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/SchemaCache.hs) (the functions' query, `callable`), [`QueryBuilder.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Query/QueryBuilder.hs) (`callPlanToQuery`, `OnePosParam`), [`Plan.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Plan.hs) (`findProc`), [`Error.hs`](https://github.com/PostgREST/postgrest/blob/main/src/library/PostgREST/Error.hs) (PGRST203).
- Supabase: postgres-meta's [`test/server/typegen.ts`](https://github.com/supabase/postgres-meta/blob/master/test/server/typegen.ts) (the generated `Functions`).
- Kanel: [`makeRoutineGenerator.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/generators/makeRoutineGenerator.ts), [`makePgTsGenerator.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/generators/makePgTsGenerator.ts), [`default-metadata-generators.ts`](https://github.com/kristiandupont/kanel/blob/main/packages/kanel/src/default-metadata-generators.ts); extract-pg-schema's [`extractFunction.ts`](https://github.com/kristiandupont/extract-pg-schema/blob/main/src/kinds/extractFunction.ts).
- Kysely: [`function-module.ts`](https://github.com/kysely-org/kysely/blob/master/src/query-builder/function-module.ts); kysely-codegen: [repository](https://github.com/RobinBlomberg/kysely-codegen) (no `pg_proc`).
- The register pattern: i18next's `CustomTypeOptions`, TanStack Router's `Register`; probed here on master's fixture output, with and without the file.
- Notes [007](./007-related.md) (the schema export `src/db` would read, the shape of a cut) and [008](./008-domains-jsonb-validators.md).

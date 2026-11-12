# Changelog

All notable changes to pgcast are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

pgcast is forked from [Zapatos 6.6.1](https://github.com/jawj/zapatos/tree/v6.6.1); upstream history lives in that repository.

## [Unreleased]

### Added
- The `upsertRequiresSameKeys` config option (`db.setConfig({ upsertRequiresSameKeys: true })`, off by default, optional in `Config`): a multi-row `upsert()` without `updateColumns`, where a key missing from some row is still set from `EXCLUDED`, throws before any query ("rows have different keys: pass updateColumns, or give every row the same keys"), instead of overwriting the existing value with its `DEFAULT`. A key of `updateValues` or a column of an array or string `conflictTarget` does not count (new rows without their serial `id`, upserted on `'id'`, pass); with `constraint()`, every key counts. Rows with the same keys, one row, and any `updateColumns` compile as before.
- The `undefinedMeansMissing` config option (`db.setConfig({ undefinedMeansMissing: true })`, off by default, optional in `Config`): an `undefined` value acts as a missing key. `insert()` sends `DEFAULT` for it (`VALUES ($1, DEFAULT)`); `update()` leaves its column out (`SET ("name") = ROW($1)`), and throws "nothing to update…" if no key is left; `upsert()` leaves its key out, so one row does not insert that column, nor update it unless `updateColumns` names it (then it is still set from `EXCLUDED` and an existing row takes the column `DEFAULT`, as for a missing key), and in several rows its cell takes `DEFAULT` and counts as missing for `upsertRequiresSameKeys`. An `undefined` in a `Whereable` or in `updateValues` is unchanged.

### Deprecated
- A multi-row `upsert()` without `updateColumns`, where a key missing from some row is still set from `EXCLUDED`: it is inserted as `DEFAULT`, then overwrites the existing value on conflict. It still runs, with the same SQL, and emits a `DeprecationWarning` (`PGCAST_DEP001`) once per process. `upsertRequiresSameKeys` will be the default in 7.0.
- An `undefined` value in `insert()`, `update()` or `upsert()` values, sent as `NULL`: a `NOT NULL DEFAULT` column fails, and `update()` erases the column instead of leaving it. It still runs, with the same SQL, and emits a `DeprecationWarning` (`PGCAST_DEP002`) once per process. `undefinedMeansMissing` will be the default in 7.0.

### Fixed
- `not()` puts its condition in parentheses: `` not(sql`a OR b`) `` compiles to `(NOT (a OR b))`; it was `(NOT a OR b)`, which Postgres reads `(NOT a) OR b`. Only a condition with a bare `AND` or `OR` at its top level now matches other rows: a `sql` fragment such as `` sql`${self} = 1 OR ${self} = 2` `` (or an array of fragments), alone, inside `and()` / `or()` or under another `not()`. Any other condition (`eq`, `isNull`, `isIn`, `between`, `like`, `and()`, `or()`, a `Parameter`, a `Whereable`) gains one pair of parentheses in its text and matches the same rows.
- `update()` with an `Updatable` that has no keys (`update('authors', {}, …)`) throws as it builds the query, before anything reaches Postgres: "nothing to update: an Updatable needs at least one column". It compiled to `SET () = ROW()`, which Postgres refused (42601), so no call that ran stops; the error now comes from `update()` itself, not from `.run()`. A key whose value is `undefined` still counts, and sets the column to `NULL` as before.

## [6.6.2] - 2026-11-12

### Changed
- Package renamed to `pgcast`. The CLI is available as both `pgcast` and `zapatos`. Module names (`zapatos/db`, `zapatos/schema`, `zapatos/custom`) are unchanged.
- Toolchain: TypeScript 5.9, ESLint 9 (native flat config), typescript-eslint 8, `@stylistic/eslint-plugin`. The toolchain change alone leaves the build output (`dist/`, `db.mjs`, `generate.mjs`) byte-identical to 6.6.1; the fixes below change `dist/`.

### Removed
- The noisy `postinstall` message.
- The `postversion` script that pushed and published to npm automatically.

### Added
- `prepack` builds before any `npm pack` / `npm publish`.
- Vitest harness (`test`, `test:watch`, `test:types`) and a `typecheck` script.
- `AGENTS.md` (+ `CLAUDE.md` symlink) and design decision notes under `docs/`. The roadmap lives in GitHub issues: one epic per chapter, one sub-issue per step, closed by its pull request.
- CI matrix: Node 20, 22 and latest LTS; draft PRs run no job.
- Agent workflow: `.agents/skills/`, `.claude/agents/` (`builder`, `branch-reviewer`, `chores`), `.claude/hooks/guard.mjs`, `npm run check:agents`, `docs/LEARNINGS.md`.
- Step workflow, drawn in `docs/WORKFLOW.md`: an issue template with **Files** and **Risk**, a plan comment before code, **Proofs** in each PR, review comments in Conventional Comments, a merge gate by risk (Ship / Show / Ask) and squash merges. `npm run check:agents` reports the size of each skill and agent.
- Integration test harness: reference fixture `test/fixtures/schema.sql` (Postgres 14+), a template database built once per run, a fresh database per test file and a `ROLLBACK` per test (`useTestDatabase()`, `test/helpers/db.ts`). Needs `TEST_DATABASE_URL` (the environment, else `src/.env`); tests only create and drop `pgcast_test_*` databases.
- CI matrix: Postgres 14, 16 and 18 service containers × Node 20, 22 and latest LTS.
- Codegen characterization (`test/integration/codegen.test.ts`): the output for the fixture is frozen per configuration in `test/__snapshots__/codegen/`; the main configuration's files, as `generate()` writes them, are committed in `test/generated/` and compiled by `npm run typecheck` against the declarations of `src/db`.
- Injection characterization: the compiled text of every entry point of `core.ts` and `shortcuts.ts` that writes a caller's string into SQL, under hostile inputs (`test/unit/injection.test.ts`), and what those inputs achieve against Postgres, with and without parameters (`test/integration/injection.test.ts`). Nothing is fixed yet.
- Runtime characterization: the `text` + `values` of each `core.ts` branch, shortcut and condition, frozen by inline snapshots (`test/unit/`), then run against the fixture (`test/integration/`), surprises included (`// characterization:` comments); `transaction()` commit, rollback, pass-through, retries and listener messages. The harness exposes the file's pool for code that commits (`useTestDatabase().pool`).
- Type tests (`test/types/`, `npm run test:types`): the public types, positive and negative, on the fixture's generated schema and the emitted declarations of `src/db`, as a consumer compiles them; `test:types` emits those declarations first. Every codegen variant but `edge` is compiled with its custom types, and orphan snapshot files are reported.
- Type-checking cost: `npm run bench:types` compiles `bench/`, a few dozen typed queries on the fixture's generated schema (nested `lateral`, `columns`, `extras`, writes with `returning`, conditions, `sql<…>`), and fails when `Instantiations` or `Types`, net of TypeScript's libs and `@types`, grow by more than 20 % on `bench/baseline.json` (measured on the 6.6.1 code); also fails when they drop by more than 5 % or when the TypeScript version differs, so that the baseline follows (`-- --update`). Runs in CI as its own job, without Postgres.

### Security
- `lock.for` and `lock.wait` of `select()`, the options of `truncate()` and the isolation level of `transaction()` are checked at run time, as `order.direction` already was.
  - A value the type refuses now throws before any query, instead of being written raw into the SQL (where `lock.for` could run a second statement).
  - The SQL for valid values is unchanged, as it is for an `undefined` or `null` that gets past the type without `strictNullChecks` (`lock.wait`, `truncate()` options).
- The `aggregate` of `select()`, its fifth argument, must now be a function name as Postgres lexes it.
  - Plain, quoted or `U&` quoted, in up to three dotted parts (`sum`, `my$agg`, `my_schema."My agg"`, `my_db.my_schema.my_agg`), with or without spaces around it and its dots.
  - Anything else, `U&"…" UESCAPE '…'` included, throws before any query, instead of being written raw into the SQL (where it could run a second statement).
  - The SQL of `count()`, `sum()`, `avg()`, `min()`, `max()` and of a valid name is unchanged, byte for byte, as it is for `null`; outside `SelectResultMode.Numeric` the argument is still ignored.
- The type of `param(x, cast)` can no longer close its quotes.
  - A type that is well-formed once wrapped in `"` (non-empty quoted identifiers joined by `.`, with or without whitespace around it, such as `pg_catalog"."int4`) is written as is, as before: `CAST($1 AS "pg_catalog"."int4")`.
  - Any other is quoted as one identifier, with any `"` doubled (as `quote_ident` does): `param(1, 'int4") || (SELECT secret FROM t) || ("int4')` now compiles to `CAST($1 AS "int4"") || (SELECT secret FROM t) || (""int4")`, a type that does not exist (42704), instead of a cast that reads another expression.
  - A type without `"` compiles as before.
  - The only casts that ran under 6.6.1 and no longer do have something other than whitespace between their quoted parts: an expression, which is the hole this closes, or a comment (`pg_catalog"/**/."int4`), now a type that does not exist (42704).
- A table or column name given as a string (`Table`, `Column`, a `Whereable` key, `cols`, `parent()`, `columns`, `order.by`, …) can no longer close its quotes: any `"` in it is doubled, as `quote_ident` does, and it is still split on `.`.
  - A `Whereable` key `a" = "a" OR TRUE OR "a` now compiles to `WHERE ("a"" = ""a"" OR TRUE OR ""a" = $1)`, a column that does not exist (42703), instead of `WHERE ("a" = "a" OR TRUE OR "a" = $1)`, which returned every row; without parameters, such a name could run a second statement.
  - A name without `"` compiles as before, as does one that 6.6.1 already compiled to quoted names only (a hand-escaped `a""b`, for the column `a"b`) and one that is already a well-formed quoted name (below).
  - The cost: a real column named `a""b`, which the generated `Column` type spells `'a""b'`, still compiles to `"a""b"`, the column `a"b`, as under 6.6.1.
  - The only names that ran under 6.6.1 and no longer do close their quotes to splice SQL around them: an alias (`id" AS "x`), a table alias (`users" "u`), a cast (`id"::"text`), a sort or a second item (`id" DESC, "name`), a collation (`display_name" COLLATE "C`), an expression (`display_name" || "email`) or a comment (`users"/**/."id`), each now a column or table that does not exist (42703, 42P01).
  - The generated `Table` and `Column` types, unions of literal names, already refused all of them; write those in a `sql` template, with only the name interpolated.
- The `lateral` keys of `select()` (and of `selectOne()`, `count()`, …), its `alias` and its table name can no longer close their quotes where they become the aliases `"lateral_…"` and `"sq_…"`.
  - Each is one identifier there, any `"` doubled as `quote_ident` does, not split on `.`.
  - An `alias` `u"; DROP TABLE users; --` now ends `AS "sq_u""; DROP TABLE users; --"`, one alias, as it is everywhere else in the query; with the fix above alone, it ended `AS "sq_u"; DROP TABLE users; --"` and, without parameters, ran a second statement.
  - A name without `"` compiles as before, as does one that 6.6.1 already wrote as one quoted name (`a""b`).
  - Replayed in their 6.6.1 form, no key, alias or table name that returned rows under 6.6.1 stops, but one that spliced SQL around `"lateral_…"` or `"sq_…"` and still ran, with parameters too, now runs as one name, with a different result:
    - Before this fix, a lateral key could read other tables: `selectOne('users', { id: 1 }, { columns: ['id'], lateral: { [key]: count(…) } })`, with the key `x" || ') AS result FROM "users" LEFT JOIN LATERAL (SELECT (SELECT string_agg(email::text, chr(44)) FROM users) AS result) AS "lateral_x`, opened a string literal in one `"lateral_…"` and closed it in the other, and returned every user's email under the key; it now returns the count.
    - The `alias` `x" ("result") GROUP BY "result`, with `columns: ['email']`, returned one user, and now returns them all.
  - A key or alias with a lone `"` (`a"b`) was a syntax error under 6.6.1 (42601), and now runs; `select()` also reaches a table whose name has a `"` (`'my"table'`).
  - The cost, as for a string identifier: `a""b` reads as a hand-escaped `a"b`, so the lateral keys `a"b` and `a""b` given together get the same alias, which Postgres refuses (42712).
- A string that starts and ends with `"` is written as is only if it is already a well-formed name as Postgres lexes it; any other is quoted like any other name (above).
  - Well-formed: a quoted identifier, then any quoted, `U&` quoted or unquoted ones, each after a `.`, with or without whitespace around it (`"a"`, `"a"."b"`, `"a""b"`, `"a.b"`, `"public".users."display_name"`, `"users".U&"display_name"`), the parts the `aggregate` of `select()` accepts.
  - 6.6.1 wrote as is anything that started and ended with `"`, even a lone `"`: without parameters, the column `"display_name" FROM users; DROP TABLE users; SELECT "display_name"` ran a second statement, and now compiles to `"""display_name"" FROM users; DROP TABLE users; SELECT ""display_name"""`, a column that does not exist (42703).
  - `"; DROP TABLE t; --"` is one quoted name, the column `; DROP TABLE t; --`, and is still written as is.
  - Replayed against Postgres, the only such strings that ran under 6.6.1 and no longer do close their quotes to splice SQL around them: a statement (above) or a clause (`"display_name" FROM "users" UNION SELECT "display_name"`), an alias (`"display_name" AS "x"`), a table alias (`"users" "u"`), a cast (`"display_name"::"text"`), a sort or a second item (`"display_name" DESC, "email"`, `"display_name", "email"`, `"users", "accounts"`), a collation (`"display_name" COLLATE "C"`), an expression (`"display_name" || "email"`, `UESCAPE` clauses included), a join (`"users" NATURAL JOIN "accounts"`) or a comment between the parts (`"users"/**/."display_name"`), each now a column or table that does not exist (42703, 42P01).
  - Strings that were a syntax error under 6.6.1 now name something that does not exist: `"` and `""` the column `"`, `"a"b"` the column `"a"b"`; as the `alias` of `select()`, they now run as one alias, as does `"u" AS "v"`.
- A plain value in the `updateValues` of `upsert()` is now sent as a parameter, as its type and `update()` already said.
  - `{ mood: 'happy' }` compiles to `DO UPDATE SET ("mood") = ROW($n)`, instead of `ROW("happy")`, an identifier.
  - Under 6.6.1, such a string could close its quotes: `xmin" || (SELECT string_agg(email::text, ',') FROM users) || "xmin` wrote every user's email into the column.
  - Under 6.6.1, a number, a `bigint` or a boolean threw "Alien object", `null` a `TypeError`, an object or a class instance (a `Date`, a `Buffer`, a custom type with `toPostgres()`) became a `WHERE`-style condition of its keys (`TRUE` without keys), and an array its items one after the other (`['a', 'b']` gave the identifier `"a""b"`, `[1, 2]` threw, `[]` gave `ROW()`, a syntax error): each is now a parameter, with the same JSON casts as in `update()`.
  - A value that holds a `sql`, `param()`, `raw()`, `cols()`, `vals()` or `parent()` object, `Default` or `self`, at any depth of its arrays and plain objects, compiles as before, byte for byte: ``[db.sql`upper(EXCLUDED.name)`]``, ``{ 'users.name': db.conditions.like('B%') }``, or what `mapWithSeparator()` returns when it holds a fragment (a `sql` separator, say) or a `param()`; so a string beside a fragment in an array is still an identifier.
  - What `mapWithSeparator()` returns for one string, or for none, is a plain array, now a parameter.
  - A function or the global object, alone or in an array, still throws.
  - Replayed against Postgres on a text column, a bare column name never ran (`ROW("display_name")` is ambiguous between the existing row and `EXCLUDED`, 42702), but these did, and are now stored as data:
    - a qualified column (`'users.display_name'`, `'public.users.display_name'`, `'excluded.display_name'`), a whole row (`'users'`, `'excluded'`) or a system column (`'xmin'`, `'ctid'`), which read that column as text;
    - an object with no own enumerable keys (`{}`, a `Date`, an empty `Buffer`, a `Map`, a `Set`), stored as `true`;
    - an object or a class instance whose keys all name such a column (`{ 'users.display_name': 'Bob' }`, `{ xmin: '1' }`), stored as `true` or `false`;
    - a class instance that holds a fragment (``new (class { x = db.sql`'Bobby'` })()``), which stored the fragment's result;
    - or an array of one of them, what `mapWithSeparator()` returns for one string included.
  - To keep the 6.6.1 result, put the value in a fragment: any value other than `undefined` (which still means the key is absent) compiles inside ``db.sql`${value}` `` byte for byte as it did in `updateValues` under 6.6.1, the name fixes above aside, as ``{ display_name: db.sql`${'users.display_name'}` }`` does.

# Changelog

All notable changes to pgcast are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

pgcast is forked from [Zapatos 6.6.1](https://github.com/jawj/zapatos/tree/v6.6.1); upstream history lives in that repository.

## [Unreleased]

### Changed
- Package renamed to `pgcast`. The CLI is available as both `pgcast` and `zapatos`. Module names (`zapatos/db`, `zapatos/schema`, `zapatos/custom`) are unchanged.
- Toolchain: TypeScript 5.9, ESLint 9 (native flat config), typescript-eslint 8, `@stylistic/eslint-plugin`. The build output (`dist/`, `db.mjs`, `generate.mjs`) is byte-identical to 6.6.1.

### Removed
- The noisy `postinstall` message.
- The `postversion` script that pushed and published to npm automatically.

### Added
- `prepack` builds before any `npm pack` / `npm publish`.
- Vitest harness (`test`, `test:watch`, `test:types`) and a `typecheck` script.
- `AGENTS.md` (+ `CLAUDE.md` symlink) and design decision notes under `docs/`. The roadmap lives in GitHub issues: one epic per chapter, one sub-issue per step, closed by its pull request.
- CI matrix: Node 20, 22 and latest LTS; draft PRs run no job.
- Agent workflow: `.agents/skills/`, `.claude/agents/` (`builder`, `branch-reviewer`, `chores`), `.claude/hooks/guard.mjs`, `npm run check:agents`, `docs/APPRENTISSAGES.md`.
- Integration test harness: reference fixture `test/fixtures/schema.sql` (Postgres 14+), a template database built once per run, a fresh database per test file and a `ROLLBACK` per test (`useTestDatabase()`, `test/helpers/db.ts`). Needs `TEST_DATABASE_URL` (the environment, else `src/.env`); tests only create and drop `pgcast_test_*` databases.
- CI matrix: Postgres 14, 16 and 18 service containers × Node 20, 22 and latest LTS.
- Codegen characterization (`test/integration/codegen.test.ts`): the output for the fixture is frozen per configuration in `test/__snapshots__/codegen/`; the main configuration's files, as `generate()` writes them, are committed in `test/generated/` and compiled by `npm run typecheck` against the declarations of `src/db`.
- Injection characterization: the compiled text of every entry point of `core.ts` and `shortcuts.ts` that writes a caller's string into SQL, under hostile inputs (`test/unit/injection.test.ts`), and what those inputs achieve against Postgres, with and without parameters (`test/integration/injection.test.ts`). Nothing is fixed yet.
- Runtime characterization: the `text` + `values` of each `core.ts` branch, shortcut and condition, frozen by inline snapshots (`test/unit/`), then run against the fixture (`test/integration/`), surprises included (`// characterization:` comments); `transaction()` commit, rollback, pass-through, retries and listener messages. The harness exposes the file's pool for code that commits (`useTestDatabase().pool`).
- Type tests (`test/types/`, `npm run test:types`): the public types, positive and negative, on the fixture's generated schema and the emitted declarations of `src/db`, as a consumer compiles them; `test:types` emits those declarations first. Every codegen variant but `edge` is compiled with its custom types, and orphan snapshot files are reported.
- Type-checking cost: `npm run bench:types` compiles `bench/`, a few dozen typed queries on the fixture's generated schema (nested `lateral`, `columns`, `extras`, writes with `returning`, conditions, `sql<…>`), and fails when `Instantiations` or `Types`, net of TypeScript's libs and `@types`, grow by more than 20 % on `bench/baseline.json` (measured on the 6.6.1 code); also fails when they drop by more than 5 % or when the TypeScript version differs, so that the baseline follows (`-- --update`). Runs in CI as its own job, without Postgres.

### Security
- `lock.for` and `lock.wait` of `select()`, the options of `truncate()` and the isolation level of `transaction()` are checked at run time, as `order.direction` already was: a value the type refuses now throws before any query, instead of being written raw into the SQL (where `lock.for` could run a second statement). The SQL for valid values is unchanged, as it is for an `undefined` or `null` that gets past the type without `strictNullChecks` (`lock.wait`, `truncate()` options).
- The `aggregate` of `select()`, its fifth argument, must now be a function name as Postgres lexes it, plain, quoted or `U&` quoted, in up to three dotted parts (`sum`, `my$agg`, `my_schema."My agg"`, `my_db.my_schema.my_agg`), with or without spaces around it and its dots: anything else, `U&"…" UESCAPE '…'` included, throws before any query, instead of being written raw into the SQL (where it could run a second statement). The SQL of `count()`, `sum()`, `avg()`, `min()`, `max()` and of a valid name is unchanged, byte for byte, as it is for `null`; outside `SelectResultMode.Numeric` the argument is still ignored.
- The type of `param(x, cast)` is quoted as one identifier, with any `"` doubled (as `quote_ident` does): `param(1, 'int4") || (SELECT secret FROM t) || ("int4')` now compiles to `CAST($1 AS "int4"") || (SELECT secret FROM t) || (""int4")`, a type that does not exist (42704), instead of a cast that closes its quotes and reads another expression. A type without `"` compiles as before.

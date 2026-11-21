# Changelog

All notable changes to `@pgcast/typegen` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). pgcast's own changes are in [its changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## [Unreleased]

### Added

- `pgcast-typegen --watch` regenerates the row types each time a source file changes, describing only the queries whose text changed. [#829](https://github.com/AlexandreDemartin/pgcast/issues/829)

### Changed

- The `pg` peer range is `>=8.6.0 <9`: the tool's value decoding hard-codes the parser table of `pg-types` 2.x, which pg 9 may change.

### Fixed

- A project whose tsconfig resolves a `typescript` without the JavaScript API (TypeScript 7) gets `typescript <version> from <tsconfig> has no JavaScript API; point --project at a tsconfig that resolves typescript 4.1 to 6`, not a stack of `useCaseSensitiveFileNames`.
- A `queries.ts` that the project imports and that holds conflict markers or a syntax error is regenerated, as `--check` advises, instead of stopping the run.
- A missing peer (`@pgcast/pgcast` or `pg`, when the package manager skipped peers) is named in one line, with exit 1, instead of a stack.

## [0.1.0] - 2026-11-21

### Added

- The private statement describer reads field origins and parameter types from Postgres without executing the statement. [#801](https://github.com/AlexandreDemartin/pgcast/issues/801)
- The private writer generates nullable query result fields from pg's default text parsers, including recursive arrays with nullable elements. [#802](https://github.com/AlexandreDemartin/pgcast/issues/802)
- The private scanner finds static named SQL templates and reports ambiguous bindings and conflicting query texts. [#803](https://github.com/AlexandreDemartin/pgcast/issues/803)
- `pgcast-typegen [--project <tsconfig>]` writes row types for named static SQL queries beside the generated schema. [#804](https://github.com/AlexandreDemartin/pgcast/issues/804)
- Named result fields omit `| null` when the SQL and column origin prove it. Included enum columns use their verified labels. [#805](https://github.com/AlexandreDemartin/pgcast/issues/805)
- Named queries accept literal identifiers, literal parameter casts and `param(value, false)`. [#806](https://github.com/AlexandreDemartin/pgcast/issues/806)
- Named queries accept up to four `param(value)` or `param(value, true)` slots when their successful plain and JSON forms agree on the row. [#807](https://github.com/AlexandreDemartin/pgcast/issues/807)
- `pgcast-typegen --check` checks committed query names and SQL offline, and row types against a configured database. [#819](https://github.com/AlexandreDemartin/pgcast/issues/819)
- Generated row modules export `NotNull<R, K>` to remove `null` from selected columns. [#820](https://github.com/AlexandreDemartin/pgcast/issues/820)

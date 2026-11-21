# Changelog

All notable changes to `@pgcast/typegen` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). pgcast's own changes are in [its changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## [Unreleased]

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

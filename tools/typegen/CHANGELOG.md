# Changelog

## [Unreleased]

### Added

- The private statement describer reads field origins and parameter types from Postgres without executing the statement. [#801](https://github.com/AlexandreDemartin/pgcast/issues/801)
- The private writer generates nullable query result fields from pg's default text parsers, including recursive arrays with nullable elements. [#802](https://github.com/AlexandreDemartin/pgcast/issues/802)
- The private scanner finds static named SQL templates and reports ambiguous bindings and conflicting query texts. [#803](https://github.com/AlexandreDemartin/pgcast/issues/803)
- `pgcast-typegen [--project <tsconfig>]` writes row types for named static SQL queries beside the generated schema. [#804](https://github.com/AlexandreDemartin/pgcast/issues/804)

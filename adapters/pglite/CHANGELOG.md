# Changelog

All notable changes to `@pgcast/adapter-pglite` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). pgcast's own changes are in [its changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## [Unreleased]

### Changed
- Point out where native PGlite calls share an adapter transaction in the README.
- The README's [In a page](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#in-a-page) gives the setup to load `zapatos/db` with the adapter in a browser (a `pg` alias and a full `Buffer`), and `npm run check:browser` runs it.

## [0.1.1] - 2026-11-19

### Changed
- The README explains when a nested transaction receives the outer client in pgcast 7 and updates both install commands to pgcast 7.

## [0.1.0] - 2026-11-19

### Added
- `asPool(pglite)` gives pgcast's `run()` and `transaction()` a PGlite 0.5.x, in Node or [in a page](https://pgcast.dev/drivers#pglite), whose values are read with `pg`'s parsers and written as `pg` writes them, with [exceptions](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-writes), so a `bigint` is a string, a `date` local midnight and a `Date` local time, where PGlite reads and writes them otherwise (the README lists each type, [#698](https://github.com/AlexandreDemartin/pgcast/issues/698)). Each query goes to Postgres as `pg` sends it, through PGlite's `execProtocol()`; `.prepared(name)` prepares it once on that PGlite. It never creates, configures nor closes the PGlite, whose one connection `transaction()` takes in turn.
  - Unchanged: pgcast itself; the adapter imports nothing from it, and is published apart.
  - It takes pgcast 6.12.0 or later, whose `QueryableLike` and `PoolLike` its types fit; under 6.11.0, `run()` and `transaction()` refuse its pool (TS2345).

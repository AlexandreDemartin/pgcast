# Changelog

All notable changes to `@pgcast/adapter-postgres-js` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). pgcast's own changes are in [its changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## [Unreleased]

### Changed
- Point the README's usage notes to connection loss during an adapter transaction with postgres.js 3.4.x and `max: 1`.

## [0.1.1] - 2026-11-19

### Changed
- The README explains when a nested transaction receives the outer client in pgcast 7 and updates both install commands to pgcast 7.

## [0.1.0] - 2026-11-19

### Added
- `asPool(sql)` gives pgcast's `run()` and `transaction()` a postgres.js `sql`, 3.4 or 4.x, whose values are read with `pg`'s parsers and written as `pg` writes them, with [exceptions](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#what-it-writes), so a `timestamp` is a local `Date`, an `interval` an object and JSON text stays JSON, where postgres.js reads and writes them otherwise (the README lists each type, [#697](https://github.com/AlexandreDemartin/pgcast/issues/697)). It never creates, configures nor ends `sql`, and `transaction()` runs on a connection of `sql.reserve()`. Each query runs unprepared, `.prepared()` too, as postgres.js 4 serializes the values again when it reruns a prepared statement.
  - Unchanged: pgcast itself; the adapter imports nothing from it, and is published apart.
  - It takes pgcast 6.12.0 or later, whose `QueryableLike` and `PoolLike` its types fit; under 6.11.0, `run()` and `transaction()` refuse its pool (TS2345).

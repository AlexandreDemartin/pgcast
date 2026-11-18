# Changelog

All notable changes to `@pgcast/adapter-postgres-js` are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/). pgcast's own changes are in [its changelog](https://github.com/AlexandreDemartin/pgcast/blob/master/CHANGELOG.md).

## [Unreleased]

### Added
- `asPool(sql)` gives pgcast's `run()` and `transaction()` a postgres.js `sql`, 3.4 or 4.x, whose values are read with `pg`'s parsers and written as `pg` writes them, so a `timestamp` is a local `Date`, an `interval` an object and JSON text stays JSON, where postgres.js reads and writes them otherwise (the README lists each type, [#697](https://github.com/AlexandreDemartin/pgcast/issues/697)). It never creates, configures nor ends `sql`, and `transaction()` runs on a connection of `sql.reserve()`. Each query runs unprepared, `.prepared()` too, as postgres.js 4 serializes the values again when it reruns a prepared statement.
  - Unchanged: pgcast itself; the adapter imports nothing from it, and is published apart.

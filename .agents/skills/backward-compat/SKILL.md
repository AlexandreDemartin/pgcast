---
name: backward-compat
description: 'Backward compatibility with Zapatos 6.6.1: what the public API is, what breaks, how to add without breaking, zapatos/* module names. USE FOR: changing an export, a signature, a public type, a runtime behaviour, the config. DO NOT USE FOR: codegen output (codegen-output).'
---

# Staying backward compatible

Promise: a project on Zapatos 6.6.1 moves to `zapatos@npm:pgcast` without changing a line (note 002).

## The public API

- Everything exported by `zapatos/db` and `zapatos/generate` (`db.mjs` and `generate.mjs` give the list).
- The generated types and their shape (`Selectable`, `Insertable`, `Whereable`, `Updatable`, `*ForTable<T>`).
- The SQL produced by each shortcut: a user may log it, test it or depend on it.
- The config (`zapatosconfig.json`, `setConfig`) and the CLI (`npx zapatos`).

## Breaking, hence a stop point

- Removing or renaming an export, a parameter, an option.
- Narrowing an accepted type, widening a returned type.
- Changing the SQL produced by default, even if "equivalent".
- Renaming a `zapatos/*` string (note 002).

## Not breaking

- Adding an export, an optional option, a condition.
- Widening an accepted type without changing inference for existing calls (check it with a type test).
- Fixing **invalid** SQL (Postgres refused it): it is a fix, with its test and its CHANGELOG line.

## Fixing an existing bug

Rule of note [003](../../../docs/decisions/003-correctifs-et-depreciation.md):

- **Fix** directly if Postgres already refused the SQL, if the type already refused the call, if the old result contradicts the function's name, type or docs, or if it is a vulnerability.
- **Otherwise, opt-in**: a config option, whose default keeps the old behaviour; the old path emits once `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` naming the option; default in 7.0.
- The phase 1 characterisation test changes in the same PR, with the reason; an opt-in also keeps the test of the old behaviour.

## Checklist

- [ ] No export removed: `git diff master -- db.mjs generate.mjs` after `npm run build`
- [ ] Characterisation tests unchanged, or diff justified
- [ ] `CHANGELOG.md` line (`Added`, `Changed`, `Fixed`)

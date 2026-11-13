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

Rule of note [003](../../../docs/decisions/003-fixes-and-deprecation.md):

- **Fix** directly if Postgres already refused the SQL, if the type already refused the call, if the old result contradicts the function's name, type or docs, or if it is a vulnerability.
- **Otherwise, opt-in**: a config option, whose default keeps the old behaviour; the old path emits once `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` naming the option; default in 7.0.
- The phase 1 characterisation test changes in the same PR, with the reason; an opt-in also keeps the test of the old behaviour.
- A deprecation trigger follows the SQL the call compiles to (which columns still come from `EXCLUDED`), not the input's shape, or the 7.0 default refuses calls that lose nothing (#27).
- An error moved from `.run()` to build time is a change to name: a synchronous throw, not a rejection, a plain `Error`, not a `DatabaseError` (`.catch()`, `Promise.allSettled`, `isDatabaseError`). Probe it with `.run(pool).catch(h)` outside any `async`.
- A new opt-in updates every page that lists the others: `git grep` the existing ones (#190 found six stale pages).

## Replay, do not reason

Each claim about what 6.6.1 does, in an issue, a plan, a review item or a `CHANGELOG.md` line (each form it lists, each "Unchanged" item), is replayed against Postgres before it is written: issues and reviews got it wrong in #25, #26 and #134.

- **How**: the `zapatos@6.6.1` npm tarball, with `NODE_PATH` on the branch's `node_modules`, runs one script on both (`npx -y -p node@20 node …` for Node 20). Types: `git archive v6.6.1 src/db src/typings tsconfig.json`, emitted with its own tsconfig.
- **Where**: a scratch folder outside `test/` (Vitest collects only `test/` and swallows `console.log`), output to a file, nothing committed.
- **Each case** is built with its own copy's `sql`, `param` and `Default` (`instanceof` and symbols do not cross copies), under a `SAVEPOINT` rolled back after every run.
- **Three runtimes**: 6.6.1, master and the branch, both ways: a half-done fix on master can be worse than both (#24), and "the same under both" fails going back.
- **What**: the stored value, not only whether it throws (`pg` stores an object as JSON, anything else through `toString()`); each write path and column type that took the old value (text, `jsonb`, an array element); the negated forms and the writes (`isNotIn`, `deletes`); `undefined` and `null`, for projects without `strictNullChecks`; odd shapes (a `null` row, a getter, a class instance, inherited, non-enumerable or symbol keys, a subclass of each refused built-in).
- **Types**: a grid of calls (each column × a literal of each Postgres type) compiled against 6.6.1's declarations and the branch's, diffed both ways: a union member can widen a literal or let a new call through.

## Checklist

- [ ] No export removed: `git diff master -- db.mjs generate.mjs` after `npm run build`
- [ ] Characterisation tests unchanged, or diff justified
- [ ] Each claim about 6.6.1 replayed, on 6.6.1, master and the branch
- [ ] `CHANGELOG.md` line (`Added`, `Changed`, `Fixed`)

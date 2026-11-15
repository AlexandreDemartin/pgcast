---
name: backward-compat
description: 'Backward compatibility with Zapatos 6.6.1: what the public API is, what breaks, how to add without breaking, zapatos/* module names. USE FOR: changing an export, a signature, a public type, a runtime behaviour, the config. DO NOT USE FOR: codegen output (codegen-output).'
---

# Staying backward compatible

Promise: a project on Zapatos 6.6.1 moves to `zapatos@npm:@pgcast/pgcast` without changing a line (note 002).

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

- **Fix** directly if Postgres already refused the SQL, if the type already refused the call, if the old result contradicts the function's name, type or docs, or if it is a vulnerability; except what only run time knows, which is Document, as note 003 § Rule says.
- **Otherwise, opt-in**: a config option, whose default keeps the old behaviour; the old path emits once `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` naming the option; default in 7.0. An explicit old value is kept with no warning (note 003 § Rule); a types-only opt-in (`ConfigTypes`) cannot warn, so for a niche type gap Document comes first (#274, #402).
- **Off, the old path is master's byte for byte**: the same queries, SQL, files and listener messages; nothing added for the option's sake (#233's empty query runs only with it on, #484).
- The phase 1 characterisation test changes in the same PR, with the reason; an opt-in also keeps the test of the old behaviour.
- A deprecation trigger follows the SQL the call compiles to (which columns still come from `EXCLUDED`), not the input's shape, or the 7.0 default refuses calls that lose nothing (#27); a run-time check copied from a type inherits its gaps, so it follows the Postgres semantics the type stands for (`SerializableRODeferrable` satisfies every read-only level, #486).
- An error moved from `.run()` to build time is a change to name: a synchronous throw, not a rejection, a plain `Error`, not a `DatabaseError` (`.catch()`, `Promise.allSettled`, `isDatabaseError`). Probe it with `.run(pool).catch(h)` outside any `async`.
- **A new refusal** where 6.6.1 rejected from `.run()` throws while compiling: a fragment whose `compile` throws, inside the query's expressions so `copy()` keeps it (#167, #235), frozen through `.run()`, and its docs say "throws while compiling, so `.run()` rejects", as its test asserts (#167). Its probe table crosses each value with each shortcut and row position, and with the inputs the existing refusals catch first (#244, #341); the type slot that still takes the call is narrowed in the same PR, or the gap filed (#503).
- **A caller's object is read as 6.6.1 read it**: the same keys, as often; no copy that rebuilds it (`{ ...x }`, `Object.fromEntries`) and loses getters, inherited or non-enumerable keys; a throwing getter or a Proxy never breaks every query (`getConfig()`: #249, #257, #501; its test: #508).
- **A result that changes** (a rejection turned into a value, or the reverse) has a `Changed:` sub-bullet naming what the caller now gets, one clause per path (a pool and a plain client), its row in `switching.md` § Find the calls whose result changes, and an "except" in the report's class cell (#163, #502, #506).
- A new opt-in updates every page that lists the others (skill `code-style` § Claims, what changed is searched for; #190 found six stale pages); a config key Zapatos 6.6.1 lacks is also named in `switching.md` § Go back, with what going back leaves behind (#364).

## Replay, do not reason

Each claim about what 6.6.1 does, in an issue, a plan, a review item or a `CHANGELOG.md` line (each form it lists, each "Unchanged" item), is replayed against Postgres before it is written: issues and reviews got it wrong in #25, #26 and #134.

- **How**: the `zapatos@6.6.1` npm tarball, with `NODE_PATH` on the branch's `node_modules`, runs one script on both (`npx -y -p node@20 node …` for Node 20); the code is loaded from each built `dist`, never a hand copy (#405); a characterisation test replays by swapping its `src/db` import for the tarball's `dist/db`. Types: `git archive v6.6.1 src/db src/typings tsconfig.json`, emitted with its own tsconfig.
- **Where**: a scratch folder outside `test/` (Vitest collects only `test/` and swallows `console.log`), output to a file, nothing committed.
- **Each case** is built with its own copy's `sql`, `param` and `Default` (`instanceof` and symbols do not cross copies), under a `SAVEPOINT` rolled back after every run; each value is snapshotted as it is read (`{ ...x }`, getters read by name), or a shared live object or `JSON.stringify` shows a regression that is not there (#245).
- **Three runtimes**: 6.6.1, master and the branch, both ways: a half-done fix on master can be worse than both (#24), and "the same under both" fails going back. Once on the pre-fix commit too, to show the grid finds the defect; the proof is the diff of the whole grid, never a count nor the targeted values alone (#34, #168, #501).
- **What**: the stored value, not only whether it throws (`pg` stores an object as JSON, anything else through `toString()`); each write path and column type that took the old value (text, `jsonb`, an array element); the negated forms and the writes (`isNotIn`, `deletes`); `undefined` and `null`, for projects without `strictNullChecks`; odd shapes (a `null` row, a counting and a throwing getter, a Proxy, a class instance, inherited, non-enumerable or symbol keys, prototype names, a subclass of each refused built-in, an array-like); falsy values set under a truthy default (`0` tells `??` from `||`) and at each level; `null` options at each entry point; what a JSON config holds (`null`, a comma-separated list).
- **Types**: a grid of calls (each column × a literal of each Postgres type) compiled against 6.6.1's declarations and the branch's, diffed both ways, line by line: a union member can widen a literal or let a new call through. It adds values typed through the exported generics as consumers write them (`db.RangeString<number>`), generic forwarders, an assignment to `typeof fn`, a union per refused shape, an exhaustive `switch`, and in output position `Record<T, X>`, a mapped type and conditionals in three forms; inferred types are compared by the emitted `.d.ts` of a probe file (`tsc --declaration --emitDeclarationOnly`). A grid cell assigns a value (`const x: L = '1'`), never `{} as never`, which always compiles; `===` does not narrow a union of pattern template literals. Overloads are no neutral way to widen a generic export: passed as an argument (`.map`, `.then`) they lose generic inference. A `never` result turned into a real type is probed combined (a union, a ternary, several `return`s) and computed from (`keyof`, an indexed access, a conditional) (#34, #38, #40, #41, #43, #185, #462).

## Checklist

- [ ] No export removed nor added by accident: `git diff $(git merge-base origin/master HEAD) -- db.mjs generate.mjs` after `npm run build` (each `export` of a module in `src/generate/index.ts`'s `export *` list is public: a helper goes in a module of its own)
- [ ] Characterisation tests unchanged, or diff justified
- [ ] Each claim about 6.6.1 replayed, on 6.6.1, master and the branch
- [ ] `CHANGELOG.md` line (`Added`, `Changed`, `Fixed`)

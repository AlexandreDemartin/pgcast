---
name: backward-compat
description: 'Backward compatibility with Zapatos 6.6.1: what the public API is, what breaks, how to add without breaking, zapatos/* module names. USE FOR: changing an export, a signature, a public type, a runtime behaviour, the config. DO NOT USE FOR: codegen output (codegen-output).'
---

# Staying backward compatible

Promise: a project on Zapatos 6.6.1 moves to `zapatos@npm:@pgcast/pgcast` without changing a line (note 002).

## The public API

- Everything exported by `zapatos/db` and `zapatos/generate` (`db.mjs` and `generate.mjs` give the list).
- The generated types and their shape (`Selectable`, `Insertable`, `Whereable`, `Updatable`, `*ForTable<T>`).
- The SQL produced by each shortcut: a user may log, test or depend on it.
- The config (`zapatosconfig.json`, `setConfig`) and the CLI (`npx zapatos`).

## Breaking, hence a stop point

- Removing or renaming an export, a parameter, an option.
- Narrowing an accepted type, widening a returned type.
- Changing the SQL produced by default, even if "equivalent".
- Renaming a `zapatos/*` string (note 002).

## Not breaking

- Adding an export, an optional option, a condition.
- Widening an accepted type without changing inference for existing calls (a type test checks it).
- Fixing **invalid** SQL (Postgres refused it), with its test and its CHANGELOG line.

## Fixing an existing bug

Rule of note [003](../../../docs/decisions/003-fixes-and-deprecation.md):

- **Fix** directly if Postgres or the type already refused it, if the old result contradicts the function's name, type or docs, or if it is a vulnerability; except what only run time knows: Document (note 003 § Rule).
- **Otherwise, opt-in**: a config option, whose default keeps the old behaviour; the old path emits once `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` naming the option; default in 7.0. An explicit old value is kept with no warning (note 003 § Rule); a types-only opt-in (`ConfigTypes`) cannot warn, so for a niche type gap Document comes first (#274, #402). A new public function starts on the 7.0 default, not on a deprecated one it would have to leave (`check()`, #560).
- **Off, the old path is master's byte for byte**: the same queries, SQL, files and listener messages; nothing added for the option's sake (#233's empty query runs only with it on, #484).
- The phase 1 characterisation test changes in the same PR, with the reason; an opt-in keeps the old behaviour's test too.
- A deprecation trigger follows the compiled SQL (which columns still come from `EXCLUDED`), not the input's shape, or the 7.0 default refuses calls that lose nothing (#27); a run-time check copied from a type inherits its gaps, so it follows the Postgres semantics behind the type (`SerializableRODeferrable` satisfies every read-only level, #486).
- An error moved from `.run()` to build time is a named change: a synchronous throw, not a rejection, a plain `Error`, not a `DatabaseError` (`.catch()`, `Promise.allSettled`, `isDatabaseError`). Probe it with `.run(pool).catch(h)` outside any `async`.
- **A new refusal** where 6.6.1 rejected from `.run()` throws while compiling: a fragment whose `compile` throws, in the query's expressions so `copy()` keeps it (#167, #235), frozen through `.run()`; its docs say "throws while compiling, so `.run()` rejects", as its test asserts. Its probe table crosses each value with each shortcut and row position, and with the inputs the existing refusals catch first (#244, #341); a type slot that still takes the call is narrowed in the PR, or the gap filed (#503). A walk over caller data is iterative (an explicit stack), runs where the fragment compiles (an array changed after the call), and is tested with a refused item after a plain one in a nested array and a cycle not through the root (#638, #647); a large built-in is refused before its keys are listed (#543).
- **A caller's object is read as 6.6.1 read it**: the same keys, as often; no copy that rebuilds it (`{ ...x }`, `Object.fromEntries`) and loses getters, inherited or non-enumerable keys; a throwing getter or Proxy never breaks every query (`getConfig()`: #249, #257, #501, #508). A read or trap-count test has a case where the runtimes differ (an own getter), a `Proxy` row with no own key and a key added to `Object.prototype`. A guard comparing a value with `Object.prototype`'s uses `Object.is` (`NaN`) and the property descriptor, data or accessor (`get`, `set`, `{ get, set }`, `__proto__`), with a row per descriptor shape at each caller of the shared helper (`callerValue()` in `utils.ts`) (#550, #553, #558, #598).
- **A result that changes** (a rejection turned into a value, or the reverse) has a `Changed:` sub-bullet saying what the caller gets, one clause per path (a pool and a plain client), its row in `switching.md` § Find the calls whose result changes, and an "except" in the report's class cell (#163, #502, #506); a PR that extends a refusal extends its row, and a write refusal's row also names a `vals({…})` of a query you write (#686).
- A new opt-in updates every page that lists the others (skill `code-style` § Claims; #190 found six stale pages); a config key or a CLI flag Zapatos 6.6.1 lacks is also named in `switching.md` § Go back, with what going back leaves behind (#364).

## Replay, do not reason

Each claim about what 6.6.1 does (issue, plan, review item, `CHANGELOG.md` line, with each form and "Unchanged" item it lists) is replayed against Postgres before it is written (wrong in #25, #26, #134).

- **How**: the `zapatos@6.6.1` npm tarball, with `NODE_PATH` on the branch's `node_modules`, runs one script on both (`npx -y -p node@20 node …`); the code loads from each built `dist`, never a hand copy (#405); a characterisation test replays by swapping its `src/db` import for the tarball's `dist/db`. Types: `git archive v6.6.1 src/db src/typings tsconfig.json`, emitted with its own tsconfig.
- **Where**: a scratch folder outside `test/` (Vitest collects only `test/` and swallows `console.log`), output to a file, nothing committed.
- **Each case** is built with its own copy's `sql`, `param` and `Default` (`instanceof` and symbols do not cross copies), under a `SAVEPOINT` rolled back after each run, a `setval` inside it (a sequence is not rolled back, #529); each value is snapshotted as read (`{ ...x }`, getters by name), or a shared live object or `JSON.stringify` shows a regression that is not there (#245).
- **Three runtimes**: 6.6.1, master and the branch, both ways: a half-done fix on master can be worse than both (#24), and "the same under both" fails going back. Once on the pre-fix commit too, to show the grid finds the defect; the proof is the whole grid's diff, never a count nor the targeted values (#34, #168, #501). A read count "as in 6.6.1" is measured on 6.6.1's `dist`, not master's, which adds reads (#550); a claim about a range of versions replays each one (#568); 6.6.1's type name replays what it now resolves to (#539).
- **What**: the stored value, not only whether it throws (`pg` stores an object as JSON, anything else through `toString()`); each write path and column type that took the old value (text, `jsonb`, an array element); the negated forms and the writes (`isNotIn`, `deletes`); `undefined` and `null`, for projects without `strictNullChecks`; odd shapes (a `null` row, a counting and a throwing getter, a Proxy, a class instance, inherited, non-enumerable or symbol keys, prototype names, a subclass of each refused built-in, an array-like); falsy values set under a truthy default (`0` tells `??` from `||`) and at each level; `null` options at each entry point; what a JSON config holds (`null`, a comma-separated list); each value `pg` returns through the column's old `Selectable` type (an interval typed `string` is an object), and a one-key variant of each refused built-in (#503, #530); `null` and `undefined` items of each array option (`order`, `lock`, #558); each conversion path of a value apart (#607); a CLI argument in each position (#557).
- **Types**: a grid of calls (each column × a literal of each Postgres type) compiled against 6.6.1's declarations and the branch's, diffed both ways, line by line: a union member can widen a literal or let a new call through. It adds the exported generics as consumers write them (`db.RangeString<number>`), generic forwarders, an assignment to `typeof fn`, a union per refused shape, an exhaustive `switch`, and in output position `Record<T, X>`, a mapped type and conditionals in three forms; inferred types compare by a probe file's emitted `.d.ts` (`tsc --declaration --emitDeclarationOnly`). A grid cell assigns a value (`const x: L = '1'`), never `{} as never`, which always compiles; `===` does not narrow a union of pattern template literals. Overloads are no neutral way to widen a generic export: passed as an argument (`.map`, `.then`) they lose generic inference, and overloading an export that had one signature (`sql`, `eq()`, `param()`) is a break by default (#276, #282, #520), probed by `traced(db.sql)`, a value assigned to `typeof db.sql` and a contextual arrow under `noImplicitAny`. To widen an overloaded one, add an overload and keep 6.6.1's last, which `Parameters` and `ReturnType` read; test an inline literal, a variable, `as const` and a `readonly` array, each resolved apart (#682, #684). A cell uses the value it reads back (`run()` is `any` after `instanceof`, #655). A `never` result turned into a real type is probed combined (a union, a ternary, several `return`s) and computed from (`keyof`, an indexed access, a conditional) (#34, #38, #40, #41, #43, #185, #462).

## Checklist

- [ ] No export removed nor added by accident: `git diff $(git merge-base origin/master HEAD) -- db.mjs generate.mjs` after `npm run build` (each `export` of a module in `src/generate/index.ts`'s `export *` is public: a helper goes in its own module; under `node10` a consumer's `.d.ts` names `zapatos/dist/db/*` paths, so an export of `dist` stays, #581)
- [ ] Characterisation tests unchanged, or diff justified
- [ ] Each claim about 6.6.1 replayed, on 6.6.1, master and the branch
- [ ] `CHANGELOG.md` line (`Added`, `Changed`, `Fixed`)

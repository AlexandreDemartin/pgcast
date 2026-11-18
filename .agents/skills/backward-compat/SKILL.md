---
name: backward-compat
description: 'Backward compatibility with Zapatos 6.6.1: what the public API is, what breaks, how to add without breaking, zapatos/* module names. USE FOR: changing an export, a signature, a public type, a runtime behaviour, the config. DO NOT USE FOR: codegen output (codegen-output).'
---

# Staying backward compatible

Promise: a project on Zapatos 6.6.1 moves to `zapatos@npm:@pgcast/pgcast` without changing a line (note 002).

Cases that serve a minority of steps are in [reference.md](reference.md), read when this core names them.

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
- A new opt-in updates every page that lists the others (skill `code-style` § Claims; #190 found six stale pages); a config key or a CLI flag Zapatos 6.6.1 lacks is also named in `switching.md` § Go back, with what going back leaves behind (#364).
- When the fix adds a deprecation trigger, moves an error to build time, adds a refusal, reads a caller's object or changes a result: [reference.md](reference.md) § Fixing an existing bug.

## Replay, do not reason

Each claim about what 6.6.1 does (issue, plan, review item, `CHANGELOG.md` line, with each form and "Unchanged" item it lists) is replayed against Postgres before it is written (wrong in #25, #26, #134).

- **How**: the `zapatos@6.6.1` npm tarball, with `NODE_PATH` on the branch's `node_modules`, runs one script on both (`npx -y -p node@20 node …`); the code loads from each built `dist`, never a hand copy (#405); a characterisation test replays by swapping its `src/db` import for the tarball's `dist/db`. Types: `git archive v6.6.1 src/db src/typings tsconfig.json`, emitted with its own tsconfig.
- **Where**: a scratch folder outside `test/` (Vitest collects only `test/` and swallows `console.log`), output to a file, nothing committed.
- **Three runtimes**: 6.6.1, master and the branch, both ways: a half-done fix on master can be worse than both (#24), and "the same under both" fails going back. Once on the pre-fix commit too, to show the grid finds the defect; the proof is the whole grid's diff, never a count nor the targeted values (#34, #168, #501). A read count "as in 6.6.1" is measured on 6.6.1's `dist`, not master's, which adds reads (#550); a claim about a range of versions replays each one (#568); 6.6.1's type name replays what it now resolves to (#539).
- Before building the cases: each case, what to replay and the types grid, in [reference.md](reference.md) § Replay, do not reason.

## Checklist

- [ ] No export removed nor added by accident: `git diff $(git merge-base origin/master HEAD) -- db.mjs generate.mjs` after `npm run build` (each `export` of a module in `src/generate/index.ts`'s `export *` is public: a helper goes in its own module; under `node10` a consumer's `.d.ts` names `zapatos/dist/db/*` paths, so an export of `dist` stays, #581)
- [ ] Characterisation tests unchanged, or diff justified
- [ ] Each claim about 6.6.1 replayed, on 6.6.1, master and the branch
- [ ] `CHANGELOG.md` line (`Added`, `Changed`, `Fixed`)

---
name: backward-compat
description: 'Backward compatibility as decision 019 scopes it: what a minor keeps and a major may break, what the public API is, how to add without breaking, one behaviour per option, zapatos/* module names. USE FOR: changing an export, a signature, a public type, a runtime behaviour, the config. DO NOT USE FOR: codegen output (codegen-output).'
---

# Staying backward compatible

Compatibility is best effort (decision [019](../../../docs/decisions/019-one-behaviour.md) § 2):

- **6.x** is a drop-in for Zapatos 6.6.1: a project moves to `zapatos@npm:@pgcast/pgcast` without changing a line (note 002).
- **A minor or a patch** keeps what working code relies on, bar decision 003's fixes (§ Fixing an existing bug).
- **A major** may change behaviour, SQL text or types when that buys better performance or typing, within the philosophy, with a migration guide in English and French.
- **Always**: types derived from the database; the `zapatos/*` module names (decision 002).

Cases that serve a minority of steps are in [reference.md](reference.md), read when this core names them.

## The public API

- Everything exported by `zapatos/db` and `zapatos/generate` (`db.mjs` and `generate.mjs` give the list).
- The generated types and their shape (`Selectable`, `Insertable`, `Whereable`, `Updatable`, `*ForTable<T>`).
- The SQL produced by each shortcut: a user may log, test or depend on it.
- The config (`zapatosconfig.json`, `setConfig`) and the CLI (`npx zapatos`).
- No export removed nor added by accident: `git diff $(git merge-base origin/master HEAD) -- db.mjs generate.mjs` after `npm run build`. Each export of a module in `src/generate/index.ts`'s `export *` is public, so a helper goes in its own module; under `node10` a consumer's `.d.ts` names `zapatos/dist/db/*` paths, so an export of `dist` stays (#581). tsc names a type through the entry that re-exports it, so a dist path is written for one no entry re-exports, or by hand: a module moved within `src/` re-exports its old names from its old file, frozen by a path-mapped type test (`generateTables.test-d.ts`, as `utils.test-d.ts` does, #885), and a helper absent from 6.6.1 that no entry exports and no entry's type names may go (`warnOnce`, #887). Which paths a consumer's declarations write: `tsc --declaration` against both tarballs, with `preserveSymlinks: true` through a linked package, or `pg` fails with TS2307 (#885, 7.1.2's range review).

## Breaking, hence a stop point

A break is a stop point in a minor or a patch, and at a major when the major's decided list does not name it (for 8.0, decision 019 § 3). A break the list names is built, with its migration entry (§ One behaviour per option). A break:

- Removing or renaming an export, a parameter, an option.
- Narrowing an accepted type, widening a returned type.
- Changing the SQL produced by default, even if "equivalent".
- Renaming a `zapatos/*` string (note 002): a stop point at a major too.

## Not breaking

- Adding an export, an optional option, a condition.
- Widening an accepted type without changing inference for existing calls (a type test checks it).
- Fixing **invalid** SQL (Postgres refused it), with its test and its CHANGELOG line.

## One behaviour per option

Decision 019 § 1, which supersedes "an explicit old value is kept" of note 003 § Rule:

- **At a major**, an option that chooses between two behaviours of pgcast goes, and the better one stays alone: the cheapest SQL for the same result (principle 6), then the type closest to what the database states (principle 1), then the result that matches the function's name, type and docs.
- **A new option that switches between two behaviours of pgcast names its exit**: the sole behaviour at the next major, written in its decision note and its docs entry, or it is refused.
- **Kept**: configuration by nature (a fact the database cannot state, a listener, Zapatos 6.6.1's own keys), and an addition, off by default, that changes nothing while off (`constraintNames`).
- **An old value stays only with a stated need that no other way meets**; "someone may rely on it" is not one, the migration entry answers it.
- **A breaking change ships with its migration entry** in the same PR, in `website/switching.md` and `website/fr/switching.md`: before → after code, what the user sees change, how to find the calls (a grep, a type error). Without it, it is not merged.
- **A removed key fails loudly**: it leaves the types, and its old value throws at `setConfig()` or before the generator's first query (decision 019 § 4).

## Fixing an existing bug

Rule of note [003](../../../docs/decisions/003-fixes-and-deprecation.md):

- **Fix** directly if Postgres or the type already refused it, if the old result contradicts the function's name, type or docs, or if it is a vulnerability; except what only run time knows: Document (note 003 § Rule).
- **Otherwise, opt-in**: a config option, whose default keeps the old behaviour; the old path emits once `process.emitWarning(…, { type: 'DeprecationWarning', code: 'PGCAST_DEP00n' })` naming the option; its fix becomes the sole behaviour at the next major (§ One behaviour per option). Until then, an explicit old value works with no warning (note 003 § Rule); a types-only opt-in (`ConfigTypes`, through 7.x) cannot warn, so for a niche type gap Document comes first (#274, #402). A new public function starts on the behaviour the next major keeps, not on a deprecated one it would have to leave (`check()`, #560).
- **Off, the old path is master's byte for byte**: the same queries, SQL, files and listener messages; nothing added for the option's sake (#233's empty query runs only with it on, #484).
- The phase 1 characterisation test changes in the same PR, with the reason; an opt-in keeps the old behaviour's test too.
- A new opt-in updates every page that lists the others (skill `code-style` § Claims; #190 found six stale pages); a config key or a CLI flag Zapatos 6.6.1 lacks is also named in `switching.md` § Go back, with what going back leaves behind (#364).
- When the fix adds a deprecation trigger, moves an error to build time, adds a refusal, reads a caller's object or changes a result: [reference.md](reference.md) § Fixing an existing bug.

## Replay, do not reason

Each claim about what 6.6.1 does (issue, plan, review item, `CHANGELOG.md` line, with each form and "Unchanged" item it lists) is replayed against Postgres before it is written (wrong in #25, #26, #134).

- **How**: the `zapatos@6.6.1` npm tarball, with `NODE_PATH` on the branch's `node_modules`, runs one script on both (`npx -y -p node@20 node …`); the code loads from each built `dist`, never a hand copy (#405); a characterisation test replays by swapping its `src/db` import for the tarball's `dist/db`; a body moved behind a new function is proved by a differential harness over the two built `dist` trees, every mode × option × config (#750: 45,360 cases in a second). Types: `git archive v6.6.1 src/db src/typings tsconfig.json`, emitted with its own tsconfig.
- **Where**: a scratch folder outside `test/` (Vitest collects only `test/` and swallows `console.log`), output to a file, nothing committed.
- **Three runtimes**: 6.6.1, master and the branch, both ways: a half-done fix on master can be worse than both (#24), and "the same under both" fails going back. Once on the pre-fix commit too, to show the grid finds the defect; the proof is the whole grid's diff, never a count nor the targeted values (#34, #168, #501). A read count "as in 6.6.1" is measured on 6.6.1's `dist`, not master's, which adds reads (#550); a claim about a range of versions replays each one (#568); 6.6.1's type name replays what it now resolves to (#539).
- Before building the cases: each case, what to replay and the types grid, in [reference.md](reference.md) § Replay, do not reason.

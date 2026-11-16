# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #520: an overload added to fix an inference turns every refused call's error into TS2769 with one message per overload on TS 5 (TS 7 prints the last one): grep the docs' `// @errors:` lines before choosing that route.
- #520: `Parameters<>` of an overloaded function reads the last overload, and can differ from the single-signature result (`never` on 6.6.1's `sql`).
- #520: ESLint's base `no-redeclare` rejects TypeScript overload signatures; typescript-eslint advises turning it off for TS.
- #520: inside a generic shortcut, TS reads a key's contextual type through the type parameter's constraint, so a bare generic call infers from the union over every table, even when the table is named by a literal.
- #520: overloading an export that had one signature (`sql`, `eq()`, `param()`) is a public-API break by default (third time: R33 #276, R34 #282, #520): a type test against 6.6.1's signature freezes a generic higher-order function over it (`traced(db.sql)`: types, a call with type arguments, a refused argument) and a value written to 6.6.1's signature assigned to `typeof db.sql`, plus a contextually typed arrow under `noImplicitAny`.
- #520: a claim "wrappers and `typeof fn` keep their types" is tested in both directions: `db.fn` assigned to a signature, and a value assigned to `typeof db.fn`.
- #520: blocking a type parameter's inference from the return type in one signature needs a deferred wrapper, which also blocks inference for callers passing their own type parameter (`eq<T>`, wrappers, #181); forms TypeScript simplifies change nothing; a mapped `where` in the shortcuts fixes only a literal table and keeps only shared keys over a union (TS2353). Seven candidates measured: #493 became Document.
- #520: `npm run test:types` with a mutant `core.ts` leaves the mutant's declarations in `node_modules/.cache/pgcast`: re-emit them before another check reads that cache (TS 7 on `test/types`).
- #520: a probe grid's `.codes` files kept the first code of each line only, so a second code on a line could change unseen: record every `(line, code)` pair and diff the messages too.
- #516: the type tests target ES2019, so a `1n` literal fills a `@ts-expect-error` with its own TS2737 and the negative freezes nothing; write `null as unknown as bigint`.
- #516: BSD `sed` has no `\|` alternation: a sed meant to strip `@ts-expect-error` directives matched nothing and the run looked green; use `sed -E` or `awk`, and check the stripped file changed.
- #516: `tsc -p test` type-checks the runtime tests against the stub schema, so a change to the `updateValues` types shows only in `test:types`.
- #516: on a column typed `any`, the whole `updateValues` slot is `any`, so no narrowing of its members refuses anything there (frozen by a characterisation test).
- #516: a grid that says a narrowing "refuses only what throws" crosses each form with an argument typed `any` and `unknown`: `any` is assignable to everything but `never`, so a narrowing that resolves to `never` refuses untyped callers (`JSON.parse`, `req.body`) that worked under 6.6.1.
- #516: accepting `any` where a narrowing collapses to `never` also brings back `null` and `undefined` with `strict` off, since they widen to `any`: a claim about `null` names `strictNullChecks`.
- #516: a fallback type in public declarations (a non-exported `unique symbol`, `class` or `interface`) goes through a consumer declaration-emit probe (`tsc --declaration` on a file exporting an inferred value of the slot), not only a checking grid: TS2527 otherwise (skill `backward-compat` § Types); a grep of `dist/**/*.d.ts` for a non-exported `unique symbol` used in an exported type is a cheaper check.
- #513: a draft PR runs no Postgres or Node matrix, so a claim that depends on a version not installed locally (Postgres 18's `WITHOUT OVERLAPS`) stays unproven until the PR is ready; the orchestrator marks it ready early for that proof.
- #513: under heavy machine load a few codegen variant-snapshot tests time out at their 5 s default, even on reruns; a third run once the load dropped was green.
- #512: a Done when that names one mutant for every row is checked against each shape before the issue is written: a primitive's property reads `undefined` and a stored `null` is reset to the default, so neither goes red on a plain direct read.
- #512: `getConfig()` returns `{ minMs: undefined, maxMs: undefined }` for a truthy primitive `transactionRetryDelay` (`100`), where 6.6.1 returned `100`; nothing throws, value only.
- #522: a new variant snapshot is not on disk until the first run writes it, so its "compiles" test fails once: run the file twice before reading a red.
- #522: `it.each([undefined, false])` passed into `Config` fails `typecheck` under `exactOptionalPropertyTypes`; spread the key conditionally instead.
- #522: a structural type that a value must satisfy to be written (`toPostgres()`) needs a negative case per required member: a mutant making one optional went uncaught while another member was still required.
- #522: a codegen branch keyed on a built-in type's bare name (`'interval'`, `'_interval'`, `root.name`) without `pg_catalog` came up in two sibling PRs (#519, #522): any new branch on a built-in name checks the schema and is tested against an enum, a composite and a domain of that name in a user schema (candidate for skill `codegen-output`, and a grep check for `=== '<builtin>'` in `src/generate/`).
- #522: docs that promise "doesn't compile" for something in a `.d.ts` (placeholders, generated schema) say what happens under `skipLibCheck`: nothing, and the type becomes `any`.
- #522: a note's lead-in that names the kinds of column it lists is checked against every kind its listing code admits, under each option that widens the list (`domainsTypedByContext`): one probe column per kind in the note's test, the lead-in asserted word for word (missed twice in #522).
- #522: three rounds because the code that picks a note's columns and the code that types them are separate: each opt-in with a note gets one test over a set of shapes asserting the note's list equals the columns whose lines or placeholders differ between the key `true` and left out (placeholders counted: a domain over `interval` changes only there).
- #522: domain roots compose (domain over array over domain): the listing condition reads the root exactly as the typing does, or the two drift.
- #522: a probe column added to a fixture table broke a runtime test comparing exact rows (`toEqual`); a separate table avoids it.
- #521: `vitest run --execArgv=--harmony-temporal` passes a V8 flag to the forks, and `npx -y -p node@26 node node_modules/vitest/vitest.mjs run` runs the suites on a Node not installed: a built-in of a later Node can be tested locally.
- #521: Vitest hides `console.log` from a passing test, so a probe writes its output to a file.
- #521: an unquoted heredoc in zsh runs the backticks inside it; quote the heredoc for anything written as Markdown.
- #521: a claim that a built-in appears "from Node N" is checked on the majors just before N, not only the CI legs (20, 22, `lts/*`): `npx -p node@<v> node -p "typeof X"` from the lowest supported major (`Intl.DurationFormat` was dated 26, Node 23 has it).
- #521: a PR that changes what `core.ts` refuses checks the test-side lists that mirror it (#511's `keptConstructors`) and says which side changes in which PR.
- #521: `temporal-polyfill/global` replaces `Intl.DateTimeFormat` too, so the load order of a polyfill decides whether `Intl` values are refused as well; it is a no-op where the runtime has `Temporal`.
- #521: have the French proofread before committing a docs fix, or "one commit per blocker" costs extra commits.
- #521: two "from Node N" claims in a row were wrong at first (`SuppressedError`, `DurationFormat`): a script running `typeof <global>` on each major could check them.
- #521: a clause naming one runtime version ("on Node 26") for something read from `globalThis` says "where the runtime has one": a flag (`--harmony-temporal`) adds the object on an older Node.
- #519: Postgres names the array type of `tag` `_tag_1` when an enum `_tag` already exists, so detecting an array by the `_` prefix types it `any` (same on 6.6.1).
- #519: `pg` accepts as a write the array text it returned from `sql`, so code that writes a `sql` row back works today: why typing it `string` is an opt-in, not a Fix.
- #519: a probe database was terminated by another worktree's suite ("terminated by administrator command"); a `pool.on('error')` handler and caught errors in the probe script let the rerun pass.
- #519: three PRs in a row (R40/#44, #484, #519) decided a type from an enum found by name among the relation's schema's enums, not the type's schema's: a type predicate reads `otherEnums[udtSchema]`; a standard control column is an enum named like a built-in (`int4`, `text`) next to a column of that built-in's array (candidate for skill `codegen-output`).
- #519: a reviewer's probes run alongside `npm test` push codegen tests past their 5000 ms timeout: run the suite alone, or rerun a timed-out file alone before reporting it.
- #519: a note on a domain column waits for the placeholder's final text, known only once every relation is read (#42's last-wins; a schema with no enum of that name gives `any`): filter in `tsForQueries` on the shared `customTypes`.
- #519: under load from parallel worktrees the 5 s Vitest timeout fails different, unrelated tests on each full run: rerun the failing files alone.
- #519: two "would change" notes in a row (#484, #519) listed columns the option did not change: a test helper could diff the output with the key off and on and compare the changed columns with the note's list.
- #526: on a rerun, `gh run view --job <id> --log` returns the latest attempt's log, not the failed one; the failed attempt's needs `gh api repos/…/actions/jobs/<id>/logs`.
- #526: under load a compile can block the event loop past Vitest's timer, so a test passed at 11 s under a 5 s limit: timeouts on compile-heavy tests are not deterministic; size them from CI's measures with a margin.
- #511: the walk of every global constructor of a bare `vm` context found a real gap on CI's Node 26 leg on its first ready run (`Temporal`, fixed by #521): a list a later Node can outgrow is generated from the runtime, not written by hand.
- #511: a kept entry keyed by path, with a namespace fallback, lets the list shrink as `core.ts` grows; a whole-namespace entry (`Intl`) would have hidden #521's refusals from the walk.
- #511: `npm run lint` covers `src/`, `scripts/` and `website/`, not `test/`, so a test-only PR's style goes unchecked.
- #527: a mutant matching by `Symbol.toStringTag` is the cheap proof of "refused by identity": `Object.create(Math)` inherits the tag and gets refused.
- #527: anything `core.ts` reads at load gets a test that loads `zapatos/db` with that global deleted or replaced: `Math`/`JSON`/`Reflect` read as bare names made a missing one crash the load.
- #527: no CI lane runs Node 22 with `--harmony-temporal`, so builders prove that runtime by hand (#515, #523); only `lts/*` covers `Temporal` in CI.
- #527: a PR's "Market" versions are checked against `npm view <pkg> version` when written (Slonik 47 cited, 49 current).
- #527: a built-in `core.ts` captures at load is read through `globalThis` with a fallback, never as a bare name; checkable by `no-restricted-globals` at module scope in `src/db/*.ts`, or a test loading the module with each captured global deleted (`vi.resetModules()` plus a dynamic import; `pg` stays cached, so only pgcast's modules are tested).
- #522: `check:agents` fails during a conflicted merge: `git ls-files src/*.ts` lists each unmerged file once per stage, so the deprecations check counts each "Set <key>:" message three times; it passes once the resolution is staged.
- #522: merging two opt-ins that touch the same lists is cleanest by putting each side's whole block back from `git show <side>:<file>`: diff3 interleaves the shared lines of two new blocks.
- #522: a claim that Postgres refuses a value is run on the oldest Postgres of CI (14), not only the local 17: interval input got stricter in 17 (commit 617f9b7d4), and 14/16 store `{ days: 1 }` sent as JSON as one second; with no older Postgres installed, the 14 and 16 legs are the only run of that branch, so the PR is marked ready early for them.
- #530: on 6.6.1 a plain `Date` or `Buffer` in `updateValues` compiled as a filter (`TRUE`, `("0" = $2)`): advice that must hold on 6.6.1 names `db.param()`.
- #530: the French site writes « un `Date` » (masculine), a choice the glossary does not record, so a new French line easily gets it wrong.
- #530: one "except" clause covering several kinds of value lists each that stored a value, identical to the CHANGELOG's list: `switching.md` dropped a case the CHANGELOG had (as in #503).
- #530: a 6.6.1 cell also tries the value as `pg` returns it through the column's old `Selectable` type (an interval typed `string` is an object at run time): the builder's grid and the docs both missed it.
- #530: advice for one value differs by place: in `updateValues` the plain value is sent as a parameter, in a `sql` template a plain `Date` throws and needs `db.param()`; a shared advice line names its place.
- #530: when a type change refuses calls that "worked", every shape whose own enumerable keys add up to one value (one character, one byte, one own field, one interval part) silently stored a wrong value under 6.6.1 (#503, #530): the replay grid holds a one-key variant of each refused built-in.
- #536: once `[Unreleased]` becomes a release, its notes enter `changelog.xml` as escaped HTML, so feed-only checks (the paths check read `/Users/&lt;/code&gt;` as a machine's path) are first exercised by the release PR: run `docs:build` on a release branch early.
- #537: the whole 6.7.0 section (~151,000 characters) exceeds GitHub's 125,000-character release body: the release notes are a subset (Security, Deprecated) plus links to the changelog page's anchors.
- #532: a fix of a generic `where` needs a large synthetic schema in its grid: the cross-product TS2590 ("union too complex") shows only from a few dozen tables, never on the 3-table fixture.
- #532: excess-property checks skip a generic indexed-access member of a union, so making each member a lookup by `T` turns the check off; the annotated form (`const w: s.WhereableForTable<K>`) keeps it.
- #532: a mutant also checks that each characterisation line fails for the reason it claims: a bare `sql` value stayed refused under the fix because #493 refuses it too.
- #532: a conflicting PR runs no `pull_request` workflow, so only CodeQL shows and it reads as "checks pass": the gate checks a CI run exists for the head SHA (`gh run list --commit <sha>`) and `mergeable` is not `CONFLICTING` (skill `ci-gate` § Pitfalls says it; a check could enforce it).
- #532: after a mutant `test:types` run, every probe reads the mutant's declarations from `node_modules/.cache/pgcast` until `test:types` runs again on the restored source; a docs replay wrongly showed calls compiling.
- #532: a claim like "keys still checked" on a generic intersection type is probed with a column of only one table, not only a key no table has: `WhereableForTable<K>` resolves to `A.Whereable & B.Whereable`, which takes either table's columns.
- #539: a union of 6.6.1's lookup with a lookup of the mapped type per table (`UpdatableForTable<T> | { [K in Table]: UpdateValuesForTable<K> }[T]`) restores generic bodies without TS2590 at 49 tables; a union with the generic mapped type itself breaks the excess check over a union of tables.
- #539: on TS 5.9, inferring `param('ok')` against the mapped `updateValues` depends on the order the program resolves types: a cell red in a small probe can be green in `test/types`, so its red test needs a program of its own (#538).
- #539: a replay grid for a value slot holds a `param()` of a string literal on an enum column and on a template-literal column (`TimeString`), in every context, generic ones included: `param(date)` and `param(1)` never test literal widening.
- #539: a stacked PR is re-merged onto its base's final head before review (`git merge-base --is-ancestor origin/<base> origin/<head>`), or the review diffs against a stale base.
- #539: a mutant that leaves an alias unused fails the declaration emit on `noUnusedLocals` (TS6196) before any test runs: keep the alias used (an export) so the mutant reaches the tests.
- #539: a characterisation over every table (`<T extends s.Table>`) holds a refused line beside the taken ones, to show its boundary: only `{}` and `any`-typed values get through there.
- #539: a clause listing the column kinds a type gap hits comes from a probe over every value-type shape of the fixture's `extra.type_zoo`, not a hand-picked list: `timetz` and a template-literal domain were missed twice (the PR and #538).
- #539: since #134's brands, "6.6.1's type" (`UpdatableForTable<T>`) no longer means 6.6.1's behaviour: a revert to an old type name is replayed against what the name now resolves to, and a decision that drops machinery counts the cells it re-admits as well as those it refuses.
- #541: indexing a mapped type over a concrete key union by a generic `T` is rewritten by TypeScript into a type mapped over `T` (microsoft/TypeScript#47109); a key-remapped mapped type (`[K in Table as K]`) is not, so `T` resolves through its constraint.
- #541: on TS 5.9, `param<T>()`'s inference picks between the column's `V` and a brand type by creation order; a brand written as a subtype of `V` (`V & { … }`) always loses to `V`, so a literal stays a literal.
- #541: the bench measures a small program, so a fixed per-program cost reads as +47 %; the PR measures the fixed part (+4,756 instantiations at 17 tables, +9,204 at 49) and the per-call part (12 against 72) separately.
- #541: an order-dependent type test needs a `tsc` program with a fixed `files` order; `AGENTS.md`'s `test:types` row and skill `type-tests` should name the programs `test:types` runs (`test/types-opt-in`, `test/types-order`).
- #541: merging #539 left `bench:types` at +4.4 % without refreshing the baseline, and #541's update absorbed it: a PR that moves the bench refreshes the baseline, or says how much of a change is inherited.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #522 (form): `website/versions.md` § opt-ins list, "which types an `interval` in `Selectable` as `pg` parses it": three "and"s end the list (FR too).
- #522 (form): `src/generate/tables.ts`, `rootOf(row)` computed for the note and again for the typing, each rebuilding `(isArray ? '_' : '') + name`: one shared value would keep them from drifting.
- #520 (defect): `test/types/core.test-d.ts` › `characterization: a bare template is refused`: the enum case the docs name is pinned only by a scratch probe; the fixture has a single enum column type.
- #520 (form): `CHANGELOG.md` Changed line of #493, "whose name another table's column of another enum has": hard to parse.
- #521 (form): `website/sql-template.md` § built-ins, "which the error names by their constructor (`PlainDate`)": `Intl` objects are named the same way (`Collator`); FR too.
- #521 (defect): `CHANGELOG.md` Unreleased: the #170 bullet (#416, #521, vulnerabilities) sits under `Fixed` where decision 003 says `Security`; settle the section at the 6.7.0 release.
- #519 (form): `website/versions.md` § opt-ins list, "by the base type of its innermost domain, and [`enumArraysTypedAsText`]": two "and"s end the list (FR too).
- #519 (defect): `CHANGELOG.md` enumArraysTypedAsText line and `website/generator.md`: an array of another schema's enum named like a built-in (`box.int4[]`) is typed `number[]` without `typeEnumsAcrossSchemas`, `string` under the key; not named, not frozen by a test.
- #516 (form): `website/switching.md` § Compile, "Give the value itself, sent as a parameter": for `{ title: db.cols('title') }` the advice could also name `db.cols([name])`.
- #516 (form): `test/types-opt-in/tsconfig.json`, "Type tests of an option declared in ConfigTypes": the program now also holds a declaration-emit test.
- #530 (form): `CHANGELOG.md` #503 entry, "The exception is `vals()` of one character": with the default config the interval is typed `string`, so #503 is what refuses `vals(row.c_interval)`, which stored 2 seconds under 6.6.1; the entry could point to it.
- #539 (form): `test/types/shortcuts.test-d.ts`, `const two = <T extends 'users' | 'active_users'>`: `{ created_at: date }` is refused by Postgres on `active_users` (42703); a comment would mark it a characterisation.
- #539 (form): `test/types-opt-in/updateValues.ts`: extra blank line at the end of the file.
- #541 (defect): `test/types/shortcuts.test-d.ts`, over every table: `param(anyV)`, taken by master on TS 5.9 `strict`, is now refused (as 6.6.1); no `@ts-expect-error` freezes it, and the PR body says "`any` itself is still taken".
- #541 (form): `AGENTS.md` `test:types` row and skill `type-tests`: the plain-`tsc` programs `test/types-opt-in` and `test/types-order` are not named.
- #541 (form): `scripts/bench-types.mjs` header, "each later call costs 12 where it cost 72": shape-dependent (about 21 against 77 for mixed one- or two-key calls).

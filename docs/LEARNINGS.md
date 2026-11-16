# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
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
- #519: Postgres names the array type of `tag` `_tag_1` when an enum `_tag` already exists, so detecting an array by the `_` prefix types it `any` (same on 6.6.1).
- #519: `pg` accepts as a write the array text it returned from `sql`, so code that writes a `sql` row back works today: why typing it `string` is an opt-in, not a Fix.
- #519: a probe database was terminated by another worktree's suite ("terminated by administrator command"); a `pool.on('error')` handler and caught errors in the probe script let the rerun pass.
- #519: three PRs in a row (R40/#44, #484, #519) decided a type from an enum found by name among the relation's schema's enums, not the type's schema's: a type predicate reads `otherEnums[udtSchema]`; a standard control column is an enum named like a built-in (`int4`, `text`) next to a column of that built-in's array (candidate for skill `codegen-output`).
- #519: a reviewer's probes run alongside `npm test` push codegen tests past their 5000 ms timeout: run the suite alone, or rerun a timed-out file alone before reporting it.
- #519: a note on a domain column waits for the placeholder's final text, known only once every relation is read (#42's last-wins; a schema with no enum of that name gives `any`): filter in `tsForQueries` on the shared `customTypes`.
- #519: under load from parallel worktrees the 5 s Vitest timeout fails different, unrelated tests on each full run: rerun the failing files alone.
- #519: two "would change" notes in a row (#484, #519) listed columns the option did not change: a test helper could diff the output with the key off and on and compare the changed columns with the note's list.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #519 (form): `website/versions.md` § opt-ins list, "by the base type of its innermost domain, and [`enumArraysTypedAsText`]": two "and"s end the list (FR too).
- #519 (defect): `CHANGELOG.md` enumArraysTypedAsText line and `website/generator.md`: an array of another schema's enum named like a built-in (`box.int4[]`) is typed `number[]` without `typeEnumsAcrossSchemas`, `string` under the key; not named, not frozen by a test.
- #516 (form): `website/switching.md` § Compile, "Give the value itself, sent as a parameter": for `{ title: db.cols('title') }` the advice could also name `db.cols([name])`.
- #516 (form): `test/types-opt-in/tsconfig.json`, "Type tests of an option declared in ConfigTypes": the program now also holds a declaration-emit test.


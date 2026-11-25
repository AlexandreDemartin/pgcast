# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

- #928 — a claim that a value "is no longer assignable" is tested where a type is expected too: a generic class's `new C()` takes its type argument from the annotation or parameter it meets — branch-reviewer
- #928 — the "README changed after its package shipped" rule is checked per package from its own last tag: `git diff <tag>..origin/master -- README.md tools/*/README.md adapters/*/README.md` — branch-reviewer
- #928 — declaration emit writes a type argument's default in full, so changing a default reaches consumers through their dependencies' published `.d.ts`; a compat grid for such a change includes an emitted `.d.ts` — branch-reviewer
- #931 — in a scratch measuring script that joins errors onto one line, `grep -o` with a length cap hid the first error; print the raw `tsc` errors before drawing a conclusion — builder
- #931 — `tsc` prints a file's path relative to the cwd it runs in, with no leading `/` below it: a normaliser anchored on `^.*/sweep/` stripped one run's paths and not the other's, and the diff showed every line; anchor on `^(.*/)?` and compare the line counts first — builder
- #931 — the same generic case checked in 9.5 s under `bench:types:large` and in 12.3 s in a scratch runner on a saved copy of its schema: a figure the docs quote is the lower bound ("over 9 s") of both, not one run's — builder
- #931 — a type test appended as the last test of its `describe` keeps every earlier line number, so a sweep of `@ts-expect-error` diffs master and branch with no line shift to account for — builder
- #946 — timings beside another agent's `npm test` spread 100–480 % on the sub-millisecond rows, medians within ±30 %: a speed PR runs `bench:runtime` on a quiet machine, or twice — builder
- #946 — a scenario whose SQL changes per call (an `OFFSET` that moves) makes client and `EXPLAIN` times disagree: each scenario compiles one text, so `EXPLAIN` measures what was timed — builder
- #943 — a cast panel's type is the built hover, not the one written by hand: check it in `.vitepress/dist/<page>.md` after `docs:build` — builder
- #943 — a PR body that names an upstream issue as `owner/repo#n` adds a backlink there: a reference "not posted" goes in backticks — builder
- #943 — an example that needs Postgres 17 (`EXPLAIN … SERIALIZE`) cannot go in `examples/`, which `docs:examples` runs on CI's oldest Postgres (14) and on PGlite: an inline twoslash block, compiled only — builder
- #948: a count written from memory in a note was wrong twice ("30 cases" for 33, "45 Postgres types" for "45 cases"); grepping the probe's output and the quoted issue before the commit caught both.
- #940 — a top-level form that needs a transform of its own also replaces `run`, since `run()` compiles `this`, not the form a transform expects — builder
- #940 — a conversion moved into the select list changes what `ORDER BY` and `DISTINCT` compare (`to_jsonb` of a `timestamptz` sorts as text, DISTINCT + ORDER BY expression gives 42P10): convert above the unchanged sub-SELECT, as the aggregate does — branch-reviewer
- #940 — a top-level form is a fragment of its own even when its SQL is the same: `Object.assign` onto a fragment the nested form also holds leaked `preparedName` and `noop` into a CTE; checked by walking the nested tree and compiling each nested form before and after a top-level compile — branch-reviewer
- #940 — `setConfig` merges, so a probe harness sets every key it relies on on each run — branch-reviewer
- #940 — a red test with two cases asserts each right after its own run: when both ran first, one case's 42P10 hid the other's wrong order — builder
- #940 — a verifier's script that joins `__dirname` with a folder name runs only from its own folder: `path.resolve` lets the fix round aim it at another build — builder
- #950 — an option that changes a nested query's SQL type (`jsonb` → `json`) is retried in every parent slot that compares or groups the child's value as it is: `DISTINCT` over a passed-through lateral failed on `json` (42883) while the row expression was handled — branch-reviewer
- #950 — a marker that a copy must keep goes on a value `copy()` already shares by reference (the query's own `runResultTransform`), not on the fragment, whose symbol keys `copy()` drops; it then survives `copy({ literals })` too, so a test of "the caller's SQL stays as written" includes an overridden copy — builder, branch-reviewer
- #950 — Postgres counts an identifier's 63 bytes in the server encoding: a UTF-8 byte guard is exact only in a UTF-8 database, checked with a throwaway `ENCODING 'EUC_JP' TEMPLATE template0` database — branch-reviewer
- #950 — a merge can conflict with no textual hunk: master made `selectRows()` share one `rowsResult` while the branch marks each query's transform; grep the merged file for every place one side mutates what the other made shared — builder
- #950 — `toEqual` ignores key order, which was the only symptom of a `to_jsonb` wrapper under `json`: combined-option tests compare `Object.keys` too, on a `json` column whose keys are out of `jsonb` order — builder, branch-reviewer
- #950 — `git push` answered "remote rejected (Internal Server Error)" twice: compare `git rev-parse HEAD` with `git ls-remote` before going on — builder
- #950 — `guard.mjs` refuses `git merge --no-edit`: `git merge --no-commit`, then `git commit -m` with the trailer — builder
- #950 — a verifier whose `node_modules` links to the builder's rewrote its `node_modules/.cache/pgcast` with `typecheck`: SQL and value probes can share it, `typecheck`, `test:types` and `bench:types` need their own `npm ci` — branch-reviewer
- #950 — `bench:runtime -- --config <json>` gives the before and after of an option in one process, on the same database — builder
- #954 — a branch that tells pgcast's own fragment from a caller's value with `instanceof SQLFragment` lets a caller's fragment past the type take it too: mark our own with a flag or an argument (`SQLForJSONObject`'s `ours`) — branch-reviewer
- #954 — wrapping a caller's expression in a scalar subquery changes how Postgres resolves it (an aggregate, window or set-returning function binds to the subquery, an untyped `$n` becomes `text`): probe each refusal of the outer clause both ways, 42803, 42P20, 0A000 and 42P18 — branch-reviewer
- #954 — a ±10 % server-execution difference on a 10,000-row write reversed between runs of one build: a claim of "less" quotes at least two runs, else it says "no more" — branch-reviewer
- #954 — `test/unit/injection.test.ts` § shortcut options has no `afterEach(resetConfig)`: a test there that calls `setConfig` adds `onTestFinished(resetConfig)` — builder
- #954 — in French text, write U+00A0 into new text directly; replacing " :" afterwards misses a `:` with no space before it (`check-translations` caught it) — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.

- #940 — `defect` — with `topLevelSelectAsRows` on, `query.run = (queryable, force) => topLevel().run(queryable, force)` (`src/db/shortcuts.ts:1043`) no longer goes through `query.compile`, so a caller who wraps `compile` on a `select()` (to prefix a `/* tag */`) sees the wrap dropped on, where `selectExactlyOneChecksForSecondRow`'s `run()` calls `this.compile` and keeps it; worth a line in `runtime-config.md` beside the one on `runResultTransform`? — branch-reviewer
- #940 — `defect` — under `withCTEs()`, the main query's top-level form reads `noop` from the query's last top-level compile (`src/db/shortcuts.ts:1446`, `withClause(topLevelQuery)`), so its SQL depends on the order of calls; master's `selectExactlyOneChecksForSecondRow` does the same; follow-up for both opt-ins: `topLevel()` copies instead of assigning, `withCTEs()` reads `noop` from `query` at the call — branch-reviewer
- #950 (defect) — the 63-byte guard on a key alias (`src/db/shortcuts.ts` `SQLForKeyAlias`, `website/runtime-config.md` and `website/select.md` § With `shortcutsUseJson`) counts UTF-8 bytes, where Postgres truncates an identifier in the server encoding: in an `EUC_JP` database a key of 31 × `é` (62 bytes in UTF-8, 93 there) passes and comes back cut to 21 characters. The wording could say "in a UTF-8 database", where the count is exact; `src/db/conditions.ts` counts the same way. — branch-reviewer
- #950 (defect) — `website/select.md` § With `shortcutsUseJson`, the `distinct: true` row, names the passed-through `select()`, `selectOne()` and `selectExactlyOne()` alone: a `sql` child that wraps a shortcut, ``lateral: db.sql`SELECT (${db.selectOne('studios', { id: db.parent('studio_id') })}) AS result` ``, runs with the option off and fails with 42883 with it on, its SQL the caller's and compared as written. One clause could say that a shortcut inside a `sql` child is `json`, so it needs a `to_jsonb()` wrap under `distinct: true`. — branch-reviewer
- #950 (defect) — a `copy()` whose `literals` or `expressions` are overridden is still a query and keeps the `jsonResult` marker, so under `distinct: true` the parent wraps the caller's SQL in `to_jsonb()`: `.copy({ literals: ['SELECT 7::bigint AS result'], expressions: [] })` as a passed-through lateral gives `'7'` off and `7` on (a `timestamptz` a `Date` off, a string on); `withCTEs()` takes the same override path, so `copy()` cannot tell them apart without `core.ts`. The comment on `jsonResult` (`src/db/shortcuts.ts:176`) or the `distinct: true` row of `website/select.md` (and `fr/`) could say that such a copy is compared as `jsonb`. — branch-reviewer
- #939 — `form` — with `shortcutsUseJson` on, `select()`'s aggregate is `json_agg`, but `src/db/shortcuts.ts:937` and `:1485` and `website/runtime-config.md:104` and `:322` (and `fr/`) say `jsonb_agg`: "its aggregate" holds under both options — branch-reviewer
- #954 — `defect` — `src/db/shortcuts.ts:235` `returning.map(…)` with `shortcutsUseJson` on: past the type, `returning: 'id'` throws a synchronous `TypeError` from `db.insert()`, where off (Zapatos 6.6.1) `mapWithSeparator` makes `.run()` reject with 42703; `mapWithSeparator` would keep the failure where it was, and `select()`'s `columns` does the same on master — branch-reviewer
- #954 — `form` — `docs/decisions/018-json-output.md:107` misses its link: "so every write that `RETURNING` accepts gives the same values in the scalar subquery, which also takes some of what `RETURNING` refuses (…)" — branch-reviewer

# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #992 — docs:examples caught what check-prose cannot: a docs example that hand-writes a driver result (`rows: [{ result: … }]`) follows the SQL's shape, and check-prose compares SQL text only; a step that changes the rows a query sends greps `result: \[` across website/examples and the pages (#992).
- #992 — A test helper that read `q.runResultTransform` and ran `q.compile()` by hand broke under the rows form, the trap the migration entry names for users; going through `q.run()` with a client that rewrites the text keeps such helpers honest (#992).
- #992 — When a removal makes an opt-in's form the only behaviour, the opt-in's docs section becomes a stub: each exception it listed needs a home in the reference of the member it affects (`sql-template.md` § `runResultTransform`), not only in the migration entry, or the reference turns false unnoticed (#992).
- #992 — When a shortcut's top-level form differs from its nested form, check each property `copy()` carries (`preparedName`, `runResultTransform`) against that difference: a name kept with another text breaks prepared statements on one connection (#992).
- #992 — A migration entry's grep finds reads as well as assignments: `runResultTransform(` as well as `runResultTransform =` (#992).
- #992 — When every fix of a blocking item is docs, its "red test" can only freeze what the branch already does and passes from its own commit: a fix brief names that case instead of asking for red then green (#992).
- #992 — `npm run docs:translated` takes page names (`-- switching sql-template`); run bare, it throws (#992).
- #992 — A brief's "master touches only X" goes stale within the round: after merging master, `git diff --stat HEAD^1 HEAD` says what came in (#992).
- #992 — A sentence that limits a behaviour to one entry point ("a `select()` run on its own") is replayed on every entry point the same mechanism covers: the main query of `withCTEs()` took the same path and the sentence left it out (#992).
- #992 — The #981 rule (read before and after) applies to each case of an entry's list, not only to the entry: a fix that adds a bullet can give its "after" inline and never reach **Before → after** (#992).
- #998 — Running a prepared child and its embedding in both orders tells a historical name collision from one a change of SQL introduced: the builder's replay stopped a break 019 does not list — codex
- #998 — Put an empty CTE list on either side of another wrapper when testing whether the public compiler and transform survive composition — codex
- #998 — Count server-side prepared statements on the connection that ran them, after repeatedly creating copies as well as repeatedly running one copy: a compiled name alone misses a copy the test never executed — codex
- #998 — Comparing the code spans of the English and French migration entries caught a missing `oldTransform` assignment — codex
- #999 — In the characterisation report, a finding's class is the first word of its Proposal cell: a removed opt-in appends to the cell and keeps **opt-in** (R9, R16, R14); R14 is the first case where 8.0 keeps the unfixed behaviour.
- #999 — The first removed key whose kept value is `false` turns the refusal grid's hard-coded `false` into `!kept`, and rewords `runtime-config.md:28` ("the one 8.0 always behaves as (`true`)").
- #999 — Removing a config key breaks `docs:build` through `check-changelog.mjs` when an old CHANGELOG line still type-checks a snippet setting it: grep the CHANGELOG for `<!-- tsc -->` on the removed key.
- #999 — `bench:types` compares with `bench/baseline.json`, stale on master itself (+7.4 %): measure master in a detached worktree before reading a rise as the PR's.
- #999 — A docs claim that names a parameter by position ("its last parameter") breaks under an option that adds one after it (`offset` after `LIMIT`): name the clause, and probe it with every option that appends a parameter.
- #999 — A scratch copy whose `node_modules` links another checkout's makes `npm run test:types` write that checkout's `node_modules/.cache/pgcast`: a separate install when that checkout must stay untouched.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- `defect` `test/unit/injection.test.ts:2400` (#981): the Date-row upsert batch passes `updateColumns: ['display_name']`, so the hostile key no longer reaches `DO UPDATE SET (…) = ROW(EXCLUDED."…")` in the batch case; `updateColumns: [v, 'email', 'display_name']` gives master's text.
- `form` `README.md:87-88` (#981): the opt-ins table rows of `upsertRequiresSameKeys` and `undefinedMeansMissing` do not say "always on in 8.0, the key removed", as the other rows do; for #977 if not before.
- `form` `website/switching.md` § from 8.0, `upsertRequiresSameKeys` entry (#981): its `updateColumns: ['votes']` example has every row give `votes`, so it shows no difference; a table whose rows differ on one column and share another outside the target would show it.
- `defect` `website/switching.md:313` and `fr/:314` (#981): "A key a row lacks still sets that row's stored value to `DEFAULT`" now stands alone and reads as true of any missing key; it holds only for a key `updateColumns` names.
- `form` `src/generate/tables.ts:215-217` `keepsText` (#982): its comment describes a case no test reaches since the `placeholder_hues` test went (the mutant `keepsText = false` keeps the 367 codegen tests green); say it is unreachable from 8.0.0, or freeze a case.
- `defect` `adapters/pglite/test/browser-bundle.mjs` (#983): its paths come from `new URL(…).pathname`, which keeps `%20`, so `check:browser` fails in any checkout whose path has a space; `fileURLToPath` fixes it.
- `form` `website/transaction.md:~730` and FR (#983): "By default, a batch upsert…" / "Par défaut, un upsert de plusieurs lignes…" left over from #981, where 8.0 has no other behaviour.
- `defect` `website/runtime-config.md:462` and FR `:467` (#983): "8.0 removes all but `aggregatesTypedByColumn`", but 019 § 3 removes it too; #968 rewrites the sentence to name what 8.0 removed.
- `defect` `website/switching.md:357` and FR `:358` (#983): `grep -rn "'BEGIN"` misses `"BEGIN"`, `` sql`BEGIN` ``, lowercase `begin` and `START TRANSACTION`; `grep -rniE "[\"'\`](begin|start transaction)"`.
- `form` `docs/CHARACTERISATION-REPORT.md:56` R10 and `:73` R22 (#983): "fixed" twice in one cell; one status per version, as R8 and R9.
- `defect` `website/switching.md:424` and FR (#984): the `uniqueIndexConstraintsOnly` entry gives after code for a `WITHOUT OVERLAPS` key under `DO NOTHING`, not for a deferrable parent key on a partitioned table with immediate partition keys (TS2345 after regenerating); point to the same explicit `sql` statement.
- `form` `.agents/skills/codegen-output/SKILL.md:16` (#984): the rule's only example, `domainsTypedByContext`, is a removed key.
- `form` `src/db/utils.ts:17` (#984): a short line mid-paragraph in the rewrapped JSDoc.
- `defect` `website/switching.md:407` and FR `:408` (#985): "arithmetic on a sum is TS18047" holds with `strictNullChecks` from TypeScript 4.9; TS2531 on 4.1, compiles with `strict: false`.
- `form` `website/aggregates.md:3`, `website/select.md:143`, `:311` and FR twins (#985): "By default" / "Par défaut" where 8.0 has no other typing.
- `form` `CHANGELOG.md:15` (#986): "refused too, as 7.x's `tsForConfig()` read it" does not name the one config that goes from working to refused: `generate()` with an inherited removed key, which 7.x's `finaliseConfig()` spread dropped.
- `form` #989 `website/switching.md` § from-8-0-valuesTypedAsAliases: **What you see** could name that `--check` or `check()` in CI fails after the upgrade until `schema.d.ts` is regenerated.
- `form` #989 `CHANGELOG.md:17`: the `bench:types:large --aliases` removal is contributor tooling on a user-facing Breaking line; `docs/WORKFLOW.md` already says it.
- `defect` `test/integration/injection.test.ts:994`, `:1000` (#988): `"nul key"` and `"prequotedCloses key"` record a codeless throw as `undefined`, so a refusal for another reason passes too; the comment at `:938` still says a lateral key is a parameter (extended protocol).
- `defect` `website/switching.md:424` and FR `:425` (#988): `{"balance" : 20.00}` is `json_build_object`'s text, with `columns` or `returning` only; without them `to_json` writes compact text.
- `form` `src/db/transaction.ts:614` (#988): "its one `jsonb_agg` row" is now `json_agg`.
- `form` `website/select.md:64`, `website/runtime-config.md:258`, `website/performance.md:12`, `CHANGELOG.md` (#988): four figures for the same lateral scenario; keep one, link to it.
- `form` `src/db/shortcuts.ts:202` (#988): names `$action` for writes, which have none.
- `defect` `adapters/pglite/test/browser-bundle.mjs` (#988): `new URL(...).pathname` keeps `%20`, so `check:browser` fails in a checkout whose path has a space; use `fileURLToPath`.
- `form` #988 `website/switching.md` § from-8-0-shortcutsUseJson and `website/select.md:67`: the way out (`::jsonb`, `->>`) does not fix a `groupBy` beside a `lateral` (42803); add `->>` to the 42803 sentence and restore select.md's link to `/lateral#filter-sort-and-group-by-a-lateral`, EN and FR.
- `defect` #988 `website/switching.md:426` (FR `:427`): an untyped value on the other side of `@>` (nested right) or `<@` (nested left) fails with 42725, not the 42883 the entry names; name it or give no code for operators.
- `form` #988 `website/switching.md:426`: "`COALESCE`, `CASE` or `UNION`" reads as closed (`GREATEST`, `INTERSECT`, `VALUES`, `ARRAY[…]`, casts give 42846 too; "such as"); `->> 0` on an array of objects keeps `json`'s spacing; the bullet (~120 words) would read better split.
- `form` `website/switching.md:440`, `website/runtime-config.md:264`, their FR twins and `CHANGELOG.md:15` (#992): the 10k-row bench reads 240 in the docs and 242 in the CHANGELOG; the default column gives 242.2 ms, 240.6 is the prepared one: one figure.
- `defect` `website/runtime-config.md:254` and `fr/:259` (#992): § shortcutsUseJson "and `select()` its array with `json_agg`" is now true only nested or copied.
- `form` `website/switching.md:453` and `fr/:454` (#992): the prepared copy gets its "after" inline only, where the other cases get a before → after; add `q.copy()` → `q.copy({ preparedName: 'films_agg' })` (or let #993 remove the case).
- `defect` `website/sql-template.md:571` and `fr/:575` (#992): "A `select()` run on its own" leaves out the main query of `withCTEs()`, which behaves the same; say it as `CHANGELOG.md:15` does.
- `form` `CHANGELOG.md:15` (#992): eight effects in one sentence joined by semicolons; name them and link the migration entry (skill `concise-docs`).
- #998 — `defect` `website/switching.md:440`: "sends `selectRows()`'s query" holds except for a passed-through `count()` lateral, where `select()` wraps it in `to_json(result)` and returns `[2]` against `selectRows()`'s `['2']`; qualify it EN and FR as `sql-template.md` does — codex
- `form` `README.md:93` (#999): the opt-ins row still says "a standalone `selectExactlyOne()` throws on a second row" with no "through 7.x … removed in 8.0, `LIMIT 1` alone", as the `topLevelSelectAsRows` and `shortcutsUseJson` rows have; for #977 if not before.
- `defect` `website/switching.md:456` and `fr/:457` (#999): "its last parameter is `1`, not `2`" is false with an `offset` (`LIMIT $2 OFFSET $3`, `[1,2,1]` → `[1,1,1]`); "its `LIMIT` parameter" / "le paramètre de son `LIMIT`".
- `form` `website/switching.md:458` and `fr/:459` (#999): the before span does not say it ran under `true`, as its siblings say "with `false`"; "…<!-- tsc -->, with `true`, becomes" / "…, avec `true`, devient".
- `form` `website/runtime-config.md:228` (#999): "`true` made one run on its own ask for two rows" does not say what ran; "a `selectExactlyOne()` run on its own", as the FR twin (`:233`) says.

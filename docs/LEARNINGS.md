# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

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

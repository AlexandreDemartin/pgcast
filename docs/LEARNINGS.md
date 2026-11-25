# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

- #959 — `check:agents` caps a skill `reference.md` at 1,800 words; `type-tests/reference.md` is at the cap, so its next line needs a trim or a new home — builder
- #960 — Decision 019 § 3 and § 6 changed what 8.0 does with two opt-ins, yet `versions.md`, `why.md` and two option entries, EN and FR, kept "for good" and "stays off in 7.0": a decision PR greps the site for each promise it overturns — range review
- #960 — `shortcutsUseJson`'s entry, the `select.md` and `insert.md` sections and `performance.md` named a 7.3.0 option with no version while the site deploys master: an option's PR opens every section that advises it with "From x.y.z." — audit
- #960 — #959 merged item 5's roadmap line while this step was being built: a fix step rereads `origin/master` before an item that an open PR may already cover — builder
- A U+00A0 typed through the Edit tool lands as a plain space: check a French edit's bytes, or insert it with a scripted replace (#980).
- A compat-rule sweep greps `.claude/agents` too: the reviewer's compat question lives there, outside `.agents` (#979).
- A pgcast.dev URL in a "…"-quoted message on a French page becomes a link that `check-translations.mjs` refuses as English: quote such a message as a code span with `<!-- message -->` (#981).
- A "…" in a docs quote of a message cannot stand for part of a template's fixed text: quote it whole, or elide only its interpolations (#981).
- `check:agents` does not check the characterisation report's "Test that pins it" cells: a test rename or removal greps `docs/CHARACTERISATION-REPORT.md` by hand (#981).
- A test moved from a removed option to `updateColumns` "with the same SQL" is diffed against master's compiled text: the injection matrix compares rows with each other, never with master, so a lost hostile `EXCLUDED."…"` failed nothing (#981).
- A migration entry's "Before → after" can hold only an "after": a review checks both code spans, in both languages (#981).
- A `<!-- tsc -->` mark proves something only if the checker reads the span: break each new span in a scratch copy and see the check fail at its line and column; a passing count does not show it (#981).
- A docs test of a migration entry (its heading, its quoted message) goes in the docs commit, not the code commit, so each commit stays green (#982).
- A "PR #n" in a characterisation report row is committed after the PR opens, never as a placeholder (#982).
- A refusal placed at entry points covers every exported function that read the key on master: `git grep <key> origin/master -- src`, each read traced up to its exported caller (`definitionForRelationInSchema()` was missed, #982).
- A guard calling `Object.prototype.hasOwnProperty.call(arg, …)` on a public function's argument throws on `undefined`/`null` where the old `{ ...arg }` did not: replay `f(undefined)` on master and the branch (#982).
- On the docs schema, `every.<enum>` is a type namespace, not a value: a migration example reads it at type level (`type X = s.every.crew_job[0]`) or as a tuple annotation (#982).
- A `<!-- tsc -->` mark only checks a span whose tables exist in the docs schema; examples taken from the generator page (`prints`, `archive.*`) stay unchecked (#982).
- `guard.mjs` refuses a plain `git merge origin/master`, a trial one too, since its commit has no trailer: `git merge --no-commit origin/master`, then `git commit -m "…" -m "Co-Authored-By: …"` (#982).
- Two PRs adding entries to one docs section each with its own intro leave the second intro under the first PR's last `###`: one shared intro for the section, decided before the second PR opens (#982).
- When a key is removed, `<!-- tsc -->` marks on old CHANGELOG lines that set it stop compiling: `git grep -nE 'transactionRequires[A-Za-z]*: [a-z]*[^`]*`<!-- (tsc|probe)'`, with the removed key (#983).
- Removing an option can leave data that records the old behaviour with no test asserting it any more (the 6.6.1 `old` data of the block cases): keep it only as the record behind a docs table, and say so (#983).
- `@ts-expect-error` proves that an error is there, not which one: when a criterion, a doc or a migration entry names a code (TS2353, not TS2559 for a weak type), compile the line once without the directive (#983).
- `leak-check.sh` reads a PR, not an issue: a plan comment posted on an issue is not covered (its GraphQL call fails on an issue number and still prints `clean`); check the issue thread with the same pattern after posting (#973).
- `git diff -- 'website/*.md'` matches `website/fr/` too, as the pathspec `*` crosses `/`: `-- website ':!website/fr'` gives the English pages alone (#984).
- A replay of `tsForConfig()` compares `customTypeSourceFiles` with sorted keys: their order follows query completion (#984).
- A PR that removes an option greps `.agents/` and `AGENTS.md` for the key too, not only `website`, `README.md` and `tools`: a skill kept citing a removed option as its rule's example (`git grep -n <key> -- .agents AGENTS.md`, #984).

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

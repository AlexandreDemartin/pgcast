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
- A skill or `docs/WORKFLOW.md` that names a test project goes stale when a step deletes it: grep `.agents/` and `docs/WORKFLOW.md` for every path a step removes (`test/types-opt-in/legacy`, #985).
- A leftover 7.x `ConfigTypes` augmentation makes `db.ConfigTypes` resolve again: a type error a doc names holds only for the case a probe compiled (#985).
- `<!-- tsc -->` spans compile as modules, so a migration's top-level `await` compiles as written (#985).
- A removal that edits a docs sentence listing the cases a type refuses compiles each case kept and each taken out; diffing the sentence against its JSDoc twin is the cheap check ("X, Y, and Z unless <option>" lost X and Y with Z, #985).
- A docs fact the page leaves out, which the JSDoc and tests state, has no check to fail on: its red step is a scratch probe, quoted in the PR (#985).
- A type harness outside the checkout compiled against `test/generated/tsconfig.json` sets `rootDir: "/"` (else TS6059 stops tsc before any check, and a per-line grep reports "compiles" for every case) and includes `test/types/custom/PgPreferences.d.ts` when it excludes the generated one (#985).
- A removal step checks how master read each key: by spread (own keys only) or by property access (inherited too); the refusal reads the same way, or a 7.x reader switches without a word (#974).
- A test that the CLI exits at once on a closed port says nothing of queries in flight, as every connection fails together: keep one in flight while another fails (a trap that sleeps, or an ACCESS EXCLUSIVE lock held by another session on a table with a column `DEFAULT`, which blocks the columns query) (#986).
- Removing a read of the caller's config (`suppliedConfig.key`, `{ ...suppliedConfig, key }`) also removes the TypeError it threw on `null` or `undefined`: replay both on master and branch (#986).
- To stop a run as soon as a query fails, act where it fails, not in a catch around the run: a `finally` that ends a pool, a stream or a server waits for the work in flight first (#986).
- A removal that makes a variant the default turns its "same types" equality test into a comparison of the output with itself: the proof moves to the PR, as a probe against master's output (#975).
- A wait for another PR to land checks `gh pr view --json mergeStateStatus` first: polling `git log origin/master` while it is BLOCKED spends the whole wait for nothing (#975).
- learning: a comment added inside a script's template literal (the `source` of `check-declarations-floor.mjs`) must not hold backticks; lint caught it as "Unexpected token".
- learning: a change that shrinks the generated schema moves the memory ratios of every `bench:types:large` case, not only libCheck's; plan a full `--update` (about 20 min), not `--cases libCheck` alone.
- learning: `vitest run -u test/integration/codegen.test.ts` ran all 29 files; with `-u` placed before the path, the filter was not applied.
- learning: a rewording that moves a claim's reference point (from 7.x's written-out union to Zapatos 6.6.1's) must be replayed against the new reference for each case; #654 made the Insertable differ from 6.6.1's.
- learning: a "same output" proof that compiles only the main variant is completed cheaply by expanding each snapshot diff's added alias line through the old template and comparing it with the removed line: every variant in under a second, no database.
- learning: before writing "same as Zapatos 6.6.1" about a type, check it against 6.6.1's `dist/generate/tables.js` (cached under `node_modules/.cache/pgcast-zapatos-661/`); pgcast changed the generated unions after 6.6.1 (#654), so the last pgcast release is usually the safer reference.
- A `gh issue comment` that times out (502/504) may still have posted: check `gh issue view --json comments` before retrying (#969).
- Probes that need a changed `src/` go in a detached scratch worktree from the start: auto mode refuses a temporary edit of the checkout (#969).
- Rewriting failing test literals from captured values trusts the actual value: a helper that extracts a substring and falls back to the full text was silently rewritten to the fallback, and shared helpers (`insertSQL(...)`) were inlined; flag rewrites whose length moves a lot and diff for removed helper calls before committing (#969).
- A replay compared as a multiset per test, with a fallback per file, survives renamed tests; random statement names and pids are named in Proofs (#969).
- A one-shot `git grep` for a removed SQL form missed four prose lines that a per-page hit count, EN against FR, found: count per page before committing the English (#988).
- `node check-prose.mjs`, run from `website/`, checks every docs probe in about 10 s without `docs:build`: the fast loop for SQL text in the docs (#988).
- When an entry of another class joins a migration section (group B: the 7.x default is not the kept value), reread the section's intro: its general claims ("never set → no change") were written for the entries already there (#988).
- `bench:runtime` can fail its gate from machine load alone (spreads over 200 %, load ~10 gave +61/+76 % on prepared inserts; a calm rerun −9/+7 %): read the spread column and `uptime` before calling a red gate a regression (#988).
- A shipped gain with no baseline refresh leaves the gate blind to losing it (a lateral back from 19 to 90 ms passes under +50 % of 63.8; a `null` baseline is never gated): the bench script's refresh rule should cover a measured gain, not only a justified slowdown (#988).
- `adapters/pglite`'s `check:browser` fails whenever the checkout path has a space: `test/browser-bundle.mjs` hands Vite `new URL(...).pathname`, which keeps `%20`; `fileURLToPath` fixes it, a symlink with `--preserve-symlinks --preserve-symlinks-main` works around it (#988).
- In a worktree `.git` is a file: `git commit -F .git/MERGE_MSG` fails; use `git rev-parse --git-path MERGE_MSG` (#988).
- To check a merge commit, rebuild it with `git merge-tree --write-tree <ours> <theirs>` and diff that tree against the real merge: only the hand-resolved lines show, so a dropped line of the other branch shows at once (#988).
- Local `docs:build` does not run the docs examples against Postgres: a change of SQL output runs `cd website && npm run docs:examples` too, or CI's `docs` job is the first to see a documented pattern break (#988: `GROUP BY` over a `json` lateral, 42883).
- One probe script can check Postgres and PGlite: `.compile()` once, then send the same text to a `pg` client and to `open(schema)` from `website/.vitepress/playground/pglite.ts` (#988).
- After a change of SQL type, grep the docs for the old type's name too, not only the failing example: a page still said a nested result is `jsonb` after round 1 (#988).
- A type change that drops operators (`jsonb` → `json`: no equality, no ordering) is documented by its cause, "anything that compares or sorts it fails", not by a list of clauses: each list left one out (`GROUP BY` in round 2, then `ORDER BY`, `=`, `IN`) (#988).
- learning: running the way out before writing it showed that `::jsonb` and `->>` do not fix a `select()` `groupBy` beside a lateral (42803); a way out written from memory would have been wrong.
- learning: `update()` refuses `db.all` as a filter, so a probe that writes every row needs `db.sql\`TRUE\``.
- learning: changing a value's type from `jsonb` to `json` does not always fail loudly: `||` with an untyped literal resolves to `anynonarray || text` and returns text; a migration entry for a type change is checked against the old type's operators and against mixing with it (COALESCE, CASE, UNION), not only its functions and comparisons.
- learning: three rounds on one migration entry came from lists written from memory; the class of a type change is enumerated from `pg_operator`/`pg_proc` once, not case by case.
- learning: a sweep built from the catalog (`pg_operator` and `pg_proc` filtered on `jsonb`, each in 7.x's shape, 8.0's and the way out, on both engines) closed in about 15 calls a class that three lists written from memory kept missing.
- learning: the class has a boundary: assigning into a `jsonb` column and the polymorphic `jsonb` builders (`to_jsonb`, `jsonb_agg`, `jsonb_build_object`) are unchanged, so the entry need not list them.
- learning: an error code named for "an operator that takes only jsonb" is checked with an untyped value on the other side too: `unknown @> json` and `json <@ unknown` resolve against the polymorphic range operators and fail with 42725, which a sweep of typed operands misses.

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

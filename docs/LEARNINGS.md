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

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- `defect` `test/unit/injection.test.ts:2400` (#981): the Date-row upsert batch passes `updateColumns: ['display_name']`, so the hostile key no longer reaches `DO UPDATE SET (…) = ROW(EXCLUDED."…")` in the batch case; `updateColumns: [v, 'email', 'display_name']` gives master's text.
- `form` `README.md:87-88` (#981): the opt-ins table rows of `upsertRequiresSameKeys` and `undefinedMeansMissing` do not say "always on in 8.0, the key removed", as the other rows do; for #977 if not before.
- `form` `website/switching.md` § from 8.0, `upsertRequiresSameKeys` entry (#981): its `updateColumns: ['votes']` example has every row give `votes`, so it shows no difference; a table whose rows differ on one column and share another outside the target would show it.
- `defect` `website/switching.md:313` and `fr/:314` (#981): "A key a row lacks still sets that row's stored value to `DEFAULT`" now stands alone and reads as true of any missing key; it holds only for a key `updateColumns` names.

# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #512: a Done when that names one mutant for every row is checked against each shape before the issue is written: a primitive's property reads `undefined` and a stored `null` is reset to the default, so neither goes red on a plain direct read.
- #512: `getConfig()` returns `{ minMs: undefined, maxMs: undefined }` for a truthy primitive `transactionRetryDelay` (`100`), where 6.6.1 returned `100`; nothing throws, value only.
- #521: `vitest run --execArgv=--harmony-temporal` passes a V8 flag to the forks, and `npx -y -p node@26 node node_modules/vitest/vitest.mjs run` runs the suites on a Node not installed: a built-in of a later Node can be tested locally.
- #521: Vitest hides `console.log` from a passing test, so a probe writes its output to a file.
- #521: an unquoted heredoc in zsh runs the backticks inside it; quote the heredoc for anything written as Markdown.
- #521: a claim that a built-in appears "from Node N" is checked on the majors just before N, not only the CI legs (20, 22, `lts/*`): `npx -p node@<v> node -p "typeof X"` from the lowest supported major (`Intl.DurationFormat` was dated 26, Node 23 has it).
- #521: a PR that changes what `core.ts` refuses checks the test-side lists that mirror it (#511's `keptConstructors`) and says which side changes in which PR.
- #521: `temporal-polyfill/global` replaces `Intl.DateTimeFormat` too, so the load order of a polyfill decides whether `Intl` values are refused as well; it is a no-op where the runtime has `Temporal`.
- #521: have the French proofread before committing a docs fix, or "one commit per blocker" costs extra commits.
- #521: two "from Node N" claims in a row were wrong at first (`SuppressedError`, `DurationFormat`): a script running `typeof <global>` on each major could check them.
- #521: a clause naming one runtime version ("on Node 26") for something read from `globalThis` says "where the runtime has one": a flag (`--harmony-temporal`) adds the object on an older Node.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #521 (form): `website/sql-template.md` § built-ins, "which the error names by their constructor (`PlainDate`)": `Intl` objects are named the same way (`Collator`); FR too.
- #521 (defect): `CHANGELOG.md` Unreleased: the #170 bullet (#416, #521, vulnerabilities) sits under `Fixed` where decision 003 says `Security`; settle the section at the 6.7.0 release.

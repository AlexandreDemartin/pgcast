# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #846 — run-step SKILL.md is at 1787 of 1800 words: its next amendment needs a reference.md or a cut first — builder
- #846 — check:agents' `sectionErrors` captures past a comma (`§ Transactions, then …` is read as one section name): a cited list of sections ends each name with `;` or `.` (folded into #845) — builder
- #846 — a verdict proof per kept row is cheaper scripted from a line→target map and a line→key-term map: a missing or doubled assignment shows at once (L203 and L227 had been left out) — builder
- #846 — `check:agents`' `sectionErrors` checks only the first `§` after a `](reference.md)` link: a core that lists several sections in one sentence leaves the rest unchecked, so write one link per section until #845 lands — branch-reviewer
- #846 — a rule merged from learnings about a catalog relation (parent and child, partition, foreign table) is checked against the query that implements it (here the walk over `pg_inherits` in `origins.ts`): a merge can move the condition to the wrong side of the relation — branch-reviewer
- #846 — a per-section citation joined by "and" (`§ Watch mode and [reference.md] § …`) is read by `sectionErrors` as a section named "Watch mode and": join the citations with commas — builder
- #846 — a reworded rule breaks the method PR's kept-row proof wherever its key term changed (4 of 221): rerun the proof after each fix round and update the key terms with the rules — builder
- #847 — a check that must run before an import's side effect (a missing peer) is a tiny module imported first: TypeScript's CommonJS output keeps import order and a try/catch cannot wrap imports — builder
- #847 — `npm install` in a folder inside a project installs into the parent project; `--prefix <folder>` is what makes a nested tool folder work — builder
- #847 — a flaky test that does not reproduce locally is fixed from the CI failure message; prove the fix by a loop of runs and, where possible, a delay injected at the racing point — builder
- #847 — a docs setup that relies on `extends` is replayed on a tsconfig with no `include` or `files` (what `tsc --init` writes): TypeScript resolves the default include from the extending file's folder, so "the same files" stops being true — branch-reviewer
- #847 — a new file in a package's `dist` updates the exact-contents list in `.github/workflows/ci.yml` in the same commit: `npm pack --dry-run` alone shows the file but asserts nothing (second time after #830) — branch-reviewer
- #847 — a fix to one CLI mode greps every mode for the same code path (normal, `--check`, `--watch`), and its CHANGELOG line names the modes it covers — branch-reviewer
- #847 — `require("<pkg>/package.json")` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` on a package with `exports` (`@pgcast/pgcast`): a probe reads the file with `fs`, or a pinned install silently gets an empty version — builder
- #847 — a replay of a CI step that reads its expected list from `ci.yml` itself gives a red/green proof for a workflow-only fix, where a test cannot — builder
- #847 — an inherited `include` or `files` resolves from the base tsconfig's folder; only a key the extending file writes resolves from its own: check an expected tsconfig with `tsc -p <file> --listFilesOnly` before writing it in a review — branch-reviewer

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #811 — `tools/typegen/test/scan.test.ts:217`: in a cyclic composite reference graph, TypeScript 5.9 and 6.0 select neither project's source and 4.1.6 both; the test pins the compiler's choice without asserting the cycle's diagnostic — orchestrator


# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #853 — `check:agents` cannot read a `§` heading that holds `'` or `-`: a reference heading meant to be cited is plain letters and spaces — builder
- #853 — a `reference.md` nears the 1,800-word cap fast (`codegen-output` at 1,799): split it before its next addition — builder
- #854 — the `tsc` marks come in two forms, `<!-- tsc -->` and `<!-- tsc: … -->`: grep `<!-- tsc`, not `tsc -->` — builder
- #854 — `useTestDatabase`'s own connection shares the test database: a probe that kills the watch's backend diffs the pids before and after the start, with `backend_type = 'client backend'` (autovacuum shares `datname`) — builder
- #854 — `docs:build` takes about 160–190 s, over the 120 s foreground timeout: run it in the background — builder
- #854 — a citation check is proved by mutating every real citation of the tree, not only synthetic probes (68 mutants in under a second) — branch-reviewer
- #854 — a docs check reads every page, as `check-prose.mjs` does, never a hand list: a hand list reopens the hole at the next page that gets a mark — branch-reviewer
- #854 — CodeQL runs on a draft PR while the CI jobs are skipped: read it before the review (it caught what lint and the tests did not) — branch-reviewer
- #854 — a check that reads every page skips every page-level comment, VitePress's `<!-- @content -->` and `<!-- @changelog -->` included, not only the other checks' marks — builder
- #854 — a planting harness tied to line numbers goes stale at the next master merge; appending a line to the page does not — builder
- #848 — `check:agents`' `sectionErrors` regex ends a section name at its last lowercase letter, so a heading that ends in a capital (`## The method PR`) cannot be cited; name such headings to end lowercase until #845 lands — builder
- #848 — a verdict that sends a learning to an open issue's check fix (#845) also comments on that issue with the new cases and the rule text the fix must update — builder
- #848 — a method PR's § Watch reread rereads the triggers earlier rereads left in the Epic ("becomes a sub-issue if …") and states, for each, whether it fired — branch-reviewer
- #848 — an issue carried over from an Epic that closes ("Minors kept from Epic #n") is attached to an open Epic, or its place said, before `Closes #n` merges, or `run-step` § Finding the step never reaches it — branch-reviewer
- #848 — merging two learnings into one rule can drop the condition of one (here the base tsconfig with no `include`): reread each merged rule against each source line — orchestrator
- #848 — when a fix moves a rule or a pointer, grep the PR body, the verdict comment and the Epic comments for its old location (three places named it) — builder
- #855 — Vite 8 is rolldown-based (no esbuild in `node_modules`): a build whose entry is a virtual module names it without a null byte and maps it to the `\0` id in `resolveId` — builder
- #855 — `adapters/pglite`'s `check:browser` reads `dist`: `npm run build` in the adapter first — builder
- #864 — the chrome-devtools tools cannot open DevTools › Application › Manifest: a Done-when that needs that panel says the owner checks it, or proves the manifest by fetching it and loading each icon — builder
- #863 — a hook that ends a session must close what a constructor that threw had already opened: `createWatchProgram` that throws leaves its file watchers alive — reviewer
- #863 — an early return on SIGINT turns a hang into a process only SIGKILL ends: test that the process exits, not only that it stops printing — reviewer
- #863 — CI's TypeScript loop replays locally with `check:floor` and `npm install --prefix <scratch>/ts<version> typescript@<version>`, pointed to by `PGCAST_TEST_TYPESCRIPT` — builder
- #863 — a fix round that runs the reviewer's harness needs its own probe database and its own scratch folder exported, since the harness reads them from there — builder
- #865 — auto mode refuses a compound command that starts with `pkill`: a builder stops its own background process by its PID — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #853 — six skills keep a `## Checklist` (`backward-compat`, `code-style`, `consumer-usage`, `merge-gate`, `review-comments`, `zero-abstraction`) after #853 cut the six others as duplicates: one rule for all, at the next method PR
- #854 — `sectionErrors` still leaves unchecked `[reference.md](reference.md#x) § X` and `[reference.md](./reference.md) § X`, and checks a bare `skills/code-style/reference.md § Claims` against the citing skill's own reference; no such citation in the tree


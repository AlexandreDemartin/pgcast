# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #874 — a file with two subjects in progress stages them apart (`git add -p`): a pushed commit that mixes them cannot be amended — builder
- #874 — a test of a check's message uses relative paths in each half of the message, or it prints the temp folder of the first occurrence — builder
- #874 — a method PR's proof also checks the "already lives there" home of each dropped row on the base: it caught a misquoted term — builder
- #874 — a script that strips a learning's author suffix anchors a regex on ` — <author>$`: a line without a suffix breaks `rsplit(' — ')` — builder
- #874 — the blocker that escaped to Epic #850's range review came from a `low` PR with no review (#868): the review gate by Risk is the next lever to watch, beside the model — builder
- #874 — a Watch trigger is reread with the measure it was set on; changing that measure is said in the comment, not done silently — branch-reviewer
- #874 — a check that refuses a Markdown structure is proved against near misses (case, heading level, a trailing word, the same structure under another heading), not only the exact form — branch-reviewer
- #874 — a dropped learning is first grepped as a rule on master: if a rule already holds it, the verdict cites that rule and counts the learning as its second occurrence — branch-reviewer
- #874 — a model revert lands in the orchestrator's own hand-over too: a spawn's `model`/`effort` outrank the agent's frontmatter, so a stale brief keeps the old lever alive — branch-reviewer
- #874 — a trigger worded "if X keeps growing" fires at every method PR by construction: set a trigger on a threshold a check enforces — builder
- #874 — a near-miss test runs each form on its own: a probe that follows every heading with the same task item proves only the task-item clause — builder
- #874 — word counts quoted in a GitHub comment drift between rounds: recount them against the named base when the comment is edited — builder
- #878 — a docs recipe proved by a harness that passes in a dependency the recipe bundles (a PGlite built in Node) does not test the recipe's command: replay the copyable blocks exactly as written, with the versions the doc names — branch-reviewer
- #878 — an adapter's install command names every required peer of the core (`pg`): a package manager that installs no peers fails at `import 'zapatos/db'`; the consumer probe runs each README's install with `--legacy-peer-deps`, not only `/install` — audit
- #885 — `tools/typegen`'s `npm ci` installs the published `@pgcast/pgcast` (peer `>=7.1.0 <8`), so its checks do not test a root branch: unpack the branch's `npm pack` into its `node_modules`; a symlink to the root fails (Vitest inlines the root's `generate.mjs`) — builder
- #885 — the test count rises by one per new module in `src/` (the per-module case of `runtimeImports.test.ts`): a refactor's proof explains the difference — builder
- #885 — when a module moves, run `tsc --declaration` for a consumer against both tarballs before applying #581's "an export of `dist` stays": tsc names a symbol through the entry that re-exports it, so only a hand-written `dist` path changes — branch-reviewer
- #885 — a file moved within `src/` can drop a name from `dist/<module>` with no suite noticing: a path-mapped type test, as `utils.test-d.ts` does, freezes an inner module's old exports — builder
- #886 — an orchestrator brief asked for "the label the languages section names", but `website/README.md` § Languages names a script (`docs:translated`), not a label: a brief quotes the rule it relies on rather than paraphrasing it — builder
- #886 — the home's install line (`website/index.md`) drops `pg` by #371's choice, so a `pg` sweep of install commands skips it rather than flagging it — builder
- #886 — a find-and-replace anchored on a French line ending in "PGlite : c’est" missed (the space before the colon is U+00A0); anchoring on the line's start worked — builder
- #886 — two fixes in separate hunks of one file were committed apart with `git apply --cached --unidiff-zero` on one hunk, as `git add -p` is interactive here — builder
- #884 — with no `process.emitWarning` left in `zapatos/db`, the playground's shim in `website/.vitepress/playground/globals.ts` is likely dead: a small PR of its own, proved by `docs:build` and the playground — builder
- #884 — skill `backward-compat`'s rule "an export of `dist` stays" under `node10` (#581) could say it covers the exports a consumer's declarations can name, so removing an uninferrable helper is not read as a stop point — builder
- #895 — before deleting a browser stand-in for a Node global, grep the built bundle for unguarded reads of the global itself, not only of the method it provided: the shim also defined `process` — builder
- #895 — a brief's scratch folder is created by the orchestrator before the spawn: `npm ci > <missing dir>/x.log` in the background failed silently — builder
- #895 — chrome-devtools `take_screenshot` cannot write into the session scratchpad (outside its workspace roots): screenshot proof needs another allowed folder — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


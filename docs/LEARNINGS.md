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
- 7.1.2 range — `npm pack --dry-run` shows no CHANGELOG gap in the extensions: a docs PR that changes an extension's README after it shipped (#889, after adapters 0.1.2 and typegen 0.2.0) leaves its `[Unreleased]` empty, so the range review checks the `[Unreleased]` of each package whose files the range touches — branch-reviewer
- 7.1.2 range — consumer declarations compiled against a published and a branch tarball through a symlinked package need `preserveSymlinks: true`, or `pg` resolves from the real path and fails with TS2307 — branch-reviewer
- 7.1.2 range — #887 updated decision 003 but left `docs/decisions/005-playground.md:51` and `website/.vitepress/playground/globals.ts:3` saying `zapatos/db` calls `process.emitWarning`: they go with the shim's removal (#884's learning) — branch-reviewer
- #894 — `gh api …/sub_issues` takes the issue's numeric id with `-F sub_issue_id=<id>`: `-f` sends a string and fails with 422 — builder
- #894 — `git diff origin/master` leaves out untracked files: a leak grep reads new files directly, or runs after `git add` — builder
- #894 — Zapatos's demo is the separate repository `jawj/zapatos-demo` (`demo.ts`), not a folder of `jawj/zapatos` — builder
- #894 — the builder made recipe titles an exception to the site's one-or-two-word rule; the orchestrator reverted it, as the owner wants brief titles everywhere: a brief quotes the title rule when a step names pages — orchestrator
- #892 — `check-translations` fails a new French page with no `english:` front matter; `docs:translated -- <page>` writes it, so a new page needs no hand-written hash — builder
- #892 — the French prose mixes « batches » (14) and « batchs » (8): a site-wide choice for the glossary, left alone — builder
- #892 — an "every `### Added` placed or left out" proof is mechanical with a script over the changelogs and a placement file checked for equal counts — builder
- #893 — in a fresh worktree `docs:build` fails with TS2694 on `zapatos/schema.d.ts` until the root's `npm run build` has run: a builder brief's worktree setup names it after `npm ci` — builder
- #893 — `vitepress preview` on `/` redirects a French-language browser to `/fr/`: read the English home with `fetch('/index.html')` — builder
- #898 — a condition is probed on its own (`db.sql\`${{ col: cond }}\``): `columns` shifts the parameter numbers, so a `$n` quoted in prose drifts — builder
- #898 — an `and()` or `or()` saved with no annotation infers `T = unknown` and a shortcut's `where` refuses it (TS2345): annotate it `SQLFragment<boolean | null>` or build it in the call — a need for the chapter-10 list — builder
- #898 — a cast panel shows the type of the first `const` below the cut: helper consts go inside functions — builder
- #898 — `docs:examples` runs in Node with the real `Buffer`, so a gap in the playground's stand-in (`globals.ts`: `byteLength`, still `isBuffer`) shows only when a link runs in the browser: a check that the stand-in covers every `Buffer.` call of `dist/db` would catch it — builder
- #898 — a same-origin iframe loop (open each playground link, press Run, read the live region) checks every panel of a page in one call — builder
- #899 — `count(*)` in a `select()`'s `extras` comes back a JSON number (the row is `jsonb_build_object`), in a `sql` template a string: `::int` belongs only in the raw template — builder
- #899 — without `alias`, a self-join's `parent()` names the inner row and silently returns `[]`: a probe that runs the join without the alias catches a recipe that forgot it — builder
- #899 — a ranked search writes its `tsquery` twice, in `websearchToTsquery()` and in the fragment for `ts_rank()`/`ts_headline()`: a need to watch for the chapter-10 list — builder
- #899 — one long-lived probe process (create the database, load `schema.sql`, run a cases module, drop it) serves every docs step; a loop that fetches each built page's HTML and reads its playground links checks several pages with no navigation — builder
- #906 — a builder in a worktree checks that each Edit path starts with the worktree: one edit of note 005 landed in the main checkout first (reverted at once) — builder
- #906 — on the playground, chrome-devtools `wait_for` and `take_snapshot` dump the whole schema block (~1,100 nodes) per call: an inline `evaluate_script` that clicks Run and returns the live region's `innerText` costs one small call per panel — builder
- #906 — two agents' `vitepress preview` share port 4173 by default: each builder serves its preview on its own port — builder
- #906 — #907 closes the `isBuffer` gap that the #898 learning above names, with `check-buffer.mjs` in `docs:build` — orchestrator
- #900 — a probe span that starts with `(` carries every pair of parentheses around it: an `and()` of comparisons is quoted as one span per comparison, each probed — builder
- #900 — the local probe server's session TimeZone is not UTC: a probe sets UTC before reading offsets for captions — builder
- #900 — the French proofreader moves a marked pgcast message into « »: a brief says that `<!-- message -->` keeps straight quotes — builder
- #901 — a panel whose query runs on a transaction's client aliases the pool as a typed const above the cut (`const txnClient: db.Queryable = pool`): the playground skips typed consts — builder
- #901 — the French site says « lock » for an advisory lock and « verrou » only for a row lock: a brief for a lock page says so — builder
- #901 — `cmd; echo exit $?` in the background showed 0 for a failed `docs:build`: append the exit code to the log and read it there — builder
- #901 — `docs:translated` runs again after any later edit of the English page, or the build fails on the French page's stale `english:` mark — builder
- #911 — the brief said `@pgcast/typegen` "checks" a query's row type with a Whereable, but it refuses a Whereable (`neutralise.ts`): a brief reads a tool's accepted inputs before stating its limits — builder
- #911 — Python's `re.escape` escapes spaces, so a pattern over the French pages splits on spaces and joins with `[  ]` (U+00A0) — builder
- #911 — in the playground, each example link takes its own navigate before `evaluate_script`, the list of links kept in localStorage — builder
- #904 — a mutant of a `.vitepress` check runs without a rebuild: load the module with vite's `ssrLoadModule` (`ssr.external: true`, `resolve.preserveSymlinks: true`), change its table or a copy of the dist, then call `checkLinks` with `outDir` on the copy; plain `node` fails on `cast.data.ts` — builder
- #904 — a French page whose English page changes only in a link still needs `docs:translated`, so its `english:` line changes too; a conflict limited to those lines resolves by dropping the markers by script, then `docs:translated` — builder
- #904 — a moved-anchor check accepts a line whose old page is gone, as the 404 page runs the same head script — builder
- #904 — an inline head script kept in a TS template literal is changed twice before it ships (escapes, then the minifier): test the built one, taken from the built HTML and run in `node:vm` with a mock `location` — branch-reviewer
- #904 — the brief asked the reviewer to post its comment, against `review-comments` (the orchestrator posts it): a review brief asks for the text — orchestrator
- ch9 range — no check compares a panel's caption with what the panel returns: a caption check in `docs:examples` would freeze them, as the range review's `captions.mjs` did by hand — branch-reviewer
- ch9 range — a new outline group touches every list of the groups (`outline.ts`, `llms.txt`, the home's read-next cards, `README.md`'s docs line): #903 and #905 each updated part of it — branch-reviewer
- ch9 range — a page split is proved to lose no anchor by taking the old tag's anchors minus the new pages' anchors and `moved.ts` — branch-reviewer
- #914 — `{{ … }}` in an inline code span breaks a VitePress page (Vue interpolation): a Whereable in prose or a table is written `<code v-pre>` with `&#96;`; only fenced blocks are safe — builder
- #914 — a full-page DevTools screenshot lays the page out again: crop a viewport screenshot taken after scrolling the element into view, at the device pixel ratio — builder
- #914 — the docs world seeds no `ratings` row and `security_empty_filter` deletes them all: a `ratings` example on the seed alone returns nothing — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


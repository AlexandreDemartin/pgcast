# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

- #247 — An inferred type is read from the command line with `tsc --declaration --emitDeclarationOnly --outDir <scratch>` on a file of `export const`s: the `.d.ts` shows it, strict on or off, without a hover — `builder`
- #245 — An explicit interface return type where TypeScript inferred an object literal type drops the implicit index signature: a value assignable to `Record<string, unknown>` stops being; diff the emitted `.d.ts` when a return type changes — `branch-reviewer`
- #245 — A spread copy reads own enumerable properties once: prototype getters are lost; copy a typed config object by naming its declared keys — `branch-reviewer`
- #245 — A replay against 6.6.1 snapshots each value as it reads it (`{ ...x }`) and reads getters explicitly, or a shared live object or `JSON.stringify` shows a regression that does not exist — `builder`
- #245, #246 — `test/tsconfig.json` sets `exactOptionalPropertyTypes`: a test of an `undefined` config key, as consumers write it, needs `as unknown as NewConfig` — `builder`
- #246 — Choosing `??` over `||` is tested only by a set but falsy value under a truthy default (`transactionAttemptsMax: 0`, default 5): an `undefined`/`null` grid lets `||` through; swap the operator once and see only the targeted tests fail — `branch-reviewer`
- #246 — When a fix changes what `transaction()`'s `try` covers, probe a pool and a plain client: on a plain client a throw before the `try` leaves `_zapatos` set, and every later `transaction()` on it skips `START TRANSACTION`/`COMMIT` — `branch-reviewer`
- #246 — A red proof without touching history: run the test on a scratch copy of the worktree with the one line changed (`node_modules` and `src/.env` linked), never `git stash` in a shared repository — `builder`, orchestrator
- #132 — Replay characterisation tests on 6.6.1 by swapping the test file's `src/db` import for the zapatos@6.6.1 tarball's `dist/db`: the same assertions are proven; the pgcast-only tests going red shows the swap took — `branch-reviewer`
- #132 — A characterisation of a value sent as a parameter checks `values` with `toStrictEqual` against the instance itself: a change that stringifies it first stores the same text — `branch-reviewer`
- #112 — A « the type already refuses » claim is probed on every `zapatos/custom` placeholder (`extra.type_zoo`), not only on `users`: the placeholders are `any`, the only typed callers a fix changes — `branch-reviewer`
- #112 — A characterisation whose type test has a positive case pins that same case at run time, or the fix PR's diff shows no change on the one path the type allows — `branch-reviewer`
- #112 — Git can merge a summary table quietly while its rows conflict: two report PRs merged one after the other get the table recounted by script — `builder`
- #112 — The report's « N to fix, M to document » sentence counts R16 (now opt-in) as document, so a recount by script disagrees — `builder`
- #112 — `npx tsc` from a scratch folder resolves to the unrelated npm package « tsc »: a probe calls `<worktree>/node_modules/.bin/tsc` — `builder`
- #33 — A change to the empty case of a generic `SQLFragment` also reaches positions that are not conditions (`GROUP BY ()`, `ROW()`, a call with no arguments, all valid SQL): replay wherever the fragment's type is accepted before claiming « every changed call failed before » — `branch-reviewer`
- #33 — A fix that turns an error into « every row » for a destructive call (`deletes(t, and(...[]))`) goes to the owner, and the CHANGELOG says to keep the guard rather than drop it — orchestrator
- #33 — A docs probe follows a code span that appears in the compiled SQL: « `deletes(…)` deletes them all » is rephrased « `deletes(…)` sends `WHERE TRUE` » to carry the mark — `builder`
- #33 — `git merge --no-edit` leaves out the Co-Authored-By line: pass `-m` with it on every merge — `builder`
- #33 — Two-dot `git diff origin/master` shows master's newer commits as reverted once master moves: size and grep checks use three dots — `builder`
- #32 — A mechanism that replaces a fragment's `compile` carries every instance property `SQLFragment.compile` reads (`parentTable`, `preparedName`, `noop`: the list `copy()` overrides); one at a time, the others drop silently — `branch-reviewer`, `builder`
- #32 — An opt-in that widens a `LIMIT` also widens a `FOR UPDATE`/`FOR SHARE` on the same query: replay a lock clause whenever a row count changes — `branch-reviewer`
- #32 — Under `exactOptionalPropertyTypes`, `copy({ parentTable: x, preparedName: y })` with possibly `undefined` values does not compile: compile, then set `name` — `builder`
- #96 — A red test can be red for the wrong reason (`NOT (NULL)` on a nullable column gives the same rows under both readings): run it against the fix too before committing it — `builder`
- #96 — A replay that compares rows needs data where both readings differ, or it reports « same rows » for a call whose meaning changed — `builder`
- #96 — A claim that every other call of a helper joining fragments as text keeps its meaning needs splits inside quoted literals, not only grammar splits: `` and(sql`title = 'x`, sql`y'`) `` stays valid SQL and compares with another value — `branch-reviewer`
- #96 — A reviewer that symlinks another worktree's `node_modules` writes its `node_modules/.cache/pgcast` on `typecheck`; at another commit, use a separate `--outDir` or its own `npm ci` — `branch-reviewer`

## Minors kept

Minor review defects, taken up by the end-of-chapter review.
- #246 — `CHANGELOG.md:82`: the line names the pool only; on a plain client, 6.6.1 left `_zapatos` set after the throw, and the fix clears it too: a clause, and a plain-client test of the throwing-getter path — `branch-reviewer`
- #246 — `test/integration/transaction.test.ts:467`: cannot fail because of #246 (`undefined` and `false` both count as false): rename or drop — `branch-reviewer`
- #246 — `CHANGELOG.md:82`: « (or `null`, from JavaScript) » is too narrow: `null` compiles from TypeScript without `strictNullChecks` — `branch-reviewer`
- #132 — `docs/CHARACTERISATION-REPORT.md:20`: the summary sentence counts R16 (now opt-in) as document: 37 to fix, 16 to document, 12 to leave — `branch-reviewer`
- #132 — `docs/CHARACTERISATION-REPORT.md:77` (R66): « a text column » leaves out `varchar`, `citext`, `json`, `xml`, `name`, `bytea`; and the nested case rests only on the cost of walking every value (6.6.1's type refused it too) — `branch-reviewer`
- #112 — `test/types/shortcuts.test-d.ts:260`: `not.toBeAny()` where an equality compiles (`resolves.toEqualTypeOf<db.UpsertReturnableForTable<'users', undefined, undefined, undefined>>()`) — `branch-reviewer`
- #33 — `CHANGELOG.md`: `groupBy: and()` sent `GROUP BY ()` (valid, the empty grouping set) in 6.6.1 and now fails with 42601; only the PR body says so: one « Changed too » line — `builder`
- #32 — `website/runtime-config.md:182`: with `lock`, the option's `LIMIT 2` also locks the second row until the transaction ends, though `.run()` rejects — `branch-reviewer`
- #32 — `website/handle-errors.md:97`, `:163`: still says two matching rows are not an error, and `statusOf()` maps every `NotExactlyOneError` to 404; with the option a second row gives the same class — `branch-reviewer`
- #32 — `test/unit/shortcuts.test.ts:1223`: the option's `withTies` (`FETCH FIRST $n ROWS WITH TIES`, 2) and `offset` forms are not frozen by a test — `branch-reviewer`
- #32 — `README.md:84`, `:91`: « except `selectExactlyOneChecksForSecondRow`'s » attaches to « a code »; line 91 names only `lateral` as the nested case — `branch-reviewer`
- #96 — `CHANGELOG.md:84`: « only the parentheses of the next line change » — `or()` does not change at all, and the next line changes rows for a bare `OR` — `branch-reviewer`
- #96 — `test/integration/conditions.test.ts:93`: no test pins the `BETWEEN` split's 42601; `website/switching.md:79` does not list it among the changed calls — `branch-reviewer`

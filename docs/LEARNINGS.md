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
- #259 — When a branch starts writing an object's key into the text (`parent()` with no column takes its `vals({…})` key), the injection matrix runs over the key too — `branch-reviewer`
- #259 — A fix that changes the run time greps `website/` for its characterisation's issue numbers and for the pages that list errors or « calls whose result changes » — `branch-reviewer`
- #259 — An error message that names a remedy is probed on each call that throws it: `db.self` cannot read a column in an `INSERT`'s `VALUES` (42703) — `branch-reviewer`
- #259 — To prove an injection test can fail, break only the branch it guards (a scratch copy), so the run shows the new test doing the work — `branch-reviewer`
- #35 — Replay, do not reason: reading the code suggested R26 was live on current pg; the pg tarballs showed the branch is dead since pg 8.0.0 — `builder`
- #35 — A test that stubs a package mocks the entry Vitest loads (`pg`'s ESM file through its `exports` « import » condition), not the CommonJS object — `builder`
- #35 — A fake queryable models queueing: a real client holds every `query()` until `connect()`, so a fake that answers at once turns a pending promise into « ok » — `branch-reviewer`
- #35 — pg-native replays locally with no dependency: `pg@7.18.2` and `pg-native@3` in a scratch folder, `node-gyp rebuild` in `libpq` with `/Library/PostgreSQL/17/bin` on `PATH`, run with `DYLD_LIBRARY_PATH=/Library/PostgreSQL/17/lib` — `branch-reviewer`
- #96 — A red test can be red for the wrong reason (`NOT (NULL)` on a nullable column gives the same rows under both readings): run it against the fix too before committing it — `builder`
- #96 — A replay that compares rows needs data where both readings differ, or it reports « same rows » for a call whose meaning changed — `builder`
- #96 — A claim that every other call of a helper joining fragments as text keeps its meaning needs splits inside quoted literals, not only grammar splits: `` and(sql`title = 'x`, sql`y'`) `` stays valid SQL and compares with another value — `branch-reviewer`
- #96 — A reviewer that symlinks another worktree's `node_modules` writes its `node_modules/.cache/pgcast` on `typecheck`; at another commit, use a separate `--outDir` or its own `npm ci` — `branch-reviewer`
- #37 — A rule that turns a character of an identifier into syntax (splitting on `.`, cutting `[]`) changes every catalog name holding that character: replay it with a `CREATE TYPE`/`CREATE DOMAIN` named with each such character beside a type of the shorter name — `branch-reviewer`
- #37 — When two accept rules overlap, a test pins one input both accept, or swapping them goes unseen — `branch-reviewer`
- #37 — The obvious end-anchored regex for trailing brackets is quadratic in V8: time it before planning, and scan from the end — `builder`
- #37 — After a merge from master, compare `git diff <master tip> <merge>` with `git diff <merge base> <branch tip>` (`+`/`-` lines only): identical means the merge kept both sides unchanged — `branch-reviewer`
- #37 — A mutation applied by matching the source text survives the line numbers a merge moves; line numbers quoted in a PR body go stale — `branch-reviewer`
- #34 — Narrowing a shortcut's type parameter below Zapatos 6.6.1's exported generic (`LateralOption<C, E>`) breaks every options value typed with it; a compat grid includes values typed through the exported generics, generic forwarders and hand-written signatures, not only literals — `branch-reviewer`
- #34 — A type parameter's constraint is checked on each member of a union: refusing one tuple shape refuses every union holding it; the grid has a union case per refused shape — `branch-reviewer`
- #34 — A grid proof pastes the per-line output and a `diff` against the 6.6.1 tarball's own errors, never a count: 6.6.1 itself refuses some shapes — `branch-reviewer`, `builder`
- #34 — Before calling SQL « refused by Postgres, so no call ever ran », check user overloads on the `search_path`: an unqualified built-in name (`max`, `count`) resolves to a user aggregate of another arity — `branch-reviewer`
- #34 — To make a shortcut throw while compiling, so `.run()` rejects, put a fragment whose `compile` throws inside the returned query's expressions; overriding the query's own `compile` is lost when a parent `lateral` calls `copy()` — `builder`
- #34 — A throw moved from a `.run()` rejection to a synchronous call escapes a `.catch()` attached to `.run()`: refusals throw while compiling — orchestrator
- #34 — `git commit --no-edit` on a conflicted merge keeps the `# Conflicts:` lines; give `-m` again at commit time — `builder`

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
- #259 — `src/db/core.ts:240-241`: « throw in an object, and in an array in a filter, as `Default` does » reads as if `Default` throws in an object — `branch-reviewer`
- #35 — `CHANGELOG.md:88`: a native client not yet connected waits for its `connect()`, as a `pg.Client` does (6.6.1 rejected at once) — `branch-reviewer`
- #35 — `test/unit/transaction.test.ts:28`: the native `Pool` stub is a class; a real pg 7 pool is a `pg-pool` instance classed by `_connected`, so the control proves the outcome, not the path — `branch-reviewer`
- #35 — `src/db/transaction.ts:57`, `docs/CHARACTERISATION-REPORT.md:87`: the comment says « with pg-native » (the guard passes on pg 7 without it); R26's test cell still says « none » — `branch-reviewer`
- #96 — `CHANGELOG.md:84`: « only the parentheses of the next line change » — `or()` does not change at all, and the next line changes rows for a bare `OR` — `branch-reviewer`
- #96 — `test/integration/conditions.test.ts:93`: no test pins the `BETWEEN` split's 42601; `website/switching.md:79` does not list it among the changed calls — `branch-reviewer`
- #37 — `src/db/core.ts` (JSDoc of `param()` and `Parameter`): the bounds sentence sits in the « Without a `"` » case, so « With a `"`, the type is written as is » reads as if bounds stay inside; say a name holding a `.` or ending with `[]` is given already quoted — `branch-reviewer`
- #34 — `docs/CHARACTERISATION-REPORT.md` (R25): the class cell reads plain « non-breaking »; « except a user aggregate overloading a built-in name with another arity, and a refused aggregate marked `noop` », as R28 does — `builder`

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

## Minors kept

Minor review defects, taken up by the end-of-chapter review.
- #246 — `CHANGELOG.md:82`: the line names the pool only; on a plain client, 6.6.1 left `_zapatos` set after the throw, and the fix clears it too: a clause, and a plain-client test of the throwing-getter path — `branch-reviewer`
- #246 — `test/integration/transaction.test.ts:467`: cannot fail because of #246 (`undefined` and `false` both count as false): rename or drop — `branch-reviewer`
- #246 — `CHANGELOG.md:82`: « (or `null`, from JavaScript) » is too narrow: `null` compiles from TypeScript without `strictNullChecks` — `branch-reviewer`

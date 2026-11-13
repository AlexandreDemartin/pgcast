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

## Minors kept

Minor review defects, taken up by the end-of-chapter review.

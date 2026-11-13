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
- #132 — Replay characterisation tests on 6.6.1 by swapping the test file's `src/db` import for the zapatos@6.6.1 tarball's `dist/db`: the same assertions are proven; the pgcast-only tests going red shows the swap took — `branch-reviewer`
- #132 — A characterisation of a value sent as a parameter checks `values` with `toStrictEqual` against the instance itself: a change that stringifies it first stores the same text — `branch-reviewer`

## Minors kept

Minor review defects, taken up by the end-of-chapter review.
- #132 — `docs/CHARACTERISATION-REPORT.md:20`: the summary sentence counts R16 (now opt-in) as document: 37 to fix, 16 to document, 12 to leave — `branch-reviewer`
- #132 — `docs/CHARACTERISATION-REPORT.md:77` (R66): « a text column » leaves out `varchar`, `citext`, `json`, `xml`, `name`, `bytea`; and the nested case rests only on the cost of walking every value (6.6.1's type refused it too) — `branch-reviewer`

# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #513: a draft PR runs no Postgres or Node matrix, so a claim that depends on a version not installed locally (Postgres 18's `WITHOUT OVERLAPS`) stays unproven until the PR is ready; the orchestrator marks it ready early for that proof.
- #513: under heavy machine load a few codegen variant-snapshot tests time out at their 5 s default, even on reruns; a third run once the load dropped was green.
- #512: a Done when that names one mutant for every row is checked against each shape before the issue is written: a primitive's property reads `undefined` and a stored `null` is reset to the default, so neither goes red on a plain direct read.
- #512: `getConfig()` returns `{ minMs: undefined, maxMs: undefined }` for a truthy primitive `transactionRetryDelay` (`100`), where 6.6.1 returned `100`; nothing throws, value only.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


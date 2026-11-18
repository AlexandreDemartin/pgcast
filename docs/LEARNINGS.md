# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Nothing applies before the end of the chapter: the method is frozen until then (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #693 — A type gap kept by Document freezes the public alias's own property (`NonNullable<db.TxnClientForSerializableRO['_zapatos']>['isolationLevel']`), not only the callback's: an alias-only widening passed every callback test and the containment test — branch-reviewer, `test/types/transaction.test-d.ts`
- #693 — A grid for widening a type alias that is both a callback's client and a user's parameter has cells inside a helper's own body (assignment, exhaustive `switch`, forwarding, `Record` keyed by the property), not only on the callback: the alias-only route broke only those — branch-reviewer
- #690 — A refusal rule that reads a command's words after quotes are emptied missed every quoted argument and every `src:dst` refspec (`HEAD:refs/tags/v7.0.0` created the tag); such a rule is tested with the quoted and the colon form of each argument it looks for — branch-reviewer, `.claude/hooks/guard.mjs`
- #690 — A minor judged "still true" went into #689 though #560 had fixed it; a verdict of still true is a run on master (`git log -S`, the built export) before it goes into an issue — branch-reviewer

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.

- #928 — a claim that a value "is no longer assignable" is tested where a type is expected too: a generic class's `new C()` takes its type argument from the annotation or parameter it meets — branch-reviewer
- #928 — the "README changed after its package shipped" rule is checked per package from its own last tag: `git diff <tag>..origin/master -- README.md tools/*/README.md adapters/*/README.md` — branch-reviewer
- #928 — declaration emit writes a type argument's default in full, so changing a default reaches consumers through their dependencies' published `.d.ts`; a compat grid for such a change includes an emitted `.d.ts` — branch-reviewer

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.

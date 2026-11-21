# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #853 — `check:agents` cannot read a `§` heading that holds `'` or `-`: a reference heading meant to be cited is plain letters and spaces — builder
- #853 — a `reference.md` nears the 1,800-word cap fast (`codegen-output` at 1,799): split it before its next addition — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.
- #853 — six skills keep a `## Checklist` (`backward-compat`, `code-style`, `consumer-usage`, `merge-gate`, `review-comments`, `zero-abstraction`) after #853 cut the six others as duplicates: one rule for all, at the next method PR

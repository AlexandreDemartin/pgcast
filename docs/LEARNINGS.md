# Learnings of the chapter

What the agents returned during the chapter and what waits for its end. Written by the orchestrator, judged and emptied by the method PR (skill `run-step` § End of chapter).

- One line per remark: `<step> — <remark> — <source>` (agent, `file:line`, standard).
- Past about 60 lines of § Learnings, the next step is a method PR on them (skill `run-step` § Finding the step).
- A learning applies only once judged, at the end of the chapter; a method change that is ready does not wait (`.agents/README.md` § Self-improvement).

## Learnings

Candidates for a check, a rule or a skill line.
- #916 — a method PR's proof checks a merged row only against its kept term, so a merge that drops a source line's qualifier passes (twice here: `--unidiff-zero`, "an adapter's"): grep each source line's actor, flag and exception in the merged rule before the first push — branch-reviewer
- #916 — a verdict "the check catches it" is a claim about a check's limit: rerun the check on the learning's exact case (row 51: a fragment probed alone numbers from `$1`) — branch-reviewer
- #916 — in a worktree's zsh, a shell function named `g` or `gg` collides with the profile's aliases (`gg` ran `git gui`): proof greps go in a bash script in scratch — builder
- #920 — `Memory used` from `--extendedDiagnostics` moves with the garbage collector (252 to 307 MB between runs of one job), and check time with the other processes on the machine: gate a median, on a ratio against a reference library run interleaved in the same job — builder
- #920 — a job-level `if` cannot read `matrix`: to run a matrix entry on some events only, build the matrix with `fromJSON(<event test> && '[…]' || '[…]')`, which keeps CI passed's `RESULTS` unchanged — builder
- #920 — `gh run view --job <id> --log` refuses while other jobs of the run are going; `gh api repos/<o>/<r>/actions/jobs/<id>/logs` reads a finished job's log — builder
- #921 — a check that compiles a `.d.ts` under `skipLibCheck` proves nothing about the names it uses (an unresolved type becomes `any`): give it a `@ts-expect-error` line that reads the type through a consumer, and a mutant that renames what it names — branch-reviewer
- #921 — `npx vitest run -u <file>` ran all 26 test files; without `-u` the same command ran only that file — builder
- #921 — `guard.mjs` refuses a bare `git merge origin/master`, even one that stops on a conflict: give it `-m "<subject>" -m "Co-Authored-By: …"` — builder

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


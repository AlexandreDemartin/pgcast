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
- #931 — in a scratch measuring script that joins errors onto one line, `grep -o` with a length cap hid the first error; print the raw `tsc` errors before drawing a conclusion — builder
- #931 — `tsc` prints a file's path relative to the cwd it runs in, with no leading `/` below it: a normaliser anchored on `^.*/sweep/` stripped one run's paths and not the other's, and the diff showed every line; anchor on `^(.*/)?` and compare the line counts first — builder
- #931 — the same generic case checked in 9.5 s under `bench:types:large` and in 12.3 s in a scratch runner on a saved copy of its schema: a figure the docs quote is the lower bound ("over 9 s") of both, not one run's — builder
- #931 — a type test appended as the last test of its `describe` keeps every earlier line number, so a sweep of `@ts-expect-error` diffs master and branch with no line shift to account for — builder
- #946 — timings beside another agent's `npm test` spread 100–480 % on the sub-millisecond rows, medians within ±30 %: a speed PR runs `bench:runtime` on a quiet machine, or twice — builder
- #946 — a scenario whose SQL changes per call (an `OFFSET` that moves) makes client and `EXPLAIN` times disagree: each scenario compiles one text, so `EXPLAIN` measures what was timed — builder
- #943 — a cast panel's type is the built hover, not the one written by hand: check it in `.vitepress/dist/<page>.md` after `docs:build` — builder
- #943 — a PR body that names an upstream issue as `owner/repo#n` adds a backlink there: a reference "not posted" goes in backticks — builder
- #943 — an example that needs Postgres 17 (`EXPLAIN … SERIALIZE`) cannot go in `examples/`, which `docs:examples` runs on CI's oldest Postgres (14) and on PGlite: an inline twoslash block, compiled only — builder
- #948: a count written from memory in a note was wrong twice ("30 cases" for 33, "45 Postgres types" for "45 cases"); grepping the probe's output and the quoted issue before the commit caught both.

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.


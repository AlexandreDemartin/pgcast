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
- #918 — an overloaded function passed as a value (`xs.map(db.parent)`) is inferred from its last signature only: an overload added in front of a public generic function changes every higher-order use while each direct call keeps its type; a new overload of a public function needs a type test that passes it as a value — branch-reviewer
- #918 — an instantiation expression (`db.parent<X.Column>`, TS ≥ 4.7) checks the constraint of every overload of matching arity, so an overload's type parameter constrained to `Table` broke one on a production app (TS2344) — orchestrator
- #918 — a gain on generic calls can hide a cost on literal ones: the large bench measured only generic helpers until a `literals` case was added; a type change on a hot public function is measured on its common, literal path too — branch-reviewer
- #918 — a gate case with a time floor catches only a regression larger than the floor: the `literals` case catches round 0's overload by 0.35 s over the 0.25 s floor because it holds 300 calls; a smaller case would sit under it — branch-reviewer
- #918 — a ratio gate on a case near 0 (`selectWith` at 0.01) moves by large percentages on noise: the 0.25 s absolute floor is what keeps it stable — builder
- #918 — `npm ci` clears `node_modules/.cache`, Zapatos 6.6.1's copy for `bench:types:large` included, so a harness that reads that copy fails until the bench fetches it again — builder
- #918 — `npm run docs:translated` needs the page names as arguments to refresh their `english:` mark — builder
- #918 — an orchestrator check script run without its argument printed its pass message: a check refuses a missing argument with a non-zero exit — orchestrator

## Minors kept

Minor review defects, each tagged `form` or `defect` (skill `review-comments`), taken up by the end-of-chapter review.

- #918 — form — `CHANGELOG.md:17`: the #918 bullet grew to seven sentences; the cost and its verdict could stand apart from the type changes (skill `concise-docs`) — branch-reviewer

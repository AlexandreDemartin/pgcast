---
name: run-step
description: 'Orchestrate a step, sub-issue of a GitHub Epic: issue body, risk, plan, builder, review, fixes, verify, gate, end of chapter, learnings. USE FOR: starting the next step or a feature, writing an issue, choosing the risk, briefing an agent, triaging. DO NOT USE FOR: writing the code (agent builder), CI (ci-gate), the merge itself (merge-gate).'
---

# Orchestrating a step

The orchestrator is the main session: it starts the agents, triages and merges; it does not write the step's code.

## The plan

It lives in the issues of `AlexandreDemartin/pgcast` (`--repo AlexandreDemartin/pgcast` everywhere, never `jawj/zapatos`):

| Issue | Role | Closed by |
|---|---|---|
| `type: epic` | a chapter: outcome, why, order, ruled out | the end-of-chapter method PR (`Closes #epic`) |
| `type: feature` | a feature; its **Planned PRs** as a list of titles | the last PR of its tasks (`Closes #task`, `Closes #feature`) |
| `type: task` | a step = a branch = a PR | its PR (`Closes #n`) |

- Native sub-issues: their order is the order of the steps; the Epic counts the closed ones by itself.
- Subject labels: `security`, `opt-in` (note 003), `needs decision`, `runtime`, `codegen`, `types`. Milestones: the versions.

## Finding the step

- Open Epics: `gh issue list --repo AlexandreDemartin/pgcast --label 'type: epic' --state open`. The workflow Epic (#836) is not a chapter and stays open: skip it, the next step never comes from it.
- Before it: if `docs/LEARNINGS.md` § Learnings passes about 60 lines (`awk '/^## Learnings/{f=1;next}/^## /{f=0}f' docs/LEARNINGS.md | wc -l`), the next step is a method PR on them, whatever the chapter: § End of chapter 2, without the Epic's closing.
- The next one: the first open sub-issue of the first open Epic:
  `gh api 'repos/AlexandreDemartin/pgcast/issues/<epic>/sub_issues?per_page=100' -q '.[] | select(.state == "open") | "\(.number) \(.title)"' | head -1`.
- Read it: `gh issue view <n> --repo AlexandreDemartin/pgcast`; only it, and its Epic if the order requires.
- A `type: feature` that starts: first create its `type: task` issues from **Planned PRs**, in order, each under the feature ([reference.md](reference.md) § Issue order).
- A step too wide for one PR (skill `pr-shape` § Size and scope, § Splitting like Zapatos): split it into sub-issues before starting the `builder`.
- `needs decision`, or a stop point of `AGENTS.md` (`core.ts`, codegen output, publication): ask the user **before** the `builder`.
- A new idea: a `type: feature` issue under its Epic, at its place in the order ([reference.md](reference.md) § Issue order).
- Unstable network: retry a `gh` call; before recreating, list what exists.

## Issue body

The issue is the agent's brief, from `.github/ISSUE_TEMPLATE/task.md`, in English, concise (skill `concise-docs`):

- **What**: the expected behaviour, the SQL before / after when it matters · **Why**.
- **Done when**: the acceptance criteria as checkboxes; it names the commands beyond `lint`, `typecheck`, `test`, `test:types`, `build` (`bench:types`…).
- **Files**: the targeted paths, the feature's docs page included (skill `pr-shape` § Splitting like Zapatos), its `outline.ts` entry and `examples/plain/` file, and `db.mjs` for a new export, tracked though built (#723, #724, #729).
- **Notes**: **Risk** (level, lens, blockers), **Class** (note 003), **Read** (skills), **Frozen by** (tests).
- Public: unnamed patterns (skill `consumer-usage`); Zapatos, not its author (skill `pr-shape` § PR title).
- An older issue without **Files** or **Risk** (its **Review** gives the level): the orchestrator adds them before the `builder` starts.

## Risk

| Risk | For | Plan | Review | Gate |
|---|---|---|---|---|
| `low` | docs, method, CI only | none | the CI, and the `builder` rereads its diff before the PR; no reviewer | Ship |
| `normal` | tests, opt-in addition (condition, option, codegen emitter) | posted, the builder goes on | `branch-reviewer`; a fresh `builder` only for blockers; no verify | Show |
| `high` | `core.ts` (compilation, escaping), `transaction.ts`, driver interface, existing public types, default codegen output | posted, the builder stops until checked | `branch-reviewer` with the subject's lens; fresh `builder`; verify | Ask |

- The level follows the file the change lands in, found by `git grep`, not the issue's title; a refusal added inside `compileExpression` is `high` even when no SQL changes (#677); a case that never reaches the file can be `high` too ([reference.md](reference.md) § Risk).

The plan: skill `plan-and-proofs`; the comments: skill `review-comments`; the gate: skill `merge-gate`.

## Sequence

1. **Issue**: **Files** and **Risk** present; stop points asked.
2. **Plan** (`normal`, `high`): the `builder` posts it on the issue. At `high` it stops; the orchestrator checks the plan against the issue, then resumes it within 5 minutes, or else starts a fresh `builder` with "plan checked": after 5 minutes its cache is cold, and resuming rewrites its whole context (#812).
3. **Build**: tests first, one-line commits (skill `pr-shape`), checks; draft PR, base `master` (skill `ci-gate`), body with **Proofs** (skill `plan-and-proofs`).
4. **Review** (`normal`, `high`): a fresh `branch-reviewer`, even on a draft PR; the orchestrator posts its comment (skill `review-comments`).
5. **Fixes**: a fresh `builder`, blocking items only; the others go to `docs/LEARNINGS.md` § Minors kept.
6. **Verify** (`high`): `branch-reviewer` in `verify` mode on the fix commits, posted as a second comment; `not fixed` or `regressed` goes back to 5. A third round that finds a deeper hole: [reference.md](reference.md) § Rounds.
7. **Learnings**: the agents' "learning" remarks, one line each in `docs/LEARNINGS.md`, last commit of the branch ("Record what #22 taught").
8. **Gate**: `gh pr ready`, green CI (skill `ci-gate`), then the gate of the **Risk**, squash and clean-up (skill `merge-gate`). The merge closes the issue; no "Tick step" commit.

## Briefs

An agent knows only what its brief says. It follows the skills, names an exception to one as such, and runs an Expected it rewrites, as a reviewer's is (#708, #741, #842).

- **`builder`**: the issue number, the decisions taken with the user; to resume at `high`, "plan checked" and any correction; to fix, the PR, its branch and the blocking items (`file:line`, expected fix), each a red test commit, then its fix commit (#550).
  - Started as the typed `builder`; only if the harness answers "Agent type 'builder' not found", a general-purpose agent told to read `.claude/agents/builder.md` first.
- **Model and effort** per role, the effort passed in each spawn: a user setting can pin a model at `high` over the session's effort; an agent's frontmatter and a spawn's `effort` both outrank it. A session reads `.claude/agents/` when it starts: a changed agent applies from the next session (#731, #732). The re-run at `high` is the fix round, the review being the failure signal (Anthropic, "Optimizing for cost and intelligence"). The table: [reference.md](reference.md) § Models.
- **A `builder`'s hand-over**: one that stopped past about 80 calls (agent `builder` § Hand-over) is followed by a fresh `builder` with the issue, the branch and its hand-over note.
- **`branch-reviewer`**: the PR, the **Risk** and its blockers, the lens (`sql`, `types`, `codegen`, `compat`) if the issue has one; in `verify` mode, the blocking items and the range of the fix commits.
- Never the expected conclusion: a reviewer fed the hypothesis confirms it.
- **Agents in parallel**: each its worktree (§ Ritual rules) and its own scratch folder per round, named after its PR, where the reviewer's harness stays for the fix round.
- **A CI-only criterion** (a matrix, a failing job): the orchestrator proves it after `gh pr ready`, which auto mode refuses to a subagent; a draft's **CI passed** proves nothing (skill `ci-gate` § Pitfalls).

## Ritual rules

- One agent at a time works in the main checkout. Agents in parallel each get a worktree: `git worktree add --no-track -b <branch> <path> origin/master` (with tracking, a bare `git push` aims at `master`), `src/.env` linked, `npm ci` (agent `builder` § Where to work); removed after the merge. A checkout whose `node_modules` is a link shares `node_modules/.cache/pgcast`, which its `typecheck`, `test:types` and `bench:types` overwrite: at another commit it runs its own `npm ci` (#41, #50, #96).
- A pushed branch is never rebased nor forced; a fix from below goes up by merge (`guard.mjs`).
- Stacking dependent steps: skill `pr-shape` § Stacking.

## End of chapter

Applies to every Epic that closes, a release chapter included; an Epic never closes before its method PR.

1. A review of the whole merged range (`<master before the chapter>..master`) by `branch-reviewer`, with `docs/LEARNINGS.md` § Minors kept, each "still holds" a run on master (#690); its fixes in a follow-up PR.
2. The method PR: each learning judged (`.agents/README.md` § Self-improvement), kept or dropped, with its proof ([reference.md](reference.md) § Method PRs); the file is emptied in the same PR, which closes the Epic (`Closes #epic`). Like any method PR, it rewrites § Current workflow of Epic #836 and adds its row to § History, and § Watch is reread against the method (what it shows becomes a comment or a sub-issue there).
3. A change of model or effort is kept only while fix rounds stay at or under 0.72 per merged PR and no blocker escapes to the range review of 1; otherwise it is reverted.
4. The orchestrator ends the chapter's session with a written hand-over; the next chapter starts a fresh session from it (one session reached 966K tokens, #732). Within a chapter it updates the hand-over after each merge, so that the session can compact at 250K tokens (`autoCompactWindow`, `.claude/settings.json`) and lose nothing (#812).

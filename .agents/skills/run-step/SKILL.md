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

- Open Epics: `gh issue list --repo AlexandreDemartin/pgcast --label 'type: epic' --state open`.
- The next one: the first open sub-issue of the first open Epic:
  `gh api 'repos/AlexandreDemartin/pgcast/issues/<epic>/sub_issues?per_page=100' -q '.[] | select(.state == "open") | "\(.number) \(.title)"' | head -1`.
- Read it: `gh issue view <n> --repo AlexandreDemartin/pgcast`; only it, and its Epic if the order requires.
- A `type: feature` that starts: first create its `type: task` issues from **Planned PRs**, in order, each under the feature:
  `gh api repos/AlexandreDemartin/pgcast/issues/<feature>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the task's `id`, not its number (`gh api repos/AlexandreDemartin/pgcast/issues/<n> -q .id`).
- A step too wide for one PR (skill `pr-shape` § Size and scope, § Splitting like Zapatos): split it into sub-issues before starting the `builder`.
- `needs decision`, or a stop point of `AGENTS.md` (`core.ts`, codegen output, publication): ask the user **before** the `builder`.
- A new idea: a `type: feature` issue under its Epic, at its place in the order (`PATCH …/issues/<epic>/sub_issues/priority`, with `sub_issue_id` and `after_id`).
- Unstable network: each `gh` call can be retried; before recreating, list what exists (no duplicates).

## Issue body

The issue is the agent's brief, from `.github/ISSUE_TEMPLATE/task.md`, in English, concise (skill `concise-docs`):

- **What**: the expected behaviour, the SQL before / after when it matters · **Why**.
- **Done when**: the acceptance criteria as checkboxes; it names the commands beyond `lint`, `typecheck`, `test`, `test:types`, `build` (`bench:types`…).
- **Files**: the targeted paths, the feature's docs page included (skill `pr-shape` § Splitting like Zapatos).
- **Notes**: **Risk** (level, lens, blockers), **Class** (note 003), **Read** (skills), **Frozen by** (tests).
- Public: unnamed patterns (skill `consumer-usage`); Zapatos, not its author (skill `pr-shape` § PR title).
- An older issue without **Files** or **Risk** (its **Review** gives the level): the orchestrator adds them before the `builder` starts.

## Risk

| Risk | For | Plan | Review | Gate |
|---|---|---|---|---|
| `low` | docs, method, CI only | none | the CI, and the `builder` rereads its diff before the PR; no reviewer | Ship |
| `normal` | tests, opt-in addition (condition, option, codegen emitter) | posted, the builder goes on | `branch-reviewer`; a fresh `builder` only for blockers; no verify | Show |
| `high` | `core.ts` (compilation, escaping), `transaction.ts`, driver interface, existing public types, default codegen output | posted, the builder stops until checked | `branch-reviewer` with the subject's lens; fresh `builder`; verify | Ask |

- The level follows the file the change lands in, found by `git grep`, not the issue's title: `{ col: self }` never passes through `conditions.ts`, so #106 was `high` from the start. A refusal added inside `compileExpression` is `high` even when no SQL changes (#677).

The plan: skill `plan-and-proofs`; the comments: skill `review-comments`; the gate: skill `merge-gate`.

## Sequence

1. **Issue**: **Files** and **Risk** present; stop points asked.
2. **Plan** (`normal`, `high`): the `builder` posts it on the issue. At `high` it stops; the orchestrator checks the plan against the issue, then resumes it.
3. **Build**: tests first, one-line commits (skill `pr-shape`), checks; draft PR, base `master` (skill `ci-gate`), body with **Proofs** (skill `plan-and-proofs`).
4. **Review** (`normal`, `high`): a fresh `branch-reviewer`, even on a draft PR; the orchestrator posts its comment (skill `review-comments`).
5. **Fixes**: a fresh `builder`, blocking items only; the others go to `docs/LEARNINGS.md` § Minors kept.
6. **Verify** (`high`): `branch-reviewer` in `verify` mode on the fix commits, posted as a second comment; `not fixed` or `regressed` goes back to 5.
7. **Learnings**: the agents' "learning" remarks, one line each in `docs/LEARNINGS.md`, last commit of the branch ("Record what #22 taught").
8. **Gate**: `gh pr ready`, green CI (skill `ci-gate`), then the gate of the **Risk**, squash and clean-up (skill `merge-gate`). The merge closes the issue; no "Tick step" commit.

## Briefs

An agent knows only what its brief says.

- **`builder`**: the issue number, the decisions taken with the user; to resume at `high`, "plan checked" and any correction; to fix, the PR, its branch and the blocking items (`file:line`, expected fix), each a red test commit, then its fix commit (#550).
  - Started as the typed `builder`; only if the harness answers "Agent type 'builder' not found", a general-purpose agent told to read `.claude/agents/builder.md` first.
- **Model and effort** per role, the effort passed in each spawn: a user setting can pin a model at `high` over the session's effort; an agent's frontmatter and a spawn's `effort` both outrank it. A session reads `.claude/agents/` when it starts: a changed agent applies from the next session (#731, #732). The re-run at `high` is the fix round, the review being the failure signal (Anthropic, "Optimizing for cost and intelligence").

  | Role | Model | Effort |
  |---|---|---|
  | `builder`, `low` or `normal` step | the session's | `medium` |
  | `builder`, `high` step (plan and build), round of fixes | the session's | `high` |
  | `branch-reviewer`, review and `verify` | the session's | `high` |
  | `chores`, French proofreader, npm and site audits | `sonnet` | `medium` |
  | Orchestrator | the session's | the session's |

- **`branch-reviewer`**: the PR, the **Risk** and its blockers, the lens (`sql`, `types`, `codegen`, `compat`) if the issue has one; in `verify` mode, the blocking items and the range of the fix commits.
- Never the expected conclusion: a reviewer fed the hypothesis confirms it.
- **Agents in parallel**: each its worktree (§ Ritual rules) and its own scratch folder per round, named after its PR, where the reviewer's harness stays for the fix round.
- **A CI-only criterion** (a matrix, a failing job): the orchestrator proves it after `gh pr ready`, which auto mode refuses to a subagent; a draft's **CI passed** proves nothing (skill `ci-gate` § Pitfalls).

## Ritual rules

- One agent at a time works in the main checkout. Agents in parallel each get a worktree: `git worktree add --no-track -b <branch> <path> origin/master` (with tracking, a bare `git push` aims at `master`), `src/.env` linked, `npm ci` (agent `builder` § Where to work); removed after the merge. A checkout whose `node_modules` is a link shares `node_modules/.cache/pgcast`: its `typecheck`, `test:types` and `bench:types` overwrite the other's declarations, so at another commit it runs its own `npm ci` (#41, #50, #96).
- A pushed branch is never rebased nor forced; a fix from below goes up by merge (`guard.mjs`).
- Stacking dependent steps: skill `pr-shape` § Stacking.

## End of chapter

1. A review of the whole merged range (`<master before the chapter>..master`) by `branch-reviewer`, with `docs/LEARNINGS.md` § Minors kept; its fixes in a follow-up PR.
2. The method PR: each learning judged (`.agents/README.md` § Self-improvement), kept or dropped; the file is emptied in the same PR, which closes the Epic (`Closes #epic`).
3. A change of model or effort is kept only while fix rounds stay at or under 0.72 per merged PR and no blocker escapes to the range review of 1; otherwise it is reverted.
4. The orchestrator ends the chapter's session with a written hand-over; the next chapter starts a fresh session from it rather than compacting a long one (one session reached 966K tokens of context, #732).

## Checklist

- [ ] Only the step's issue read, with **Files** and **Risk**; stop points asked before the `builder`
- [ ] Plan posted at `normal` and `high`, checked at `high`
- [ ] Review of the **Risk**, brief without a fed conclusion, comment posted
- [ ] Blockers fixed by a fresh `builder`; minors and learnings in `docs/LEARNINGS.md`
- [ ] Gate passed, PR squashed with `Closes #n`, issue closed, local clean

---
name: run-step
description: 'Orchestrate a step, sub-issue of a GitHub Epic: builder, review by **Review**, blocking / minor triage, verify, merge that closes the issue, end of chapter, learnings. USE FOR: starting the next step, starting a feature, choosing the review, triaging defects, merging. DO NOT USE FOR: writing the code (agent builder), CI (ci-gate).'
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
- A step too wide for one PR in George's manner (skill `zapatos-spirit` § Splitting like George): split it into sub-issues before starting the `builder`.
- `needs decision`, or a stop point of `AGENTS.md` (`core.ts`, codegen output, publication): ask the user **before** the `builder`.
- A new idea: a `type: feature` issue under its Epic, at its place in the order (`PATCH …/issues/<epic>/sub_issues/priority`, with `sub_issue_id` and `after_id`).
- Unstable network: each `gh` call can be retried; before recreating, list what exists (no duplicates).

## Issue body

In English, concise (skill `concise-docs`): **What** (the expected behaviour, the SQL before / after when it matters) · **Why** · **Done when** · **Notes**: **Class** (note 003), **Review** (level, lens, blockers), **Read** (skills), **Frozen by** (tests). **Done when** names the commands beyond `lint`, `typecheck`, `test`, `test:types`, `build` (`bench:types`…). Public: unnamed patterns (skill `consumer-usage`).

## Review level

| Level | For | Review |
|---|---|---|
| `low` | docs, method, CI only | the CI, and the `builder` rereads its diff before the PR; no reviewer |
| `normal` | tests, opt-in addition (condition, option, codegen emitter) | `branch-reviewer`; a fresh `builder` only for blockers; no `verify` |
| `high` | `core.ts` (compilation, escaping), `transaction.ts`, driver interface, existing public types, default codegen output | `branch-reviewer` with the subject's lens; fresh `builder`; `verify` |

## Sequence

1. `builder` builds the step, checks locally, opens its PR in **draft**, base `master` (skill `ci-gate`), with `Closes #n` in the body and `(closes #n)` at the end of the title.
2. The level's reviews, in parallel, even on a draft PR.
3. Each defect is classed:
   - **blocking** (bug, injection, breaking change, wrong or too wide type, SQL different from the one announced, missing test on a risk): a fresh `builder` fixes it in the step;
   - **minor** (naming, JSDoc, form): added to `docs/APPRENTISSAGES.md` § Mineurs gardés, or dropped.
4. Level `high`: `branch-reviewer` in `verify` mode on the fix commits; `not fixed` or `regressed` goes back to 3.
5. The agents' "learning" remarks: one line each in `docs/APPRENTISSAGES.md`, last commit of the branch ("Record what #22 taught").
6. `gh pr ready`, green CI on the last commit (skill `ci-gate`); `gh pr merge --merge`: the merge closes the issue, the Epic ticks itself. No "Tick step" commit. Clean up (`builder.md` § Clean up).

## Briefs

An agent knows only what its brief says.

- **`builder`**: the issue number, the decisions taken with the user; to fix, the PR, its branch and the blockers (`file:line`, expected fix).
- **`branch-reviewer`**: the PR, the level, the blockers of **Review**, the lens (`sql`, `types`, `codegen`, `compat`) if the issue has one.
- Never the expected conclusion: a reviewer fed the hypothesis confirms it.

## Ritual rules

- **A reviewer's report**: at most 10 defects, from most to least serious, each blocking or minor.
- **No worktree by default**; one only for two pieces of work in parallel, removed after the merge.
- A pushed branch is never rebased nor forced; a fix from below goes up by merge (`guard.mjs`).

## Stacking PRs

Sources: GitHub docs "Stack code changes in pull requests", Thoughtworks Radar (*Caution* ring), Graphite, cubic (2026).

| Stack | Do not stack |
|---|---|
| The steps of a **same feature** depend on each other (PR 2 needs PR 1's code), and waiting for the bottom to merge would block what follows. Example: the series of #54, FK metadata → `related()` → `relatedMany()`. | **Independent** changes, like most fixes of Epic #18: separate PRs to `master`. |
| Each layer is a George PR, readable on its own. | A PR that stands on its own; a stack used as an excuse for a big change ("an excuse to write one enormous change", Thoughtworks). |
| **3 layers at most**, each ≤ ~250 lines and 25 files (Graphite's warning threshold). | A layer that makes no sense without the one above: split it again. |

- **Mechanics without rewriting**, compatible with `guard.mjs`: layer N starts from branch N-1 and its PR targets branch N-1 (`--base <branch N-1>`). A fix from below goes up by `git merge origin/<branch N-1>` into each layer above, from bottom to top (agent `chores`).
- **No `gh stack sync` nor `gh stack push`**: they rebase and force each branch.
- **Review**: each layer is reviewed on its own, as soon as it is open, without waiting for the bottom; the reviewer gets the layer's number and its base.
- **Merge from bottom to top**, as a merge commit (`gh pr merge --merge`): the next layer has nothing to redo, and GitHub retargets it to `master` (`delete_branch_on_merge` is on). Then `git merge origin/master` into the retargeted layer if `master` has moved, green CI, merge.
- A middle layer is never merged before the ones below it.

## End of chapter

1. A review of the whole merged range (`<master before the chapter>..master`) by `branch-reviewer`, with `docs/APPRENTISSAGES.md` § Mineurs gardés; its fixes in a follow-up PR.
2. The method PR: each learning judged (`.agents/README.md` § Self-improvement), kept or dropped; the file is emptied in the same PR, which closes the Epic (`Closes #epic`).

## Checklist

- [ ] Only the step's issue read; stop points asked before the `builder`
- [ ] Review of the level, brief without a fed conclusion
- [ ] Each defect classed; blockers fixed by a fresh `builder`
- [ ] Minors and learnings written in `docs/APPRENTISSAGES.md`
- [ ] PR merged with `Closes #n`, issue closed, local clean

# Workflow

How a step of pgcast goes from its issue to `master`, on one page. Each box links to the skill that holds its rules; this page repeats none of them.

An orchestrator (the main session) runs each step with three agents: `builder` writes the code, `branch-reviewer` reviews it read-only, `chores` does the mechanical work. The owner reads what each step leaves on GitHub and gives the OK where the risk is high.

## The flow

```mermaid
flowchart TD
    issue["Issue: What, Done when, Files, Risk"] --> risk1{"Risk"}
    risk1 -- "low" --> build
    risk1 -- "normal" --> planN["Plan comment on the issue"] --> build
    risk1 -- "high" --> planH["Plan comment, the builder stops"] --> check["Orchestrator checks the plan"] --> build
    build["Branch type/n-slug, tests first, one-line commits"] --> draft["Draft PR: What, Why, Proofs, Decided alone"]
    draft --> risk2{"Risk"}
    risk2 -- "low" --> reread["The builder rereads its diff"] --> ready
    risk2 -- "normal or high" --> review["Review comment, Conventional Comments"]
    review --> blocking{"Blocking items?"}
    blocking -- "none" --> ready
    blocking -- "yes" --> fixes["A fresh builder fixes the blockers"]
    fixes --> risk3{"Risk"}
    risk3 -- "normal" --> ready
    risk3 -- "high" --> verify["Verify comment, one verdict per blocker"]
    verify -- "not fixed or regressed" --> fixes
    verify -- "all fixed" --> ready
    ready["gh pr ready, green CI"] --> gate{"Merge gate"}
    gate -- "Ship: low" --> squash
    gate -- "Show: normal" --> squash
    gate -- "Ask: high" --> owner["Label needs-owner, wait for the owner OK"] --> squash
    owner -. "meanwhile" .-> next["Next step: independent, or stacked on this PR"]
    squash["Squash merge, the issue closes"] --> clean["Clean up: branch -D, fetch --prune"]
    clean --> epic{"Last step of the Epic?"}
    epic -- "no" --> issue
    epic -- "yes" --> chapter["End of chapter: whole range review, method PR on LEARNINGS"]
```

| Stage | What it leaves on GitHub | Skill |
|---|---|---|
| Issue | the brief: **What**, **Done when**, **Files**, **Risk** ([template](../.github/ISSUE_TEMPLATE/task.md)) | [`run-step`](../.agents/skills/run-step/SKILL.md) § Issue body |
| Plan | a comment on the issue, before any code | [`plan-and-proofs`](../.agents/skills/plan-and-proofs/SKILL.md) |
| Branch and commits | `fix/26-upsert-update-values`; one-line commits in plain English; a bug's failing test before its fix | [`pr-shape`](../.agents/skills/pr-shape/SKILL.md) |
| Draft PR | `Closes #n`, **What** · **Why** · **Proofs** · **Decided alone** | [`plan-and-proofs`](../.agents/skills/plan-and-proofs/SKILL.md) |
| Review, fixes, verify | one comment per round; blockers marked `→ fixed in <sha>` | [`review-comments`](../.agents/skills/review-comments/SKILL.md) |
| CI | none while in draft; **CI passed** on the last commit | [`ci-gate`](../.agents/skills/ci-gate/SKILL.md) |
| Gate, squash, clean-up | one commit per PR on `master` | [`merge-gate`](../.agents/skills/merge-gate/SKILL.md) |

## Risk

The issue's **Risk** sets the plan, the review and the gate (detail: skill `run-step` § Risk).

| Risk | For | Plan | Review | Gate |
|---|---|---|---|---|
| `low` | docs, method, CI only | none | CI; the builder rereads its diff | **Ship**: merged on green CI |
| `normal` | tests, an opt-in addition | posted, the builder goes on | `branch-reviewer`; fixes of blockers | **Show**: merged on green CI, read by the owner afterwards |
| `high` | `core.ts`, `transaction.ts`, existing public types, default codegen output | posted, the builder waits for the check | `branch-reviewer` with a lens; fixes; verify | **Ask**: `needs-owner`, the owner's OK before merging |

## A stack

Steps of one feature that depend on each other become a stack of at most three PRs, each targeting the branch below (skill `pr-shape` § Stacking).

```mermaid
flowchart LR
    l1["Layer 1, base master"] --> l2["Layer 2, base layer 1"] --> l3["Layer 3, base layer 2"]
    l1 -- "squashed" --> retarget["GitHub retargets layer 2 to master"]
    retarget --> up["git merge origin/master into layer 2, never a rebase"] --> gate2["Layer 2 through its own gate"]
```

## End of chapter

When the Epic's last step is merged: a review of the whole merged range, then a method PR that judges each line of [LEARNINGS.md](LEARNINGS.md) and closes the Epic (skill `run-step` § End of chapter).

## Later

- release-please for pgcast's npm versions, once releases start.
- Native stacked PRs, once `gh stack` stops rebasing and forcing branches.

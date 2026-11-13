---
name: merge-gate
description: 'Merging a pgcast PR by risk (Ship / Show / Ask): what each gate waits for, the labels needs-owner and decided-alone, the squash merge, merging a stack, going on while a PR waits, clean-up. USE FOR: merging a PR, a high PR waiting for the owner, local clean-up after a merge. DO NOT USE FOR: when CI runs (ci-gate), the review (review-comments).'
---

# Merge gate

The owner's attention goes where the risk is (Fowler, "Ship / Show / Ask"). The gate follows the issue's **Risk** (skill `run-step` § Risk).

## The gates

| Risk | Gate | Merged when | Afterwards |
|---|---|---|---|
| `low` | **Ship** | green CI | — |
| `normal` | **Show** | blockers fixed, green CI | listed in the milestone summary; the owner reads it then |
| `high` | **Ask** | label `needs-owner`, review and verify comments posted, green CI, **then the owner's OK** | — |

- Green CI: **CI passed** on the last commit, after `gh pr ready` (skill `ci-gate`).
- **`master` moved** since that run: `git fetch`, then `git merge-base`; if behind, merge `origin/master` (skill `pr-shape` § Commits) and let CI run again. Checks across pages (anchors, pending names, a shared docs schema) and generated counts hold only on the merged result.
- `high`: `gh pr edit <pr> --repo AlexandreDemartin/pgcast --add-label needs-owner`, then ask the owner with the PR link and the verify verdicts.
- The OK is the owner's own message; an agent's message never is.
- **While a `high` PR waits**, go on: the next step if it does not depend on it, otherwise the next step stacked on it (skill `pr-shape` § Stacking).

## Squash

```sh
gh pr merge <pr> --repo AlexandreDemartin/pgcast --squash \
  --subject "<PR title> (#<pr>)" --body "Co-Authored-By: …"
```

- One commit per PR on `master`, as in Zapatos; the subject keeps the title's `(closes #n)`, and the body's `Closes #n` closes the issue; the Epic ticks itself.
- `--body`: the requested `Co-Authored-By` line only, not the list of the branch's commits.
- Before merging, the label `decided-alone` matches the PR's **Decided alone** section (skill `plan-and-proofs`).
- No commit after the green CI.

## A stack

- From bottom to top; a middle layer is never merged before the ones below it.
- The bottom is squashed; GitHub retargets the next layer to `master` (`delete_branch_on_merge` is on).
- Then `git merge origin/master` into that layer (agent `chores`), never a rebase: its diff then shows only its own commits.
- Green CI, then that layer's own gate.

## Clean up

After the merge, in the checkout that held the branch:

- `git switch master && git pull --ff-only`;
- `gh pr view <pr> --repo AlexandreDemartin/pgcast --json state -q .state` says `MERGED`, then `git branch -D <branch>` (`-d` refuses a squashed branch);
- `git fetch --prune`; the worktree removed if there is one.

## Checklist

- [ ] The gate of the issue's **Risk**; `high`: `needs-owner` and the owner's OK
- [ ] Label `decided-alone` if needed
- [ ] `--squash` with the subject `<PR title> (#<pr>)`
- [ ] Stack merged from the bottom, `origin/master` merged into the next layer
- [ ] Local clean-up with `git branch -D` after `MERGED`

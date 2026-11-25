---
name: pr-shape
description: 'The shape of a pgcast PR, after the commits of Zapatos: size, splitting, stacking, PR title, branch, commits. USE FOR: splitting a step, stacking dependent PRs, naming a PR, a branch or a commit. DO NOT USE FOR: code, JSDoc and docs style (code-style), the shape of a helper (zero-abstraction).'
---

# The shape of a PR

Zapatos was committed straight to `master`: **one Zapatos commit is one pgcast PR**, squashed into one commit on `master` (skill `merge-gate`). Source: `git log upstream/master`.

## Size and scope

Measured on the 212 Zapatos commits that touch `src/`: a median of 14 lines changed in `src/` (p75 42, p90 84), in 1 file (p90 4).

- **One PR = one visible change**, described in one sentence. Never mix a fix, a feature and a refactor.
- **`src/`: ~100 lines changed at most per PR** (Zapatos's p90). Beyond that, split into independent PRs, each useful on its own.
- **The whole PR: ~400 hand-written lines**, not counting generated snapshots.
- **Tests in proportion**: a tests-only PR stays readable in one go (~800 hand-written lines). Beyond that, split by subject (types, injection, a module).
- Counter-example: PR #5, ~2,900 lines; today split into core, shortcuts, conditions and transaction.

## Splitting like Zapatos

Dependent steps make a stack of PRs (§ Stacking); otherwise, separate PRs. The moves of Zapatos's history (`git log upstream/master`):

- **A feature grows by steps**: one case, then the others, then the generalisation; one PR per step, each useful on its own, the simplest case first.
- **Runtime and codegen apart** (22 mixed commits out of 154): one `src/generate` PR, then one `src/db` PR that uses it. Never both, except a format change that ties them (canary).
- **Docs follow the code** (5 mixed commits out of 154): each feature PR carries its docs page in `website/` (skill `code-style` § Docs voice), its `CHANGELOG.md` line and its JSDoc; a "Document …" PR only for a guide that spans a series.
- **Fixing along the way**: a defect found after merge is a small "Fix …" PR, never mixed into what follows.
- **Dependencies apart**: one PR for dependency updates, with no code.
- **Small, frequent versions** (94 version commits, "6.4.1", "6.4.2", one fix each): a version as soon as a useful change is merged. Publication remains a stop point.
- **Big exploratory work**: first a decision note, then a series of small PRs. Never a giant PR.
- **The reason in the title** when it is not obvious, short, at the end: "… to count(*) rather than count(alias.*) for performance reasons".

## Stacking

- **Stack** the steps of the **same feature** that depend on each other (PR 2 needs PR 1's code), when waiting for the bottom would block: #54, FK metadata → `related()` → `relatedMany()`. **Do not stack** independent changes, like most fixes of Epic #18, nor a PR that stands on its own: separate PRs to `master`.
- Each layer is a PR the size of a Zapatos commit, readable on its own; never a stack as "an excuse to write one enormous change" (Thoughtworks).
- **3 layers at most**, each ≤ ~250 lines and 25 files (Graphite's warning threshold); a layer that makes no sense without the one above is split again.
- **No rewriting** (`guard.mjs`): layer N starts from branch N-1 and its PR targets it (`--base <branch N-1>`); a fix from below goes up by a merge of `origin/<branch N-1>` (§ Commits) into each layer above, bottom to top (agent `chores`).
- **No `gh stack sync` nor `gh stack push`**: they rebase and force each branch.
- **Splitting a pushed PR**: new branches from `origin/master`, `git cherry-pick` of its commits, the old PR closed with a pointer.
- **Review**: each layer on its own, as soon as it is open; the reviewer gets its number and its base.
- **Merge from bottom to top**, each layer squashed, then `origin/master` merged into the next (skill `merge-gate` § A stack).

## PR title

- **Plain English, a capital at the start, no prefix** (`test:`, `feat:`), with a verb that says the effect for the user: `Add …`, `Allow …`, `Fix …`, `Make …`, `Stop …`, `Characterise …`.
- **British spelling**, as in Zapatos (`licence`, `characterise`, `parenthesise`, `favour`).
- **Zapatos, not its author**, in issues, PRs and commits ("the Zapatos style"); his name only where credit and the licence call for it (README credit line, docs footer, `LICENCE`, copyright headers, `package.json`) and where a skill cites its sources.
- API names as they are, without backticks: "Allow db.all as value of noNullUpdateColumns".
- **The step's issue at the end, always**: `(closes #n)`, as in Zapatos ("Stop generating .eslintrc.json (closes #184)"); the body's `Closes #n` closes the issue on merge. `(addresses #n)` for a PR that does only part of it.

## Branch

- `<type>/<issue>-<slug>`, types `fix`, `feat`, `test`, `docs`, `chore`: `fix/26-upsert-update-values`.
- From an up-to-date `origin/master`, or from the layer below in a stack.

## Commits

Same voice as PR titles.

- **One line**, in plain English, a capital at the start, no prefix nor final full stop: "Add conditions with array operators".
- **Imperative**, like Zapatos's recent commits: the verbs of § PR title, `Ensure`, `Export`.
- **Docs**: "Update docs for …"; **dependencies**: "Update dependencies"; **version**: the number alone ("6.7.0").
- **Learnings**: "Record what #22 taught"; **merge of master**: "Merge master into <branch>".
  - `git merge -m "<subject>" -m "Co-Authored-By: …"` (a trailer needs its own `-m`); after a conflict `git commit -m`. Never `--no-edit`, which drops the trailer or keeps the `# Conflicts:` lines: `guard.mjs` refuses it.
  - Then `git diff origin/master...HEAD`: no `CHANGELOG.md` line landed under a release heading nor came back in an older wording (a branch made before a PR rewrote the entry), and a line merged after a version PR sits where it belongs on purpose (#569, #571, #647); an entry written twice fails `check:agents`. Every diff against master, size and "must not change" checks included, takes three dots: two make the branch revert what master gained (#33, #235, #506). A merge can conflict with no textual hunk: the merged files are grepped for every place one side mutates what the other made shared (master made `selectRows()` share one `rowsResult` while the branch marked each query's transform, #950).
- **A bug**: the failing test is committed before the fix, so the proof can show it red (skill `plan-and-proofs` § Proofs).
- **A fix ahead of its advisory** is neutral from the first commit, in its messages, `CHANGELOG.md`, comments and test values; `git log -p origin/master..HEAD` before the first push (#550, #551).
- No Conventional Commits, no commits that tick a box: merging the PR closes its issue.
- No body, except a reason that does not fit on the line; the requested `Co-Authored-By` line always stays.

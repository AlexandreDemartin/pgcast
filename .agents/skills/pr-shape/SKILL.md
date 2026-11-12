---
name: pr-shape
description: 'The shape of a pgcast PR, after the commits of Zapatos: size, splitting, stacking, PR title, branch, commits. USE FOR: splitting a step, stacking dependent PRs, naming a PR, a branch or a commit. DO NOT USE FOR: code, JSDoc and docs style (code-style), the shape of a helper (zero-abstraction).'
---

# The shape of a PR

Zapatos was committed straight to `master`: **one Zapatos commit is one pgcast PR**, squashed into one commit on `master` (skill `merge-gate`). Source: `git log upstream/master`.

## Size and scope

Measured on the 212 Zapatos commits that touch `src/`:

| | median | p75 | p90 |
|---|---|---|---|
| lines changed in `src/` | 14 | 42 | 84 |
| files | 1 | — | 4 |

- **One PR = one visible change**, described in one sentence. Never mix a fix, a feature and a refactor.
- **`src/`: ~100 lines changed at most per PR** (Zapatos's p90). Beyond that, split into independent PRs, each useful on its own.
- **The whole PR: ~400 hand-written lines**, not counting generated snapshots.
- **Tests in proportion**: a tests-only PR stays readable in one go (~800 hand-written lines). Beyond that, split by subject (types, injection, a module).
- Example of the right size: "Add conditions with array operators", 4 lines in `conditions.ts`.
- Counter-example: PR #5, ~2,900 lines; today split into core, shortcuts, conditions and transaction.

## Splitting like Zapatos

Dependent steps make a stack of PRs (§ Stacking); otherwise, separate PRs. How Zapatos's history split them:

| Move | Example from `git log upstream/master` | In pgcast |
|---|---|---|
| A feature grows by steps: one case, then the others, then the generalisation | "Added returning option to insert shortcut" → … → "Returning (and now also extras) options for insert/upsert/update/deletes" | One PR per step, each useful on its own, the simplest case first. |
| Runtime and codegen apart (22 mixed commits out of 154) | "Direct lateral subquery support" (`db`); "add support for schema generation for materialized views" (`gen`) | One `src/generate` PR, then one `src/db` PR that uses it. Never both, except a format change that ties them (canary). |
| Docs follow the code (5 mixed commits out of 154) | "Updated docs for returning/extras and 2.0" | Each feature PR carries its docs page in `website/` (skill `code-style` § Docs voice), its `CHANGELOG.md` line and its JSDoc; a "Document …" PR only for a guide that spans a series. |
| Fixing along the way | "Direct lateral subquery support" then "Fixed type inference for lateral direct subqueries" | A defect found after merge: a small "Fix …" PR, never mixed into what follows. |
| Dependencies apart | "Updated dependencies" | One PR for dependency updates, with no code. |
| Small, frequent versions (94 version commits) | "6.4.1", "6.4.2", one fix each | A version as soon as a useful change is merged. Publication remains a stop point. |
| Big exploratory work on a branch | "Started work on multi schema support" → … → "Multi-schema updates" | First a decision note, then a series of small PRs. Never a giant PR. |
| The reason in the title when it is not obvious | "… to count(*) rather than count(alias.*) for performance reasons" | A short reason at the end of the title, if it helps. |

Example for step ③ (foreign keys), each of 1 to 4 with its docs page:

1. "Generate foreign key metadata for each table" (`src/generate`, opt-in)
2. "Add related() for many-to-one lateral joins" (`src/db`)
3. "Add relatedMany() for one-to-many lateral joins" (`src/db`)
4. "Allow lateral results to be referenced in order and groupBy" (`src/db`)
5. "Document lateral joins on foreign keys" (a how-to that spans the series)

## Stacking

Sources: GitHub docs "Stack code changes in pull requests", Thoughtworks Radar (*Caution*), Graphite, cubic (2026).

| Stack | Do not stack |
|---|---|
| Steps of the **same feature** that depend on each other (PR 2 needs PR 1's code), when waiting for the bottom would block: #54, FK metadata → `related()` → `relatedMany()`. | **Independent** changes, like most fixes of Epic #18: separate PRs to `master`. |
| Each layer is a PR the size of a Zapatos commit, readable on its own. | A PR that stands on its own; a stack as "an excuse to write one enormous change" (Thoughtworks). |
| **3 layers at most**, each ≤ ~250 lines and 25 files (Graphite's warning threshold). | A layer that makes no sense without the one above: split it again. |

- **No rewriting** (`guard.mjs`): layer N starts from branch N-1 and its PR targets it (`--base <branch N-1>`); a fix from below goes up by `git merge origin/<branch N-1>` into each layer above, bottom to top (agent `chores`).
- **No `gh stack sync` nor `gh stack push`**: they rebase and force each branch.
- **Review**: each layer on its own, as soon as it is open; the reviewer gets its number and its base.
- **Merge from bottom to top**, each layer squashed, then `origin/master` merged into the next (skill `merge-gate` § A stack).

## PR title

- **Plain English, a capital at the start, no prefix** (`test:`, `feat:`), with a verb that says the effect for the user: `Add …`, `Allow …`, `Fix …`, `Make …`, `Stop …`, `Characterise …`.
- **British spelling**, as in Zapatos (`licence`, `characterise`, `parenthesise`, `favour`).
- **Zapatos, not its author**, in issues, PRs and commits ("the Zapatos style"); his name only where credit and the licence call for it (README credit line, docs footer, `LICENCE`, copyright headers, `package.json`) and where a skill cites its sources.
- API names as they are, without backticks: "Allow db.all as value of noNullUpdateColumns".
- **The step's issue at the end, always**: `(closes #n)`, as in Zapatos ("Stop generating .eslintrc.json (closes #184)"); the body's `Closes #n` closes the issue on merge. `(addresses #n)` for a PR that does only part of it.
- Example: "Fix not() so it parenthesises its condition (closes #30)".

## Branch

- `<type>/<issue>-<slug>`, types `fix`, `feat`, `test`, `docs`, `chore`: `fix/26-upsert-update-values`.
- From an up-to-date `origin/master`, or from the layer below in a stack.

## Commits

Same voice as PR titles.

- **One line**, in plain English, a capital at the start, no prefix nor final full stop: "Add conditions with array operators".
- **Imperative**, like Zapatos's recent commits: the verbs of § PR title, `Ensure`, `Export`.
- **Docs**: "Update docs for …"; **dependencies**: "Update dependencies"; **version**: the number alone ("6.7.0").
- **Learnings**: "Record what #22 taught"; **merge of master**: "Merge master into <branch>".
- **A bug**: the failing test is committed before the fix, so the proof can show it red (skill `plan-and-proofs` § Proofs).
- No Conventional Commits, no commits that tick a box: merging the PR closes its issue.
- No body, except a reason that does not fit on the line; the requested `Co-Authored-By` line always stays.
- Old format (`test: …`, `fix: …`): history of PRs #1 to #12, not rewritten.

## Checklist

- [ ] A single visible change, described in one sentence
- [ ] `src/` ≤ ~100 lines, the PR ≤ ~400, otherwise split
- [ ] A feature's docs page in the same PR
- [ ] Branch `<type>/<issue>-<slug>`; a bug's failing test before its fix
- [ ] Title in plain English, no prefix, British spelling, `(closes #n)` at the end

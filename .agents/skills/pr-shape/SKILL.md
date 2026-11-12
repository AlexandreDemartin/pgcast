---
name: pr-shape
description: 'The shape of a pgcast PR, after the commits of George MacKerron: size, splitting, stacking, PR title, branch, commits. USE FOR: splitting a step, stacking dependent PRs, naming a PR, a branch or a commit. DO NOT USE FOR: code, JSDoc and docs style (zapatos-spirit), the shape of a helper (zero-abstraction).'
---

# The shape of a PR

George committed straight to `master`: **one George commit is one pgcast PR**, squashed into one commit on `master` (skill `merge-gate`). Source: `git log upstream/master`.

## Size and scope

Measured on his 212 commits that touch `src/`:

| | median | p75 | p90 |
|---|---|---|---|
| lines changed in `src/` | 14 | 42 | 84 |
| files | 1 | — | 4 |

- **One PR = one visible change**, described in one sentence. Never mix a fix, a feature and a refactor.
- **`src/`: ~100 lines changed at most per PR** (his p90). Beyond that, split into independent PRs, each useful on its own.
- **The whole PR: ~400 hand-written lines**, not counting generated snapshots.
- **Tests in proportion**: a tests-only PR stays readable in one go (~800 hand-written lines). Beyond that, split by subject (types, injection, a module).
- Example of the right size: "Add conditions with array operators", 4 lines in `conditions.ts`.
- Counter-example: PR #5, ~2,900 lines in one PR; today it would be split into core, shortcuts, conditions and transaction.

## Splitting like George

When his steps depend on each other, the series becomes a stack of PRs (§ Stacking); otherwise, separate PRs. His history shows how he split:

| His move | Example from `git log upstream/master` | In pgcast |
|---|---|---|
| A feature grows by steps: one case, then the others, then the generalisation | "Added returning option to insert shortcut" → "Added returning option to upsert" → "Returning (and now also extras) options for insert/upsert/update/deletes" | One PR per step, each useful on its own. The first carries the simplest case. |
| Runtime and codegen apart (22 mixed commits out of 154) | "Direct lateral subquery support" (`db`); "add support for schema generation for materialized views" (`gen`) | One `src/generate` PR, then one `src/db` PR that uses it. Never both, except a format change that ties them (canary). |
| Docs follow the code (5 mixed commits out of 154) | "Updated docs for returning/extras and 2.0" | The code PR carries its `CHANGELOG.md` line and its JSDoc; the usage guide comes in a "Document …" PR after the series. |
| Fixing as he went | "Direct lateral subquery support" then "Fixed type inference for lateral direct subqueries" | A defect found after merge becomes a small "Fix …" PR, never a big fix mixed into what follows. |
| Dependencies apart | "Updated dependencies" | One PR for dependency updates, with no code. |
| Small, frequent versions (94 version commits) | "6.4.1", "6.4.2", one fix each | A version as soon as a useful change is merged. Publication remains a stop point. |
| Big exploratory work on a branch | "Started work on multi schema support" → "Progress on multi-schema work" → "Multi-schema updates" | First a decision note, then a series of small PRs. Never a giant PR. |
| The reason in the title when it is not obvious | "… to count(*) rather than count(alias.*) for performance reasons" | A short reason at the end of the title, if it helps. |

Example for step ③ (foreign keys):

1. "Generate foreign key metadata for each table" (`src/generate`, opt-in)
2. "Add related() for many-to-one lateral joins" (`src/db`)
3. "Add relatedMany() for one-to-many lateral joins" (`src/db`)
4. "Allow lateral results to be referenced in order and groupBy" (`src/db`)
5. "Document related() and relatedMany()" (docs)

## Stacking

Sources: GitHub docs "Stack code changes in pull requests", Thoughtworks Radar (*Caution* ring), Graphite, cubic (2026).

| Stack | Do not stack |
|---|---|
| The steps of a **same feature** depend on each other (PR 2 needs PR 1's code), and waiting for the bottom to merge would block what follows. Example: the series of #54, FK metadata → `related()` → `relatedMany()`. | **Independent** changes, like most fixes of Epic #18: separate PRs to `master`. |
| Each layer is a George PR, readable on its own. | A PR that stands on its own; a stack used as an excuse for a big change ("an excuse to write one enormous change", Thoughtworks). |
| **3 layers at most**, each ≤ ~250 lines and 25 files (Graphite's warning threshold). | A layer that makes no sense without the one above: split it again. |

- **No rewriting** (`guard.mjs`): layer N starts from branch N-1 and its PR targets it (`--base <branch N-1>`); a fix from below goes up by `git merge origin/<branch N-1>` into each layer above, bottom to top (agent `chores`).
- **No `gh stack sync` nor `gh stack push`**: they rebase and force each branch.
- **Review**: each layer is reviewed on its own, as soon as it is open, without waiting for the bottom; the reviewer gets the layer's number and its base.
- **Merge from bottom to top**, each layer squashed, then `origin/master` merged into the next (skill `merge-gate` § A stack).

## PR title

- **Plain English, a capital at the start, no prefix** (`test:`, `feat:`), with a verb that says the effect for the user: `Add …`, `Allow …`, `Fix …`, `Make …`, `Stop …`, `Characterise …`.
- **British spelling**, like George (`licence`, `characterise`, `parenthesise`, `favour`).
- API names as they are, without backticks: "Allow db.all as value of noNullUpdateColumns".
- **The step's issue at the end, always**: `(closes #n)`, like George ("Stop generating .eslintrc.json (closes #184)"); the body also carries `Closes #n`, which closes the issue on merge. `(addresses #n)` for a PR that does only part of it.
- Examples: "Fix not() so it parenthesises its condition (closes #30)", "Add related() and relatedMany() for lateral joins on foreign keys".

## Branch

- `<type>/<issue>-<slug>`, types `fix`, `feat`, `test`, `docs`, `chore`: `fix/26-upsert-update-values`.
- From an up-to-date `origin/master`, or from the layer below in a stack.

## Commits

Same voice as PR titles.

- **One line**, in plain English, a capital at the start, no prefix nor final full stop: "Add conditions with array operators", "Stop generating .eslintrc.json (closes #184)".
- **Imperative**, like his recent commits: `Add`, `Allow`, `Fix`, `Make`, `Stop`, `Ensure`, `Export`, `Characterise`.
- **Docs**: "Update docs for …"; **dependencies**: "Update dependencies"; **version**: the number alone ("6.7.0").
- **Learnings**: "Record what #22 taught"; **merge of master**: "Merge master into <branch>".
- **A bug**: the failing test is committed before the fix, so the proof can show it red (skill `plan-and-proofs` § Proofs).
- No Conventional Commits, no commits that tick a box: merging the PR closes its issue.
- No body, except a reason that does not fit on the line; the requested `Co-Authored-By` line always stays.
- Old format (`test: …`, `fix: …`): history of PRs #1 to #12, not rewritten.

## Checklist

- [ ] A single visible change, described in one sentence
- [ ] `src/` ≤ ~100 lines, the PR ≤ ~400, otherwise split
- [ ] Branch `<type>/<issue>-<slug>`; a bug's failing test before its fix
- [ ] Title in plain English, no prefix, British spelling, `(closes #n)` at the end

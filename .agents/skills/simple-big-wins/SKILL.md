---
name: simple-big-wins
description: 'Simple big wins, nothing shaky: measured gain weighed against added complexity, reuse before writing, what to test. USE FOR: before writing a mechanism, choosing between two solutions, optimising, adding a dependency, a rule on existing code. DO NOT USE FOR: the shape of a helper (zero-abstraction), recording a decision (decision-philosophy).'
---

# Simple big wins, not complicated small wins

- The right balance is judged by the **measured gain** weighed against the **added complexity**: lines, special cases, conditional types, assumptions to keep in mind.
- **Simple big win**: take it at once. **Costly small win**: leave it, even if correct and tested.
- **Shaky solution** (fragile workaround, reliance on an internal detail of `pg` or TS, behaviour that works by chance): refused, even if it works today.
- Removing code or a dependency with no loss of function is a big win.

## Before writing code

1. Already in `src/`? Reuse it (`mapWithSeparator`, `SQLFragment.copy`, `conditionalParam`…).
2. Postgres already does it? Expose the SQL, do not reimplement it in JS.
3. Otherwise short home-made code, with no runtime dependency (`AGENTS.md` § Philosophy, point 4).

## Types

- One more conditional type is paid for at every compilation by every user: measure it (`npm run bench:types`).
- The simplest type that refuses the wrong cases; no feat of typing that catches nothing more.

## Tests

- Each observable behaviour: its compiled SQL (`text` + `values`) and its real execution.
- Each public type: a positive and a negative case (skill `type-tests`).
- Outside Pareto, covered in full: escaping and parameterisation (skill `sql-safety`).
- Nothing Postgres does not promise: a multi-row `RETURNING` is sorted before `toEqual`, a sequence value is read through `RETURNING` (`ROLLBACK` does not undo `nextval`).
- A compiled result is snapshotted raw, never through `JSON.stringify`, which erases `Date` against string and `undefined` against `null`.
- A check (a docs checker, `check:agents`, a guard) is first proved in the direction that passes silently: plant near misses of its marker (`<!---`, a plural, case, spacing, an info string), a duplicate, a comment.
  - A loose detector beside the strict parser fails on any line it sees and cannot read; a scanner is compared with the real parser (markdown-it's `fence` tokens) on every page.
  - Equality, not `[\s\S]*?` between expected lines, which accepts a dropped one.
  - Its rule sits in a module a self-check can import alone, not one that pulls in a data loader (#236).

## Adopting a rule on existing code

- A new rule applies to new or touched code; no sweep of all of `src/` (except for a bug or a vulnerability).
- Zapatos's original code keeps its style; we do not reformat it.

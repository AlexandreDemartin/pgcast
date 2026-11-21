---
name: plan-and-proofs
description: 'What a builder leaves on GitHub for the owner to read: the plan comment on the issue before code, and the PR body with its Proofs and Decided alone sections. USE FOR: posting a plan, writing or checking a PR description, the red test before a fix, the label decided-alone. DO NOT USE FOR: review comments (review-comments), the merge (merge-gate).'
---

# Plan and proofs

Each step leaves a trace the owner can read: the plan before the code, the proofs in the PR.

## The plan comment

Explore, then plan, then code, then commit. The plan follows the issue's **Risk** (skill `run-step` § Risk):

- `low`: none.
- `normal`: posted on the issue, then the builder goes on.
- `high`: posted on the issue, then the builder **stops** and reports its link; the orchestrator checks it against the issue's **What**, **Done when** and **Files**, then resumes the builder.

- Posted with `gh issue comment <n> --repo AlexandreDemartin/pgcast --body-file <file>`, in English, ≤ ~30 lines.
- Sections, as bullets: **Approach** · **Files** · **Tests first** (each test and what it proves) · **SQL before / after** (when the SQL changes) · **Risks** · **Decided-alone candidates**.

## The PR body

```markdown
Closes #n

## What
## Why
## Proofs
## Decided alone
```

- `Closes #n` on the first line; a layer of a stack starts with "Stacked on #m" (skill `pr-shape` § Stacking), then `Closes #n`.
- **What** and **Why** as bullets; unnamed patterns, never an extract from the corpus (skill `consumer-usage`).
- The body, like the plan comment, names Zapatos, not its author (skill `pr-shape` § PR title).
- It ends with the requested "Generated with Claude Code" line.

## Proofs

- **Each command run**, with the tail of its output in a code block: the issue's **Done when**, at least `lint`, `typecheck`, `test`, `test:types`, `build`. An empty output counts with its exit code (`tsc`), a step that exits 0 whatever is missing asserts on its output (`npm pack --dry-run --json`), and a check whose tests no count shows (`test/types-opt-in`, compiled by `tsc`) is broken once on purpose (#701, #712, #750).
- **A change of behaviour, a message or a claim**: the `git grep` of its old wording and of its siblings' (skill `code-style` § Claims), with what each hit became, as a **Docs swept** line (Epic #836's gap of 2026-11-21).
- **A bug**: the failing test is committed before the fix (skill `pr-shape` § Commits), and a move that makes it testable (a script's logic into a module) in a commit before it; the proof gives its name and its failing output at the test commit (SHA), where `npm test` and `test:types` both run (TS2379 under `exactOptionalPropertyTypes`, #703, #742).
  - Its expected value is written by hand: an empty inline snapshot records the current output. It also runs against the fix, or it may be red for the wrong reason (#96), and its data tell the frozen behaviour from its nearest alternative, not only from the rejected fix (#164).
  - Each new assertion is red on its own: in one `it`, the first old failure hides the rest, and a loop over rows stops at its first red row, so each row is shown red alone (#601). A red run counts by its failing test names: a parse error gives "no tests" (#558); a red test also passes `typecheck` (#572).
  - A review item whose expected fix only documents the head's behaviour is red against master's runtime (#558).
  - A test that freezes a route a `CHANGELOG.md` line names (`upsert()` `updateValues`, `lateral`) runs red against the base's runtime.
- **A guard or a test that passes on the base** proves something only through a mutant: break only the branch it guards, in a scratch copy (`git worktree add --detach <scratch>/mutant HEAD`, each `node_modules` entry but `.cache`, and `src/.env`, linked; never `git stash`), then record the mutant and its red. Each mutant changes one line, is checked to apply (`String.replace` changes the first occurrence: anchor it on its context; a harness built from the source between two markers survives an edit, and reports each mutant NOT APPLIED before its counts), and runs against the fix's final shape; an equivalent one is named in the PR (#621, #647, #648, #676, #727, #748). The mutant worktree deletes Vitest's `node_modules/vitest/dist/tsconfig.tmp.tsbuildinfo` before each run (an unrelated red follows it), and restores the source in a `finally`, by `git show HEAD:<path> > <path>` after a kill, as `SIGTERM` skips it (#727, #751). In a checkout that links the whole of `node_modules`, a mutant `test:types` run leaves its declarations in `node_modules/.cache/pgcast`: rerun `test:types` on the restored source before any other probe reads them (#520, #532, #653). Two guards in one branch or two overlapping accept rules get a test where both hold, which pins which wins (#37, #50), and two guards that cover the same cases a test only one catches, or the other's mutants survive (dropping `NoInfer` went unseen, #701; a missing `RELEASE`, until an outer level failed right after an inner one, #727); a limit gets a passing case at exactly it, measured with the module's own counter, beside the failing one past it, or `>` → `>=` survives (#742); flags read together get one test per flag alone, so a mutant that ORs them fails (#36); a guard shared by several routes gets a mutant per route, a value read at several sites one per site, a default set for one caller a test through each, a file written under a condition a case where it is false, and a guard moved ahead of a costly step a spy on that step (#253, #546, #557, #558, #560). An export said to keep its result is called by a test (#49); an assertion that cannot fail (`isDatabaseError(err)` with no names, a counter on a getter that replaces itself) freezes nothing (#268, #271).
- **`core.ts`**: the compiled SQL before / after (skill `sql-safety`).
- **Compat at stake**: the 6.6.1 replay, what 6.6.1 did and what the branch does (skill `backward-compat`).
- **Types**: the `bench:types` figure when a type changes (skill `type-tests`).
- **Docs site**: screenshots go on a private artifact, linked from **Proofs** (`gh` cannot attach images).

## Decided alone

- One bullet per choice made where nothing is written (skill `decision-philosophy`), with its why in one line.
- None: "None.". Not empty: the PR carries the label `decided-alone` (`gh pr create … --label decided-alone`).

## Checklist

- [ ] Plan posted at `normal` and `high`; stopped after posting at `high`
- [ ] `Closes #n` first; What · Why · Proofs · Decided alone
- [ ] Each command with the tail of its output; the red test before a fix
- [ ] Label `decided-alone` if that section is not empty

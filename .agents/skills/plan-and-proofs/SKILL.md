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
- A reference to another repository's issue that must not post a backlink there ("not posted") goes in backticks: `owner/repo#n` written bare adds one (#943).
- It ends with the requested "Generated with Claude Code" line.

## Proofs

- **Each command run**, with the tail of its output in a code block: the issue's **Done when**, at least `lint`, `typecheck`, `test`, `test:types`, `build`. An empty output counts with its exit code (`tsc`), a step that exits 0 whatever is missing asserts on its output (`npm pack --dry-run --json`), and a check whose tests no count shows (`test/types-opt-in`, compiled by `tsc`) is broken once on purpose (#701, #712, #750).
- **A change of behaviour, a message, a claim or a public type's printed form**: the `git grep` of its old wording and of its siblings' (skill `code-style` § Claims), decision notes included (note 017 kept a hover #924 changed, `ParentColumn<Column`), with what each hit became, as a **Docs swept** line (Epic #836's gap of 2026-11-21). A decision note that withdraws a promise the docs made greps the site, EN and FR, for that promise in the same PR (`after 8\.0|beyond 8\.0|permanent|and later`: #953 left about 12 site lines saying the opposite); a new option or export greps a sibling's name for every page that lists them (`grep -l topLevelSelectAsRows website website/fr README.md`: `shortcutsUseJson` missed four pages and their twins) (#957). The sweep covers `.claude/agents/`, `AGENTS.md` and `docs/WORKFLOW.md` beside `.agents/`, for a removed key or path and a changed rule: a skill kept a removed key as its rule's example (#984), the reviewer's compat question lives in `.claude/agents` (#979), a skill named a deleted test project (#985). Its hits are counted per page, EN against FR, before the English is committed: a one-shot grep for a removed SQL form missed four prose lines; after a change of SQL type, the grep takes the old type's name too, as a page still called a nested result `jsonb` (#988).
- **A bug**: the failing test is committed before the fix (skill `pr-shape` § Commits), with the move that makes it testable before it; the proof gives its name and its failing output at the test commit (SHA). Its expected value is written by hand, and each new assertion is red on its own: [reference.md](reference.md) § Red test of a bug.
- **A guard or a test that passes on the base** proves something only through a mutant: break only the branch it guards, in a scratch copy (`git worktree add --detach <scratch>/mutant HEAD`; never `git stash`), then record the mutant and its red; each mutant changes one line and is checked to apply; an equivalent one is named in the PR. Mechanics and which mutants a guard needs: [reference.md](reference.md) § Mutants.
- **`core.ts`**: the compiled SQL before / after (skill `sql-safety`).
- **Compat at stake**: the 6.6.1 replay, what 6.6.1 did and what the branch does (skill `backward-compat`).
- **Types**: the `bench:types` figure when a type changes (skill `type-tests`).
- **Docs site**: screenshots go on a private artifact, linked from **Proofs** (`gh` cannot attach images).

## Decided alone

- One bullet per choice made where nothing is written (skill `decision-philosophy`), with its why in one line.
- None: "None.". Not empty: the PR carries the label `decided-alone` (`gh pr create … --label decided-alone`).

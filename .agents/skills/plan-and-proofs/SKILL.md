---
name: plan-and-proofs
description: 'What the owner reads on GitHub: two layers (a one-minute read, the detail folded), the plan comment, the PR body, its Proof, Evidence and Decided alone. USE FOR: posting a plan, writing or checking a PR body, a word budget, the red test before a fix, the label decided-alone. DO NOT USE FOR: review comments (review-comments), the merge (merge-gate).'
---

# Plan and proofs

Each step leaves a trace the owner can read in a minute: the plan before the code, the proof in the PR, the detail folded for the agents and the audit.

## Two layers

- An issue, a plan comment, a PR body and a round comment open with the owner's one-minute read: at most 200 words above the first line that opens a `<details>`. The detail the agents and the audit need is folded below it.
- Above the fold, plain words: never a file list, a restated diff or command output; an internal code (a decision number, a round's item, `019 § 3`) only with its meaning.
- Checked by `node scripts/check-body.mjs <file>` before posting; CI checks each PR body (`.github/workflows/pr-body.yml`, skill `ci-gate`).
- What the script leaves out, from its code: HTML comments, images (`![…](…)`, `<img>`), a line that starts with `Closes #n` or `Part of #n`, and the "Generated with" line. A code span counts as one word, a link as its text, a token with no letter or digit (punctuation, a table's separator row) as none. A `<details>` opens the fold only at the start of its line.
- The issue body: skill `run-step` § Issue body; the round comment: skill `review-comments` § Round comment.

## The plan comment

Explore, then plan, then code, then commit. The plan follows the issue's **Risk** (skill `run-step` § Risk):

- `low`: none.
- `normal`: posted on the issue, then the builder goes on.
- `high`: posted on the issue, then the builder **stops** and reports its link; the orchestrator checks it against the issue's **What**, **Done when** and **Files**, then resumes the builder.

- Posted with `gh issue comment <n> --repo AlexandreDemartin/pgcast --body-file <file>`, in English.
- Above the fold: the **Approach** and **To check**, what the orchestrator should check.
- Folded, as bullets: **Files** · **Tests first** (each test and what it proves) · **SQL before / after** (when the SQL changes) · **Risks** · **Decided-alone candidates** · the probe outputs.

## The PR body

```markdown
Closes #n

## Change
## Look at
## Decided alone
## Proof

<details><summary>Evidence</summary> … </details>

<details><summary>Docs swept</summary> … </details>
```

- From `.github/pull_request_template.md`. `Closes #n` on the first line; a layer of a stack starts with "Stacked on #m" (skill `pr-shape` § Stacking), then `Closes #n`.
- **Change**: one or two sentences on what changes, for whom, and why.
- **Look at**: one to three bullets on where the risk is, the doubts, and what the diff does not show; right after **Change**, as it carries the most value. Dropped when there is nothing to say.
- **Decided alone** (§ Decided alone) and **Proof** (§ Proof); folded below: **Evidence** (§ Evidence) and **Docs swept** (§ Docs swept).
- Unnamed patterns, never an extract from the corpus (skill `consumer-usage`).
- The body, like the plan comment, names Zapatos, not its author (skill `pr-shape` § PR title).
- A reference to another repository's issue that must not post a backlink there ("not posted") goes in backticks: `owner/repo#n` written bare adds one (#943).
- It ends with the requested "Generated with Claude Code" line.
- **Reread after every fix round**: the builder that fixed checks the body against the final diff and rewrites what no longer matches; #1000's **Decided alone** claimed a leak that no run showed.

## Proof

Above the fold, one line each:

- Each **Done when** of the issue, shown met.
- The checks run: the issue's **Done when**, at least `lint`, `typecheck`, `test`, `test:types`, `build`; their tails go in **Evidence**.
- A bug: the test that was red before the fix, with its test commit's SHA.
- A docs-site change: a `Before | After` table of captures, uploaded by `gh pr edit <pr> --body-file <file> --attach './x.png#alt'` (gh ≥ 2.105), which points each `![alt](./x.png)` of the body at its uploaded copy; paths in the file are relative to its folder.

## Evidence

Folded, below `<details><summary>Evidence</summary>`:

- **Each command run**, with the tail of its output in a code block; an empty output counts with its exit code (`tsc`), a step that exits 0 whatever is missing asserts on its output (`npm pack --dry-run --json`), and a check whose tests no count shows (`test/types-opt-in`, compiled by `tsc`) is broken once on purpose (#701, #712, #750).
- **A bug**: the failing test is committed before the fix (skill `pr-shape` § Commits), with the move that makes it testable before it; the proof gives its name and its failing output at the test commit (SHA). Its expected value is written by hand, and each new assertion is red on its own: [reference.md](reference.md) § Red test of a bug.
- **A guard or a test that passes on the base** proves something only through a mutant: break only the branch it guards, in a scratch copy (`git worktree add --detach <scratch>/mutant HEAD`; never `git stash`), then record the mutant and its red; each mutant changes one line and is checked to apply; an equivalent one is named in the PR. Mechanics and which mutants a guard needs: [reference.md](reference.md) § Mutants.
- **`core.ts`**: the compiled SQL before / after (skill `sql-safety`).
- **Compat at stake**: the 6.6.1 replay, what 6.6.1 did and what the branch does (skill `backward-compat`).
- **Types**: the `bench:types` figure when a type changes (skill `type-tests`).

## Docs swept

Folded, below its own `<details>`:

- **A change of behaviour, a message, a claim or a public type's printed form**: the `git grep` of its old wording and of its siblings' (skill `code-style` § Claims), decision notes included (note 017 kept a hover #924 changed, `ParentColumn<Column`), with what each hit became, as a **Docs swept** line (Epic #836's gap of 2026-11-21). A decision note that withdraws a promise the docs made greps the site, EN and FR, for that promise in the same PR (`after 8\.0|beyond 8\.0|permanent|and later`: #953 left about 12 site lines saying the opposite); a new option or export greps a sibling's name for every page that lists them (`grep -l topLevelSelectAsRows website website/fr README.md`: `shortcutsUseJson` missed four pages and their twins) (#957). The sweep covers `.claude/agents/`, `AGENTS.md` and `docs/WORKFLOW.md` beside `.agents/`, for a removed key or path and a changed rule: a skill kept a removed key as its rule's example (#984), the reviewer's compat question lives in `.claude/agents` (#979), a skill named a deleted test project (#985). Its hits are counted per page, EN against FR, before the English is committed: a one-shot grep for a removed SQL form missed four prose lines; after a change of SQL type, the grep takes the old type's name too, as a page still called a nested result `jsonb` (#988).

## Decided alone

- One bullet per choice made where nothing is written (skill `decision-philosophy`), with its why in one line.
- None: "None.". Not empty: the PR carries the label `decided-alone` (`gh pr create … --label decided-alone`).

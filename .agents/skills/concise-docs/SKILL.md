---
name: concise-docs
description: 'All docs, complete but concise: one piece of information in one place, structure before prose, short sentences. USE FOR: writing or condensing Markdown (AGENTS, README, CHANGELOG, skill, decision note), a PR description, a JSDoc. DO NOT USE FOR: the content of a decision note (decision-philosophy).'
---

# Concise documentation

Complete in substance, concise in form.

## One piece of information, one place

| Information | Source |
|---|---|
| Philosophy, stop points, commands | `AGENTS.md` |
| A code rule | a single skill |
| A decision and its why | `docs/decisions/NNN-*.md` |
| Order of changes and their reason | the Epics, `type: epic` issues (skill `run-step`) |
| A step, its state | its sub-issue, closed by its PR |
| A change visible to the user | `CHANGELOG.md` |
| Public usage | `README.md` |

- Elsewhere, refer: a link, or "skill `<name>`". A one-line summary plus the link is allowed; copying, never.

## Rules

- **Structure before prose**: headings, bullets, tables; a paragraph of 3 sentences at most.
- **One bullet, one idea**, about 20 words.
- **The essentials first**, the why in one line if it is not obvious.
- **Exact terms** in backticks: paths, functions, copyable commands.
- **One example per rule**, the shortest, a real extract from the repository.
- **Complete**: condensing never removes a rule, an exception or a pitfall.
- Language: everything written to the repository or to GitHub is in English, British spelling; chat with the maintainer may stay in French.

## To cut

- Introductions, transitions, conclusions; "it is important to note that".
- History (it is in git); exhaustive lists that go stale.

## Target lengths

| Document | Target |
|---|---|
| Skill | ≤ 150 lines |
| JSDoc | 1 to 3 lines: the contract, and the SQL produced for a helper |
| PR description | `Closes #n`, then **What** · **Why** · **Verify**, as bullets |
| Decision note | context, options in a table, proposed choice, question to the user |

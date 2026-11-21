# Orchestrating a step: reference

The cases of skill `run-step` that serve a minority of steps; [SKILL.md](SKILL.md) names each section with when to read it.

## Models

| Role | Model | Effort |
|---|---|---|
| `builder`, `low` or `normal` step | `sonnet` | `medium` |
| `builder`, `high` step (plan and build), round of fixes | the session's | `high` |
| `branch-reviewer`, review and `verify` | the session's | `high` |
| `chores`, French proofreader, npm and site audits | `sonnet` | `medium` |
| Orchestrator | the session's | the session's |

Each change of this table is a lever of #812, with its keep-or-revert test and its measurements.

## Issue order

- A task under its feature: `gh api repos/AlexandreDemartin/pgcast/issues/<feature>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the task's `id`, not its number (`gh api repos/AlexandreDemartin/pgcast/issues/<n> -q .id`).
- A new idea at its place in the order: `PATCH …/issues/<epic>/sub_issues/priority`, with `sub_issue_id` and `after_id`.

## Rounds

- A third round finding a deeper hole in one part cuts it to a Deferred section, its blockers checked against what stays (#746); a design on several conditional types writes its hunt grid before the first review (#751).
- `{ col: self }` never passes through `conditions.ts`, so #106 was `high` from the start.

## Method PRs

- **A method PR's proof** is scripted from two maps, a learning's line to the rule that took it and to a key term of that rule: a line left out or given twice shows at once, where by hand two were missed (#846). Each kept row's term is found by `git grep -F` at the head and absent on the base, and the script is rerun after each fix round: a reworded rule loses its term (4 of 221 in #846). The verdicts are a table, one row per line, posted as a comment on the PR.
- **A rule merged from several learnings** is reread against the code it describes: about a catalog relation (parent and child, partition, foreign table), the query that walks it (`pg_inherits` in `tools/typegen/src/origins.ts`), as a merge can move the condition to the wrong side (#846).

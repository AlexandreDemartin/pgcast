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

## Method PRs

- **A method PR's proof** is scripted from two maps, a learning's line to the rule that took it and to a key term of that rule: a line left out or given twice shows at once, where by hand two were missed (#846). Each kept row's term is found by `git grep -F` at the head and absent on the base, and the script is rerun after each fix round: a reworded rule loses its term (4 of 221 in #846). The verdicts are a table, one row per line, posted as a comment on the PR.
- **A rule merged from several learnings** is reread against the code it describes: about a catalog relation (parent and child, partition, foreign table), the query that walks it (`pg_inherits` in `tools/typegen/src/origins.ts`), as a merge can move the condition to the wrong side (#846).

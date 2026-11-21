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

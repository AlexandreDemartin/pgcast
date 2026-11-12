# AI tooling

Each element exists once, where the tools read it natively. The method comes from an application project, cut down to what a library needs.

| Element | Location | Read by |
|---|---|---|
| Project instructions | `AGENTS.md` | Cursor, Codex, Copilot; Claude Code via `CLAUDE.md` (link) |
| Skills | `.agents/skills/` | Cursor, Codex, Copilot; Claude Code via `.claude/skills` (link) |
| Agents (subagents) | `.claude/agents/*.md` | Claude Code, Cursor, Copilot |
| Guard | `.claude/hooks/guard.mjs` | Claude Code (`.claude/settings.json`) |

## Skill map

### Method

| Skill | Subject |
|---|---|
| `run-step` | Orchestrate a step, sub-issue of a GitHub Epic (`gh issue view`): builder, review by **Review**, triage, `verify`, merge that closes the issue, end of chapter |
| `ci-gate` | Draft PR while iterating, `gh pr ready`, docs only, **CI passed** check, exceptional `[skip ci]`, merge |
| `decision-philosophy` | Decide alone what nothing writes down, or wait for the user |
| `simple-big-wins` | Measured gain weighed against added complexity; nothing shaky |
| `concise-docs` | Complete but concise docs, one piece of information in one place |

### Library

| Skill | Subject |
|---|---|
| `zero-abstraction` | Design a helper or an option: visible and unique SQL, derived from Postgres, minimal surface |
| `backward-compat` | Backward compatibility with Zapatos 6.6.1: public API, `zapatos/*`, what breaks |
| `sql-safety` | `core.ts` sensitive zone: escaping, parameters, identifiers, injection tests |
| `type-tests` | Positive and negative type tests, compile cost (`bench:types`) |
| `codegen-output` | Codegen output: snapshots, opt-in, canary, justified diff |
| `consumer-usage` | Validate a need and an API against the corpus of real usage, without letting anything out |
| `zapatos-spirit` | George MacKerron's spirit: split, name, code and document like him, only better |

## Writing a skill

```text
.agents/skills/<name-in-kebab-case>/SKILL.md
```

```markdown
---
name: name-in-kebab-case
description: 'What the skill does. USE FOR: … DO NOT USE FOR: …'
---
```

- **One subject per skill**, read in full when it triggers; ≤ 150 lines.
- **Only what the agent does not know**: pgcast's own choices, never a course on Postgres or TypeScript.
- **One rule, one skill**: elsewhere, refer to it by name ("skill `sql-safety`").
- **One default path**, the exception named; the why in one line.
- **Real examples** from the repository, file named in a comment.
- `description` ≤ 350 characters (`npm run check:agents`): it alone triggers the skill.

## Agents

| Agent | Mission |
|---|---|
| `builder` | Builds a step (an issue) up to the ready PR that closes it, or fixes a list of defects, started afresh |
| `branch-reviewer` | Senior read-only review (user skill `branch-review` + pgcast lenses); `verify` mode |
| `chores` | Mechanical work on sonnet: merge from below, CI rerun, regeneration; stops at the first choice |

Ritual of a step: skill `run-step`.

## Method checks

- `guard.mjs` refuses before execution what has no exception: `push --force`, `rebase`, `--amend`, npm publication or release, writes to generated files (`db.mjs`, `generate.mjs`, `dist/`) or to a `.env`.
- `npm run check:agents` (`scripts/check-agents.mjs`, in CI): frontmatter of skills and agents, description length, cited skills that exist, the hook's tests.

## Self-improvement

- **Invariants**, never questioned alone: the 5 principles of `AGENTS.md` § Philosophy, 6.6.1 backward compatibility, the accepted decisions of `docs/decisions/`.
- **Criterion**: a review remark enters a skill if it prevents a real bug that recurs or has cost dearly, and is general and verifiable. A preference of form does not.
- **Preference**: an automatic check (ESLint, test, `check:agents`); otherwise an existing rule amended; last, a skill line.
- **Batched**: the method is frozen during a chapter; agents return their "learnings" apart, the orchestrator writes them in [docs/LEARNINGS.md](../docs/LEARNINGS.md), judged at the end-of-chapter method PR (skill `run-step`).

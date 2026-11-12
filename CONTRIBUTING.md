# Contributing

Thank you for helping. pgcast is small on purpose: this page says what it accepts and how a change gets in.

## What pgcast accepts

- Types derived from Postgres, never written by hand; SQL you can read, with no ORM, no hidden state and nothing new required at run time. The five principles: [AGENTS.md § Philosophy](AGENTS.md#philosophy-non-negotiable).
- No breaking change for a project on Zapatos 6.6.1: a fix that changes a valid result comes as an opt-in ([decision 003](docs/decisions/003-fixes-and-deprecation.md)).
- An idea that needs a design choice starts as an issue, then a decision note in [docs/decisions/](docs/decisions/), before any code.

## How a change flows

- One issue, one branch, one draft pull request that closes it, small enough to read in one go.
- The steps, from issue to merge: [docs/WORKFLOW.md](docs/WORKFLOW.md). The rules and stop points: [AGENTS.md](AGENTS.md).
- Tests come first, or with the code: the compiled SQL, a real run against Postgres, and the types, positive and negative.
- `CHANGELOG.md` and the docs change with the code.

## Local setup

- Node `^20.19` or `>=22.12`, npm 10 or later.
- A local Postgres 14 or later (no Docker needed): set `TEST_DATABASE_URL` in the environment or in `src/.env` (ignored by git). The role needs `CREATEDB`, and superuser for the fixture's `file_fdw` table ([AGENTS.md § Local environment](AGENTS.md#local-environment)).
- Then:

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run test:types && npm run build
```

- `npm run bench:types` when a type changes; `npm run check:agents` when `.agents/` or `.claude/` changes. All commands: [AGENTS.md § Commands](AGENTS.md#commands).

## Commits and pull requests

- As in Zapatos: one line, plain English, imperative, British spelling, no prefix: "Add conditions with array operators".
- A pull request title ends with the issue it closes: "Fix not() so it parenthesises its condition (closes #30)".
- Size, splitting and naming: skill [`pr-shape`](.agents/skills/pr-shape/SKILL.md).

## Security

A vulnerability is never a public issue: see [SECURITY.md](SECURITY.md).

## Licence and attribution

- pgcast is MIT ([LICENCE](LICENCE)); your contribution is too.
- Keep the existing copyright headers (George MacKerron). A new file may carry its own copyright line.

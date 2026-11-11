# Changelog

All notable changes to pgcast are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

pgcast is forked from [Zapatos 6.6.1](https://github.com/jawj/zapatos/tree/v6.6.1); upstream history lives in that repository.

## [Unreleased]

### Changed
- Package renamed to `pgcast`. The CLI is available as both `pgcast` and `zapatos`. Module names (`zapatos/db`, `zapatos/schema`, `zapatos/custom`) are unchanged.
- Toolchain: TypeScript 5.9, ESLint 9 (native flat config), typescript-eslint 8, `@stylistic/eslint-plugin`. The build output (`dist/`, `db.mjs`, `generate.mjs`) is byte-identical to 6.6.1.

### Removed
- The noisy `postinstall` message.
- The `postversion` script that pushed and published to npm automatically.

### Added
- `prepack` builds before any `npm pack` / `npm publish`.
- Vitest harness (`test`, `test:watch`, `test:types`) and a `typecheck` script.
- `AGENTS.md` (+ `CLAUDE.md` symlink), roadmap and design decision notes under `docs/`.
- CI matrix: Node 20, 22 and latest LTS; draft PRs run no job.
- Agent workflow (adapted from Project B): `.agents/skills/`, `.claude/agents/` (`builder`, `branch-reviewer`, `chores`), `.claude/hooks/guard.mjs`, `npm run check:agents`, `docs/SUIVI.md`, `docs/APPRENTISSAGES.md`.
- Integration test harness: reference fixture `test/fixtures/schema.sql` (Postgres 14+), a template database built once per run, a fresh database per test file and a `ROLLBACK` per test (`useTestDatabase()`, `test/helpers/db.ts`). Needs `TEST_DATABASE_URL` (`src/.env` or the environment); tests only create and drop `pgcast_test_*` databases.
- CI matrix: Postgres 14, 16 and 18 service containers × Node 20, 22 and latest LTS.

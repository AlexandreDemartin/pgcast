# History of the steps

The plan lives in the GitHub issues: one Epic per chapter, one sub-issue per step, closed by its PR (skill `run-step`). Epics: [#18](https://github.com/AlexandreDemartin/pgcast/issues/18) fixes, [#19](https://github.com/AlexandreDemartin/pgcast/issues/19) schema and conditions, [#20](https://github.com/AlexandreDemartin/pgcast/issues/20) runtime, [#21](https://github.com/AlexandreDemartin/pgcast/issues/21) inference of raw SQL. This file keeps only the earlier history.

## 0. Fork

- 0.1 `chore/fork-setup` — renaming, tooling, CI, notes 001 and 002: PR #1
- 0.2 `chore/agent-workflow` — the agents' working method: PR #2

## 1. Characterisation

- 1.1 `test/harness` — test database, fixture, Postgres CI: PR #3
- 1.2 `test/codegen-snapshots` — codegen output pinned: PR #4
- 1.3 `test/compiled-sql` — the SQL of each shortcut and condition: PR #5
- 1.4 `test/types` — public types on a real schema: PR #7
- 1.5 `test/injection` — hostile inputs: PR #8
- 1.6 `test/bench-types` — compile cost: PR #10
- 1.7 `docs/characterization-report` — report of the bugs and surprises: PR #11

## 2. Fixes

- 2.1 Check lock, truncate and isolation level keywords at run time (R5): PR #14
- 2.2 Accept only a function name as the aggregate of select() (R6): PR #17

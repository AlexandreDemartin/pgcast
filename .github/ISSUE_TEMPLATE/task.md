---
name: Step
about: One step of an Epic, built by one PR (skill run-step § Issue body)
title: ''
labels: 'type: task'
---

## What

<!-- The expected behaviour; the SQL before / after when it matters. -->

## Why

<!-- In one or two bullets. -->

## Done when

- [ ] <!-- an acceptance criterion the PR proves -->
- [ ] `npm run lint && npm run typecheck && npm test && npm run test:types && npm run build` pass <!-- plus `bench:types`, `check:agents`… when needed -->

## Files

<!-- The targeted paths: `src/db/conditions.ts`, `test/unit/conditions.test.ts`. -->

## Notes

- **Risk**: `low` | `normal` | `high` <!-- the review and the merge gate (skill run-step § Risk); the lens (sql, types, codegen, compat) and the blockers -->
- **Class**: <!-- fix or opt-in (decision 003) -->
- **Read**: <!-- the skills, as: skill `sql-safety` -->
- **Frozen by**: <!-- the tests that pin the current behaviour -->

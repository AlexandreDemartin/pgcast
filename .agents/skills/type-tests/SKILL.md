---
name: type-tests
description: 'Testing a public type of pgcast: positive and negative cases, expectTypeOf, @ts-expect-error, the fixture’s generated schema, compile cost (bench:types, +20 % threshold). USE FOR: writing or changing a type, a generic, a signature, a generated type. DO NOT USE FOR: runtime tests of the SQL (zero-abstraction).'
---

# Type tests

A type that compiles is not necessarily correct: it may be `any`, too wide, or accept a wrong call.

## Rules

- **Files**: `test/**/*.test-d.ts`, run by `npm run test:types` (Vitest `--typecheck`).
- **Positive**: `expectTypeOf(x).toEqualTypeOf<…>()`, never `toMatchTypeOf` when equality is possible: it lets a too-wide type through.
- **Negative**: one wrong call per line under `// @ts-expect-error <reason>`; the reason says what must be refused.
- **No `any` slipping through**: `expectTypeOf(x).not.toBeAny()` on each tested shortcut's return.
- **Real schema**: types are tested against the schema generated from the fixture (`test/fixtures/schema.sql`), not against the dummy schema of `src/typings`.
- **Edge cases**: nullable column, with a default, generated, identity; `columns`, `extras`, nested `lateral`; a view's table (no `Insertable`).
- `exactOptionalPropertyTypes` is on: a test covers `{ col: undefined }` when the type is concerned.

## Compile cost

- `npm run bench:types` compiles an example project and compares `Instantiations` (deterministic) with the stored baseline.
- Above **+20 %**: a stop point (`AGENTS.md`), with the figure and its cause.
- A justified rise updates the baseline in the same PR, figure in the description.

## Checklist

- [ ] At least one positive and one negative per changed type
- [ ] `not.toBeAny()` on the returns
- [ ] `bench:types` under the threshold, figure in the PR

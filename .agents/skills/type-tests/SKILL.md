---
name: type-tests
description: 'Testing a public type of pgcast: positive and negative cases, expectTypeOf, @ts-expect-error, the fixture’s generated schema, compile cost (bench:types, +20 % threshold). USE FOR: writing or changing a type, a generic, a signature, a generated type. DO NOT USE FOR: runtime tests of the SQL (zero-abstraction).'
---

# Type tests

A type that compiles is not necessarily correct: it may be `any`, too wide, or accept a wrong call.

## Rules

- **Files**: `test/**/*.test-d.ts`, run by `npm run test:types` (Vitest `--typecheck`).
- **Positive**: `expectTypeOf(x).toEqualTypeOf<…>()`, never `toMatchTypeOf` when equality is possible: it lets a too-wide type through.
- **Negative**: one wrong call per line under `// @ts-expect-error <reason>`; the reason says what must be refused. A call or an `expectTypeOf`, never an unused `type X = …`: with `noUnusedLocals`, its own error fills the expectation. Make each negative valid once to see "Unused '@ts-expect-error'".
- **The call itself**: the shortcut's call, its value built apart, not through a typed helper (`constraint<'users'>(…)` tests the helper) nor an annotated variable (inference differs).
- **Structural wrappers**: `Parameter<T>` is `{ value: T }`, so a wrapper class passes wherever its shape fits: probe each against each slot typed `Parameter<T>`, on an int and an enum column, not only text. A mapped `Wrapper<U[K]>` wraps the whole union (`null`, `DefaultType`, `SQLFragment`): pull `T` out first (`ParameterValue<U[K]>`).
- **No `any` slipping through**: `expectTypeOf(x).not.toBeAny()` on each tested shortcut's return.
- **Real schema**: types are tested against the schema generated from the fixture (`test/fixtures/schema.sql`), not against the dummy schema of `src/typings`.
- **Edge cases**: nullable column, with a default, generated, identity; `columns`, `extras`, nested `lateral`; a view's table (no `Insertable`).
- `exactOptionalPropertyTypes` is on: a test covers `{ col: undefined }` when the type is concerned.

## A claim about a type

In a test, the docs or the CHANGELOG, it is probed, not read from the declarations:

- on the result type, not only the parameter: a `readonly` `returning` is accepted and gives `never`;
- with `strict: false`: `undefined extends X` is then always true, so narrowing by `columns`, `returning` or `reportAction` is lost, and a `lateral` key gives TS2339;
- on a value built at run time and on wider types (`Record<string, string>`, `object`): excess keys are checked only in a fresh literal, and a built-in that shares a member with a column (`name`, `size`) passes the weak-type check;
- on each compiler it names, by a real install: 5.9 and 7.0 infer literals differently (the type tests run on 5.9 only), TS 7 prints only the last overload's error, the declarations need 5.7 for a full check; the error code (TS2322 or TS2345) depends on the signature's form;
- in a scratch probe outside a dot folder (`tsc` skips them), with the `paths` of `website/tsconfig.json` (`@types/*` before `node_modules/*`), on the docs schema for a `sql` interpolation: the fixture's `products` table lets `SQLForTable` take any string.

## Compile cost

- `npm run bench:types` compiles an example project and compares `Instantiations` (deterministic) with the stored baseline.
- Above **+20 %**: a stop point (`AGENTS.md`), with the figure and its cause.
- A justified rise updates the baseline in the same PR, figure in the description.
- The baseline drifts on master with no type change (#208: +0.4 %): refresh it with `-- --update` in a chore PR, so later PRs measure against master.

## Checklist

- [ ] At least one positive and one negative per changed type
- [ ] `not.toBeAny()` on the returns
- [ ] `bench:types` under the threshold, figure in the PR

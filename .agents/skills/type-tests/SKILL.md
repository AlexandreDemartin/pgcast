---
name: type-tests
description: 'Testing a public type of pgcast: positive and negative cases, expectTypeOf, @ts-expect-error, the fixture’s generated schema, compile cost (bench:types, +20 % threshold). USE FOR: writing or changing a type, a generic, a signature, a generated type. DO NOT USE FOR: runtime tests of the SQL (zero-abstraction).'
---

# Type tests

A type that compiles is not necessarily correct: it may be `any`, too wide, or accept a wrong call.

## Rules

- **Files**: `test/**/*.test-d.ts`, run by `npm run test:types` (Vitest `--typecheck`). The same command compiles `test/types-opt-in/legacy` separately for the literal `false` aggregate declaration.
- **Positive**: `expectTypeOf(x).toEqualTypeOf<…>()`, never `toMatchTypeOf` when equality is possible: it lets a too-wide type through.
- **Negative**: one wrong call per line under `// @ts-expect-error <reason>`; the reason says what must be refused. A call or an `expectTypeOf`, never an unused `type X = …`: with `noUnusedLocals`, its own error fills the expectation. Make each negative valid once to see "Unused '@ts-expect-error'", and compile a new one against master's types: one that holds there too (a `T` collapsed to `never`) freezes nothing, so an indexed access goes where a value goes (`null as unknown as T['k']`, #41). An unrelated error fills it too: a `1n` literal under the ES2019 target (TS2737: write `null as unknown as bigint`). A sweep of negatives diffs the whole `tsc` output, every `(line, code)` pair and its continuation lines, under each `strict` and `exactOptionalPropertyTypes` setting (TS2375 replaces TS2322), and uses the function as a value too (`.map(fn)`) (#516, #520, #579, #615).
- **The call itself**: the shortcut's call, its value built apart, not through a typed helper (`constraint<'users'>(…)` tests the helper) nor an annotated variable (inference differs).
- **Structural wrappers**: `Parameter<T>` is `{ value: T }`, so a wrapper class passes wherever its shape fits: probe each against each slot typed `Parameter<T>`, on an int and an enum column, not only text. A mapped `Wrapper<U[K]>` wraps the whole union (`null`, `DefaultType`, `SQLFragment`): pull `T` out first (`ParameterValue<U[K]>`). A class with only optional members (`ParentColumn`) is a weak type that `{}` and `param('id')` pass, and a refusal by its shape refuses plain JSON objects (`{ value: x }`); a type a value must satisfy (`toPostgres()`) gets a negative per required member (#522, #569).
- **No `any` slipping through**: `expectTypeOf(x).not.toBeAny()` on each tested shortcut's return, beside an equality, never instead of one (#420).
- **Real schema**: types are tested against the schema generated from the fixture (`test/fixtures/schema.sql`), not against the dummy schema of `src/typings`.
- **Edge cases**: nullable column, with a default, generated, identity; a literal on an enum column in context, which rests on inference through the return type (#181), and a type parameter found only there, inferred from every table's column of that name (`NoInfer` in `utils.ts` stops it, #569, #573); a `param()` of a string literal on an enum and a `TimeString` column, generic contexts included (`param(1)` tests no widening); `not()`, `and()`, `or()` of a Whereable wherever a condition goes; `columns`, `extras`, nested `lateral`; a view's table (no `Insertable`); over every table, a refused line beside the taken ones (#539, #655).
- **Generic forwarders**: a guard or a check on a shortcut's parameter is probed through `<T extends Table>(w: WhereableForTable<T>)`, with a spread plus a key (`{ ...w, id }`), `Object.assign` and a key of one table only, on 4.1.6, 5.9 and 7. `X<T> & G` loses them where a lookup by table, `{ [K in Table]: X<K> & G }[T]`, keeps them (a target with no table, `and()`, cannot take it); `T & Check<T>` stays deferred and refuses them all. An unknown key written in place still gives TS2353, on one table and on a union of tables; beside a spread (`{ ...w, nope: 1 }`) it compiles, so a test names which. `keyof` of each public type it touches is frozen, each member of an exported options type included (`keyof Parameters<…>`) (#532, #570, #676, #682).
- **Programs of their own**: an inference that depends on the order `tsc` checks types in (TS 5.9's `param()`) is frozen in `test/types-order`, with a fixed `files` order; a narrowed `zapatos/custom` placeholder, by excluding the generated one in a tsconfig of its own (#539, #541, #572).
- `exactOptionalPropertyTypes` is on: a test covers `{ col: undefined }` when the type is concerned.

## A claim about a type

In a test, the docs or the CHANGELOG, it is probed, not read from the declarations:

- on the result type, not only the parameter: a `readonly` `returning` is accepted and gives `never`;
- with `strict: false`: `undefined extends X` is then always true, so narrowing by `columns`, `returning` or `reportAction` is lost, and a `lateral` key gives TS2339;
- on a value built at run time and on wider types (`Record<string, string>`, `object`): excess keys are checked only in a fresh literal, and a built-in that shares a member with a column (`name`, `size`) passes the weak-type check;
- on each compiler it names, by a real install: 4.1.6 (`check:floor`'s copy in `node_modules/.cache`; the docs schema, `website/zapatos`, copied into a scratch consumer), 5.9 and 7.0. They infer literals differently (the type tests run on 5.9 only); TS 7 prints only the last overload's error, 4.1 and 5.9 one per overload (TS2769), so the docs' `// @errors:` lines are read before an overload is added; 4.1 parses no instantiation expression (`db.sql<I>`): its TS1005 hides every semantic error of the whole 4.1 program, so an instantiation expression never shares a 4.1 program with a probe; the declarations need 5.7 for a full check; the error code (TS2322 or TS2345) depends on the signature's form (#520, #581, #667, #668, #686);
- under `skipLibCheck`, where a name a `.d.ts` uses and the compiler lacks (`Awaited` below 4.5, a removed type) becomes `any` silently: a removal or a "does not compile" claim needs a downstream negative (TS2578 once it goes) or `not.toBeAny()` on a result type; Vitest reports nothing on an import line outside a `test()` (#522, #581, #606);
- crossed with an argument typed `any` and `unknown`: a narrowing that resolves to `never` refuses the untyped callers 6.6.1 took (`JSON.parse`, `req.body`), and taking `any` brings `null` back with `strictNullChecks` off (#516);
- on the `any` placeholders of `zapatos/custom` (`extra.type_zoo`) and an array of one: they are the typed callers a fix changes, and `0 extends (1 & T)` does not see `any[]`; a type "left as generated" is checked by identity (`(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)`), not two-way assignability (#112, #484, #487);
- in a scratch probe outside a dot folder (`tsc` skips them), with the `paths` of `website/tsconfig.json` (`@types/*` before `node_modules/*`), on the docs schema for a `sql` interpolation; a docs claim under the docs' tsconfig (`strict`, no `exactOptionalPropertyTypes`), at each position it covers, a hand-written `sql` template and an `any` column included. A page proves a line it accepts with a `<!-- tsc -->` mark or a compiling block holding `@ts-expect-error`, never `// @errors:` alone, which matches codes only; a misuse the type refuses is "does not compile" before "throws" (#571, #572, #609, #634, #677);
- for a string refused as a name, on a table with a column named like a `String` member (the fixture's `products.search`): its `SQL` (#670), the shortcuts' `where` and `having`, `exists()`, `isInSelect()`, `update()` values and the rows of `insert()` and `upsert()` refuse it (#682); `db.SQL`, `and()`, `or()` and `not()` take it, by design;
- for an interface kept one, by assigning it to `Record<string, unknown>` under `@ts-expect-error` (it has no implicit index signature): `toEqualTypeOf` and the identity check cannot tell it from an alias, nor can this control with an explicit index signature (#583, #603).

## Compile cost

- `npm run bench:types` compiles an example project and compares `Instantiations` (deterministic) with the stored baseline.
- Above **+20 %**: a stop point (`AGENTS.md`), with the figure and its cause.
- A justified rise updates the baseline in the same PR, figure in the description; a PR that moves the bench refreshes it, or says how much of its change it inherits (#541).
- The bench is a small program that calls neither a new condition nor a new function: measure N calls against the nearest sibling with `tsc --extendedDiagnostics`, the per-program part apart from the per-call part, and a type over every table on a synthetic schema of 50 to 100 tables, where TS2590 and a lookup spelled out per table in a consumer's `.d.ts` show; each option of a decision is measured, not inferred (#532, #541, #569, #572, #646, #682).
- The baseline drifts on master with no type change (#208: +0.4 %): refresh it with `-- --update` in a chore PR, so later PRs measure against master.

## Checklist

- [ ] At least one positive and one negative per changed type
- [ ] `not.toBeAny()` on the returns, beside an equality
- [ ] `bench:types` under the threshold, figure in the PR

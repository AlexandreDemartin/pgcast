---
name: type-tests
description: 'Testing a public type of pgcast: positive and negative cases, expectTypeOf, @ts-expect-error, the fixture’s generated schema, compile cost (bench:types, +20 % threshold). USE FOR: writing or changing a type, a generic, a signature, a generated type. DO NOT USE FOR: runtime tests of the SQL (zero-abstraction).'
---

# Type tests

A type that compiles is not necessarily correct: it may be `any`, too wide, or accept a wrong call.

Cases that serve a minority of steps are in [reference.md](reference.md), read when this core names them.

## Rules

- **Files**: `test/**/*.test-d.ts`, run by `npm run test:types` (Vitest `--typecheck`). The same command compiles `test/types-opt-in/legacy` separately for the literal `false` aggregate declaration.
- **Positive**: `expectTypeOf(x).toEqualTypeOf<…>()`, never `toMatchTypeOf` when equality is possible: it lets a too-wide type through.
- **Negative**: one wrong call per line under `// @ts-expect-error <reason>`; the reason says what must be refused. A call or an `expectTypeOf`, never an unused `type X = …`: with `noUnusedLocals`, its own error fills the expectation. Make each negative valid once to see "Unused '@ts-expect-error'", and compile a new one against master's types: one that holds there too (a `T` collapsed to `never`) freezes nothing, so an indexed access goes where a value goes (`null as unknown as T['k']`, #41). An unrelated error fills it too: a `1n` literal under the ES2019 target (TS2737: write `null as unknown as bigint`). A sweep of negatives diffs the whole `tsc` output, every `(line, code)` pair and its continuation lines, under each `strict` and `exactOptionalPropertyTypes` setting (TS2375 replaces TS2322), and uses the function as a value too (`.map(fn)`) (#516, #520, #579, #615).
- **The call itself**: the shortcut's call, its value built apart, not through a typed helper (`constraint<'users'>(…)` tests the helper) nor an annotated variable (inference differs).
- **Structural wrappers**: a wrapper class passes wherever its shape fits (`Parameter<T>` is `{ value: T }`), so each is probed against each slot, on an int and an enum column too ([reference.md](reference.md) § Structural wrappers).
- **No `any` slipping through**: `expectTypeOf(x).not.toBeAny()` on each tested shortcut's return, beside an equality, never instead of one (#420).
- **Real schema**: types are tested against the schema generated from the fixture (`test/fixtures/schema.sql`), not against the dummy schema of `src/typings`; an internal reader of options too, where only the fixture shows disjoint column keys (#755).
- **Edge cases**: nullable column, with a default, generated, identity; a literal on an enum column in context, which rests on inference through the return type (#181), and a type parameter found only there, inferred from every table's column of that name (`NoInfer` in `utils.ts` stops it, #569, #573); a `param()` of a string literal on an enum and a `TimeString` column, generic contexts included (`param(1)` tests no widening); `not()`, `and()`, `or()` of a Whereable wherever a condition goes; `columns`, `extras`, nested `lateral`, and a row type borrowed from another mode with each kind of lateral passed through (`count()`, `sum()`, `avg()`) under each config (#750); a view's table (no `Insertable`); over every table, a refused line beside the taken ones (#539, #655); a list helper, `<T extends string>(a: readonly T[])`, widens its items to `string` where `like(a: T)` keeps the literal, and infers `never` from `[]`: tested on a literal-union or template-literal column, and `[]` on a column of the wrong type (#708).
- **Generic forwarders**: a guard or a check on a shortcut's parameter is probed through `<T extends Table>(w: WhereableForTable<T>)`, with a spread plus a key (`{ ...w, id }`), `Object.assign` and a key of one table only, on 4.1.6, 5.9 and 7. `X<T> & G` loses them where a lookup by table, `{ [K in Table]: X<K> & G }[T]`, keeps them (a target with no table, `and()`, cannot take it); `T & Check<T>` stays deferred and refuses them all. An unknown key written in place still gives TS2353, on one table and on a union of tables; beside a spread (`{ ...w, nope: 1 }`) it compiles, so a test names which. `keyof` of each public type it touches is frozen, each member of an exported options type included (`keyof Parameters<…>`) (#532, #570, #676, #682).
- **A member a library calls is a property**, never a method, which is checked bivariantly even under `strict` (#700, #730): [reference.md](reference.md) § Methods and callbacks. Before a type parameter, a type over drivers' clients or a refusal by a fragment's type arguments: [reference.md](reference.md) § Inference, [reference.md](reference.md) § Driver types, [reference.md](reference.md) § Fragment refusals.
- **Programs of their own**: an inference that depends on the order `tsc` checks types in (TS 5.9's `param()`) is frozen in `test/types-order`, with a fixed `files` order; a narrowed `zapatos/custom` placeholder, by excluding the generated one in a tsconfig of its own (#539, #541, #572).
- `exactOptionalPropertyTypes` is on: a test covers `{ col: undefined }` when the type is concerned.

## A claim about a type

In a test, the docs or the CHANGELOG, it is probed, not read from the declarations: on the result type, with `strict: false`, on each compiler it names (4.1.6, 5.9, 7.0), under `skipLibCheck`, crossed with `any` and `unknown`, on the `any` placeholders of `zapatos/custom`, in a docs-faithful probe. Each probe, with its why: [reference.md](reference.md) § Claims about a type.

## Compile cost

- `npm run bench:types` compiles an example project and compares `Instantiations` (deterministic) with the stored baseline.
- `npm run bench:types:large`: check time and memory of generic helpers and of 300 literal `parent()` calls (case `literals`) on 280 tables, as a ratio to Zapatos 6.6.1; a PR that changes the declarations runs `-- --cases libCheck` locally (CI runs it only on master and by hand) and quotes it.
- Above **+20 %**: a stop point (`AGENTS.md`), with the figure and its cause.
- A justified rise updates the baseline in the same PR, figure in the description; a PR that moves the bench refreshes it, or says how much of its change it inherits (#541).
- The bench is a small program that calls neither a new condition nor a new function: measure N calls against the nearest sibling with `tsc --extendedDiagnostics`, the per-program part apart from the per-call part, and a type over every table on a synthetic schema of 50 to 100 tables, where TS2590 and a lookup spelled out per table in a consumer's `.d.ts` show; each option of a decision is measured, not inferred (#532, #541, #569, #572, #646, #682). A micro-measure (N calls, all using an opt-in type) is that type's cost where it is written, not the +20 % stop point of the bench: the PR gives one verdict (#824).
- The baseline drifts on master with no type change (#208: +0.4 %): refresh it with `-- --update` in a chore PR, so later PRs measure against master.

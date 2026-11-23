# Type tests: reference

The cases of skill `type-tests` that serve a minority of steps; [SKILL.md](SKILL.md) names each section with when to read it.

## Methods and callbacks

- A member a library calls (`QueryableLike.query`) or a callback key is declared as a property: a method, `k?(e: Union): void` included, is checked bivariantly even under `strict`, so a `query()` that needs a `name` `run()` never sends, or a listener for one member of a union, compiles and throws. A new callback key is probed with `(e: Extract<Union, …>) => …` (#700, #730).
- A method's bivariance holds only where the target is its own declaration: a copy as a function type (a re-exported `const` in a library's `.d.ts`, Vitest's `mockImplementation`) checks one way under `strictFunctionTypes`, so a claim resting on it is probed through each copy with the library's real types, not a hand-written stand-in (#700).
- A refusal resting on `strictFunctionTypes` holds only under `strict`: its "does not compile" names the condition, probed with `strict: false` (#730).

## Inference

- `Parameters` and `infer` reduce an unconstrained type parameter to `unknown`; those erased forms, and mocks on 6.6.1's types, are cells pinned by tests, which small rewrites broke silently (#701).
- A union member holding a bare type parameter (`C & X`) collects candidates from every argument, and broke non-generic `pg` calls; an overloaded method infers from its last signature (`@types/pg`'s `connect()` ends with the callback form) (#701).
- A new overload of a public function gets a type test that passes it as a value (`xs.map(db.parent)` is inferred from the last signature only, so every higher-order use changes while each direct call keeps its type) and one through an instantiation expression (`db.parent<X.Column>`, TS ≥ 4.7), which checks the constraint of every overload of its arity: a type parameter constrained to `Table` gave TS2344 on a production app (#918).
- A type parameter inferred from one argument is `NoInfer`'d everywhere else it appears, or a callback passed by reference or annotated infers it from its own parameter: the grid has the callback inline, by reference, annotated and through a forwarder (#701).
- `NoInfer` on a callback's parameter also blocks a generic caller forwarding a callback typed with that parameter: a helper type exported "so users can type a helper" gets a probe of that helper, generic over it (#701, #751).
- A type parameter that infers nothing inside a generic body falls back to its constraint: a forwarder is checked with a constrained generic (`<C extends X>`) too, and a "does not compile" claim on it names what fails (#751).
- An explicit type argument turns off inference for every other parameter, which takes its default: a signature whose safety rests on an inferred parameter is probed with `fn<T>(…)`. It is the caller's assertion, as a cast is: a rule names it rather than chase it with more conditional branches; a misuse that fails loudly at run time is named in the docs, not chased in the type (#751).
- A type parameter's constraint (`N extends { connect?: never }`) binds the chosen type argument, not the value passed: the restriction goes on the argument's type itself (#751).

## Driver types

A type over drivers' clients (`PoolLike`, `TxnClientLike`):

- compiles on each major of each peer's typings (`@types/pg` 7 and 8, postgres.js 3.4.0's `TransactionSql extends Sql` and 3.4.9's `ISql`), a negative and a docs example included (#703, #751);
- is probed on a subclass that overrides an overloaded method with one signature, not only `interface X extends pg.Pool { extra }`, and on each union both mixed and all-foreign (#701, #751);
- tests a marker by its property's type, not its key: a string index signature puts `_zapatos` in `keyof` of a bare client; once a fallback is detected one way, every type branching on it uses that same test (#751);
- backs a docs claim that a driver "gives" a field with that driver's declarations, optional or required, not only a run (#701).
- tests each run-time path against what the type inferred, when it accepts a pool or a marked client (#751).

## Fragment refusals

A refusal by `SQLFragment`'s type arguments (a brand, `options & X<L>`):

- is probed on a consumer's own `<R>(q: SQLFragment<R>)` helper and a generic forwarder, whose `L` is a type parameter; the docs name that condition and give the fix (`SQLFragment<R, any>`); a test helper takes `SQLFragment<any, any>` (#750);
- tests each union member with a distributive conditional, as `[L] extends [SQLFragment<infer R>]` merges them, and sees only what subtype reduction leaves (`cond ? sql<SQL, any> : count()` is already `SQLFragment<any>`); "no member matched" is `true extends G<L>`, as 4.1.6 misreads `[G<L>] extends [never]` (#750);
- quotes only the error's first line: the member TypeScript explains varies by program and compiler (#750);
- an option intersection (`options?: X & Cond<L>`) refuses one shape and keeps `L`'s inference on 4.1.6, 5.9 and 7 (#750).
- is worded as probed: a wording a review prescribes is compiled before it goes in ("contains a type parameter" was false for `SQLFragment<R[]>`, and a constrained `R` compiles on 5.9 and 7, not 4.1) (#750).

## Compiler grids

- A tsconfig per compiler: TypeScript 7 removes `moduleResolution: node` (TS5108), so its own takes `module: preserve`, `moduleResolution: bundler`; a probe that emits sets `rootDir`, or it writes `.d.ts` files into the checkout (#700, #741).
- Its paths point at a live `node_modules` (`typeRoots`, `pg`), and a `.d.ts` copied outside the checkout gets a `node_modules` link beside it, or `pg` stops resolving (TS2345 on 4.1) (#744, #750).
- A 4.1.6 consumer: the `npm pack`ed build, linked to 4.1's own `@types` with `preserveSymlinks` (the checkout's `@types/node` does not parse there); a spy from `@vitest/spy`, as Vitest 4's declarations do not parse (#700, #730).
- A claim "from TypeScript X" runs on X itself: `npm pack typescript@X` into the scratch folder (#741).
- A reviewer's grid is rerun with your `dist` in its `paths`, plus a probe file without `@ts-expect-error` for the exact error text to quote (#750).

## Claims about a type

In a test, the docs or the CHANGELOG, a claim is probed, not read from the declarations:

- on the result type, not only the parameter: a `readonly` `returning` is accepted and gives `never`;
- with `strict: false`: `undefined extends X` is then always true, so narrowing by `columns`, `returning` or `reportAction` is lost, and a `lateral` key gives TS2339;
- on a value built at run time and on wider types (`Record<string, string>`, `object`): excess keys are checked only in a fresh literal, and a built-in that shares a member with a column (`name`, `size`) passes the weak-type check;
- on each compiler it names, by a real install: 4.1.6 (`check:floor`'s copy in `node_modules/.cache`; the docs schema, `website/zapatos`, copied into a scratch consumer), 5.9 and 7.0. They infer literals differently (the type tests run on 5.9 only); TS 7 prints only the last overload's error, 4.1 and 5.9 one per overload (TS2769), so the docs' `// @errors:` lines are read before an overload is added; 4.1 parses no instantiation expression (`db.sql<I>`): its TS1005 hides every semantic error of the whole 4.1 program, so an instantiation expression never shares a 4.1 program with a probe; the declarations need 5.7 for a full check; the error code (TS2322 or TS2345) depends on the signature's form, and a key one edit away from a known one gives TS2561, not TS2353 (#730); from 4.2 an optional property is assignable to a string index signature, under `exactOptionalPropertyTypes` too, where 4.1.6 refuses it (#520, #581, #667, #668, #686, #741). How to set up each compiler: [reference.md](reference.md) § Compiler grids;
- under `skipLibCheck`, where a name a `.d.ts` uses and the compiler lacks (`Awaited` below 4.5, a removed type) becomes `any` silently: a removal, a "does not compile" claim or a check that compiles a `.d.ts` (`check:floor`'s aliased consumer, #921) needs a downstream negative (TS2578 once it goes) or `not.toBeAny()` on a result type, and a mutant that renames what it names; Vitest reports nothing on an import line outside a `test()` (#522, #581, #606);
- crossed with an argument typed `any` and `unknown`: a narrowing that resolves to `never` refuses the untyped callers 6.6.1 took (`JSON.parse`, `req.body`), and taking `any` brings `null` back with `strictNullChecks` off (#516);
- on the `any` placeholders of `zapatos/custom` (`extra.type_zoo`) and an array of one: they are the typed callers a fix changes, and `0 extends (1 & T)` does not see `any[]`; a type "left as generated" is checked by identity (`(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)`), not two-way assignability (#112, #484, #487);
- in a scratch probe outside a dot folder (`tsc` skips them), with the `paths` of `website/tsconfig.json` (`@types/*` before `node_modules/*`), on the docs schema for a `sql` interpolation; a docs claim under the docs' tsconfig (`strict`, no `exactOptionalPropertyTypes`), at each position it covers, a hand-written `sql` template and an `any` column included. A page proves a line it accepts with a compiling block holding `@ts-expect-error`, never `// @errors:` alone, which matches codes only, nor a `<!-- tsc -->` mark, compiled in `CHANGELOG.md` only (#700, #715); a misuse the type refuses is "does not compile" before "throws" (#571, #572, #609, #634, #677);
- for a string refused as a name, on a table with a column named like a `String` member (the fixture's `products.search`): its `SQL` (#670), the shortcuts' `where` and `having`, `exists()`, `isInSelect()`, `update()` values and the rows of `insert()` and `upsert()` refuse it (#682); `db.SQL`, `and()`, `or()` and `not()` take it, by design;
- for an interface kept one, by assigning it to `Record<string, unknown>` under `@ts-expect-error` (it has no implicit index signature): `toEqualTypeOf` and the identity check cannot tell it from an alias, nor can this control with an explicit index signature (#583, #603).

## Structural wrappers

- `Parameter<T>` is `{ value: T }`, so a wrapper class passes wherever its shape fits: probe each against each slot typed `Parameter<T>`, on an int and an enum column, not only text. A mapped `Wrapper<U[K]>` wraps the whole union (`null`, `DefaultType`, `SQLFragment`): pull `T` out first (`ParameterValue<U[K]>`). A class with only optional members (`ParentColumn`) is a weak type that `{}` and `param('id')` pass, and a refusal by its shape refuses plain JSON objects (`{ value: x }`); a type a value must satisfy (`toPostgres()`) gets a negative per required member (#522, #569).

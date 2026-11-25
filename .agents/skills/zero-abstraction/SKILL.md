---
name: zero-abstraction
description: 'Designing a helper, a condition or an option of pgcast: visible and unique SQL, types derived from Postgres, minimal surface, opt-in. USE FOR: adding to db.conditions, a shortcut, a select option, a helper (related, fn, with), naming an API. DO NOT USE FOR: escaping (sql-safety), type tests (type-tests).'
---

# Zero abstraction

A pgcast helper is a writing shortcut to SQL you would have written by hand; nothing more.

## Rules

- **The SQL is the contract**: each helper documents in JSDoc the exact SQL it produces, and a test freezes that SQL (`text` + `values`).
- **One SQL per call**: no hidden branch that changes the shape of the query depending on the values, except the documented empty case (`isIn([])` → `false`).
- **Always composable**: a helper returns a `SQLFragment` that can be slipped into `sql```, a `Whereable`, `extras` or `lateral`.
- **Parameter, never literal**: a value goes through `param()`; an identifier goes through `Column`/`Table` typing (skill `sql-safety`).
- **Derived from the database**: a type comes from the generated schema (`ColumnForTable<T>`, `SelectableForTable<T>`), never from a hand-written declaration.
- **The cheapest SQL for the result**: of two forms with the same result and types, the cheaper one, measured on the runtime bench, not assumed (`AGENTS.md` § Philosophy, point 6).
- **No state, no magic**: no cache, no global registry, no lazy read, no implicit extra query.
- **State lives on the fragment**: a mark or a property that changes how a query compiles or what it returns (`parentTable`, `preparedName`, `noop`, a transform) is carried by `copy()`, with a test of the copy (#32, #262, #263). A fragment is mutable (`prepared()` sets `preparedName`): a helper returns a copy, never its argument, an empty case included, and a guard reads a fragment's state where it compiles, not at the call (#673). Neither `copy()` nor `prepared()` nests a prepared fragment safely, as the nested `compile()` still writes `result.name`: a wrapper drops `preparedName` itself, as `inWith()` does (#743). A form compiled in place of a query (a top-level form) is a fragment of its own even when its SQL is the same: `Object.assign` onto a fragment the nested form also holds leaked `preparedName` and `noop` into a CTE, so a test walks the nested tree and compiles each nested form before and after a top-level compile; such a form also replaces `run`, since `run()` compiles `this` (#940). A marker a copy must keep goes on a value `copy()` already shares by reference (the query's own `runResultTransform`), not on the fragment, whose symbol keys `copy()` drops; it then survives `copy({ literals })` too, so a test of "the caller's SQL stays as written" includes an overridden copy (#950).
- **A rewrite replayed where it is read**: a change to a query's shape (a conversion moved into the select list, output columns added to a level, a caller's expression wrapped in a subquery, a nested result's SQL type) is replayed in each clause that compares, groups or resolves a name against it, in both forms:
  - `ORDER BY` and `DISTINCT` compare the converted value (`to_jsonb` of a `timestamptz` sorts as text; `DISTINCT` with an `ORDER BY` expression gives 42P10): convert above the unchanged sub-SELECT, as the aggregate does (#940);
  - a parent slot that compares or groups a child's value as it is: `DISTINCT` over a passed-through lateral failed on `json` (42883) while the row expression was handled (#950);
  - a bare name in `ORDER BY` or `DISTINCT ON` matches the new output columns first, a caller's fragment included (42702, #957);
  - a scalar subquery binds an aggregate, window or set-returning function to itself, and types an untyped `$n` as `text`: each refusal of the outer clause is probed both ways, 42803, 42P20, 0A000 and 42P18 (#954).
- **Minimal surface**: one more option only if real usage asks for it (skill `consumer-usage`); otherwise a `sql` fragment is enough.
- **Opt-in**: anything that changes the default output or adds a dependency sits behind an option (skill `backward-compat`). An option that switches between two behaviours of pgcast names its exit, the sole behaviour at the next major, in its decision note and its docs entry, or it is refused; an addition that changes nothing while off stays opt-in (decision 019 § 1).
- **Valid empty case**: a variadic or array helper produces valid SQL with no argument (`and()` → `TRUE`, `or()` → `FALSE`), never `()`. A path that forces or wraps a no-op runs on a `GENERATED ALWAYS` column and on a view (the fixture's `users`, `active_users`): an empty `insert()`'s text is refused there (428C9, #673). A condition that picks its SQL when built and reads its values when compiled is probed from each initial length: an `isIn([])` given `db.all` later compiled to `((false))` (#755).

## Shape of a condition

```ts
// src/db/conditions.ts
export const like = <T extends string>(a: T) => sql<SQL, boolean | null, T>`${self} LIKE ${conditionalParam(a)}`;
```

- `self` for the current column, `conditionalParam` to accept a value, `SQLFragment`, `Parameter` or `parent()`.
- The third type parameter (`T`) constrains the column; the `RunResult` says `boolean | null`.

## Naming

- The name of the Postgres operator or function when there is one (`arrayOverlaps` for `&&`, `websearchToTsquery`).
- No synonym of an existing helper; no "handy" alias.
- A name `db.mjs` can export: `gen-esm-wrapper` leaves out a reserved word (`with`), silently (#668).

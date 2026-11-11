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
- **No state, no magic**: no cache, no global registry, no lazy read, no implicit extra query.
- **Minimal surface**: one more option only if real usage asks for it (skill `consumer-usage`); otherwise a `sql` fragment is enough.
- **Opt-in**: anything that changes the default output or adds a dependency sits behind an option (skill `backward-compat`).
- **Valid empty case**: a variadic or array helper produces valid SQL with no argument (`and()` → `TRUE`, `or()` → `FALSE`), never `()`.

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

## Checklist

- [ ] SQL produced written in JSDoc and frozen by a test
- [ ] Composable in `Whereable`, `extras`, `lateral`, `sql```
- [ ] Values in `param`, identifiers typed
- [ ] Valid and tested empty case
- [ ] Positive and negative type (skill `type-tests`), cost measured for a conditional type
- [ ] Real need cited (skill `consumer-usage`)

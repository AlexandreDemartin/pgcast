# Decision notes

One note per ambiguous decision: context, options, proposed choice, then validation by the user before implementing (`AGENTS.md` § Stop points). A superseded note is never deleted: its status points to the one that replaces it.

| # | Title | Status |
|---|---|---|
| [001](./001-build-and-test-tooling.md) | Tooling: build and tests | accepted (2026-11-11) |
| [002](./002-module-names.md) | Module names `zapatos/*` or `pgcast/*` | accepted (2026-11-11) |
| [003](./003-fixes-and-deprecation.md) | Breaking fixes: fix, or deprecate | accepted (2026-11-12), revised after audit |
| [004](./004-documentation-site.md) | The documentation site | accepted (2026-11-12) |
| [005](./005-playground.md) | A playground in the browser | accepted (2026-11-13) |
| [006](./006-subquery-conditions.md) | How `exists()` and `isInSelect()` refer to the outer query | accepted (2026-11-16), under the owner's delegation |
| [007](./007-related.md) | Laterals on foreign keys: `related()`, `relatedMany()` and references to a lateral's result | accepted (2026-11-17), by delegation: not built in the core |
| [008](./008-domains-jsonb-validators.md) | Domains typed by their values, typed `jsonb`, and validators | accepted (2026-11-17), by delegation: `domainsTypedAsUnions` only; no `jsonb` mechanism, no validators package |
| [009](./009-functions.md) | Postgres functions: signatures, `fn()` and set-returning functions | accepted (2026-11-17), by delegation: not built in the core; `sql` documented |
| [010](./010-aliases-and-with.md) | Table aliases and `withCTEs()`: qualified column names and CTEs before a shortcut | accepted (2026-11-17), by delegation: `withCTEs()` for CTEs; no alias helper, `sql`'s type argument documented |
| [011](./011-several-databases.md) | Several databases: how a program types queries on more than one | accepted (2026-11-17), by delegation: not built in the core; one database per project, documented |
| [012](./012-raw-sql-types.md) | Raw SQL types: how a hand-written `sql` query gets its types from Postgres | accepted (2026-11-18), by delegation: a separate tool, `@pgcast/typegen`; Parse / Describe over `pg`, nullable unless proven, a committed file under `--check` |
| [013](./013-package-model.md) | The package model: one core, extensions under `@pgcast` | accepted (2026-11-18), by delegation |
| [014](./014-constraint-violations.md) | Tell which constraint Postgres refused a write for | accepted (2026-11-19), under the owner's delegation |
| [015](./015-recipes.md) | Recipes: the list, the format, the place and the schema | accepted (2026-11-22), by delegation: 19 recipes in four batches, a group of their own, the film schema unchanged |
| [016](./016-parent-column-default.md) | `parent()` and `ParentColumn` on a generic column: no generic column related to the `Column` union | accepted (2026-11-23), by delegation: `ParentColumn<T extends string>`, structural `LateralOption` constraints, `parent()` unchanged |
| [017](./017-value-aliases.md) | Value aliases: each column's value type named in the generated schema | accepted (2026-11-23), by delegation: `valuesTypedAsAliases`, three aliases of `zapatos/db`, the default in 8.0 |
| [018](./018-json-output.md) | How the shortcuts write their JSON: `json` functions and rows at the top level | accepted (2026-11-24), by delegation: `shortcutsUseJson`, `topLevelSelectAsRows`, the default in 8.0; their `false` superseded by 019 |
| [019](./019-one-behaviour.md) | 8.0 keeps one behaviour per option, the best, with no permanent opt-in | accepted (2026-11-25) by the owner, its inventory and three points included |
| [020](./020-bulk-insert.md) | One JSON parameter for `insert()` of many rows | accepted (2026-11-25), by delegation: ruled out; the `sql` form documented in `website/batches.md` |

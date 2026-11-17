# Decision notes

One note per ambiguous decision: context, options, proposed choice, then validation by the user before implementing (`AGENTS.md` § Stop points). A superseded note is never deleted: its status points to the one that replaces it.

| # | Title | Status |
|---|---|---|
| [001](./001-build-and-test-tooling.md) | Tooling: build and tests | accepted (2026-11-11) |
| [002](./002-module-names.md) | Module names `zapatos/*` or `pgcast/*` | accepted (2026-11-11) |
| [003](./003-fixes-and-deprecation.md) | Breaking fixes: fix, or deprecate | accepted (2026-11-12), revised after audit |
| [004](./004-documentation-site.md) | The documentation site | accepted (2026-11-12) |
| [005](./005-playground.md) | A playground in the browser | proposed (2026-11-13) |
| [006](./006-subquery-conditions.md) | How `exists()` and `isInSelect()` refer to the outer query | accepted (2026-11-16), under the owner's delegation |
| [007](./007-related.md) | Laterals on foreign keys: `related()`, `relatedMany()` and references to a lateral's result | accepted (2026-11-17), by delegation: not built in the core |
| [008](./008-domains-jsonb-validators.md) | Domains typed by their values, typed `jsonb`, and validators | accepted (2026-11-17), by delegation: `domainsTypedAsUnions` only; no `jsonb` mechanism, no validators package |
| [009](./009-functions.md) | Postgres functions: signatures, `fn()` and set-returning functions | accepted (2026-11-17), by delegation: not built in the core; `sql` documented |
| [010](./010-aliases-and-with.md) | Table aliases and `with()`: qualified column names and CTEs before a shortcut | accepted (2026-11-17), by delegation: not built in the core; `sql` and its type argument documented |

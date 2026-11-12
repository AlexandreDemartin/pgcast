---
name: codegen-output
description: 'Changing the codegen output (src/generate): fixture snapshots, opt-in, version canary, justified diff, zapatos/* strings. USE FOR: pg_catalog introspection, a new generated type or constant, a codegen config option, --check, --watch. DO NOT USE FOR: runtime types of src/db (type-tests), API compat (backward-compat).'
---

# Codegen output

The generated file (`zapatos/schema.d.ts`) is compiled by every user project: its content is part of the API (skill `backward-compat`).

## Rules

- **Snapshot first**: the output generated from `test/fixtures/schema.sql` is frozen; every snapshot diff is explained line by line in the PR.
- **Default output unchanged**: anything new (FKs, functions, validators) sits behind a config option, default = 6.6.1 output. Otherwise a stop point.
- **Deterministic**: explicitly sorted order (`ORDER BY` + name), never `pg_catalog`'s order.
- **Qualify by schema**: every introspection query filters on `pg_namespace`, never on the object name alone.
- **The generated output compiles**: `npm run typecheck` compiles the fixture's output.
- **The docs schema follows**: after the root `npm run build`, `cd website && npm run docs:schema`, and commit what changes in `website/zapatos/`; the `docs` job fails on a stale one.
- **Canary**: an incompatible change of format increments `SchemaVersionCanary` (`src/db/canary.ts` and `src/generate/tsOutput.ts`): a stop point.
- **`zapatos/*` strings** unchanged (note 002).
- **Comments**: a `COMMENT ON` text goes into a JSDoc; `*/` must be neutralised in it.

## Checklist

- [ ] Snapshot diff justified, or none
- [ ] Opt-in option, default = current output
- [ ] Introspection queries qualified by schema and sorted
- [ ] The fixture's output compiles
- [ ] `npm run docs:schema` run, `website/zapatos/` committed

---
name: codegen-output
description: 'Changing the codegen output (src/generate): fixture snapshots, opt-in, version canary, justified diff, zapatos/* strings. USE FOR: pg_catalog introspection, a new generated type or constant, a codegen config option, --check, --watch. DO NOT USE FOR: runtime types of src/db (type-tests), API compat (backward-compat).'
---

# Codegen output

The generated file (`zapatos/schema.d.ts`) is compiled by every user project: its content is part of the API (skill `backward-compat`).

## Rules

- **Snapshot first**: the output generated from `test/fixtures/schema.sql` is frozen; every snapshot diff is explained line by line in the PR.
- **Default output unchanged**: anything new (FKs, functions, validators) sits behind a config option, default = 6.6.1 output. Otherwise a stop point. Off, files and notes stay master's (skill `backward-compat` § Fixing an existing bug); each key that changes the output has its `variants` entry (a frozen, compiled snapshot), and a note's tests run every variant and freeze the order of notes that fire together (#45, #166, #447).
- **Deterministic**: explicitly sorted order (`ORDER BY` + name), never `pg_catalog`'s order nor query timing. Relations are read concurrently (`Promise.all` in `tsOutput.ts`): a value they share (`customTypes`, its imports and origins) is merged whatever the order, through state the run already shares rather than a new out-parameter, and tested through `placeholdersInEveryOrder` (`test/integration/codegen.test.ts`); no `await` inside `definitionForRelationInSchema`'s row loop. A byte-for-byte proof leaves #42's shared placeholders out or compares several runs (#184, #449, #484, #490).
- **Qualify by schema**: every introspection query filters on `pg_namespace`, never on the object name alone.
- **Hostile catalogs**: a change to an introspection query is compared with the catalog itself (`pg_index` by `indrelid`) over partitions in another schema, inheritance, names holding `"`, `.` or `[]`, a materialised view (its own query) and objects in a transient state (`indisvalid`); a filter on a `LEFT JOIN`'s right table goes in its `ON` (#37, #43, #47, #166).
- **The generated output compiles**: `npm run typecheck` compiles the fixture's output. A claim about the output is replayed with `skipLibCheck` both ways (it hides unresolved names as `any`), with 6.6.1's placeholders still on disk (the generator never rewrites them), in a prefixed and an unprefixed schema, through the CLI when `cliConfig.ts` changes; parsing (`syntaxErrors()`) and compiling are two checks (#48, #184, #399, #487).
- **The docs schema follows**: after the root `npm run build`, `cd website && npm run docs:schema`, and commit what changes in `website/zapatos/`; the `docs` job fails on a stale one.
- **Canary**: an incompatible change of format increments `SchemaVersionCanary` (`src/db/canary.ts` and `src/generate/tsOutput.ts`): a stop point.
- **`zapatos/*` strings** unchanged (note 002).
- **Comments**: a `COMMENT ON` text goes into a JSDoc; `*/` must be neutralised in the whole string, template text included, by one quoting helper per kind of string (`src/generate/quote.ts`). Line ends are normalised first (`/^/gm` matches after `\r`, U+2028, U+2029). What TypeScript reads (a tag, a hover, a strike-through) is checked with its own parser (`ts.getJSDocTags`, `getQuickInfoAtPosition`) on the real `tsForConfig` output, margins included, against master's output; any doubt keeps master's layout (#46, #48, #308, #309, #473, #488).

## Checklist

- [ ] Snapshot diff justified, or none
- [ ] Opt-in option, default = current output
- [ ] Introspection queries qualified by schema and sorted
- [ ] The fixture's output compiles
- [ ] `npm run docs:schema` run, `website/zapatos/` committed

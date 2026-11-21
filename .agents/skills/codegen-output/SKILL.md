---
name: codegen-output
description: 'Changing the codegen output (src/generate): fixture snapshots, opt-in, version canary, justified diff, zapatos/* strings. USE FOR: pg_catalog introspection, a new generated type or constant, a codegen config option, --check, --watch, tools/typegen. DO NOT USE FOR: runtime types of src/db (type-tests), API compat (backward-compat).'
---

# Codegen output

The generated file (`zapatos/schema.d.ts`) is compiled by every user project: its content is part of the API (skill `backward-compat`).

Before changing the typed SQL tool, `tools/typegen` (decision 012): [reference.md](reference.md) § Describing; then, for what the change touches, [reference.md](reference.md) § Neutralising, [reference.md](reference.md) § Name binding, [reference.md](reference.md) § Program selection, [reference.md](reference.md) § Nullability, [reference.md](reference.md) § Watch mode, [reference.md](reference.md) § A CLI and its credentials.

## Rules

- **Snapshot first**: the output generated from `test/fixtures/schema.sql` is frozen; every snapshot diff is explained line by line in the PR.
- **Default output unchanged**: anything new (FKs, functions, validators) sits behind a config option, default = 6.6.1 output. Otherwise a stop point. Off, files and notes stay master's (skill `backward-compat` § Fixing an existing bug); each key that changes the output has its `variants` entry (a frozen, compiled snapshot), and a note's tests run every variant and freeze the order of notes that fire together; a census of every note gets a new note added to its expectations, never filtered out (#44, #45, #166, #447).
- **A note lists what changes**: an opt-in's note names exactly the columns whose lines or placeholders differ between the key on and off. One test over a set of shapes, a column per kind its lead-in names, under each option that widens the list (`domainsTypedByContext`), asserts the list and the lead-in word for word; the listing reads a domain's root as the typing does, once every relation is read (#519, #522). A fix to a placeholder's text makes the note on placeholders on disk fire for files an earlier version wrote: check its message (#669).
- **Deterministic**: explicitly sorted order (`ORDER BY` + name), never `pg_catalog`'s order nor query timing; relations are read concurrently, so what they share is merged whatever the order, and no `await` sits inside `definitionForRelationInSchema`'s row loop ([reference.md](reference.md) § Determinism).
- **Qualify by schema**: every introspection query filters on `pg_namespace`, never on the object name alone; a built-in type's name is checked in `pg_catalog`, an enum in its type's own schema, an array never by a `_` prefix ([reference.md](reference.md) § Qualifying by schema).
- **Hostile catalogs**: a change to an introspection query is compared with the catalog itself, over partitions in another schema, inheritance, odd names, a materialised view and objects in a transient state ([reference.md](reference.md) § Hostile catalogs).
- **The generated output compiles**: `npm run typecheck` compiles the fixture's output; a claim about it is replayed with `skipLibCheck` both ways and with 6.6.1's placeholders on disk; parsing and compiling are two checks. A fix to one mode (a plain run, `--check`, `--watch`) greps the others for the same code path ([reference.md](reference.md) § Compiling the output).
- **The docs schema follows**: after the root `npm run build`, `cd website && npm run docs:schema`, and commit what changes in `website/zapatos/`; the `docs` job fails on a stale one.
- **Canary**: an incompatible change of format increments `SchemaVersionCanary` (`src/db/canary.ts` and `src/generate/tsOutput.ts`): a stop point.
- **`zapatos/*` strings** unchanged (note 002).
- **Comments**: a `COMMENT ON` text goes into a JSDoc; `*/` is neutralised in the whole string by one quoting helper per kind of string (`src/generate/quote.ts`), line ends first; what TypeScript reads is checked with its own parser, and any doubt keeps master's layout ([reference.md](reference.md) § Comments).

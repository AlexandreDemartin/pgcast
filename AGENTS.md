# AGENTS.md — pgcast

> `CLAUDE.md` is a symbolic link to this file. Read it in full before any change.

**pgcast** is a maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1 (MIT, George MacKerron). Its TypeScript types are **cast from the database schema**, never written by hand.
Goals: modernise, test, then extend, **without betraying the philosophy** and staying **backward compatible with Zapatos 6.6.1**. The roadmap is the GitHub issues, one Epic per chapter ([README](README.md#roadmap)); the decisions are in [docs/decisions/](docs/decisions/).

## Philosophy (non-negotiable)

1. **The database is the single source of truth.** Everything typed or validated is derived from Postgres (`pg_catalog`, `information_schema`, `COMMENT ON`), never declared by hand on the TS side.
2. **No ORM.** No models, no entity classes, no relationships declared in code, no hidden state, no lazy loading.
3. **SQL stays visible and predictable.** Each helper produces readable, unique, documented SQL. You can always drop down to the `sql` template.
4. **Minimal surface.** Whatever can live in a separate package or stay opt-in must. No new mandatory runtime dependency (Zod/Valibot as an optional peer dependency).
5. **The codegen stays a simple CLI** that reads the database and writes `.d.ts` / `.ts` files.
6. **Fast by construction.** Each helper writes the cheapest SQL Postgres offers for the same result and the same types, and the gain is measured (`bench:runtime`), never assumed. Speed never buys hidden state, a cache, an implicit client, or SQL you cannot read; a gain drowned in network latency is not one.

If a request breaks one of these points: **stop and say so** instead of implementing it.

### What pgcast does not do

A change that makes one of these moves is refused, whatever its gain. Sources: [Zapatos's docs](https://jawj.github.io/zapatos/).

- A model, an entity class, a relationship declared in TypeScript (Zapatos returns "just (fully-typed) POJOs").
- Lazy loading, an identity map, change tracking, a query cache.
- A method chain that builds a query and hides its SQL (`.where().join()`).
- An implicit, default or global client, or a transaction opened without being asked for: "Zapatos is always explicit about what client or pool is running your query", as it is "too easy to accidentally issue queries outside of transactions".
- Managing the connection pool or migrations ("Zapatos doesn't handle schema migrations").
- A layer to switch databases tomorrow at the expense of Postgres today ("a source of misery").
- A guessed type that the database does not state; a concatenated value instead of a parameter.
- SQL that depends on state, or changes with the values, without being documented.
- Core complexity for a niche case or for a gain drowned in network latency ("Small is beautiful"): it goes to a separate package, or opt-in.

## Architecture

```
Postgres ──(SQL introspection)──► src/generate/ ──(writes)──► zapatos/schema.d.ts  (declare module 'zapatos/schema')
                                                              zapatos/custom/*.d.ts (editable placeholders)
                                                                     │ ambient types
                                                                     ▼
user code ──► src/db/ (runtime: sql``, shortcuts, conditions, transactions) ──► pg (node-postgres)
```

- `src/generate/`: the codegen (CLI `pgcast`, alias `zapatos`; skill `codegen-output`). Each module is named here (`npm run check:agents`).
  - `cli.ts` runs it, `cliConfig.ts` reads its arguments and config files, `config.ts` holds the config, `schemaRules.ts` checks its `schemas` rules.
  - `write.ts` writes the files and their `check()`, `outputFiles.ts` builds them in memory, `header.ts` is their header.
  - `tsOutput.ts` assembles the `zapatos/schema` module, `moduleNames.ts` picks `zapatos/*` or `pgcast/*`.
  - `relations.ts` reads relations and their columns from the catalog, `tables.ts` produces their types, `quote.ts` writes a name or a text into the output.
  - `enums.ts` and `pgTypes.ts` map Postgres types to TS, `enumOrder.ts`, `domainRoots.ts` and `domainUnions.ts` read enums and domains; `legacy.ts` prints the "srcMode" migration warning.
- `src/db/`: the runtime (import `zapatos/db`).
  - `core.ts`: ⚠️ **sensitive zone**: `sql`, `SQLFragment`, compilation and escaping.
  - `shortcuts.ts` (`insert`, `upsert`, `update`, `select*`…), `conditions.ts`, `transaction.ts` (isolation levels, retries).
  - `date.ts`, `customJSON.ts`, `pgErrors.ts`, `config.ts`, `canary.ts`, `utils.ts`.
- `src/typings/zapatos/schema.ts`: a dummy schema used only to compile `src/db`.
- `db.{js,mjs,d.ts}` and `generate.{js,mjs,d.ts}`: root shims; the `.mjs` are **generated** at build time.
- `adapters/<driver>/` and `tools/<name>/`: official extensions, each a package of its own (decision [013](docs/decisions/013-package-model.md)).

**Module names**: `zapatos/schema`, `zapatos/db` and `zapatos/custom` are resolved at run time and compile time. **Never rename them** for the default; `moduleNames: 'pgcast'` is opt-in (decision [002](docs/decisions/002-module-names.md)).

## Commands

One line each; the whole table is in [docs/WORKFLOW.md § Commands](docs/WORKFLOW.md#commands).

- `npm ci` (npm ≥ 10), `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (needs `TEST_DATABASE_URL`), `npm run test:watch`.
- `npm run test:types`: the type tests on the fixture's schema. `npm run bench:types`: compile cost against `bench/baseline.json`, fails above +20 %.
- `npm run bench:types:large` (needs `TEST_DATABASE_URL`): check time and memory against Zapatos 6.6.1 on a large schema; a PR changing the declarations quotes its `-- --cases libCheck`, which CI runs only on master and by hand.
- `npm run bench:runtime` (needs `TEST_DATABASE_URL`): each shortcut scenario timed on a throwaway database, against `bench/runtime/baseline.json`; a speed PR quotes its table before and after, `-- --config <json>` beside the default.
- `npm run check:floor` (after `build`): the declarations on TypeScript 4.1. `npm run check:agents`: skills, agents, § Architecture, changelog and report.
- An extension runs its own checks from its folder (its README § Development, and [docs/WORKFLOW.md § Commands](docs/WORKFLOW.md#commands)).

A task is **done** only if `lint`, `typecheck`, `test` and `test:types` pass, and an extension's own when it changes.

## Method

- Method on one page: [docs/WORKFLOW.md](docs/WORKFLOW.md); skill map: [.agents/README.md](.agents/README.md). Before a subject, read the skill it names.
- A step is a sub-issue of an Epic (`gh issue view <n> --repo AlexandreDemartin/pgcast`, with **Files** and **Risk**), run by the skill `run-step`. Costs and levers: issue #812.

### Compact instructions

When the conversation is compacted, keep: the step and PR numbers in progress, the agents still running with their worktrees and scratch folders, the decisions taken with their reasons, and the next action. The rest is in the orchestrator's hand-over.

## Working rules

- **Read the code concerned before changing it**, and summarise what you understood.
- **Tests first**, or with the implementation: runtime, compiled SQL (`text` and `values`) and types (positive **and** negative, `@ts-expect-error`).
- **One feature = one branch = one PR** on `AlexandreDemartin/pgcast`, small (skill `pr-shape`).
- **No breaking change** to the public API: stop and ask (skill `backward-compat`).
- **`core.ts`**: never touch it without saying so; each change adds SQL injection tests (skill `sql-safety`).
- Subject skills: `zero-abstraction` (a helper), `type-tests` (a type), `codegen-output`, `consumer-usage` (a need), `code-style`, `concise-docs`.
- `CHANGELOG.md` and the docs in the same PR as the feature; the docs site in English and French (`website/README.md` § Languages).
- Keep the existing copyright headers (George MacKerron); a new file may carry `Copyright (C) 2026 Alexandre Demartin`.

## Stop points (mandatory: stop and ask)

- Before any change to the public API or to the codegen output (except an opt-in addition).
- Before any change to escaping or SQL compilation in `core.ts`.
- An ambiguous design decision: write `docs/decisions/NNN-title.md` (context, options, proposed choice) and ask for validation before implementing.
- If the compile benchmark exceeds its threshold (+20 %).
- Before merging a `high` PR: the owner's OK (skill `merge-gate`).
- Before any npm publication or release, pushing a tag included, the core's `v*` or an extension's `@pgcast/<name>@<version>`: a `v*` tag starts `release.yml`, whose deployment the owner approves (`docs/WORKFLOW.md` § Releases); `prepack` builds before any `npm pack` or `npm publish`.
- Before any change to `exports`, `bin`, `files`, `engines`, `peerDependencies` or `dependencies`: they are part of the public API.

## Local environment

- Node `^20.19` or `>=22.12` for development; the published package declares no `engines`, like Zapatos 6.6.1.
- With npm 10, `npm install <pkg>` can crash on Vitest's peer deps (`edgesOut`): use `npx npm@11 install …`. `npm ci` works with 10 and 11.
- Postgres for tests: **no Docker**; `TEST_DATABASE_URL` in `src/.env` (ignored by git, never commit it), or in the environment, which takes precedence. The role needs `CREATEDB`, and superuser for `CREATE EXTENSION file_fdw` and the fixture's foreign table.

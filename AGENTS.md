# AGENTS.md — pgcast

> `CLAUDE.md` is a symbolic link to this file. Read it in full before any change.

**pgcast** is a maintained fork of [Zapatos](https://github.com/jawj/zapatos) 6.6.1 (MIT, George MacKerron).
The name plays on two meanings: in Postgres, a *cast* (`::type`) gives a value a type; in English, a *cast* is also a mould. The TypeScript types are **cast from the database schema**, never written by hand.

Goals: modernise, test, then extend, **without betraying the philosophy** and staying **backward compatible with Zapatos 6.6.1**.
The roadmap lives in the GitHub issues, one Epic per chapter ([README](README.md#roadmap)), and the decisions in [docs/decisions/](docs/decisions/).

## Philosophy (non-negotiable)

1. **The database is the single source of truth.** Everything typed or validated is derived from Postgres (`pg_catalog`, `information_schema`, `COMMENT ON`), never declared by hand on the TS side.
2. **No ORM.** No models, no entity classes, no relationships declared in code, no hidden state, no lazy loading.
3. **SQL stays visible and predictable.** Each helper produces readable, unique, documented SQL. You can always drop down to the `sql` template.
4. **Minimal surface.** Whatever can live in a separate package or stay opt-in must. No new mandatory runtime dependency (Zod/Valibot as an optional peer dependency).
5. **The codegen stays a simple CLI** that reads the database and writes `.d.ts` / `.ts` files.

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

- `src/generate/`: the codegen (CLI `pgcast`, alias `zapatos`).
  - `cli.ts` runs the CLI; `cliConfig.ts` reads its arguments (`--check`), `pgcastconfig.json` else `zapatosconfig.json`, and/or a JSON argument, and interpolates `{{ENV_VAR}}`; `config.ts` holds the config and its defaults, `schemaRules.ts` checks its `schemas` rules.
  - `write.ts` (`generate()`) writes `zapatos/schema.d.ts` and the `zapatos/custom/` placeholders, each under `header.ts`'s header, and its `check()` compares them with the disk, as `--check` does; `outputFiles.ts` builds them in memory, and its `staleFiles()` names those that differ, for both.
  - `tsOutput.ts` assembles the `zapatos/schema` module (namespaces per schema, aggregate types, `*ForTable<T>` lookups, version canary); `moduleNames.ts` picks `zapatos/*` or `pgcast/*`.
  - `tables.ts` introspects relations, columns, unique indexes and comments, then produces `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable` per table; `quote.ts` writes a Postgres name or a text into the output.
  - `enums.ts` and `pgTypes.ts` map Postgres types to TS (by context: Selectable, Insertable, etc.), `enumOrder.ts` reads an enum's declared order, `domainRoots.ts` the base type under a domain, `domainUnions.ts` the values a domain's `CHECK` lists (`domainsTypedAsUnions`); `legacy.ts` prints the migration warning for the old "srcMode".
  - Each module is listed here (`npm run check:agents`); those outside `index.ts`'s `export *` stay out of `zapatos/generate`.
- `src/db/`: the runtime (import `zapatos/db`).
  - `core.ts`: ⚠️ **sensitive zone**: `sql`, `SQLFragment`, compilation and escaping (`param`, `raw`, `cols`, `vals`, `parent`, `self`, `Default`).
  - `shortcuts.ts`: `insert`, `upsert`, `update`, `deletes`, `truncate`, `select*`, aggregates, `lateral`, locks.
  - `conditions.ts`: `eq`, `like`, `isIn`, `or`/`and`/`not`, array operators…
  - `transaction.ts`: typed isolation levels and retry on serialisation failure or deadlock.
  - `date.ts`, `customJSON.ts`, `pgErrors.ts`, `config.ts`, `canary.ts`, `utils.ts`.
- `src/typings/zapatos/schema.ts`: a dummy schema used only to compile `src/db` (via `paths` in tsconfig).
- `db.{js,mjs,d.ts}` and `generate.{js,mjs,d.ts}`: root shims. The `.mjs` files are **generated** by `gen-esm-wrapper` at build time.
- `adapters/<driver>/`: the official extensions that run pgcast on another driver, each a package of its own, `@pgcast/adapter-<driver>` (`adapters/postgres-js/`). Decision [013](docs/decisions/013-package-model.md).
  - Each has its own `package.json`, lockfile, `npm ci`, version, `CHANGELOG.md` and README; no npm workspaces.
  - Its types fit the core's structurally (`QueryableLike`, `PoolLike`), with no import; a peer dependency on `@pgcast/pgcast`, with an explicit range, only to read the core's types or config.
- `tools/<name>/`: later, the official tools in packages of their own (`@pgcast/typegen`), laid out as the adapters.

### Watch out: module names

The generated code and the runtime speak of `zapatos/schema`, `zapatos/db` and `zapatos/custom`. These are **module names resolved at run time and at compile time**, not a mere matter of branding. Decision [002](docs/decisions/002-module-names.md): by default these strings stay `zapatos/*`; the generator's opt-in `moduleNames: 'pgcast'` writes `pgcast/*`, and still declares `zapatos/schema`, which `src/db` imports. **Do not rename any of these strings** for the default.

## Commands

| Command | Role |
|---|---|
| `npm ci` | install (npm ≥ 10) |
| `npm run build` | `tsc` (CJS, ES2019) + ESM wrappers |
| `npm run lint` | ESLint 9 (flat config) on `src/`, `scripts/` and the docs site's own code (`website/*.mjs`, `website/*.ts`, `website/.vitepress/**/*.ts`) |
| `npm run typecheck` | `tsc` on the lib (its declarations go to `node_modules/.cache/pgcast`), on `test/`, and on the fixture's generated output (`test/generated/`) against those declarations |
| `npm test` | Vitest: unit and integration (`TEST_DATABASE_URL` required, `useTestDatabase()` in `test/helpers/db.ts`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:types` | emits the declarations of `src/db`, then the Vitest type tests (`test/types/*.test-d.ts`, `expectTypeOf`) on the fixture's generated schema; then `test/types-opt-in` emits a library's declarations, each `import("…")` naming a public module (`scripts/check-declarations.mjs`), and `test/types-order` compiles, in a program of its own, types that depend on the order `tsc` checks them in |
| `npm run bench:types` | compile cost of `bench/` (typed queries on the fixture's schema): `Instantiations` and `Types`, minus a floor without pgcast, compared with `bench/baseline.json`; fails above +20 %, below −5 % or if the TypeScript version differs; `-- --update` rewrites the baseline |
| `npm run check:floor` | after `build`: every `.d.ts` that `npm pack` lists parses with TypeScript 4.1.6, the `typescript` peer's floor, a consumer on 4.1 compiles against them with `skipLibCheck`, and their lib check finds no error but `Buffer<ArrayBuffer>`; fetches 4.1.6 and its `@types` once into `node_modules/.cache`; a directory argument checks an unpacked package instead |
| `npm run check:agents` | consistency of skills and agents, § Architecture against `src/`, a `CHANGELOG.md` § Deprecated line (any release) per deprecation message, no `CHANGELOG.md` entry written twice in a release, the summary of `docs/CHARACTERISATION-REPORT.md` recounted from its sections, tests of the `guard` hook and of these checks |

An extension's checks run from its folder, after the root's `npm ci && npm run build`, whose install, helpers and `db.d.ts` its tests use: `npm ci`, `npm test`, `npm run test:types`, then `npm pack --dry-run`; its README § Development lists them.

A task is **done** only if `lint`, `typecheck`, `test` and `test:types` pass, and an extension's own when it changes.

## Method

- The method on one page: [docs/WORKFLOW.md](docs/WORKFLOW.md). AI tooling and skill map: [.agents/README.md](.agents/README.md). Before a subject, read the skill it names.
- Steps: the sub-issues of the Epics, one at a time, read with `gh issue view <n> --repo AlexandreDemartin/pgcast`; each issue carries **Files** and **Risk** (`.github/ISSUE_TEMPLATE/task.md`). Orchestrated by the skill `run-step`, with the agents `builder`, `branch-reviewer` and `chores`. Earlier history: [docs/HISTORY.md](docs/HISTORY.md).
- Plan comment and PR proofs: skill `plan-and-proofs`; review comments: skill `review-comments`.
- CI: skill `ci-gate`; merge by risk (Ship / Show / Ask), squashed, closing its issue: skill `merge-gate`.
- Deciding alone or asking: skill `decision-philosophy`. Size, splitting, titles, branches and commits: skill `pr-shape`; code, JSDoc, errors and the docs voice: skill `code-style`.

## Working rules

- **Read the code concerned before changing it**, and summarise what you understood.
- **Tests first**, or at least with the implementation: runtime, compiled SQL (`text` and `values`) and types (positive **and** negative cases with `@ts-expect-error`).
- **One feature = one branch = one PR** on `AlexandreDemartin/pgcast`, small like a Zapatos commit (skill `pr-shape`).
- **No breaking change** to the public API. If it is unavoidable, stop and ask (skill `backward-compat`).
- **`core.ts` (escaping, parameterisation, identifier compilation)**: never touch it without saying so explicitly. Each change adds SQL injection tests (skill `sql-safety`).
- A helper is designed with the skill `zero-abstraction`, an advanced type is tested and its compile time watched with the skill `type-tests`, the codegen output follows the skill `codegen-output`, and a need is validated with the skill `consumer-usage`.
- Update `CHANGELOG.md` and the docs with each feature (skill `concise-docs`), the docs site in English and in French, in the same PR (`website/README.md` § Languages).
- Keep the existing copyright headers (George MacKerron). New files may carry `Copyright (C) 2026 Alexandre Demartin`.

## Stop points (mandatory: stop and ask)

- Before any change to the public API or to the codegen output (except an opt-in addition).
- Before any change to escaping or SQL compilation in `core.ts`.
- An ambiguous design decision: write `docs/decisions/NNN-title.md` (context, options, proposed choice) and ask for validation before implementing.
- If the compile benchmark exceeds its threshold (+20 %).
- Before merging a `high` PR: the owner's OK (skill `merge-gate`).
- Before any npm publication or release, pushing a `v*` tag included: it starts `release.yml`, whose deployment the owner approves (`docs/WORKFLOW.md` § Releases); `prepack` builds before any `npm pack` or `npm publish`.
- Before any change to `exports`, `bin`, `files`, `engines`, `peerDependencies` or `dependencies`: they are part of the public API.

## Local environment

- Node `^20.19` or `>=22.12` for development (Vite, via Vitest); day-to-day development is on Node 22. The published package declares no `engines`, like Zapatos 6.6.1.
- CI uses npm 10 (Node 20 and 22) and npm 11 (`lts/*`); `npm ci` works with both. With npm 10, `npm install <pkg>` can crash on Vitest's peer deps (`Cannot read properties of null (reading 'edgesOut')`). If so, use `npx npm@11 install …`.
- Postgres for tests: **no Docker**. We use a local instance via `TEST_DATABASE_URL`, set in `src/.env` (ignored by git, never commit it); a variable already in the environment takes precedence over `src/.env`. In CI, these are GitHub Actions service containers.
- Rights of the `TEST_DATABASE_URL` role: `CREATEDB`, and superuser for `CREATE EXTENSION file_fdw` and the `filename` option of the fixture's foreign table.

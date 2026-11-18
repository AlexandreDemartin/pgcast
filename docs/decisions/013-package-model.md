# 013 — The package model: one core, extensions under `@pgcast`

- **Status**: accepted (2026-11-18), by delegation from the owner, from the market's best packages at this project's size and the philosophy.
- **Scope**: feature [#716](https://github.com/AlexandreDemartin/pgcast/issues/716) and its planned PRs, [#717](https://github.com/AlexandreDemartin/pgcast/issues/717) (this note) and [#718](https://github.com/AlexandreDemartin/pgcast/issues/718) (the release workflow).
- **In short**: one core, `@pgcast/pgcast`, with the runtime and the codegen; each official extension a package of its own under `@pgcast/*`, in a folder of this repository grouped by role, with its own version, changelog and tag. Written before the first extension is published, so neither its tag nor its changelog moves afterwards.

## Context

- #58, #697 and #698 applied the model case by case: `@pgcast/adapter-postgres-js` is merged (`adapters/postgres-js/`), `@pgcast/adapter-pglite` is in review (#709, #712), `@pgcast/typegen` (#62) and others will follow.
- `AGENTS.md` did not name `adapters/`; `docs/WORKFLOW.md` § Releases and `release.yml` publish the core alone, on a tag `v*`; the first adapter's changelog went into the core's `CHANGELOG.md`.
- Principle 4 (`AGENTS.md` § Philosophy): "whatever can live in a separate package or stay opt-in must".

## The model

| Choice | Decision | Market, and why |
|---|---|---|
| Core | `@pgcast/pgcast` keeps the runtime and the codegen in one package | Zapatos ships both; `zapatos/generate`, the `bin` and the generated output move together. Prisma and pgTyped split them, which here would break 6.6.1 and add a version matrix |
| Drivers and tools | Packages of their own, never a subpath of the core | Prisma `@prisma/adapter-*`, Slonik `@slonik/*`, TanStack `@tanstack/*`; Drizzle's subpath per driver is ruled out by #58 (principle 4) |
| What goes into an extension | A feature that brings a dependency (a driver, a parser), has another lifecycle (a dev tool reading the user's code), or is experimental or `high`-risk enough to need 0.x. Everything else goes into the core, opt-in when not for everyone | Principle 4 |
| Name | `@pgcast/<role>-<target>`, role first: `adapter-pglite`; a tool, its role: `typegen` | Prisma's `adapter-pg`, `adapter-neon` |
| Layout | One folder per package in this repository, grouped by role (`adapters/<driver>/`, later `tools/<name>/`), each with its own `package.json`, lockfile and `npm ci`, as `website/` has. No npm workspaces, no Changesets, Turborepo or Nx | At three packages a tool costs more than it saves; workspaces would install every driver at the root (#58) |
| Tie to the core | Structural types, no import, as the adapters do; when an extension must read the core's types or config, a peer dependency on `@pgcast/pgcast` with an explicit range | The adapters fit `QueryableLike` and `PoolLike` under `zapatos/*` and `pgcast/*` alike |
| Versions | Each its own, from 0.1.0, 1.0 once its API is stable; a compatibility table on the docs site | Independent versions, as `@prisma/adapter-*` and `@slonik/*` |
| Changelog | `CHANGELOG.md` in the package's folder, shipped in its `files`; the core's `CHANGELOG.md` gets one line when an extension is first published, linking to it | The convention npm and Changesets follow: a package's changelog sits beside it |
| Tag and release | The core keeps `v<version>`; an extension is tagged `@pgcast/<name>@<version>`, Changesets' format; `release.yml` publishes the package the tag names, with provenance, after the owner's approval | One workflow, one `npm` environment, one rule per tag pattern |
| Quality | The core's: lint, types, tests on a real database in the same CI, docs EN and FR, `bench:types` for an extension with types | — |

## What changes

- **#717**: this note; `AGENTS.md` § Architecture names `adapters/` and `tools/`, § Commands an extension's checks; `docs/WORKFLOW.md` § Releases its tag; `adapters/postgres-js/CHANGELOG.md` holds its entry, moved from the core's, which keeps one line linking to it.
- **#718**: `release.yml` publishes an extension from its tag. A stop point: the owner adds the tag pattern to the `npm` environment and sets up trusted publishing per package, which npm may allow only once the package exists. Until then, the owner publishes an extension by hand, with the commands of its README.
- **#698** (`adapters/pglite/`): takes the changelog rule by a merge of master.

## Risks

- **A change to the core that an extension needs** ships in two releases, the core's first; the extension's peer range, or its structural types, say which core it takes.
- **A tag pushed by mistake** publishes nothing without the owner's approval of the `npm` deployment (`docs/WORKFLOW.md` § Releases).

## Sources

- Prisma's driver adapters (`@prisma/adapter-pg`, `@prisma/adapter-neon`), Slonik's `@slonik/*`, TanStack's `@tanstack/*`, Drizzle's subpath per driver; Changesets' tag format `<name>@<version>`.
- [#58](https://github.com/AlexandreDemartin/pgcast/issues/58) (drivers in packages of their own), [#697](https://github.com/AlexandreDemartin/pgcast/issues/697) (`@pgcast/adapter-postgres-js`), [#716](https://github.com/AlexandreDemartin/pgcast/issues/716) (this table).

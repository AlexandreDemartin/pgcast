# 001 — Tooling: build and tests

- **Status**: accepted (2026-11-11)
- **Date**: 2026-11-11
- **Scope**: phase 0 (build) and phase 1 (tests)

## Context

Zapatos 6.6.1 compiles to **CommonJS** (`tsc`, `target ES2019`), then generates ESM wrappers (`db.mjs`, `generate.mjs`) with `gen-esm-wrapper`. The `exports` field of `package.json` points `require` at the `.js` files and `import` at the `.mjs` files, which re-export the CJS module.

The runtime exposes **identity values**: the symbols `Default`, `self` and `all`, and the classes `Parameter`, `SQLFragment`, `ColumnNames`, `ParentColumn`… Compilation relies on `instanceof` and `===` (`core.ts`, `compileExpression`). If two copies of the runtime coexisted in one process, one loaded through `require` and the other through `import`, one copy's `db.Default` would not be recognised by the other. Some values would then fall silently into the "Whereable" branch. This is the *dual package hazard*.

## Build: options

| Option | For | Against |
|---|---|---|
| **A. Keep CJS + ESM wrapper** (`tsc` + `gen-esm-wrapper`) | A single copy of the runtime, so no dual package hazard. Output **byte-identical** to 6.6.1 (checked). Zero risk for consumers. | No ESM tree-shaking (negligible impact: ~3 kLoC). The `.mjs` wrapper must be regenerated when an export is added (automatic at build). |
| B. `tsup` dual build (native CJS + ESM) | Native ESM, bundling. | **Two copies of the runtime**, so a real hazard on `Default`, `self`, `all` and `instanceof`. The symbols would have to be registered with `Symbol.for` and `instanceof` replaced by markers, which would touch `core.ts`, a sensitive zone. A new build dependency. |
| C. `tsc` ×2 (CJS + ESM) | No third-party tool. | Same hazard as B. Two tsconfigs to maintain. |
| D. Pure ESM + `require(esm)` (Node ≥ 22.12 / 20.19) | The most modern. | Breaks CJS consumers on older Node versions or bundlers. Outside the "no breaking change" scope. |

**Proposed choice: A.** The only phase 0 changes are TypeScript 5.9.3 and calling the binaries without `npx`. The output in `dist/`, `db.mjs` and `generate.mjs` is byte-identical to 6.6.1's, and `npm pack --dry-run` lists the same 51 files. If native ESM is wanted one day, the runtime must first be made robust to the hazard (`Symbol.for` and *brands* instead of `instanceof`); that will get a note of its own, since it touches `core.ts`.

### Chosen versions

| Tool | Version | Why not newer |
|---|---|---|
| TypeScript | **5.9.3** | TS 6.0 and 7.0 (the Go port) exist, but typescript-eslint 8 caps at `<6.1`, and TS 7 does not yet expose the compiler API that SQL inference (evolution no. 1) will need. To be reassessed before raw SQL inference (⑪, [#62](https://github.com/AlexandreDemartin/pgcast/issues/62)). Consumers stay free (`peerDependency typescript >=4.1`, unchanged). |
| ESLint | **9.39** (native flat config) | `eslint-plugin-import` does not yet declare ESLint 10. |
| typescript-eslint | **8.72** | `member-delimiter-style` and `semi` have moved to `@stylistic/eslint-plugin`: same rules, same configuration. |
| Vitest | **4.1** | Vitest 5 requires Node ≥ 22.12 and would drop Node 20 from the matrix. |
| Node | dev: `^20.19` or `>=22.12`; published package: **no `engines`** | Zapatos 6.6.1 declared none; adding one would make installation fail under Yarn 1 for a Node 18 user (review of PR #1). Node 20 has been EOL since April 2026 but stays in the CI matrix while it costs nothing. |

## Tests: options

| Need | Proposed choice | Alternatives rejected |
|---|---|---|
| Runner | **Vitest 4** | Jest (heavier ESM/TS), `node:test` (no inline snapshots nor built-in typecheck). |
| Type tests | **`expectTypeOf` + `vitest --typecheck`** (`*.test-d.ts` files), plus `@ts-expect-error` for negative cases | `tsd` (separate runner, poorer integration). `expect-type` stays as a devDep for direct use. |
| Postgres | **No Docker.** Locally, an existing instance through `TEST_DATABASE_URL` (read from `src/.env`, ignored by git). In CI, GitHub Actions **service containers** (14, 16 and latest stable). | docker-compose (pointless here), Testcontainers (slow, heavy dependency), PGlite alone (it is not the real server, but it will serve as a second driver with the driver interface, ⑦, [#58](https://github.com/AlexandreDemartin/pgcast/issues/58)). |
| Isolation | One ephemeral database per test file (`CREATE DATABASE … TEMPLATE pgcast_fixture`), then one rolled-back transaction per test. | One schema per test (incompatible with the multi-schema fixture). |
| Snapshots | File snapshots for the codegen (`test/__snapshots__/schema.d.ts.snap`), inline snapshots for compiled SQL. | — |
| Type bench | `tsc --noEmit --extendedDiagnostics -p bench/` on a sample project. The *Check time* and the number of *Instantiations*, which are more stable than time, are compared with `bench/baseline.json`. Fails beyond +20 %. | Hyperfine (measures only time, too noisy in CI). |

## Consequences

- Phase 0 changes no behaviour: the build output is byte-identical.
- `vitest` and `expect-type` are installed in phase 0, with a smoke test, so that `test` and `test:types` are real commands. Phase 1 adds no new dependency: `pg` is already there.

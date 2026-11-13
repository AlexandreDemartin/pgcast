# 002 — Module names: `zapatos/*` or `pgcast/*`

- **Status**: accepted (2026-11-11): option A now, option C as the target; update proposed 2026-11-13: option C first, with the names `pgcast/*` ([#364](https://github.com/AlexandreDemartin/pgcast/issues/364)), waiting for the owner (§ Update (2026-11-13))
- **Date**: 2026-11-11

## Context

The package is now called `pgcast`. But the name `zapatos` is not only a brand: it is a **module name**, used in three places:

1. **The generated code** (`zapatos/schema.d.ts`) contains:
   ```ts
   declare module 'zapatos/schema' {
     import type * as db from 'zapatos/db';          // ← real resolution in node_modules
     import type * as c from 'zapatos/custom';
     …
   }
   ```
2. **The compiled runtime** (`dist/db/*.d.ts`) imports `import type { … } from 'zapatos/schema'`. This module is *ambient*, provided by the generated file, so it works whatever the package's name.
3. **User code** imports `zapatos/db` and `zapatos/schema`.

Consequence: if `pgcast` is installed under its own name, `import 'zapatos/db'` no longer resolves and the generated types break.

## Options

| Option | User migration | Codegen output | Risk |
|---|---|---|---|
| **A. npm alias, names unchanged**: `npm i zapatos@npm:pgcast` | **None**: one line of `package.json` changes, nothing else. | Unchanged | None. Drawback: the name `pgcast` never appears in imports. |
| B. Native `pgcast/*` names | Change the imports (`zapatos/db` → `pgcast/db`) and regenerate. | Changes (`declare module 'pgcast/schema'`…) | Medium: two module names to keep side by side in the docs and in the issues. |
| **C. A + B: two names, opt-in**: the package exports `pgcast/db`, and a config option `moduleName: 'zapatos' \| 'pgcast'` (default `'zapatos'`) chooses the names the codegen emits. | None by default. New projects can write `pgcast/*`. | Unchanged by default, opt-in otherwise | Low, but for one subtlety: `src/db` imports `'zapatos/schema'`. In `pgcast` mode, the generated file would have to declare **both** ambient modules (`pgcast/schema`, which re-exports, and `zapatos/schema`); this remains to be prototyped and tested. |

## Proposed choice

**A at once, C later.**

- Phase 0: no `zapatos/*` string is touched. The README documents installing `zapatos@npm:pgcast`, which keeps the promise "change the import without rewriting your code". The CLI is called `pgcast`, with the alias `zapatos`.
- After phase 1 (codegen snapshots in place): prototype C in a dedicated PR, with the default mode's snapshot unchanged and a new snapshot for `pgcast` mode.

## Validation

Validated by the user on 2026-11-11: A now, C as the target.

## Update (2026-11-13)

The sections above are the history of 2026-11-11. The owner now wants option C first: a new project installs pgcast and imports `pgcast/*`, never `zapatos`.

### Context

- npm refused the unscoped name `pgcast` (too close to `recast`): 6.6.2 is published as `@pgcast/pgcast`.
- An alias puts it in `node_modules/pgcast`, where `pgcast/db` resolves. Once npm grants `pgcast`, only the install line changes.
- `src/db`'s compiled declarations import the ambient `'zapatos/schema'` (`dist/db/core.d.ts`, `shortcuts.d.ts`, `conditions.d.ts`).

### Proposed choice

| Subject | Proposal |
|---|---|
| Module names | `pgcast/db`, `pgcast/schema`, `pgcast/custom`, and `pgcast/generate` for the generator's API. |
| Install, today | `npm install pgcast@npm:@pgcast/pgcast`; `pnpm add pgcast@npm:@pgcast/pgcast`; `bun add pgcast@npm:@pgcast/pgcast` (not tried); `yarn add pgcast@npm:@pgcast/pgcast@^6.6.2` (Yarn 4 refuses an alias with no range). |
| Install, once `pgcast` is granted | `npm install pgcast`: no import changes. |
| Codegen option | `moduleNames: 'zapatos' \| 'pgcast'`, optional, read with `?? 'zapatos'` like `typeEnumsAcrossSchemas`, so a `CompleteConfig` written for 6.6.1 still compiles. |
| Default (`'zapatos'`) | Output byte-identical to `master`: no snapshot changes. |
| `'pgcast'` | Writes `pgcast/schema.d.ts` and `pgcast/custom/*.d.ts`, declares `pgcast/schema` and `pgcast/custom`, imports `pgcast/db`, and the canary comment says `npx pgcast`. |
| `exports` | Gains nothing: `pgcast/db` and `pgcast/generate` resolve through `./db` and `./generate`, as `zapatos/db` does. `./schema` and `./custom` stay absent: they are ambient. No `typesVersions`: `moduleResolution: node10` resolves through the root shims `db.d.ts` and `generate.d.ts`. |
| CLI | `npx pgcast` already exists (`bin`); it reads `moduleNames` from `zapatosconfig.json` like any other option. |
| Docs | Lead with `pgcast`: the install line, `pgcast/*` imports and `moduleNames: 'pgcast'` in the config. The page on switching from Zapatos keeps `zapatos@npm:@pgcast/pgcast`, with no other change. |

- Why `moduleNames`: config keys name what they set (`outDir`, `schemas`, `enumOrder`), with a union of literals for a choice (`enumOrder: 'alphabetical' | 'declared'`). Plural: it sets three module names and the folder. The 2026-11-11 table said `moduleName`.
- The value must match the folder in `node_modules`: `'pgcast'` with the `pgcast` install, `'zapatos'` with the `zapatos` alias.

### What `'pgcast'` mode declares

The generated `pgcast/schema.d.ts` ends with a second ambient module, for `src/db`'s declarations:

```ts
declare module 'pgcast/schema' {
  import type * as db from 'pgcast/db';
  import type * as c from 'pgcast/custom';
  …
}

// pgcast/db's declarations import 'zapatos/schema'
declare module 'zapatos/schema' {
  export * from 'pgcast/schema';
}
```

- **Without it, types silently become `any`**: `zapatos/schema` does not resolve in `node_modules/pgcast/dist/db/*.d.ts`. With `skipLibCheck: true` there is no error at all; `select()` returns `any` and every wrong table or column compiles.
- `export *` re-exports the namespaces (`film.Selectable`) and the lookups (`SelectableForTable`). It is older syntax than `export type *` (TypeScript 5.0); not tried below 5.9.
- The `zapatos` strings left in a `'pgcast'` project: this shim, and the header's credit to Zapatos.

### Projects

- **From Zapatos**: nothing. `zapatos@npm:@pgcast/pgcast`, default `moduleNames`, same output.
- **New project**: the `pgcast` install, `moduleNames: 'pgcast'`, imports `pgcast/db` and `pgcast/schema`.
- **Switching an existing project to `'pgcast'`**: change the dependency to `pgcast@npm:@pgcast/pgcast`, set the option, regenerate, move edited files from `zapatos/custom/` to `pgcast/custom/` (renaming `declare module 'zapatos/custom'`), delete `zapatos/`, replace the imports.
- **A stale `zapatos/` folder** next to `pgcast/` merges into `zapatos/schema` and loses its types, silently under `skipLibCheck`. Proposed: the generator warns when it finds the other mode's folder.

### Alternatives considered

| Alternative | Why not |
|---|---|
| `@pgcast/pgcast/db`, `@pgcast/pgcast/schema` | Refused by the owner: the scope would stay in every import. |
| A second, unscoped package that re-exports `@pgcast/pgcast` | Two packages to publish and keep in step, for a name npm may grant anyway. |
| Ask npm support for `pgcast` | Not exclusive: the owner can ask in parallel. If granted, only the install line changes. |
| Change `src/db` to import `pgcast/schema` | Every Zapatos-mode schema would then have to declare `pgcast/schema`: the default output changes. |
| Infer the mode from the package's folder (`moduleRoot()`) | Implicit, and wrong when the CLI runs from another install (`npx` cache). |
| Generate `zapatos/schema` in full, `pgcast/schema` re-exporting it | Works the same; go-to-definition would land on `zapatos/schema`. |

### Prototype

On 2026-11-13, with `master` packed and installed as `pgcast` (npm 10, pnpm 12), and a copy of `dist/generate` patched to read `moduleNames`: a typed `select` with `lateral`, an `insert` and negative cases compiled under TypeScript 5.9.3 and 7.0.2, strict on and off, CJS and ESM (`nodenext`), and ran against Postgres. The published 6.6.2 also installed through the alias with npm, pnpm and Yarn 4 (`nodeLinker: node-modules`). Commands and outputs: the Proofs of [#367](https://github.com/AlexandreDemartin/pgcast/pull/367).

- `lateral`, `columns`, `returning` and `extras` need `strictNullChecks`, in both modes, as in Zapatos (`docs/index.html`): strict off was proven with a `select` and an `insert`.
- TypeScript 7 removed `moduleResolution: node10`; `module: commonjs` passes there.

### Questions for the owner

1. The names `pgcast/*`, and `moduleNames: 'zapatos' | 'pgcast'`?
2. The `zapatos/schema` shim in the generated file, and the warning for a stale folder?
3. The config file: also read `pgcastconfig.json`, first if both exist? Proposed as its own small PR, after this one.

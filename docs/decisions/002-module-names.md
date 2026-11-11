# 002 — Module names: `zapatos/*` or `pgcast/*`

- **Status**: accepted (2026-11-11): option A now, option C as the target
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

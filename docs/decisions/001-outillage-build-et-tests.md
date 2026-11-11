# 001 — Outillage : build et tests

- **Statut** : accepté (2026-11-11)
- **Date** : 2026-11-11
- **Portée** : phase 0 (build) et phase 1 (tests)

## Contexte

Zapatos 6.6.1 compile en **CommonJS** (`tsc`, `target ES2019`) puis génère des wrappers ESM (`db.mjs`, `generate.mjs`) avec `gen-esm-wrapper`. Le champ `exports` du `package.json` pointe `require` vers les `.js` et `import` vers les `.mjs`, qui réexportent le module CJS.

Le runtime expose des **valeurs identitaires** : les symboles `Default`, `self` et `all`, et les classes `Parameter`, `SQLFragment`, `ColumnNames`, `ParentColumn`… La compilation repose sur `instanceof` et `===` (`core.ts`, `compileExpression`). Si deux copies du runtime coexistaient dans un même process, l'une chargée via `require` et l'autre via `import`, `db.Default` de l'une ne serait pas reconnu par l'autre. Une partie des valeurs tomberait alors silencieusement dans la branche « Whereable ». C'est le *dual package hazard*.

## Build : options

| Option | Pour | Contre |
|---|---|---|
| **A. Garder CJS + wrapper ESM** (`tsc` + `gen-esm-wrapper`) | Une seule copie du runtime, donc aucun dual package hazard. Sortie **identique à l'octet** à 6.6.1 (vérifié). Zéro risque pour les consommateurs. | Pas de tree-shaking ESM (impact négligeable : ~3 kLoC). Wrapper `.mjs` à régénérer quand un export est ajouté (automatique au build). |
| B. Dual build `tsup` (CJS + ESM natifs) | ESM natif, bundling. | **Deux copies du runtime**, donc hazard réel sur `Default`, `self`, `all` et `instanceof`. Il faudrait enregistrer les symboles via `Symbol.for` et remplacer `instanceof` par des marqueurs, ce qui toucherait `core.ts`, une zone sensible. Nouvelle dépendance de build. |
| C. `tsc` ×2 (CJS + ESM) | Pas d'outil tiers. | Même hazard que B. Deux tsconfig à maintenir. |
| D. ESM pur + `require(esm)` (Node ≥ 22.12 / 20.19) | Le plus moderne. | Rupture pour les consommateurs CJS sur d'anciens Node ou bundlers. Hors périmètre « aucun changement cassant ». |

**Choix proposé : A.** Les seuls changements de la phase 0 sont TypeScript 5.9.3 et l'appel des binaires sans `npx`. La sortie `dist/`, `db.mjs` et `generate.mjs` est identique à l'octet à celle de 6.6.1, et `npm pack --dry-run` liste les mêmes 51 fichiers. Si l'on veut un ESM natif un jour, il faudra d'abord rendre le runtime robuste au hazard (`Symbol.for` et des *brands* à la place d'`instanceof`), ce qui fera l'objet d'une note à part puisque cela touche `core.ts`.

### Versions retenues

| Outil | Version | Pourquoi pas plus récent |
|---|---|---|
| TypeScript | **5.9.3** | TS 6.0 et 7.0 (le portage en Go) existent, mais typescript-eslint 8 plafonne à `<6.1` et TS 7 n'expose pas encore l'API compilateur dont aura besoin l'inférence SQL (évolution n°1). À réévaluer avant l'inférence du SQL brut (`docs/ROADMAP.md`, étape ⑪). Les consommateurs restent libres (`peerDependency typescript >=4.1`, inchangée). |
| ESLint | **9.39** (flat config natif) | `eslint-plugin-import` ne déclare pas encore ESLint 10. |
| typescript-eslint | **8.72** | `member-delimiter-style` et `semi` ont migré vers `@stylistic/eslint-plugin` : mêmes règles, même configuration. |
| Vitest | **4.1** | Vitest 5 exige Node ≥ 22.12 et ferait sortir Node 20 de la matrice. |
| Node | dev : `^20.19` ou `>=22.12` ; paquet publié : **aucun `engines`** | Zapatos 6.6.1 n'en déclarait pas ; en ajouter un ferait échouer l'install sous Yarn 1 chez un utilisateur de Node 18 (relecture de la PR #1). Node 20 est EOL depuis avril 2026 mais reste dans la matrice CI tant que ça ne coûte rien. |

## Tests : options

| Besoin | Choix proposé | Alternatives écartées |
|---|---|---|
| Runner | **Vitest 4** | Jest (ESM/TS plus lourd), `node:test` (pas de snapshots inline ni de typecheck intégré). |
| Tests de types | **`expectTypeOf` + `vitest --typecheck`** (fichiers `*.test-d.ts`), plus `@ts-expect-error` pour les cas négatifs | `tsd` (runner séparé, moins bonne intégration). `expect-type` reste en devDep pour l'usage direct. |
| Postgres | **Pas de Docker.** En local, une instance existante via `TEST_DATABASE_URL` (lue depuis `src/.env`, ignoré par git). En CI, des **service containers** GitHub Actions (14, 16 et dernière stable). | docker-compose (inutile ici), Testcontainers (lent, dépendance lourde), PGlite seul (ce n'est pas le vrai serveur, mais il servira de second driver à l'étape ⑥ de `docs/ROADMAP.md`). |
| Isolation | Une base éphémère par fichier de test (`CREATE DATABASE … TEMPLATE pgcast_fixture`), puis une transaction annulée par test. | Un schéma par test (incompatible avec la fixture multi-schémas). |
| Snapshots | Snapshots fichier pour le codegen (`test/__snapshots__/schema.d.ts.snap`), snapshots inline pour le SQL compilé. | — |
| Bench types | `tsc --noEmit --extendedDiagnostics -p bench/` sur un projet exemple. On compare le *Check time* et le nombre d'*Instantiations*, qui sont plus stables que le temps, à `bench/baseline.json`. Échec au-delà de +20 %. | Hyperfine (ne mesure que le temps, trop bruité en CI). |

## Conséquences

- La phase 0 ne change aucun comportement : sortie de build identique à l'octet.
- `vitest` et `expect-type` sont installés dès la phase 0, avec un smoke test, pour que `test` et `test:types` soient de vraies commandes. La phase 1 n'ajoute aucune nouvelle dépendance : `pg` est déjà là.

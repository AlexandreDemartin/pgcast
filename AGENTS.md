# AGENTS.md — pgcast

> `CLAUDE.md` est un lien symbolique vers ce fichier. Lis-le en entier avant toute modification.

**pgcast** est un fork maintenu de [Zapatos](https://github.com/jawj/zapatos) 6.6.1 (MIT, George MacKerron).
Le nom joue sur deux sens : en Postgres, un *cast* (`::type`) donne un type à une valeur ; en anglais, *cast* désigne aussi un moulage. Les types TypeScript sont **moulés sur le schéma de la base**, sans jamais être écrits à la main.

Objectifs : moderniser, tester, puis étendre, **sans trahir la philosophie** et en restant **rétrocompatible avec Zapatos 6.6.1**.
La roadmap est dans [docs/ROADMAP.md](docs/ROADMAP.md) et les décisions dans [docs/decisions/](docs/decisions/).

## Philosophie (non négociable)

1. **La base de données est la seule source de vérité.** Tout ce qui est typé ou validé est déduit de Postgres (`pg_catalog`, `information_schema`, `COMMENT ON`), jamais déclaré à la main côté TS.
2. **Pas d'ORM.** Pas de modèles, pas de classes d'entités, pas de relations déclarées en code, pas d'état caché, pas de lazy loading.
3. **Le SQL reste visible et prévisible.** Chaque helper produit un SQL lisible, unique et documenté. On peut toujours redescendre au template `sql`.
4. **Surface minimale.** Ce qui peut vivre dans un package séparé ou rester opt-in doit l'être. Aucune nouvelle dépendance runtime obligatoire (Zod/Valibot en peer dependency optionnelle).
5. **Le codegen reste un simple CLI** qui lit la base et écrit des fichiers `.d.ts` / `.ts`.

Si une demande viole un de ces points : **s'arrêter et le signaler** au lieu de l'implémenter.

## Architecture

```
Postgres ──(introspection SQL)──► src/generate/ ──(écrit)──► zapatos/schema.d.ts  (declare module 'zapatos/schema')
                                                              zapatos/custom/*.d.ts (placeholders éditables)
                                                                     │ types ambiants
                                                                     ▼
code utilisateur ──► src/db/ (runtime : sql``, shortcuts, conditions, transactions) ──► pg (node-postgres)
```

- `src/generate/` : le codegen (CLI `pgcast`, alias `zapatos`).
  - `cli.ts` lit `zapatosconfig.json` et/ou un argument JSON, et interpole `{{ENV_VAR}}`.
  - `config.ts` contient la config et ses défauts.
  - `write.ts` (`generate()`) écrit `zapatos/schema.d.ts` et les placeholders `zapatos/custom/`.
  - `tsOutput.ts` assemble le module `zapatos/schema` (namespaces par schéma, types agrégés, lookups `*ForTable<T>`, version canary).
  - `tables.ts` introspecte les relations, colonnes, index uniques et commentaires, puis produit `Selectable`, `JSONSelectable`, `Whereable`, `Insertable`, `Updatable` par table.
  - `enums.ts` et `pgTypes.ts` font le mapping des types Postgres vers TS (selon le contexte Selectable, Insertable, etc.).
  - `legacy.ts` affiche l'avertissement de migration depuis l'ancien « srcMode ».
- `src/db/` : le runtime (import `zapatos/db`).
  - `core.ts` : ⚠️ **zone sensible** : `sql`, `SQLFragment`, compilation et échappement (`param`, `raw`, `cols`, `vals`, `parent`, `self`, `Default`).
  - `shortcuts.ts` : `insert`, `upsert`, `update`, `deletes`, `truncate`, `select*`, agrégats, `lateral`, verrous.
  - `conditions.ts` : `eq`, `like`, `isIn`, `or`/`and`/`not`, opérateurs de tableaux…
  - `transaction.ts` : niveaux d'isolation typés et retry sur erreur de sérialisation ou de deadlock.
  - `date.ts`, `customJSON.ts`, `pgErrors.ts`, `config.ts`, `canary.ts`, `utils.ts`.
- `src/typings/zapatos/schema.ts` : schéma factice qui ne sert qu'à compiler `src/db` (via `paths` dans tsconfig).
- `db.{js,mjs,d.ts}` et `generate.{js,mjs,d.ts}` : shims racine. Les `.mjs` sont **générés** par `gen-esm-wrapper` au build.

### Point d'attention : noms de modules

Le code généré et le runtime parlent de `zapatos/schema`, `zapatos/db` et `zapatos/custom`. Ce sont des **noms de modules résolus à l'exécution et à la compilation**, pas une simple question de marque. Tant que [docs/decisions/002-noms-de-modules.md](docs/decisions/002-noms-de-modules.md) n'est pas tranché, **ne renomme aucune de ces chaînes**.

## Commandes

| Commande | Rôle |
|---|---|
| `npm ci` | installation (npm ≥ 10) |
| `npm run build` | `tsc` (CJS, ES2019) + wrappers ESM |
| `npm run lint` | ESLint 9 (flat config) sur `src/` |
| `npm run typecheck` | `tsc --noEmit` sur la lib et sur `test/` |
| `npm test` | Vitest (runtime) |
| `npm run test:watch` | Vitest en watch |
| `npm run test:types` | tests de types Vitest (`*.test-d.ts`, `expectTypeOf`) |
| `npm run bench:types` | benchmark du temps de compilation (arrive en phase 1) |

Une tâche n'est **terminée** que si `lint`, `typecheck`, `test` et `test:types` passent.

## Règles de travail

- **Lire le code concerné avant de modifier**, et résumer ce qu'on a compris.
- **Tests d'abord**, ou au minimum avec l'implémentation : runtime, SQL compilé (`text` et `values`) et types (cas positifs **et** négatifs avec `@ts-expect-error`).
- **Une fonctionnalité = une branche = une PR** sur `AlexandreDemartin/pgcast`. Commits petits et atomiques au format Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`…).
- **Aucun changement cassant** sur l'API publique. Si c'est inévitable, on s'arrête et on demande.
- **`core.ts` (échappement, paramétrisation, compilation des identifiants)** : ne jamais y toucher sans le signaler explicitement. Chaque changement ajoute des tests d'injection SQL.
- **Types avancés** : surveiller le temps de compilation (`bench:types`, seuil +20 %). Un type qui compile n'est pas forcément correct.
- Mettre à jour `CHANGELOG.md` et la doc à chaque fonctionnalité.
- Garder les en-têtes de copyright existants (George MacKerron). Les nouveaux fichiers peuvent porter `Copyright (C) 2026 Alexandre Demartin`.
- Décision de conception ambiguë : rédiger `docs/decisions/NNN-titre.md` (contexte, options, choix proposé) et **demander validation avant d'implémenter**.

## Points d'arrêt obligatoires (on s'arrête et on demande)

- Avant tout changement de l'API publique ou de la sortie du codegen (hors ajout opt-in).
- Avant toute modification de l'échappement ou de la compilation SQL dans `core.ts`.
- À chaque note de décision.
- Si le benchmark de compilation dépasse le seuil.
- Avant toute publication npm ou création de release. Le script `postversion` d'origine, qui publiait automatiquement, a été retiré.

## Environnement local

- Node ≥ 20 (le dev courant se fait en Node 22).
- Avec npm 10, `npm install <pkg>` peut planter sur les peer deps de Vitest (`Cannot read properties of null (reading 'edgesOut')`). Dans ce cas, utiliser `npx npm@11 install …`. `npm ci` fonctionne normalement.
- Postgres pour les tests : **pas de Docker**. On utilise une instance locale via `TEST_DATABASE_URL`, définie dans `src/.env` (ignoré par git, ne jamais le commiter). En CI, ce sont des service containers GitHub Actions.

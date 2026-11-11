# Suivi des étapes

La référence de ce qu'il reste à faire, branche par branche, dans l'ordre. L'ordre et son pourquoi : [ROADMAP.md](./ROADMAP.md) ; les décisions : [decisions/](./decisions/).

## Mode d'emploi

- **Ce fichier dit l'état réel de `master`.**
- **Une branche = une PR**, dans l'ordre ; la prochaine est la première dont **Livrée** n'est pas cochée.
- **Jamais d'étape suivante tant que les cases des précédentes ne sont pas cochées.** Une case qui ne se fera pas se raye avec sa raison (`~~…~~ : pourquoi`).
- **La PR coche ses propres cases**, dans le dernier commit avant la fusion, par l'orchestrateur (skill `run-step`).
- Une idée nouvelle ne s'ajoute pas ici : elle va dans [ROADMAP.md](./ROADMAP.md), et devient une étape au début de son chapitre.
- Un chapitre futur n'a que ses titres ; ses étapes se détaillent quand il commence.
- Une étape livrée se réduit à **Livrée** et **But** à la fin de son chapitre.

### Gabarit d'une étape

Toujours les mêmes clés, dans cet ordre ; une clé absente ne s'applique pas.

| Clé | Contenu |
|---|---|
| **Livrée** | la case, avec sa PR |
| **But** | une phrase |
| **Touche** | `src/db`, `src/generate`, `test`, `docs`, CI |
| **Relecture** | `faible`, `normal` ou `élevé`, la lentille, les points bloquants (skill `run-step`) |
| **Lire** | les skills à lire avant |
| **Standard** | la référence du marché, s'il y en a une |
| **Compat** | effet sur Zapatos 6.6.1 : aucun, opt-in, ou point d'arrêt (skill `backward-compat`) |
| **Tâches** | cases à cocher |
| **Vérifier** | les commandes à passer en plus de `lint`, `typecheck`, `test`, `test:types`, `build` |

## 0. Fork

> **Résultat** : le fork se construit à l'identique de 6.6.1, avec un outillage à jour et une méthode de travail.

### 0.1 `chore/fork-setup` — renommage, outillage, CI, notes 001 et 002

- [x] **Livrée** : PR #1
- **But** : `pgcast` se construit à l'octet près comme Zapatos 6.6.1, avec TypeScript 5.9, ESLint 9, Vitest 4.

### 0.2 `chore/agent-workflow` — méthode de travail des agents

- [x] **Livrée** : PR #2
- **But** : skills, agents `builder` / `branch-reviewer` / `chores`, hook `guard`, `check:agents`, ce suivi.
- **Relecture** : `faible`.

## 1. Caractérisation

> **Résultat** : chaque comportement de 6.6.1 est figé par un test ; rien ne change de comportement ; un rapport liste les bugs trouvés, sans les corriger.

### 1.1 `test/harness` — base de test, fixture, CI Postgres

- [ ] **Livrée**
- **But** : une base éphémère par fichier de test, une transaction annulée par test, sur un schéma de référence riche.
- **Touche** : `test`, CI.
- **Relecture** : `normal` ; bloquant : une base hors de celles créées par les tests touchée, un test qui dépend de l'ordre d'exécution.
- **Lire** : `simple-big-wins`, `type-tests`.
- **Compat** : aucun.
- **Tâches** :
  - [ ] `test/fixtures/schema.sql` : plusieurs schémas, enums, domaines, composites, `jsonb`, tableaux, ranges, `int8` / `numeric`, colonnes générées, `DEFAULT`, identity, vues, vues matérialisées, foreign table (`file_fdw`), table partitionnée, index uniques multi-colonnes, FK simples / composites / auto-référentes / multiples vers la même table, fonctions SQL et PL/pgSQL (scalaire, `SETOF`, `RETURNS TABLE`, `OUT`, `VARIADIC`, surcharge), `COMMENT ON`, identifiants à guillemets.
  - [ ] `globalSetup` : `TEST_DATABASE_URL` lu depuis `src/.env` ou l'environnement ; base modèle créée depuis la fixture.
  - [ ] Helper : base par fichier (`CREATE DATABASE … TEMPLATE`), supprimée à la fin ; client par test en `BEGIN` / `ROLLBACK`.
  - [ ] Tests unitaires sans base toujours lancés ; tests d'intégration en échec clair sans `TEST_DATABASE_URL`.
  - [ ] CI : service Postgres 14, 16 et 18 × Node 20, 22 et LTS.
- **Vérifier** : `npm test` deux fois de suite (rien ne fuit entre runs).

### 1.2 `test/codegen-snapshots` — sortie du codegen figée

- [ ] **Livrée**
- **But** : le `schema.d.ts` généré depuis la fixture est figé par snapshot, et compile.
- **Relecture** : `normal`, lentille `codegen`.
- **Lire** : `codegen-output`.

### 1.3 `test/compiled-sql` — SQL de chaque shortcut et condition

- [ ] **Livrée**
- **But** : `text` + `values` de chaque shortcut et de chaque condition figés, puis exécutés contre Postgres.
- **À caractériser en priorité** (vus dans Project A et Project B ou à la lecture) : `and()` / `or()` sans argument, `isIn([])`, clé `undefined` dans un `Whereable` ou un `Updatable`, `update` sans colonne, `min` / `max` sur une date ou un texte (`Number()` du résultat), conditions de tableau sur une colonne tableau, ordre des colonnes d'un `insert`.
- **Relecture** : `normal`, lentille `sql`.
- **Lire** : `zero-abstraction`, `sql-safety`.

### 1.4 `test/types-and-injection` — tests de types et d'injection

- [ ] **Livrée**
- **But** : types publics testés en positif et en négatif sur le schéma de la fixture ; entrées hostiles testées sur chaque point d'entrée de `core.ts`.
- **Relecture** : `normal`, lentilles `types` et `sql`.
- **Lire** : `type-tests`, `sql-safety`.

### 1.5 `test/bench-types` — coût de compilation

- [ ] **Livrée**
- **But** : `npm run bench:types` mesure `Instantiations` sur un projet exemple, compare à la référence, échoue au-delà de +20 % ; branché en CI.
- **Relecture** : `normal`.
- **Lire** : `type-tests`.

### 1.6 `docs/characterization-report` — rapport des bugs et surprises

- [ ] **Livrée**
- **But** : chaque comportement surprenant trouvé en 1.1–1.5, avec son test de caractérisation et une proposition ; rien n'est corrigé.
- **Relecture** : `faible`.
- **Lire** : `backward-compat`, `consumer-usage`.

## 2. Correctifs

> Détaillé à partir du rapport 1.6 : une étape par bug, chacune avec un test qui échoue d'abord.

## 3. Le schéma et les conditions

> Titres seulement, détaillés au début du chapitre ; l'ordre et le pourquoi : [ROADMAP.md](./ROADMAP.md) (v2).

- 3.1 ① `--check` et `--watch`, avec un modèle intermédiaire de l'introspection
- 3.2 ② Conditions : `isInSelect`, `exists`, tableaux typés sur la colonne, `jsonbContains`, `jsonbPathExists`, full-text
- 3.3 ③ Clés étrangères, `related` / `relatedMany`, référence typée au résultat d'un lateral (note de décision d'abord)
- 3.4 ④ Domaines `CHECK` en unions littérales, validateurs Zod / Valibot, `jsonb` par `COMMENT ON` (note de décision d'abord)
- 3.5 ⑤ Fonctions Postgres typées
- 3.6 ⑥ Alias de table typés et `with`

## 4. Runtime

- 4.1 ⑦ Interface de driver (relecture `élevé`)
- 4.2 ⑧ Savepoints, `advisoryXactLock`, retry structuré
- 4.3 ⑨ Contexte RLS
- 4.4 ⑩ Streaming par curseur

## 5. Inférence du SQL brut

- 5.1 ⑪ Note de conception, puis implémentation si validée

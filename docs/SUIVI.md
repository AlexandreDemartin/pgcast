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

- [x] **Livrée** : PR #3
- **But** : une base éphémère par fichier de test, une transaction annulée par test, sur un schéma de référence riche.
- **Touche** : `test`, CI.
- **Relecture** : `normal` ; bloquant : une base hors de celles créées par les tests touchée, un test qui dépend de l'ordre d'exécution.
- **Lire** : `simple-big-wins`, `type-tests`.
- **Compat** : aucun.
- **Tâches** :
  - [x] `test/fixtures/schema.sql` : plusieurs schémas, enums, domaines, composites, `jsonb`, tableaux, ranges, `int8` / `numeric`, colonnes générées, `DEFAULT`, identity, vues, vues matérialisées, foreign table (`file_fdw`), table partitionnée, index uniques multi-colonnes, FK simples / composites / auto-référentes / multiples vers la même table, fonctions SQL et PL/pgSQL (scalaire, `SETOF`, `RETURNS TABLE`, `OUT`, `VARIADIC`, surcharge), `COMMENT ON`, identifiants à guillemets.
  - [x] `globalSetup` : `TEST_DATABASE_URL` lu depuis `src/.env` ou l'environnement ; base modèle créée depuis la fixture.
  - [x] Helper : base par fichier (`CREATE DATABASE … TEMPLATE`), supprimée à la fin ; client par test en `BEGIN` / `ROLLBACK`.
  - [x] Tests unitaires sans base toujours lancés ; tests d'intégration en échec clair sans `TEST_DATABASE_URL`.
  - [x] CI : service Postgres 14, 16 et 18 × Node 20, 22 et LTS.
- **Vérifier** : `npm test` deux fois de suite (rien ne fuit entre runs).

### 1.2 `test/codegen-snapshots` — sortie du codegen figée

- [x] **Livrée** : PR #4
- **But** : le `schema.d.ts` généré depuis la fixture est figé par snapshot, et compile.
- **Relecture** : `normal`, lentille `codegen`.
- **Lire** : `codegen-output`.

### 1.3 `test/compiled-sql` — SQL de chaque shortcut et condition

- [x] **Livrée** : PR #5
- **But** : `text` + `values` de chaque shortcut et de chaque condition figés, puis exécutés contre Postgres.
- **À caractériser en priorité** (vus dans Belco et Bienvenue ou à la lecture) : `and()` / `or()` sans argument, `isIn([])`, clé `undefined` dans un `Whereable` ou un `Updatable`, `update` sans colonne, `min` / `max` sur une date ou un texte (`Number()` du résultat), conditions de tableau sur une colonne tableau, ordre des colonnes d'un `insert`.
- **Relecture** : `normal`, lentille `sql`.
- **Lire** : `zero-abstraction`, `sql-safety`.

### 1.4 `test/types` — types publics sur un schéma réel

- [x] **Livrée** : PR #7
- **But** : types publics testés en positif et en négatif sur le schéma généré de la fixture ; chaque variante du codegen compile.
- **Relecture** : `normal`, lentille `types`.
- **Lire** : `type-tests`, `zapatos-spirit`.

### 1.5 `test/injection` — entrées hostiles

- [x] **Livrée** : PR #8
- **But** : entrées hostiles testées sur chaque point d'entrée de `core.ts`, compilées et exécutées.
- **Relecture** : `normal`, lentille `sql`.
- **Lire** : `sql-safety`, `zapatos-spirit`.

### 1.6 `test/bench-types` — coût de compilation

- [x] **Livrée** : PR #10
- **But** : `npm run bench:types` mesure `Instantiations` sur un projet exemple, compare à la référence, échoue au-delà de +20 % ; branché en CI.
- **Relecture** : `normal`.
- **Lire** : `type-tests`.

### 1.7 `docs/characterization-report` — rapport des bugs et surprises

- [x] **Livrée** : PR #11
- **But** : chaque comportement surprenant trouvé en 1.1–1.6, avec son test de caractérisation et une proposition ; rien n'est corrigé.
- **Relecture** : `faible`.
- **Lire** : `backward-compat`, `consumer-usage`.

## 2. Correctifs

> Une étape par constat à corriger du [rapport](./RAPPORT-CARACTERISATION.md), dans l'ordre : gravité, puis risque croissant. Chacune commence par un test qui échoue. Classe de chaque correctif (note [003](./decisions/003-correctifs-et-depreciation.md)) : **(opt-in)** = option de config + `DeprecationWarning` de l'ancien comportement ; sans mention = correctif direct. Relecture `élevé` pour `core.ts`.

- 2.1 Check lock, truncate and isolation level keywords at run time (R5)
- 2.2 Accept only a function name as the aggregate of select() (R6)
- 2.3 Escape quotes in the type name of a param() cast (R3)
- 2.4 Double embedded quotes in identifiers, so a name cannot close its quotes (R1)
- 2.5 Double embedded quotes in lateral keys and aliases too (R7)
- 2.6 Pass a string through as already quoted only if it is a well-formed quoted identifier (R2)
- 2.7 Send plain updateValues in upsert as parameters, not identifiers (R4)
- 2.8 Add upsertUpdatesSharedColumnsOnly, so rows with different keys keep what they leave out (R8) **(opt-in)**
- 2.9 Make update() with no columns throw a helpful error (R24, avant R9)
- 2.10 Add undefinedMeansMissing, so undefined acts as a missing key in update() and insert() (R9, R11) **(opt-in)**
- 2.11 Fix not() so it parenthesises its condition (R12)
- 2.12 Compile a Parameter in a Whereable or in vals() as a parameter, not as JSON (R13)
- 2.13 Add selectExactlyOneChecksForSecondRow (R14) **(opt-in)**
- 2.14 Make and() and or() with no arguments compile to TRUE and FALSE (R23)
- 2.15 Refuse aggregate options that cannot compile (R25)
- 2.16 Treat a native pg client as a client, not a pool, in transaction() (R26)
- 2.17 Let an explicit param() cast win over castArrayParamsToJson (R27)
- 2.18 Allow schema-qualified and array types in param() casts (R28)
- 2.19 Refuse a constraint of another table in upsert (R32)
- 2.20 Allow a Parameter in add() and subtract(), for date arithmetic (R33)
- 2.21 Type the array conditions on the array column, not on its element (R34)
- 2.22 Accept a readonly array as the columns option (R35)
- 2.23 Warn when two custom types share a placeholder name (R42)
- 2.24 Match unique indexes by table, not by name alone (R41)
- 2.25 Add typeEnumsAcrossSchemas to type enums of other schemas as enums (R40) **(opt-in)**
- 2.26 Warn about an include entry that matches no table (R51)
- 2.27 Prefix every line of a multi-line column comment (R48)
- 2.28 Keep column comments on views, foreign tables and partitioned tables (R49)
- 2.29 Quote awkward names and escape comments so the generated schema always parses (R47)
- 2.30 Add enumOrder: 'declared' to keep enum values in their declared order (R50) **(opt-in)**
- 2.31 Give a helpful error on interpolating null or a column-less parent() (R58)
- 2.32 Document the surprises the characterisation found (constats à documenter)

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

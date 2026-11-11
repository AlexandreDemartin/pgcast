# Roadmap pgcast

> **Statut** : v2, proposée le 2026-11-11. Elle attend la validation de l'utilisateur.

## Objectif

**Un Zapatos augmenté qui fait le dernier kilomètre.** Tout ce qu'une application réelle écrit encore en dehors du chemin typé doit avoir une forme typée, avec le même SQL visible et sans abstraction de plus. Ce chemin non typé couvre :
- `db.raw`,
- `db.sql` sans type de résultat,
- les types de lignes écrits à la main,
- les `as unknown as`,
- les helpers maison autour de `db.conditions`.

- **Boussole** : le nombre de sorties du chemin typé dans un code réel. Chaque étape doit en faire disparaître une famille entière.
- **Corpus** : Project A et Project B fournissent des exemples d'usage, ils ne sont pas la cible. Un besoin n'entre que s'il est général à Postgres (skill `consumer-usage`).

L'ordre est établi en fonction de trois critères : **la part du dernier kilomètre couverte**, **le rapport valeur/risque** et **les dépendances techniques**. Une ligne = une branche = une PR ; l'état est dans [SUIVI.md](./SUIVI.md).

## Où l'on sort du chemin typé aujourd'hui

Les motifs sont relevés dans le corpus, sans extrait de code (skill `consumer-usage`). Les comptes sont approximatifs, relevés par grep, et ne servent qu'à mesurer la fréquence.

| Motif | Project A | Project B | Réponse pgcast |
|---|---|---|---|
| Lateral sur clé étrangère réécrit à la main (`x_id: db.parent('id')`) | ~1 000 | ~34 | ③ `related` / `relatedMany` |
| Conditions maison (`= ANY`, `IN (SELECT …)`, `EXISTS`, `@>`, full-text) | ~400 appels | 26 fichiers | ② conditions |
| `and()` vide qui rend `()`, accumulateurs `SQLFragment<any>[]`, `TRUE` de repli | ~140 fichiers | 12 `find-*` | P1.5, puis ② |
| Résultat d'un lateral référencé par son alias interne (`"lateral_x".result`), `@ts-ignore` dans `groupBy` | ~110 | — | ③ référence typée |
| Alias de table et colonnes qualifiées écrits à la main ; `db.raw` pour des noms de CTE | ~200 / ~45 | — | ⑥ alias et `with` |
| CTE : helper maison qui recopie `runResultTransform` | 1 helper | — | ⑥ `with` |
| Domaines `CHECK (VALUE = ANY(…))` utilisés comme enums, types `custom/` édités à la main | ~230 domaines | contrôlés par un test regex | ④ domaines |
| Aucun contrôle en CI que `schema.d.ts` est à jour | 4 configs | 1 config | ① `--check` |
| `jsonpath` construit par concaténation (`db.raw` sur une valeur) | 2 sites | — | ② `jsonbPathExists` paramétré |
| Paramètre `jsonb` forcé à la main (`param(x, true)`, `JSON.stringify`, `'jsonb'`) | ~35 | quelques-uns | ② `@>` et ④ |
| Verrous consultatifs dans une transaction rejouée | oui | oui | ⑧ fragment `advisoryXactLock` |
| Journal des retries reconnu par une chaîne (`'retrying'`) | 1 | — | ⑧ événement structuré |
| `pgm.db as unknown as db.Queryable` (migrations) | ~35 | — | ⑦ interface de driver |
| Streaming par `pg-cursor` écrit à la main | oui | — | ⑩ |
| Tests qui reconnaissent une requête par sa position ou par son texte | ~600 fichiers | 1 fake pool | idée, après ⑦ |

## Étapes

| Étape | Évolution | Pourquoi à cette place | Risque |
|---|---|---|---|
| **P0** | Fork setup | Build identique à l'octet, outillage à jour, méthode des agents. | — |
| **P1** | Caractérisation + bench de compilation | Rien ne bouge sans filet ; les snapshots sont le contrat de rétrocompatibilité. | faible |
| **P1.5** | Correctifs | Une PR par bug du rapport, test rouge d'abord. Première : `and()` / `or()` vides rendent `TRUE` / `FALSE` au lieu d'un `()` invalide. Ce n'est pas cassant, puisque Postgres refusait déjà ce SQL. | faible |
| **①** | `--check` + `--watch` | Aucun des deux projets ne contrôle la dérive du schéma. Introduit un **modèle intermédiaire** de l'introspection, sur lequel s'appuient ③, ④ et ⑤. | faible |
| **②** | Conditions | Runtime pur, sans toucher à `core.ts`, et le besoin le plus fréquent après les FK. Contenu : `isInSelect` (`IN (SELECT …)`), `exists`, tableaux typés sur la colonne (`= ANY`, `&&`, `@>`), `jsonbContains` avec paramètre `jsonb`, `jsonbPathExists` avec variables liées, full-text avec configuration en paramètre. | faible |
| **③** | Clés étrangères : `related` / `relatedMany`, référence typée au résultat d'un lateral | Le motif n°1 de Project A. Le SQL doit rester **identique** au lateral écrit à la main. Note de décision API d'abord. | moyen |
| **④** | Domaines et validateurs | Opt-in : un domaine `CHECK (VALUE = ANY(…))` devient une union littérale, ce qui supprime des centaines de fichiers `custom/` édités à la main. Puis Zod / Valibot et `jsonb` typé par `COMMENT ON`. Note de décision d'abord. | moyen |
| **⑤** | Fonctions Postgres typées | `pg_proc` dans le même modèle. Le besoin est moins fréquent dans les deux projets, d'où sa place. | moyen |
| **⑥** | Alias de table typés et `with` (CTE) | Un `with` qui garde le `RunResult` de la requête principale remplace le helper maison, et des identifiants qualifiés typés remplacent `db.raw`. Les colonnes de CTE typées viendront plus tard. | moyen (types) |
| **⑦** | Interface de driver | Accepte tout objet qui a `query(text, values)`, ce qui supprime les `as unknown as db.Queryable` ; postgres.js et PGlite viennent en adapteurs. Prérequis de ⑧ à ⑩. | **élevé** |
| **⑧** | Savepoints, `advisoryXactLock`, retry structuré | Les deux projets prennent des verrous consultatifs dans des transactions rejouées. | moyen |
| **⑨** | Contexte RLS `withContext` | `SET LOCAL` n'a de sens que dans une transaction, avec des savepoints bien définis. | faible |
| **⑩** | Streaming par curseur | Dépend de l'API de curseur de chaque driver (⑦). | moyen |
| **⑪** | Inférence de type du SQL brut | L'aboutissement du dernier kilomètre : même le SQL écrit à la main devient typé. C'est la plus risquée, et elle s'appuie sur ①, ⑥ et ⑦. **Note de conception validée avant toute ligne de code.** | **très élevé** |

## Écarté, contraire à la philosophie

| Idée | Pourquoi non | À la place |
|---|---|---|
| Transaction courante implicite (`AsyncLocalStorage`) | État caché (principe 2) | Client passé explicitement ; savepoints (⑧) pour l'imbrication |
| `select(…).withCount()` qui change la forme du résultat | Un appel, deux SQL, résultat surprenant (principe 3) | Deux requêtes sur le même `where`, ou `COUNT(*) OVER()` en `extras` |
| Ignorer en silence une clé `undefined` d'un `Whereable` | Change le sens d'une requête existante | À caractériser en P1 ; correctif seulement après une note de décision |
| Type d'un `jsonb` déduit des données | La base n'en dit rien (principe 1) | `COMMENT ON` ou un domaine (④) |

## Jalons de publication (chacun est un point d'arrêt)

| Version | Contenu |
|---|---|
| `6.6.1-pgcast.0` | P0 + P1 : même comportement, nom réservé |
| `6.7.0` | P1.5 + ① + ② |
| `6.8.0` | ③ + ④ + ⑤ |
| `6.9.0` | ⑥ |
| `7.0.0` | seulement si ⑦ impose un changement cassant, ce qu'on cherche à éviter ; sinon ⑦ à ⑩ restent en 6.x |
| ultérieur | ⑪ |

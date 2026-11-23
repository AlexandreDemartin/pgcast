---
english: 905b32e4428a
---

# Nouveautés

Ce que pgcast ajoute à Zapatos 6.6.1, une ligne par ajout : la version qui l’a apporté, et un lien vers l’entrée ou le guide qui l’explique. Ce qui a changé dans le comportement de Zapatos lui-même est [à la fin](#what-changed).
{.lede}

## Requêtes et raccourcis {#queries-and-shortcuts}

| Ajout | À partir de |
|---|---|
| [`withCTEs()`](/fr/sql-template#withCTEs) : des CTE avant un raccourci, dont le type du résultat est conservé | 6.11.0 |
| [`selectRows()`](/fr/select#selectRows) : la requête de `select()` comme fragment, une ligne par résultat, pour un [curseur](/fr/cursors) | 6.12.0 |
| [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow) : `selectExactlyOne()` lève une erreur sur une deuxième ligne, en opt-in | 6.7.0 |
| [`ReturningTypeForTable`](/fr/insert#ReturningTypeForTable) et [`UpsertReturnableForTable`](/fr/insert#UpsertReturnableForTable), exportés : la ligne que renvoie une écriture, pour typer un faux résultat | 6.7.0 |
| [`UpsertOptions`](/fr/insert#UpsertOptions) et [`OrderSpecForTable`](/fr/select#OrderSpecForTable), exportés, pour que les déclarations d’un paquet puissent les nommer | 6.9.0 |

## Conditions {#conditions}

| Ajout | À partir de |
|---|---|
| [`eqAny()`](/fr/conditions#conditions.eqAny) : égal à un élément d’un tableau, le tableau entier en un seul paramètre | 6.9.0 |
| [`likeAny()`](/fr/conditions#conditions.likeAny) et [`ilikeAny()`](/fr/conditions#conditions.ilikeAny) : correspond à l’un de plusieurs motifs, tous en un seul paramètre | 6.12.0 |
| [`jsonbContains()`](/fr/conditions#conditions.jsonbContains) et [`jsonbPathExists()`](/fr/conditions#conditions.jsonbPathExists), sur une colonne `jsonb` | 6.9.0 |
| [`exists()`](/fr/conditions#conditions.exists) et [`isInSelect()`](/fr/conditions#conditions.isInSelect) : une sous-requête sur une table, son filtre typé par cette table | 6.9.0 |
| [`websearchToTsquery()`](/fr/conditions#conditions.websearchToTsquery) : la recherche plein texte sur une colonne `tsvector` | 6.9.0 |

## Transactions {#transactions}

| Ajout | À partir de |
|---|---|
| [`savepoint()`](/fr/transaction#savepoint) : une unité de travail qui peut échouer seule ([Savepoints](/fr/savepoints)) | 6.12.0 |
| [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) : un travail exécuté à tour de rôle, d’une connexion à l’autre ([Retries](/fr/retries)) | 6.12.0 |
| [`setLocal()`](/fr/transaction#setLocal) : des réglages pour le reste de la transaction, que lit une politique ([Sécurité niveau ligne](/fr/row-security)) | 6.12.0 |
| [`cursor()`](/fr/transaction#cursor) : un grand résultat lu par batches ([Curseurs](/fr/cursors)) | 6.12.0 |
| [`transactionEventListener`](/fr/runtime-config#Config.transactionEventListener) : chaque rollback, retry et abandon de `transaction()` sous forme de [`TransactionEvent`](/fr/runtime-config#TransactionEvent), ses champs prêts pour un log ou une métrique | 6.12.0 |

## Générateur {#generator}

| Ajout | À partir de |
|---|---|
| [`--check`](/fr/generator#check), et [`check()`](/fr/generator#export-check) depuis le code : quitte avec le code 1 quand les fichiers générés ne correspondent plus à la base, et n’écrit rien | 6.8.0 |
| [`--help`](/fr/generator#cli) : l’usage, les fichiers de config et les flags | 6.12.0 |
| [`constraintNames`](/fr/generator#generate.constraintNames) : les noms des contraintes de chaque relation dans un type `Constraint`, pour vérifier la contrainte d’une erreur | 7.1.0 |
| [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions) : un domaine sur `text` dont le `CHECK` liste les valeurs, typé comme leur union, en opt-in | 6.10.0 |
| [`moduleNames`](/fr/generator#generate.moduleNames) et `pgcastconfig.json` : des imports depuis `pgcast/db`, et aucun fichier au nom de Zapatos | 6.7.0 |
| [`SchemaRules`](/fr/generator#SchemaRules) et [`ColumnOptions`](/fr/generator#ColumnOptions), exportés depuis `zapatos/generate`, pour que les déclarations d’un paquet puissent les nommer | 6.9.0 |
| [`valuesTypedAsAliases`](/fr/generator#generate.valuesTypedAsAliases) : le type de la valeur de chaque colonne dans `Whereable`, `Insertable` et `Updatable` nommé par un alias de `zapatos/db`, les mêmes types dans un fichier plus petit, en opt-in | 7.2.0 |

## Drivers et adaptateurs {#drivers-and-adapters}

| Ajout | À partir de |
|---|---|
| [`QueryableLike`](/fr/sql-template#QueryableLike) et [`PoolLike`](/fr/transaction#PoolLike) : `run()` et `transaction()` sur [votre propre driver](/fr/drivers#a-driver-of-your-own), ou sur [un fake pour les tests](/fr/drivers#a-fake-for-tests) | 6.12.0 |
| [`@pgcast/adapter-postgres-js`](/fr/drivers#postgres-js) : pgcast sur postgres.js 3.4 ou 4.x | 0.1.0 |
| [`@pgcast/adapter-pglite`](/fr/drivers#pglite) : pgcast sur PGlite 0.5.x, dans Node ou dans une page | 0.1.0 |

Chaque adaptateur est un paquet à part, avec ses propres versions, et demande pgcast 6.12.0 ou une version ultérieure.

## SQL typé {#typed-sql}

| Ajout | À partir de |
|---|---|
| [`pgcast-typegen`](/fr/typed-sql) : le type de ligne d’une requête `sql` nommée, tel que Postgres le décrit | 0.1.0 |
| [`pgcast-typegen --check`](/fr/typed-sql#check-in-ci) : les types de ligne commités comparés à vos requêtes, hors ligne ou sur une base | 0.1.0 |
| [`NotNull`](/fr/typed-sql#narrow-a-column) : retire `null` des colonnes que vous nommez | 0.1.0 |
| [`pgcast-typegen --watch`](/fr/typed-sql#what-stays-manual) : les types de ligne régénérés à chaque modification d’un fichier source | 0.2.0 |

L’outil est `@pgcast/typegen`, un paquet à part, avec ses propres versions, qui demande pgcast 7.1.0 ou une 7.x ultérieure.

## Outillage {#tooling}

| Ajout | À partir de |
|---|---|
| [Playground](/fr/playground) : une requête sur le schéma de la doc, son SQL et son type pendant la frappe, exécutée sur Postgres dans la page, partagée par son URL | 6.7.0 |
| [Assistants IA](/fr/ai-assistant) : la doc en `llms.txt`, chaque page à copier, et un fichier de règles pour votre projet | 6.7.0 |
| Des versions publiées depuis la CI, chacune avec une attestation de provenance npm qui la relie à son commit | 6.8.0 |
| [Un signalement privé](/fr/security#report-a-flaw) d’une faille, et une politique de sécurité | 6.7.0 |

## Ce qui a changé {#what-changed}

- **Sécurité** : des failles que Zapatos 6.6.1 partage, corrigées à partir de la 6.6.2 ([Sécurité](/fr/security#what-changed-from-zapatos-6-6-1), [corrections par version](/fr/security#fixes-by-release)).
- **Corrections** : un appel que Postgres refusait lève d’abord une erreur utile, et un résultat qui contredisait le nom, le type ou la doc de sa fonction y correspond désormais (§ Fixed de chaque version dans le [changelog](/fr/changelog)).
- **Valeurs par défaut** : treize opt-ins de la 6.x sont les valeurs par défaut à partir de la 7.0 ([Venir de Zapatos](/fr/switching#from-7-0), [Versions](/fr/versions)).

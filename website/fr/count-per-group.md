---
english: 5e0ea97be728
---

# Comptes par groupe

Compter par groupe : un compte par valeur, une partie d’un compte, un compte par élément d’un tableau. [`select()`](/fr/select#select) groupe avec [`columns`, `extras` et `groupBy`](/fr/select#groupby-and-having) ; `count(*) FILTER (WHERE …)` compte une partie de chaque groupe, et `unnest()` dans un template `sql` compte les éléments d’une colonne tableau, sa ligne typée.
{.lede}

## Compter par valeur {#count-per-value}

Le nombre de films de chaque studio :

<CastPanel example="count_per_group">

<<< ../examples/count_per_group.ts{ts twoslash}

<template #caption><span>Le studio 1000 a 2 films, les studios 1001 et 1002 un chacun.</span></template>
</CastPanel>

- `GROUP BY "studio_id"`<!-- probe: examples/count_per_group.ts --> donne une ligne par studio, `columns` contenant ce par quoi il groupe.
- `count(*)` est un `bigint`, mais la ligne revient en JSON, donc `films` est un nombre, comme le dit son fragment.
- Pas [`count()`](/fr/aggregates#count) avec `groupBy` : il ne donne que le compte du premier groupe.
- Avec le nom du studio : [Jointures § Filtrer, trier et grouper par un lateral](/fr/lateral#filter-sort-and-group-by-a-lateral). Pour ne garder que certains groupes, `having` ([`groupBy` et `having`](/fr/select#groupby-and-having)).

## Compter une partie de chaque groupe {#count-part-of-each-group}

Les séances de chaque cinéma, et combien d’entre elles sont sous-titrées :

<CastPanel example="count_per_group_filter">

<<< ../examples/count_per_group_filter.ts{ts twoslash}

<template #caption><span>The Lantern a 2 séances, dont 1 sous-titrée ; les deux autres cinémas en ont 1 chacun, aucune sous-titrée.</span></template>
</CastPanel>

- `FILTER (WHERE …)` ne compte que les lignes du groupe qui correspondent, donc une seule requête donne les deux comptes.
- Un Whereable dans le fragment est une condition, comme dans un `where` : `FILTER (WHERE ("subtitled" = $1))`<!-- probe: db.sql`count(*) FILTER (WHERE ${{ subtitled: true }})` --> ([Objets Whereable](/fr/sql-template#whereable)).
- Un cinéma sans séance sous-titrée obtient `0`. Un `subtitled` encore `NULL` n’est pas `true`, donc il ne compte pas.

## Compter par élément d’un tableau {#count-per-array-item}

Le nombre de films de chaque genre, parmi ceux sortis avant 2010. `genres` est un tableau, donc chaque film compte une fois dans chacun de ses genres :

<CastPanel example="count_per_group_facets">

<<< ../examples/count_per_group_facets.ts{ts twoslash}

<template #caption><span>drama 2, puis mystery, romance et thriller 1 chacun.</span></template>
</CastPanel>

- `unnest()` donne une ligne par élément, donc la requête groupe par élément. Un film dont `genres` vaut `{}` ne donne aucune ligne, ni aucun groupe.
- Le `WHERE` est le filtre de la recherche elle-même, ici un Whereable, donc les comptes sont ceux des films que trouve la recherche.
- Dans un template `sql`, le `bigint` revient en chaîne : `::int` en fait un nombre. Le type de la ligne est celui que vous écrivez, `{ genre: string; films: number }[]`, sans vérification : [SQL typé](/fr/typed-sql) le génère et le vérifie.

## Voir aussi {#see-also}

- [`groupBy` et `having`](/fr/select#groupby-and-having) : ce qu’un `select()` groupé peut renvoyer.
- [`count()`](/fr/aggregates#count) : un seul compte, ses options, et `count(DISTINCT …)`.
- [Fonctions d’agrégat](https://www.postgresql.org/docs/current/functions-aggregate.html) et [`FILTER`](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES), dans la doc de Postgres.

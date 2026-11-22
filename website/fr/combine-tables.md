---
english: 0a30b6307ad0
---

# Unions

Combiner deux tables : les acteurs et l’équipe dans une seule liste, triée et paginée. Aucun raccourci n’écrit de `UNION`, donc la requête va dans un template [`sql`](/fr/sql-template#sql) avec `UNION ALL`, sa ligne typée à la main ou par [`@pgcast/typegen`](/fr/typed-sql).
{.lede}

## Une liste à partir de deux tables {#one-list-from-two-tables}

Tout le monde dans le schéma de la doc, par nom, cinq par page, ici la première page :

<CastPanel example="combine_tables">

<<< ../examples/combine_tables.ts{ts twoslash}

<template #caption><span>Ambrose Okafor, Clementine Ashdown, Corin Halloway (équipe), Halvard Brecke et Imogen Thackery.</span></template>
</CastPanel>

- Chaque `SELECT` donne les mêmes colonnes dans le même ordre : Postgres les associe par position, pas par nom, et refuse deux types qu’il ne peut pas accorder (42804). Le premier `SELECT` nomme les colonnes du résultat.
- `ORDER BY` et `LIMIT` trient et paginent toute l’union, par ses propres colonnes : `ORDER BY "name", kind, "id"`<!-- probe: examples/combine_tables.ts -->. Une colonne qualifiée par sa table, `actors.name`, est refusée (42P01).
- Un `id` peut se trouver dans les deux tables, donc `kind` et `id` terminent l’ordre : chaque ligne a une seule place, et aucune ligne n’est sur deux pages. La page suivante est `OFFSET ${db.param(5)}`, et le total est une requête à part ([Pagination § Compter le total](/fr/paginate#count-the-total)).
- `UNION ALL` garde toutes les lignes. `UNION` seul retire aussi les lignes égales dans toutes leurs colonnes ; avec `kind` et `id`, il n’y en a aucune à retirer.
- Le type de la ligne est celui que vous écrivez, sans vérification : `kind` revient en `text`, donc c’est à vous de garder `'actor' | 'crew'` vrai. [SQL typé](/fr/typed-sql) génère la ligne à partir de Postgres et la vérifie.

## Filtrer chaque partie {#filter-each-part}

Les personnes dont le nom contient `or`. Chaque `SELECT` prend le filtre, comme un Whereable de sa propre table :

<CastPanel example="combine_tables_filter">

<<< ../examples/combine_tables_filter.ts{ts twoslash}

<template #caption><span>Ambrose Okafor, un acteur, Corin Halloway, de l’équipe, et Teodor Vasko, un acteur.</span></template>
</CastPanel>

- La condition est écrite une fois et envoyée deux fois, en `ILIKE $1` et `ILIKE $2`<!-- probe: examples/combine_tables_filter.ts -->, une valeur chacun.
- Un motif venu d’un utilisateur doit d’abord avoir ses `%`, `_` et `\` échappés : [Recherche textuelle](/fr/text-search).

## Voir aussi {#see-also}

- [SQL brut](/fr/raw-sql) et [`sql`](/fr/sql-template#sql) : les noms, les valeurs et le type de la ligne dans une requête à vous.
- [Pagination](/fr/paginate) : l’ordre dont une page a besoin, et le total.
- [`UNION`](https://www.postgresql.org/docs/current/queries-union.html), dans la doc de Postgres.

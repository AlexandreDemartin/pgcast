---
english: b36c381bfc68
---

# Arbres

Parcourir un arbre : les mentors de chaque membre de l’équipe, en remontant la chaîne. Aucun raccourci ne suit une colonne vers sa propre table niveau après niveau, donc la requête va dans un template [`sql`](/fr/sql-template#sql) avec `WITH RECURSIVE`, sa ligne typée à la main, et la clause `CYCLE` de Postgres l’arrête à une boucle.
{.lede}

## Remonter l’arbre {#walk-up-the-tree}

Les mentors de Jonah Merriweather, de sa propre ligne jusqu’en haut de `crew.mentor_id` :

<CastPanel example="walk_a_tree">

<<< ../examples/walk_a_tree.ts{ts twoslash}

<template #caption><span>Jonah Merriweather à la profondeur 0, son mentor Corin Halloway à 1, et celui de Corin Halloway, Wilhelmina Strand, à 2.</span></template>
</CastPanel>

- Le premier `SELECT` est le point de départ, la ligne de Jonah. Le second joint `crew` aux lignes trouvées jusque-là, un niveau plus haut à chaque fois, sur `"crew"."id" = chain.mentor_id`<!-- probe: examples/walk_a_tree.ts -->, et Postgres s’arrête quand il ne trouve aucune nouvelle ligne.
- Les noms entre `${…}` sont vérifiés par rapport à `s.crew.SQL`. Ceux de la CTE, `chain` et ses colonnes, sont écrits dans le texte, et rien ne les vérifie ([SQL brut](/fr/raw-sql)).
- Le type de la ligne est celui que vous écrivez, `{ id: number; name: string; depth: number }[]`, sans vérification : [SQL typé](/fr/typed-sql) le génère et le vérifie. `0 AS depth` est un `integer`, que `pg` donne en nombre.
- [`withCTEs()`](/fr/sql-template#withCTEs) n’écrit pas de `RECURSIVE`, donc une CTE qui se lit elle-même y est refusée (42P01) : toute la requête va dans `sql` ([SQL brut § Placer une CTE avant un raccourci](/fr/raw-sql#put-a-cte-before-a-shortcut)).

## Descendre l’arbre {#go-down-the-tree}

L’équipe de Wilhelmina Strand : les membres dont elle est le mentor, ceux dont ils sont le mentor, et ainsi de suite. La jointure va dans l’autre sens :

<CastPanel example="walk_a_tree_down">

<<< ../examples/walk_a_tree_down.ts{ts twoslash}

<template #caption><span>Wilhelmina Strand à la profondeur 0, Corin Halloway et Petra Ilves à 1, Jonah Merriweather à 2.</span></template>
</CastPanel>

- `"crew"."mentor_id" = team.id`<!-- probe: examples/walk_a_tree_down.ts --> : chaque étape trouve les membres dont l’étape précédente a trouvé le mentor.
- Les lignes arrivent dans l’ordre du `ORDER BY`, ici par profondeur, puis par nom.

## S’arrêter à une boucle {#stop-at-a-loop}

Un arbre stocké dans une colonne peut boucler : une modification qui fait de Jonah Merriweather le mentor de Wilhelmina Strand referme la chaîne. À partir de Postgres 14, la clause `CYCLE` arrête chaque branche à une ligne qu’elle a déjà vue :

<CastPanel example="walk_a_tree_cycle">

<<< ../examples/walk_a_tree_cycle.ts{ts twoslash}

<template #caption><span>Les trois mêmes lignes que plus haut : l’arbre du schéma de la doc n’a pas de boucle.</span></template>
</CastPanel>

- `CYCLE id SET is_loop USING path`<!-- probe: examples/walk_a_tree_cycle.ts --> ajoute deux colonnes à la CTE : `path`, les ids de la branche jusque-là, et `is_loop`, `true` sur une ligne dont l’`id` y est déjà. Postgres ne va pas plus loin à partir de cette ligne.
- Avec la boucle, la ligne de Jonah revient à la profondeur 3 avec `is_loop` à true : `WHERE NOT is_loop` l’écarte.
- Sans `CYCLE`, la même requête ne s’arrête jamais d’elle-même : elle tourne jusqu’à ce qu’un `statement_timeout`, s’il y en a un, l’annule (57014).

## Voir aussi {#see-also}

- [SQL brut](/fr/raw-sql) et [`sql`](/fr/sql-template#sql) : les noms, les valeurs et le type de la ligne dans une requête à vous.
- [Jointures § Joindre une table à elle-même](/fr/lateral#join-a-table-to-itself) : un niveau plus haut, avec un raccourci et `alias`.
- [Requêtes `WITH`](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-RECURSIVE), `RECURSIVE` et `CYCLE`, dans la doc de Postgres.

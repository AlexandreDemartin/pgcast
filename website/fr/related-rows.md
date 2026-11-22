---
english: 209418cdfbfc
---

# Lignes liées

Filtrer sur des lignes liées : garder les lignes qui ont une ligne liée, ou celles qui n’en ont pas. [`exists()`](/fr/conditions#conditions.exists) écrit la sous-requête, [`not()`](/fr/conditions#conditions.not) l’inverse, et [`isInSelect()`](/fr/conditions#conditions.isInSelect) compare une colonne avec celle d’une sous-requête.
{.lede}

## Garder les lignes qui en ont une {#keep-the-rows-that-have-one}

Les films à l’affiche de The Lantern, le cinéma 1000 : ceux qui y ont une séance.

<CastPanel example="related_rows">

<<< ../examples/related_rows.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) et The Cartographer’s Silence (id 1002).</span></template>
</CastPanel>

- [`db.parent('id')`](/fr/sql-template#parent) est l’id du film, puisque l’option `parent` nomme `films`.
- Chaque film revient une fois, quel que soit le nombre de séances qui correspondent : `EXISTS`<!-- probe: examples/related_rows.ts --> demande s’il y en a une. Une jointure donnerait le film une fois par séance.
- Le résultat, ce sont les films seuls. Pour avoir aussi leurs séances, imbriquez-les dans un `lateral` ([Jointures](/fr/lateral)).

## Garder les lignes qui n’en ont pas {#keep-the-rows-that-lack-one}

Enveloppez la même condition dans `not()`. Ici, les cinémas sans séance sous-titrée :

<CastPanel example="related_rows_none">

<<< ../examples/related_rows_none.ts{ts twoslash}

<template #caption><span>Kestrel Picture House (id 1001) et The Old Mill Screen (id 1002).</span></template>
</CastPanel>

Les séances de ces deux cinémas ont encore `subtitled` à `NULL`, auquel `{ subtitled: true }` ne correspond pas : une séance dont on ne sait pas si elle est sous-titrée ne compte pas.

## Comparer avec la colonne d’une sous-requête {#compare-with-a-subquery-s-column}

Quand la ligne extérieure n’est pas dans le filtre de la sous-requête, comparez une colonne avec celle de la sous-requête. Ici, les membres de l’équipe qui sont le mentor de quelqu’un : chaque `id` qui est le `mentor_id` d’un membre.

<CastPanel example="related_rows_in">

<<< ../examples/related_rows_in.ts{ts twoslash}

<template #caption><span>Wilhelmina Strand (id 1000) et Corin Halloway (id 1001).</span></template>
</CastPanel>

La colonne de la sous-requête doit avoir le type de la clé ([`isInSelect()`](/fr/conditions#conditions.isInSelect)).

## Garder NULL hors de NOT IN {#keep-null-out-of-not-in}

Les membres de l’équipe qui ne sont le mentor de personne, c’est l’inverse. Sous `not()`, Postgres lit `IN` comme `NOT IN`, et un `NULL` dans la colonne de la sous-requête fait qu’il ne correspond à aucune ligne : Wilhelmina Strand n’a pas de mentor. Laissez les `NULL` hors de la sous-requête :

<CastPanel example="related_rows_not_in">

<<< ../examples/related_rows_not_in.ts{ts twoslash}

<template #caption><span>Petra Ilves (id 1002) et Jonah Merriweather (id 1003).</span></template>
</CastPanel>

Sans `IS NOT NULL`<!-- probe: examples/related_rows_not_in.ts -->, la requête ne donne personne, sans erreur. `not(exists(…))` n’a pas ce piège : [`exists()`](/fr/conditions#conditions.exists) montre ces membres de l’équipe avec lui.

## Voir aussi {#see-also}

- [Sous-requêtes](/fr/conditions#subqueries) : ce qu’écrivent `exists()` et `isInSelect()`, et leurs options.
- [`parent()`](/fr/sql-template#parent) : la colonne de la ligne extérieure dans une sous-requête.
- [Filtres optionnels](/fr/optional-filters) : une sous-requête parmi les conditions que donne une requête HTTP.

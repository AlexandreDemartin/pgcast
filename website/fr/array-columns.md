---
english: 144c22494667
---

# Colonnes tableau

Filtrer sur des colonnes tableau : un film d’un genre, de l’un de plusieurs, ou de ceux-là seuls. [`arrayContains()`](/fr/conditions#conditions.arrayContains), [`arrayOverlaps()`](/fr/conditions#conditions.arrayOverlaps) et [`arrayContainedIn()`](/fr/conditions#conditions.arrayContainedIn) comparent `films.genres`, un `text[]`, avec un tableau que vous donnez ; [`eqAny()`](/fr/conditions#conditions.eqAny) compare une colonne simple avec une liste.
{.lede}

## D’un genre {#in-a-genre}

Les drames : les films dont les `genres` contiennent `drama`.

<CastPanel example="array_columns">

<<< ../examples/array_columns.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) et A Lantern for Edith (id 1001).</span></template>
</CastPanel>

- Le tableau que vous donnez est un seul paramètre, ses éléments typés comme ceux de la colonne : `arrayContains([1])` ne compile pas sur `genres` ([Les tableaux](/fr/conditions#arrays)).
- Donnez plusieurs genres, et un film doit tous les avoir : `arrayContains(['drama', 'romance'])`, c’est A Lantern for Edith seul.
- `@>`<!-- probe: examples/array_columns.ts -->, comme `&&` et `<@` plus bas, est un opérateur que sert un index GIN sur la colonne ([GIN operator classes](https://www.postgresql.org/docs/current/gin.html#GIN-BUILTIN-OPCLASSES)).

## De l’un de plusieurs {#in-any-of-several}

Les films qui sont une romance ou un thriller, ou les deux :

<CastPanel example="array_columns_overlaps">

<<< ../examples/array_columns_overlaps.ts{ts twoslash}

<template #caption><span>A Lantern for Edith (id 1001) et The Cartographer’s Silence (id 1002).</span></template>
</CastPanel>

Un tableau vide n’a d’élément commun avec aucun tableau : sans genre coché, aucun film. Laissez alors la clé de côté, comme dans [Filtres optionnels](/fr/optional-filters).

## De ceux-là seuls {#in-only-these}

Les films dont chaque genre est drama ou romance :

<CastPanel example="array_columns_contained_in">

<<< ../examples/array_columns_contained_in.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000), A Lantern for Edith (id 1001) et Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

Small Hours at Calder Bay n’a pas de genre, `{}`, et le tableau vide est dans toute liste. Pour l’écarter, ajoutez que le tableau n’est pas vide : `{ genres: db.conditions.and(db.conditions.arrayContainedIn(['drama', 'romance']), db.conditions.ne([])) }`<!-- tsc: db.select('films', …) -->.

## Une valeur du tableau, avec = ANY {#a-value-in-the-array-with-any}

Postgres écrit aussi « cette valeur est l’une de celles du tableau » sous la forme `value = ANY(array)`. Dans une valeur en fragment `sql`, [`db.self`](/fr/sql-template#self) est la colonne :

<CastPanel example="array_columns_any">

<<< ../examples/array_columns_any.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) et A Lantern for Edith (id 1001), les lignes du premier exemple.</span></template>
</CastPanel>

Les lignes sont celles d’`arrayContains(['drama'])`, mais le type ne vérifie pas un fragment, et un index GIN ne sert pas `= ANY` sur la colonne. Préférez la condition.

## Une colonne simple dans une liste {#a-plain-column-in-a-list}

Pour une liste de valeurs face à une colonne qui n’est pas un tableau, utilisez [`eqAny()`](/fr/conditions#conditions.eqAny). Les films de Larkspur Pictures et de Ninefold Films :

<CastPanel example="array_columns_eqAny">

<<< ../examples/array_columns_eqAny.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000), The Cartographer’s Silence (id 1002) et Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

La liste est un seul paramètre, elle aussi, `= ANY($1)`<!-- probe: db.sql`${{ studio_id: db.conditions.eqAny([1000, 1002]) }}` -->, donc un seul texte de requête sert une liste de n’importe quelle longueur. [Les listes](/fr/conditions#lists) la compare avec `isIn()`.

## Voir aussi {#see-also}

- [Les tableaux](/fr/conditions#arrays) et [`eqAny()`](/fr/conditions#conditions.eqAny) : les valeurs que prend chaque condition, et ce qu’elle refuse.
- [Array functions and operators](https://www.postgresql.org/docs/current/functions-array.html), dans la doc de Postgres.

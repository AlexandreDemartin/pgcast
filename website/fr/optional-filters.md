---
english: f70f476662dc
---

# Filtres optionnels

Filtrer selon des champs optionnels : construire un filtre avec les seuls champs que donne une requête HTTP. Ajoutez une condition par champ à une liste, puis passez-la à [`and()`](/fr/conditions#conditions.and), qui joint ce que la liste contient et donne toutes les lignes quand elle est vide.
{.lede}

## Construire la liste, puis la joindre {#build-the-list-then-join-it}

Ici, une recherche donne un studio, une année avant laquelle rester, ou un acteur, dans n’importe quelle combinaison. Chaque champ présent ajoute sa condition : une clé du film, ou un [`exists()`](/fr/conditions#conditions.exists) sur sa distribution.

<CastPanel example="optional_filters">

<<< ../examples/optional_filters.ts{ts twoslash}

<template #caption><span>Les films de Larkspur Pictures avec Teodor Vasko dans la distribution : The Salt Orchard (id 1000) et The Cartographer’s Silence (id 1002).</span></template>
</CastPanel>

- Typez la liste `(s.films.Whereable | db.SQLFragment<boolean | null>)[]`. Elle contient les clés du film, vérifiées par rapport à `films`, et une condition sur une autre table, comme l’`exists()` sur `roles`. Une clé que `films` n’a pas, ou un Whereable de `roles`, ne compile pas.
- N’ajoutez une clé que si son champ est là. `{ studio_id: search.studioId }` sans studio donne `"studio_id" = $1`<!-- probe: db.sql`${{ studio_id: undefined }}` --> envoyé comme `NULL`, qui ne correspond à aucune ligne ([Objets Whereable](/fr/sql-template#whereable)).
- Sans aucun champ, `and()` vaut `TRUE`<!-- probe: db.conditions.and() --> : tous les films. C’est ce que doit donner une recherche sans champ. Dans [`update()`](/fr/insert#update) ou [`deletes()`](/fr/insert#deletes), ce sont toutes les lignes : vérifiez d’abord la liste ([Un filtre vide](/fr/security#an-empty-filter)).
- Quand chaque champ fixe une colonne à lui, un Whereable construit clé par clé fait la même chose, comme le montre [Un filtre vide](/fr/security#an-empty-filter).

Avec Zapatos 6.6.1, un `and()` vide écrivait `()`, que Postgres refuse (42601). Dans une lecture, un test de longueur gardé pour cette seule raison peut partir.

## Correspondre à l’un des champs {#match-any-of-the-fields}

Pour trouver les films qui correspondent à l’un des champs donnés, joignez la liste avec [`or()`](/fr/conditions#conditions.or) :

<CastPanel example="optional_filters_or">

<<< ../examples/optional_filters_or.ts{ts twoslash}

<template #caption><span>Un film de Ninefold Films ou un film d’avant 1980 : The Salt Orchard (1974, id 1000) et Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

Un `or()` vide vaut `FALSE`<!-- probe: db.conditions.or() --> : aucune ligne. S’il faut tous les films quand aucun champ n’est donné, vérifiez la longueur de la liste avant de choisir.

## Voir aussi {#see-also}

- [`and()`](/fr/conditions#conditions.and), [`or()`](/fr/conditions#conditions.or) et [`exists()`](/fr/conditions#conditions.exists) : le SQL qu’écrit chacun.
- [Objets Whereable](/fr/sql-template#whereable) : comment se compile chaque clé.
- [Lignes liées](/fr/related-rows) : d’autres conditions sur une autre table.

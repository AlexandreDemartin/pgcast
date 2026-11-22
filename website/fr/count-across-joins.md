---
english: 44923cee1197
---

# Comptes imbriqués

Compter à travers des jointures : les rôles de chaque studio, en passant par ses films. Imbriquez [`count()`](/fr/select#count) dans un [`lateral`](/fr/select#lateral), et atteignez la table intermédiaire avec [`isInSelect()`](/fr/conditions#conditions.isInSelect) ou [`exists()`](/fr/conditions#conditions.exists), dont l’option `parent` nomme la ligne extérieure.
{.lede}

## Compter à travers une table intermédiaire {#count-through-a-table-in-between}

Un rôle pointe vers un film, et un film vers un studio. Chaque studio avec le nombre de rôles de ses films :

<CastPanel example="count_across_joins">

<<< ../examples/count_across_joins.ts{ts twoslash}

<template #caption><span>Larkspur Pictures 6, ses deux films de trois rôles chacun ; Greyhaven Studios 3 ; Ninefold Films 3.</span></template>
</CastPanel>

- `"film_id" IN (SELECT "id" FROM "films" WHERE ("studio_id" = "studios"."id"))`<!-- probe: examples/count_across_joins.ts --> : les rôles des films du studio, comptés en une seule requête.
- `parent: 'studios'` fait de `db.parent('id')` l’`id` du studio, deux niveaux plus haut. Sans lui, la requête lève l’erreur "The 'parent' table alias has no meaning here"<!-- message --> avant d’être envoyée.
- `roles` est un `number`, et `0` pour un studio sans rôle ([`count()`](/fr/select#count)).

## Compter les lignes qui ont une ligne liée {#count-the-rows-that-have-a-related-row}

Chaque studio avec le nombre de ses films où joue Teodor Vasko (l’acteur 1003) :

<CastPanel example="count_across_joins_exists">

<<< ../examples/count_across_joins_exists.ts{ts twoslash}

<template #caption><span>Larkspur Pictures 2, The Salt Orchard et The Cartographer’s Silence ; 0 pour les deux autres.</span></template>
</CastPanel>

- Le premier `db.parent('id')` est celui du lateral, le studio ; celui d’`exists()` est celui du film, comme le dit son `parent: 'films'` : `"film_id" = "films"."id"`<!-- probe: examples/count_across_joins_exists.ts -->.
- `exists()` compte chaque film une fois, quel que soit le nombre de rôles qui correspondent. Pour compter les rôles eux-mêmes, passez par `isInSelect()`, ci-dessus.
- [Lignes liées](/fr/related-rows) donne les mêmes conditions comme filtre, sans le compte.

## Voir aussi {#see-also}

- [Sous-requêtes](/fr/conditions#subqueries) : `exists()`, `isInSelect()` et leur option `parent`.
- [`lateral`](/fr/select#lateral) et [`count()`](/fr/select#count) : ce que renvoie un compte imbriqué.
- [Décision 006](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/006-subquery-conditions.md) : pourquoi les conditions de sous-requête prennent `parent`.

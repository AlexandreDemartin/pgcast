---
english: d5d75b4fc20f
---

# Recherche textuelle

Chercher ce que tapent les utilisateurs : les films dont le titre, ou l’accroche, contient le texte. [`ilike()`](/fr/conditions#conditions.ilike) fait correspondre un motif sans tenir compte de la casse, une fois échappés les `%`, `_` et `\` de la saisie ; [`or()`](/fr/conditions#conditions.or) l’étend à plusieurs colonnes, et [`ilikeAny()`](/fr/conditions#conditions.ilikeAny) prend un motif par mot.
{.lede}

## Échapper, puis chercher {#escape-then-match}

Échappez d’abord la saisie, puis placez-la entre deux `%`, pour qu’elle puisse se trouver n’importe où dans le titre :

<CastPanel example="text_search">

<<< ../examples/text_search.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- Dans un motif, `%` est n’importe quel texte, `_` n’importe quel caractère et `\` échappe le suivant ([Les motifs](/fr/conditions#patterns)). Sans échappement, une recherche de `_` correspond à tous les titres ; échappée, seulement à un titre qui contient un `_`.
- La saisie est un paramètre dans les deux cas, `ILIKE $1`<!-- probe: db.sql`${{ title: db.conditions.ilike('%bay%') }}` --> : l’échappement garde son sens, puisque aucune saisie ne peut changer le SQL ([Sécurité](/fr/security#values-never-enter-the-sql)).
- Aucun index B-tree ne sert un motif qui commence par `%`, donc Postgres lit toute la table. Un index trigramme de l’extension [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) le sert.

## Chercher dans plusieurs colonnes {#search-several-columns}

Donnez le même motif à chaque colonne, et joignez-les avec `or()`. « map » n’est dans aucun titre, mais il est dans une accroche :

<CastPanel example="text_search_columns">

<<< ../examples/text_search_columns.ts{ts twoslash}

<template #caption><span>The Cartographer’s Silence (id 1002), dont l’accroche est « <span lang="en">Every map leaves something out.</span> »</span></template>
</CastPanel>

Un film sans accroche, `NULL`, peut toujours correspondre par son titre.

## Chercher chaque mot {#search-each-word}

Pour une recherche de plusieurs mots, donnez à `ilikeAny()` un motif par mot : un titre qui contient l’un d’eux correspond.

<CastPanel example="text_search_words">

<<< ../examples/text_search_words.ts{ts twoslash}

<template #caption><span>The Salt Orchard (id 1000) et Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- Toute la liste est un seul paramètre, `ILIKE ANY($1)`<!-- probe: db.sql`${{ title: db.conditions.ilikeAny(['%salt%', '%bay%']) }}` -->.
- `filter(Boolean)` retire les chaînes vides que `split()` laisse autour des espaces. Un mot vide donnerait `%%`, qui correspond à tous les titres ; une liste vide ne correspond à aucun ([`likeAny()`](/fr/conditions#conditions.likeAny)).
- Pour les titres qui contiennent chaque mot, joignez un `ilike()` par mot avec [`and()`](/fr/conditions#conditions.and).

## Ignorer les accents {#ignore-accents}

`ilike()` ignore la casse, pas les accents : « cartógrapher » ne trouve pas The Cartographer’s Silence. L’extension [`unaccent`](https://www.postgresql.org/docs/current/unaccent.html) de Postgres donne une fonction `unaccent()` : une fois l’extension installée, appelez-la sur la colonne et sur le motif, dans une valeur en fragment `sql` où [`db.self`](/fr/sql-template#self) est la colonne.

## Voir aussi {#see-also}

- [Les motifs](/fr/conditions#patterns) : `like()`, `ilike()` et les expressions régulières, ce à quoi chacun correspond.
- [Recherche plein texte](/fr/conditions#full-text) : faire correspondre des mots, pas du texte, avec `websearchToTsquery()`.
- [Filtres optionnels](/fr/optional-filters) : une recherche parmi les autres champs d’une requête HTTP.

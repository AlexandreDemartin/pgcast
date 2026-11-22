---
english: 51d91be320d3
---

# Recherche classée

Classer les résultats d’une recherche : les meilleures correspondances d’abord, la correspondance mise en évidence. [`websearchToTsquery()`](/fr/conditions#conditions.websearchToTsquery) trouve les films sur `title_search` ; `ts_rank()` dans [`order`](/fr/select#order-limit-offset-and-withties) place les meilleurs en tête, et `ts_headline()` dans [`extras`](/fr/select#extras) marque les mots trouvés.
{.lede}

## Les meilleures correspondances d’abord {#best-matches-first}

Une recherche de trois mots, dont chacun peut correspondre :

<CastPanel example="rank_results">

<<< ../examples/rank_results.ts{ts twoslash}

<template #caption><span>The Salt Orchard, qui correspond à deux des mots, puis A Lantern for Edith, qui correspond à un seul ; chaque headline marque les mots trouvés.</span></template>
</CastPanel>

- `query` est le même `tsquery` que celui de la condition, écrit dans un fragment pour que `ts_rank()` et `ts_headline()` puissent le lire. Chaque utilisation envoie la saisie dans son propre paramètre.
- `ts_rank()` note la fréquence des mots de la requête dans le vecteur. Deux lignes peuvent être ex æquo : faites de `order` un tableau qui finit par `{ by: 'id', direction: 'ASC' }` pour une liste stable.
- `ts_headline()` lit le texte, pas le vecteur : `title` ici, avec `<b>` autour de chaque correspondance. Elle peut être lente, car elle parse chaque texte qu’on lui donne, alors ne lui donnez que les lignes que vous affichez ([Mettre en évidence les résultats](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-HEADLINE)).

::: warning Sécurité
Postgres ne garantit pas que la sortie de `ts_headline()` puisse être mise telle quelle dans une page web ([Mettre en évidence les résultats](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-HEADLINE)). Pour garder les marques, donnez-lui vos propres marqueurs avec ses options `StartSel` et `StopSel`, échappez sa sortie, puis remplacez-les.
:::

## Pondérer les colonnes {#weight-the-columns}

Chercher aussi dans l’accroche, une correspondance dans le titre comptant davantage. `setweight()` étiquette les mots de chaque colonne, et `ts_rank()` les pondère selon leur étiquette :

<CastPanel example="rank_results_weighted">

<<< ../examples/rank_results_weighted.ts{ts twoslash}

<template #caption><span>The Salt Orchard, « orchard » dans son titre, puis The Cartographer’s Silence, « map » dans son accroche.</span></template>
</CastPanel>

- `A` et `B` sont deux des quatre étiquettes ; par défaut, `ts_rank()` leur donne les poids 1,0 et 0,4 ([Classer les résultats](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING)).
- `coalesce()` change une accroche `NULL` en `''`, car `||` avec un vecteur `NULL` donne `NULL`, qui ne correspond à aucune ligne.
- Ce vecteur est calculé sur chaque ligne, et aucun index ne le sert. Pour l’indexer, stockez-le dans une colonne générée avec un index GIN, comme `title_search` ([la doc de Postgres](https://www.postgresql.org/docs/current/textsearch-tables.html)) ; la condition s’applique alors à elle.

## Voir aussi {#see-also}

- [Recherche plein texte](/fr/conditions#full-text) : ce que `websearchToTsquery()` lit dans la requête d’un utilisateur.
- [Recherche par préfixe](/fr/prefix-search) : faire correspondre les mots au fil de la saisie.
- [Recherche textuelle](/fr/text-search) : une sous-chaîne, avec `ilike()`.

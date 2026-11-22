---
english: b953ebf0d6a7
---

# Tri utilisateur

Trier selon le choix d’un utilisateur : une colonne et un sens venus de la requête HTTP, sans risque. Associez chaque clé que vous autorisez à un [`OrderSpecForTable`](/fr/select#OrderSpecForTable), donnez le sens comme l’une de deux valeurs, et terminez l’[`order`](/fr/select#order-limit-offset-and-withties) sur `id`.
{.lede}

## Associer les clés que vous autorisez {#map-the-keys-you-allow}

Ici, la requête HTTP demande `sort=tagline` et `dir=desc`. Chaque clé que la page autorise correspond à son propre ordre, et tout le reste reçoit l’ordre par défaut :

<CastPanel example="user_sort">

<<< ../examples/user_sort.ts{ts twoslash}

<template #caption><span>The Salt Orchard, puis The Cartographer’s Silence, puis les deux films sans accroche : Small Hours at Calder Bay (id 1003), puis A Lantern for Edith (id 1001).</span></template>
</CastPanel>

- Les chaînes de la requête HTTP n’atteignent jamais le SQL, pas même comme paramètres : elles choisissent seulement l’un de vos ordres, et chaque `by` est une colonne que vous avez écrite. Une chaîne de l’appelant donnée comme `by` serait un nom, n’importe quelle colonne à portée ([La chaîne d’un appelant comme nom](/fr/security#a-caller-s-string-as-a-name)).
- `direction` vaut `'ASC'` ou `'DESC'`, quoi que contienne `dir` : `sort=nonsense&dir=sideways` donne l’ordre par défaut, `"release_year" ASC, "id" ASC`<!-- probe: db.select('films', db.all, { order: [{ by: 'release_year', direction: 'ASC' }, { by: 'id', direction: 'ASC' }] }) -->. Pour répondre 400 à la place, vérifiez les deux chaînes avant la requête.
- `Object.hasOwn()` limite la recherche aux propres clés de l’objet. Sans lui, `sort=constructor` trouve `Object`, pas un ordre, et la requête lève l’erreur "Direction must be ASC/DESC, not '…'"<!-- message -->.
- `nulls: 'LAST'` garde les films sans accroche à la fin dans les deux sens, `"tagline" DESC NULLS LAST`<!-- probe: examples/user_sort.ts -->. Sans lui, Postgres place `NULL` en premier dans un ordre `DESC` ([Trier les lignes](https://www.postgresql.org/docs/current/queries-order.html)).
- `id`, en dernier, départage les ex æquo : les deux films sans accroche reviennent dans le même ordre à chaque requête, ce dont la [Pagination](/fr/paginate#order-then-limit) a besoin.

## Trier selon plusieurs clés {#sort-by-several-keys}

Ici, la requête HTTP donne une liste, `sort=-runtime,title` : les films les plus longs d’abord, puis par titre. Chaque clé présente dans l’objet ajoute son ordre, un `-` la passe en `DESC`, et une clé que l’objet n’a pas est ignorée :

<CastPanel example="user_sort_keys">

<<< ../examples/user_sort_keys.ts{ts twoslash}

<template #caption><span>The Cartographer’s Silence (131 minutes), The Salt Orchard (112), Small Hours at Calder Bay (104), A Lantern for Edith (98).</span></template>
</CastPanel>

- `"runtime_minutes" DESC, "title" ASC, "id" ASC`<!-- probe: examples/user_sort_keys.ts --> : les clés dans l’ordre de la requête HTTP, puis `id`.
- `sort=-xmin,constructor` ne donne aucune clé : l’ordre est alors `id` seul.
- Une valeur de l’objet peut aussi être un fragment `sql` de la table, comme `` db.sql`jsonb_array_length(${'details'}->'prizes')` ``<!-- tsc: db.select('films', db.all, { order: { by: …, direction: 'DESC' } }) --> : l’utilisateur le choisit par sa clé, comme ici ([Champs JSON](/fr/json-fields#sort-by-a-field)).

## Voir aussi {#see-also}

- [`order`](/fr/select#order-limit-offset-and-withties) et [`OrderSpecForTable`](/fr/select#OrderSpecForTable) : ce qu’écrit chaque élément.
- [La chaîne d’un appelant comme nom](/fr/security#a-caller-s-string-as-a-name) : pourquoi un choix correspond à un nom de votre propre liste.
- [Pagination](/fr/paginate) : la page suivante du même ordre.

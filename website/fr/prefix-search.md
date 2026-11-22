---
english: 3f5a92bfdb83
---

# Recherche par préfixe

Chercher au fil de la saisie : faire correspondre le début de chaque mot tapé jusqu’ici. `to_tsquery()` lit `cart:*` comme les mots qui commencent par `cart`, donc un fragment `sql` sur `title_search` envoie les mots nettoyés, chacun avec `:*`, dans un seul paramètre ; [`ilike()`](/fr/conditions#conditions.ilike) sur un préfixe est la variante pour le début d’un titre entier.
{.lede}

## Le début de chaque mot {#the-start-of-each-word}

Les films dont le titre a un mot qui commence par chaque mot tapé, quand le lecteur tape « the cart » :

<CastPanel example="prefix_search">

<<< ../examples/prefix_search.ts{ts twoslash}

<template #caption><span>The Cartographer’s Silence (id 1002).</span></template>
</CastPanel>

- `prefixQuery()` garde les lettres et les chiffres de chaque mot, puis écrit `the:* & cart:*` : un seul paramètre, `to_tsquery('english', $1)`<!-- probe: db.sql`${{ title_search: db.sql`${db.self} @@ to_tsquery('english', ${db.param('the:* & cart:*')})` }}` -->.
- `to_tsquery()` lit des opérateurs, `&`, `|`, `!`, `<->` et `:*`, et lève une erreur de syntaxe sur un opérateur isolé (42601), comme pour le `salt &` d’un utilisateur. Ne garder que les lettres et les chiffres n’en laisse aucun dans la saisie.
- Postgres réduit chaque mot à sa racine comme pour le vecteur de la colonne, et retire un mot vide : « the » ne compte pour rien, et « cartographe » trouve toujours `'cartograph'`.
- Sans rien de tapé, ou seulement des mots vides, la requête ne contient aucun mot : Postgres envoie un avis et aucun film ne correspond. Laissez le filtre de côté tant qu’aucun mot n’est tapé ([Filtres optionnels](/fr/optional-filters)).
- L’index GIN sur `title_search` sert aussi un préfixe : Postgres choisit un bitmap index scan.

## Le début du titre {#the-start-of-the-title}

Pour faire correspondre plutôt le début du titre entier, donnez à `ilike()` la saisie échappée suivie de `%` :

<CastPanel example="prefix_search_ilike">

<<< ../examples/prefix_search_ilike.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (id 1003).</span></template>
</CastPanel>

- `escapeLike()` est celle de [Recherche textuelle](/fr/text-search#escape-then-match) : les `%`, `_` et `\` de la saisie ne correspondent qu’à eux-mêmes.
- Seules les premières lettres du titre comptent : « lantern » ne trouve pas A Lantern for Edith, et « a lantern » le trouve.

## Voir aussi {#see-also}

- [Recherche plein texte](/fr/conditions#full-text) : `websearchToTsquery()`, et `to_tsquery()` dans un fragment.
- [Recherche classée](/fr/rank-results) : les meilleures correspondances d’abord.
- [Contrôler la recherche plein texte](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES), dans la doc de Postgres : les préfixes dans un `tsquery`.

---
english: 40523215b823
---

# Mises à jour en place

Mettre à jour à partir de la valeur actuelle : un compteur, une valeur fixée une fois, une fusion JSON, un élément ajouté à un tableau. Dans [`update()`](/fr/insert#update), une valeur en fragment `sql` lit la colonne comme [`db.self`](/fr/sql-template#self), donc Postgres calcule la nouvelle valeur à partir de celle stockée, en une seule instruction.
{.lede}

## Compter {#count}

Ajouter un vote au compte de quatre étoiles d’un film :

<CastPanel example="update_in_place">

<<< ../examples/update_in_place.ts{ts twoslash}

</CastPanel>

- [`add(1)`](/fr/conditions#conditions.add) donne `"votes" + $1`<!-- probe: examples/update_in_place.ts -->. `` db.sql`${db.self} + 1` `` écrit la même chose, avec `1` dans le texte SQL.
- Postgres ajoute à la valeur au moment où il met la ligne à jour. À son niveau d’isolation par défaut, deux votes simultanés comptent tous les deux, là où lire le compte en JavaScript puis le réécrire peut en perdre un ([Read Committed](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)).
- Un film qui n’a pas encore de vote à quatre étoiles n’a pas de ligne à mettre à jour, donc `update()` donne `[]`. Pour insérer la ligne dans ce cas, utilisez [`upsert()`](/fr/insert#upsert).

## Fixer une valeur une fois {#set-a-value-once}

Le `subtitled` d’une séance vaut `NULL` tant que le cinéma ne l’a pas dit. Fixez-le, sauf s’il l’est déjà :

<CastPanel example="update_in_place_once">

<<< ../examples/update_in_place_once.ts{ts twoslash}

<template #caption><span>La séance 1002 est désormais sous-titrée. Sur la séance 1000, déjà à false, la même mise à jour garde false.</span></template>
</CastPanel>

- [`coalesce()`](https://www.postgresql.org/docs/current/functions-conditional.html#FUNCTIONS-COALESCE-NVL-IFNULL) donne la valeur stockée, ou la nouvelle quand elle vaut `NULL`.
- Dans un fragment, une valeur passe par [`db.param()`](/fr/sql-template#param) : une chaîne seule y est un nom, et un booléen lève une erreur ([Interpolations](/fr/sql-template#interpolations)).
- Pour savoir si cette requête HTTP a fixé la valeur, filtrez plutôt sur elle, `{ id: 1002, subtitled: db.conditions.isNull }`<!-- tsc: db.update('screenings', { subtitled: true }, …) -->, et fixez `true` : `update()` donne `[]` quand la valeur était déjà fixée.

## Fusionner du JSON {#merge-json}

Ajouter des clés aux `details` d’un film, une colonne `jsonb`, et garder les autres :

<CastPanel example="update_in_place_json">

<<< ../examples/update_in_place_json.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay : son format devient 70mm, et restored s’ajoute.</span></template>
</CastPanel>

- `||` fusionne les clés de premier niveau : chaque clé du patch remplace entièrement celle stockée. `{ prizes: ['Bronze Owl'] }` sur The Cartographer’s Silence lui retire ses deux prix. Pour changer une clé à l’intérieur d’une autre, utilisez `jsonb_set()` ([JSON functions](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-JSON-PROCESSING)).
- Le patch est un seul paramètre, casté en `jsonb` : `CAST($1 AS "jsonb")`<!-- probe: examples/update_in_place_json.ts -->.

## Ajouter un élément à un tableau {#add-an-array-item}

Ajouter un genre à un film, sauf s’il l’a déjà :

<CastPanel example="update_in_place_array">

<<< ../examples/update_in_place_array.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay, qui n’avait pas de genre, est désormais un mystery.</span></template>
</CastPanel>

- [`array_append()`](https://www.postgresql.org/docs/current/functions-array.html) ajoute l’élément même quand le tableau le contient. Le `not(arrayContains(['mystery']))` du filtre écarte un film qui l’a, ce qui donne alors `[]` ([Colonnes tableau](/fr/array-columns)).
- `array_remove()` retire un élément, toutes ses occurrences.

## Voir aussi {#see-also}

- [`update()`](/fr/insert#update) : ses arguments, et ce qu’elle renvoie.
- [`self`](/fr/sql-template#self) : où il est la colonne.
- [L’arithmétique](/fr/conditions#arithmetic) : `add()` et `subtract()`, sur les nombres et les dates.

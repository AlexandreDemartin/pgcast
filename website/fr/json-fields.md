---
english: 22c09df342fa
---

# Champs JSON

Interroger des champs JSON : lire un champ d’une colonne `jsonb` dans le résultat, trier selon ce champ, filtrer dessus. Un fragment `sql` dans [`extras`](/fr/select#extras) le lit avec `->>`, typé par le fragment ; [`order`](/fr/select#order-limit-offset-and-withties) prend le même fragment, et [`jsonbContains()`](/fr/conditions#conditions.jsonbContains) et [`jsonbPathExists()`](/fr/conditions#conditions.jsonbPathExists) filtrent dessus.
{.lede}

## Lire un champ {#read-a-field}

Chaque film avec le format de sa copie, un champ de `details` :

<CastPanel example="json_fields">

<<< ../examples/json_fields.ts{ts twoslash}

<template #caption><span>The Salt Orchard et A Lantern for Edith en 35mm, les deux autres en numérique.</span></template>
</CastPanel>

- `->>` donne le champ en texte, `"details"->>'format'`<!-- probe: examples/json_fields.ts -->, ou `NULL` quand la clé manque. Le type est le second paramètre de type du fragment, `string | null` : pgcast ne le vérifie pas d’après le JSON.
- `->` garde le champ en JSON, et `#>>` suit un chemin : `` db.sql`${'details'}#>>'{prizes,0}'` ``<!-- tsc: db.select('films', db.all, { extras: { first: … } }) --> est le premier prix d’un film, ou `NULL` ([opérateurs JSON](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-JSON-OP-TABLE)).
- Une clé qui vient d’une variable passe par `db.param()`, comme dans le tableau de [jsonb](/fr/conditions#jsonb).
- Pour typer toute la colonne plutôt qu’un champ, affinez son placeholder : [Un domaine `jsonb`](/fr/custom-types#a-jsonb-domain).

## Trier selon un champ {#sort-by-a-field}

Les films qui ont le plus de prix d’abord, le nombre de `prizes` lu une fois et utilisé deux fois :

<CastPanel example="json_fields_order">

<<< ../examples/json_fields_order.ts{ts twoslash}

<template #caption><span>The Cartographer’s Silence (2 prix), The Salt Orchard (1), A Lantern for Edith (0), puis Small Hours at Calder Bay, qui n’a pas de clé prizes.</span></template>
</CastPanel>

- `jsonb_array_length()` compte les éléments du tableau, et donne `NULL` quand la clé manque : `nulls: 'LAST'` place Small Hours at Calder Bay à la fin, `DESC NULLS LAST`<!-- probe: examples/json_fields_order.ts -->.
- Un tri sur `->>` trie du texte, comme une comparaison sur son résultat compare du texte ([jsonb](/fr/conditions#jsonb)). Castez un nombre JSON pour le trier comme un nombre : `` db.sql`(${'details'}->>'reels')::int` ``<!-- tsc: db.select('films', db.all, { order: { by: …, direction: 'ASC' } }) -->.

## Filtrer sur un champ {#filter-on-a-field}

Les films numériques qui ont au moins un prix, deux conditions sur `details` jointes par [`and()`](/fr/conditions#conditions.and) :

<CastPanel example="json_fields_filter">

<<< ../examples/json_fields_filter.ts{ts twoslash}

<template #caption><span>The Cartographer’s Silence (id 1002). Small Hours at Calder Bay est aussi en numérique, sans prix.</span></template>
</CastPanel>

`jsonbContains()` vérifie qu’un champ est égal à une valeur, et `jsonbPathExists()` compare dans un chemin, ici avec la variable `$n`. Le tableau de [jsonb](/fr/conditions#jsonb) donne celle à utiliser pour chaque test, y compris pour un motif saisi par un utilisateur.

## Voir aussi {#see-also}

- [jsonb](/fr/conditions#jsonb) : les deux conditions, ce à quoi chacune correspond et ce qu’elle refuse.
- [`extras`](/fr/select#extras) et [`order`](/fr/select#order-limit-offset-and-withties) : les options où va le fragment.
- [Fonctions et opérateurs JSON](https://www.postgresql.org/docs/current/functions-json.html), dans la doc de Postgres.

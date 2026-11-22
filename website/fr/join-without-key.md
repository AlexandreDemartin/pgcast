---
english: 3f792f4e0291
---

# Jointures sans clé

Joindre sans clé étrangère : sur un tableau, une clé JSON, une valeur calculée. Une sous-requête dans [`lateral`](/fr/select#lateral) donne à chaque ligne les lignes auxquelles elle correspond, et [`db.parent()`](/fr/sql-template#parent) nomme la colonne de la ligne extérieure dans son filtre, donc la condition de la jointure peut être n’importe quel SQL.
{.lede}

## Sur un tableau {#on-an-array}

Chaque film, et les autres films qui partagent l’un de ses genres :

<CastPanel example="join_without_key">

<<< ../examples/join_without_key.ts{ts twoslash}

<template #caption><span>The Salt Orchard et A Lantern for Edith, deux drames, se trouvent l’un l’autre ; les deux autres films n’en trouvent aucun.</span></template>
</CastPanel>

- `&&` est vrai quand les deux tableaux partagent un élément : `"genres" && "films"."genres"`<!-- probe: examples/join_without_key.ts -->. Un film dont `genres` vaut `{}` n’en partage aucun.
- `alias: 'other'` garde `db.parent()` sur le film extérieur, comme dans [Joindre une table à elle-même](/fr/lateral#join-a-table-to-itself), et [`ne(db.parent('id'))`](/fr/conditions#conditions.ne) écarte le film lui-même.
- `alike` est typé comme les lignes de la sous-requête, comme pour une jointure sur une clé.
- Pour une colonne simple face au tableau de la ligne extérieure, écrivez [`eqAny(db.parent('genres'))`](/fr/conditions#conditions.eqAny).

## Sur une clé JSON {#on-a-json-key}

Chaque film, et les autres films dans le même format, une clé de `details` :

<CastPanel example="join_without_key_json">

<<< ../examples/join_without_key_json.ts{ts twoslash}

<template #caption><span>Les deux films en 35mm se trouvent l’un l’autre, comme les deux films en numérique.</span></template>
</CastPanel>

- `->>` lit la clé en texte des deux côtés : `"details"->>'format' = "films"."details"->>'format'`<!-- probe: examples/join_without_key_json.ts -->. Un film sans la clé donne `NULL`, qui n’est égal à rien.
- Sans index, Postgres relit les films pour chacun d’eux. Un index sur l’expression, `CREATE INDEX ON films ((details->>'format'))`, sert ce `=` ([Index sur des expressions](https://www.postgresql.org/docs/current/indexes-expressional.html)).

## Sur une valeur calculée {#on-a-computed-value}

Chaque film, et les autres films dont la durée est à 10 minutes près la sienne :

<CastPanel example="join_without_key_computed">

<<< ../examples/join_without_key_computed.ts{ts twoslash}

<template #caption><span>Small Hours at Calder Bay (104 minutes) trouve The Salt Orchard (112) et A Lantern for Edith (98) ; The Cartographer’s Silence (131) n’en trouve aucun.</span></template>
</CastPanel>

- Le fragment compare la colonne à des valeurs calculées depuis la ligne extérieure : `BETWEEN "films"."runtime_minutes" - 10 AND "films"."runtime_minutes" + 10`<!-- probe: examples/join_without_key_computed.ts -->.
- Pour trier les correspondances selon une valeur calculée, comme une distance, et garder la plus proche : [Jointures § Trier par une valeur calculée](/fr/lateral#order-by-a-computed-value).

## Voir aussi {#see-also}

- [Jointures](/fr/lateral) : `lateral` pas à pas, sur des clés étrangères.
- [`parent()`](/fr/sql-template#parent) : où il fonctionne, et ce qu’il écrit.
- [Atteindre la ligne extérieure](/fr/raw-sql#reach-the-outer-row-through-parent) : une sous-requête écrite à la main dans un `lateral`.

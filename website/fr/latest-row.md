---
english: 0378229fc723
---

# Dernières lignes

Obtenir la dernière ligne : la prochaine séance de chaque film, ou la dernière par cinéma. Imbriquez [`selectOne()`](/fr/select#selectOne) avec un [`order`](/fr/select#order-limit-offset-and-withties) dans un [`lateral`](/fr/select#lateral) pour une ligne par parent, ou donnez à [`distinct`](/fr/select#distinct) un `order` qui commence par sa colonne.
{.lede}

## Une ligne par parent {#one-row-per-parent}

Chaque film avec sa prochaine séance à partir du 2 mars 2030 :

<CastPanel example="latest_row">

<<< ../examples/latest_row.ts{ts twoslash}

<template #caption><span>A Lantern for Edith au cinéma 1002, à 20:15 UTC, et Small Hours at Calder Bay au cinéma 1001, à 18:00 UTC ; null pour les deux autres, dont les séances ont lieu le 1er mars.</span></template>
</CastPanel>

- Dans le lateral, `selectOne()` ajoute un `LIMIT` de 1 à `ORDER BY "starts_at" ASC, "id" ASC`<!-- probe: examples/latest_row.ts --> : la première ligne de l’ordre, pour chaque film. Pour la dernière, triez en `DESC`.
- `next` est la ligne ou `null`, et son type le dit. Chaque film revient, y compris ceux qui n’ont plus de séance.
- `id` après `starts_at` départage deux séances à la même heure, pour que la même revienne à chaque fois.

## La dernière par valeur d’une colonne {#the-latest-per-value-of-a-column}

La dernière séance de chaque cinéma, depuis `screenings` seule :

<CastPanel example="latest_row_distinct">

<<< ../examples/latest_row_distinct.ts{ts twoslash}

<template #caption><span>Le cinéma 1000 à 21:45 UTC le 1er mars, la plus tardive de ses deux séances ; les cinémas 1001 et 1002 avec leur unique séance, le 2 mars.</span></template>
</CastPanel>

- `SELECT DISTINCT ON ("cinema_id")`<!-- probe: examples/latest_row_distinct.ts --> garde la première ligne de chaque `cinema_id` dans l’ordre : `"starts_at" DESC`<!-- probe: examples/latest_row_distinct.ts --> en fait la dernière.
- L’`order` commence par `cinema_id`, sinon Postgres refuse la requête (42P10).
- Un cinéma sans séance n’est pas dans le résultat, et les lignes sont des séances, sans colonne de `cinemas`. Pour chaque cinéma avec sa ligne ou `null`, partez de `cinemas` avec le lateral ci-dessus.

## Voir aussi {#see-also}

- [`lateral`](/fr/select#lateral) et [`selectOne()`](/fr/select#selectOne) : ce que renvoie une requête imbriquée.
- [`distinct`](/fr/select#distinct) : `DISTINCT` et `DISTINCT ON`.
- [Jointures](/fr/lateral) : les lignes qui pointent vers une ligne, pas à pas.

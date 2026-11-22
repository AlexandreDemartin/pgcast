---
english: c9c1c2af5e09
---

# Upserts

Insérer ou mettre à jour : enregistrer une ligne qui existe peut-être déjà, et savoir ce qui s’est passé. [`upsert()`](/fr/insert#upsert) est le point d’entrée ; cette page ajoute les tâches qui l’entourent : lire [`$action`](/fr/insert#UpsertAction), garder une colonne stockée avec `updateColumns`, et obtenir la ligne stockée quand [`doNothing`](/fr/insert#doNothing) n’en renvoie aucune.
{.lede}

## Enregistrer les lignes, et lire ce qui s’est passé {#save-the-rows-and-read-what-happened}

La distribution de The Salt Orchard revient d’une modification : le rôle de rang 3 change d’acteur, et le rang 4 est nouveau. La clé d’un rôle est `(film_id, billing)` :

<CastPanel example="insert_or_update">

<<< ../examples/insert_or_update.ts{ts twoslash}

<template #caption><span>Le rang 3 est maintenant Halvard Brecke, avec $action 'UPDATE' ; le rang 4 est un nouveau rôle, avec $action 'INSERT'.</span></template>
</CastPanel>

- `ON CONFLICT ("film_id", "billing")`<!-- probe: examples/insert_or_update.ts --> nomme les colonnes de la clé primaire. Avec des colonnes qu’aucun index ni aucune contrainte unique ne couvre, Postgres refuse la requête (42P10).
- Pour agir sur les nouvelles lignes seules, filtrez dessus : `roles.filter(role => role.$action === 'INSERT')`<!-- tsc: const roles = await db.upsert('roles', [{ film_id: 1000, billing: 4, actor_id: 1002, character: 'The orchard keeper' }], ['film_id', 'billing']).run(pool); … -->.
- Deux lignes de même clé dans un seul appel font refuser la requête par Postgres (21000) : « <span lang="en">ON CONFLICT DO UPDATE command cannot affect row a second time</span> ». Fusionnez-les d’abord.

## Garder une colonne stockée {#keep-a-stored-column}

Le rang 2 change d’acteur, et le rôle garde le nom du personnage déjà stocké, `Silas Vey`, et non le `Silas` du flux :

<CastPanel example="insert_or_update_keep">

<<< ../examples/insert_or_update_keep.ts{ts twoslash}

<template #caption><span>Le rang 2 est maintenant Ambrose Okafor, toujours dans le rôle de Silas Vey, avec $action 'UPDATE'.</span></template>
</CastPanel>

`DO UPDATE SET ("actor_id") = ROW(EXCLUDED."actor_id")`<!-- probe: examples/insert_or_update_keep.ts --> : la mise à jour ne modifie que `actor_id`, et une insertion écrit toujours chaque colonne donnée. [Options](/fr/insert#upsert-options) donne les autres, dont `noNullUpdateColumns` et `updateValues`.

## Insérer seulement, puis lire la ligne {#insert-only-then-read-the-row}

Ajoutez un rôle sauf si son rang est déjà pris, et obtenez dans tous les cas le rôle qui l’occupe. Avec `doNothing`, une ligne déjà présente ne renvoie rien :

<CastPanel example="insert_or_update_do_nothing">

<<< ../examples/insert_or_update_do_nothing.ts{ts twoslash}

<template #caption><span>undefined : A Lantern for Edith a déjà un rang 3, Aunt Lise.</span></template>
</CastPanel>

Un select le suit donc, sur la même clé, quand il donne `undefined` :

<<< ../examples/plain/insert_or_update_cast_once.ts{ts twoslash}

- `role` est la nouvelle ligne, avec son `$action`, ou la ligne stockée, sans.
- La ligne n’est pas verrouillée entre les deux requêtes : si un autre client la supprime entre-temps, [`selectExactlyOne()`](/fr/select#selectExactlyOne) est rejetée avec `NotExactlyOneError`.
- Dans un batch, `doNothing` ne renvoie que les lignes insérées : [Batches § Ignorer les lignes déjà présentes](/fr/batches#skip-the-rows-already-there).

## Voir aussi {#see-also}

- [`upsert()`](/fr/insert#upsert) et ses [Options](/fr/insert#upsert-options) : le SQL de chaque option.
- [`UpsertAction`](/fr/insert#UpsertAction) et [`doNothing`](/fr/insert#doNothing) : ce que contient le résultat.
- [Batches](/fr/batches) : de nombreuses lignes en une requête.

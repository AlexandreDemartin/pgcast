---
english: e3b4394041f9
---

# Suppressions par batch

Supprimer par batches : retirer beaucoup de lignes sans garder leurs verrous dans une seule longue transaction. Postgres n’a pas de `DELETE … LIMIT`, donc [`deletes()`](/fr/insert#deletes) prend un fragment `sql` sur [`self`](/fr/sql-template#self), `IN (SELECT … ORDER BY … LIMIT …)`, et une boucle le lance jusqu’à ce qu’il ne supprime plus rien.
{.lede}

## Supprimer un batch {#delete-one-batch}

Les séances d’avant le 3 mars 2030, les plus anciennes d’abord, deux par batch pour montrer la boucle :

<CastPanel example="delete_in_batches">

<<< ../examples/delete_in_batches.ts{ts twoslash}

<template #caption><span>Les séances 1000 et 1001, les deux du 1er mars.</span></template>
</CastPanel>

- `DELETE FROM screenings LIMIT 1` est une erreur de syntaxe pour Postgres (42601). La sous-requête choisit donc le batch, et `"id" IN (`<!-- probe: examples/delete_in_batches.ts --> le supprime.
- `db.self` est la colonne de sa clé, `id`. Donné comme `where` entier, sans clé, le fragment lève l’erreur "The 'self' column alias has no meaning here"<!-- message -->.
- `ORDER BY "starts_at", "id"`<!-- probe: examples/delete_in_batches.ts --> prend les plus anciennes d’abord, donc une exécution arrêtée à mi-chemin laisse les plus récentes.
- `returning: ['id']` garde chaque résultat petit, car la boucle n’a besoin que de sa longueur.
- Une séance qui a des réservations est refusée (23503), et le batch avec elle : supprimez d’abord ses `seat_bookings`, de la même façon.

## Tout supprimer {#delete-them-all}

La boucle lance le batch jusqu’à ce qu’il ne supprime plus rien :

<<< ../examples/plain/delete_in_batches_loop.ts{ts twoslash}

`deleted` vaut `4` : un batch de deux, un autre de deux, puis un de zéro.

- Chaque `deletes()` s’exécute sur le pool, donc chaque batch est une transaction à part : il est commité, et libère les verrous de ses lignes, avant que le suivant commence. Dans une seule [`transaction()`](/fr/transaction#transaction), chaque batch garderait ses verrous jusqu’au dernier `COMMIT`, comme le ferait un seul `DELETE`.
- Choisissez une taille dont le `DELETE` reste court sur votre table.
- Pour écrire beaucoup de lignes d’un coup : [Batches](/fr/batches).

## Voir aussi {#see-also}

- [`deletes()`](/fr/insert#deletes) et [`self`](/fr/sql-template#self) : le SQL de chaque partie.
- [Transactions](/fr/transaction) : ce qui s’exécute dans une transaction, et ce qui ne s’y exécute pas.
- [`DELETE`](https://www.postgresql.org/docs/current/sql-delete.html), dans la doc de Postgres.

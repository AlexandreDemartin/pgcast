---
english: 02624e04518e
description: "Annulez une partie d’une transaction et gardez le reste : réservez les places libres parmi plusieurs, dans une seule transaction."
---

# Savepoints

Annulez une partie d’une transaction et gardez le reste, avec `savepoint()` : réservez les places libres parmi plusieurs, en passant celles déjà prises, dans une seule transaction. Puis pourquoi un conflit relance quand même toute la transaction, et ce qu’il faut éviter. La page suppose que vous connaissez [Retries](/fr/retries).
{.lede}

## Réserver ce qui est libre {#book-what-is-free}

Une cliente demande les places F7, F8 et F9 de la séance 1000, et Hollis a déjà F8. L’[`insert()`](/fr/insert#insert) de chaque place va dans son propre [`savepoint()`](/fr/transaction#savepoint), dans un seul [`serializable()`](/fr/transaction#serializable) : une place déjà prise, refusée avec 23505 par la clé primaire de `seat_bookings`, n’annule que son propre insert, et les autres sont commitées.

<<< ../examples/plain/savepoints_seats.ts{ts twoslash}

`result` vaut `{ booked: ['F7', 'F9'], taken: ['F8'] }`, et `spClient` est `txnClient` lui-même (survolez-le). La transaction envoie :

<!-- probe: db.serializable(pool, txnClient => db.savepoint(txnClient, async () => {}).then(() => db.savepoint(txnClient, async () => { throw new Error(); })).catch(() => {}).then(() => db.savepoint(txnClient, async () => {}))) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- F7
SAVEPOINT pgcast_savepoint_1
-- insert(), then
RELEASE SAVEPOINT pgcast_savepoint_1
-- F8
SAVEPOINT pgcast_savepoint_1
-- insert(), which Postgres refuses with 23505, then
ROLLBACK TO SAVEPOINT pgcast_savepoint_1
RELEASE SAVEPOINT pgcast_savepoint_1
-- F9
SAVEPOINT pgcast_savepoint_1
-- insert(), then
RELEASE SAVEPOINT pgcast_savepoint_1
COMMIT
```

Le SQL de la requête du callback : [`insert()`](/fr/insert#insert) ; chaque cas qu’envoie `savepoint()`, les clients qu’elle accepte, et le nom d’un savepoint placé dans un autre : [`savepoint()`](/fr/transaction#savepoint).

## Laisser un conflit relancer la transaction {#let-a-conflict-retry-the-transaction}

Le `catch` traite le 23505 et relance toute autre erreur. Si le callback laisse remonter une erreur 40001 ou 40P01 de Postgres, [`savepoint()`](/fr/transaction#savepoint) la relance. La transaction reste en échec. Si l’erreur atteint l’appel extérieur à `serializable()` et qu’il reste une tentative, celui-ci reprend toute la réservation ([Retries](/fr/retries)).

## Éviter les pièges {#avoid-the-pitfalls}

- Sur un même client, attendez chaque savepoint avec `await`, comme le fait la boucle. pgcast ne vérifie pas si les appels se chevauchent. Si le savepoint extérieur est libéré en premier, Postgres supprime aussi le savepoint intérieur. Son propre `RELEASE` échoue alors avec 3B001 ([`savepoint()`](/fr/transaction#savepoint)).
- Interceptez l’erreur d’une requête autour de `savepoint()`, comme le fait l’exemple : si le callback l’intercepte et se termine, `savepoint()` est rejetée avec 25P02, donc un 40001 qu’il intercepte n’est pas réessayé à cet endroit ; avec le `catch` de l’exemple, la transaction est rejetée avec ce 25P02 ([`savepoint()`](/fr/transaction#savepoint)).
- Appelez `savepoint()` sur le client d’une transaction : hors d’une transaction, Postgres refuse son `SAVEPOINT` avec 25P01 ([`savepoint()`](/fr/transaction#savepoint)).
- Une `transaction()` appelée avec le client du callback n’est pas un savepoint : elle rejoint la transaction extérieure ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)).

## Voir aussi {#see-also}

- [`savepoint()`](/fr/transaction#savepoint) : le SQL de chaque cas, les clients qu’elle accepte, sa profondeur et ses limites.
- [Retries](/fr/retries) : ce qui va dans le callback d’une transaction, et comment tester un retry.
- [Erreurs](/fr/handle-errors) : les erreurs d’une application, venues de Postgres et de pgcast.

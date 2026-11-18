---
english: 1ba2be8122a5
description: "Annulez une partie d’une transaction et gardez le reste : réservez les places libres parmi plusieurs, dans une seule transaction."
---

# Savepoints

Annulez une partie d’une transaction et gardez le reste, avec `savepoint()` : réservez les places libres parmi plusieurs, en passant celles déjà prises, dans une seule transaction. Puis pourquoi un conflit relance quand même toute la transaction, et ce qu’il faut éviter. La page suppose que vous connaissez [Retries](/fr/retries).
{.lede}

## Réserver ce qui est libre {#book-what-is-free}

Une cliente demande les places F7, F8 et F9 de la séance 1000, et Hollis a déjà F8. L’[`insert()`](/fr/insert#insert) de chaque place va dans son propre [`savepoint()`](/fr/transaction#savepoint), dans un seul [`serializable()`](/fr/transaction#serializable) : une place déjà prise, refusée avec 23505 par la clé primaire de `seat_bookings`, n’annule que son propre insert, et les autres sont commitées.

<<< ../examples/plain/savepoints_seats.ts{ts twoslash}

`result` vaut `{ booked: ['F7', 'F9'], taken: ['F8'] }`. Le client du callback, `spClient`, est le client qu’il a reçu, typé tel quel : dans `serializable()`, un [`TxnClientForSerializable`](/fr/transaction#TxnClientForSerializable) (survolez-le). La transaction envoie :

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

Le `catch` ne garde que le 23505 : toute autre erreur remonte jusqu’à `serializable()`. Le SQL de la requête du callback : [`insert()`](/fr/insert#insert) ; chaque cas qu’envoie `savepoint()`, et le nom d’un savepoint placé dans un autre : [`savepoint()`](/fr/transaction#savepoint).

## Laisser un conflit relancer la transaction {#let-a-conflict-retry-the-transaction}

Sur un 40001 ou un 40P01 dans le savepoint, `savepoint()` est rejetée avec cette erreur et n’envoie pas de `ROLLBACK TO`, donc la transaction reste en échec. Laissez-la remonter, comme le fait le `throw err` de l’exemple : `transaction()` annule la transaction et exécute de nouveau tout son callback, savepoint de chaque place compris ([Retries](/fr/retries)).

Un savepoint ne réessaie jamais de lui-même : après un 40001 ou un 40P01, la transaction est en échec, et le retry demande une nouvelle transaction, avec un nouvel instantané.

## Éviter les pièges {#avoid-the-pitfalls}

- Un seul savepoint à la fois sur un client : attendez chacun avec `await`. Deux en même temps s’imbriquent dans l’ordre de leurs appels : deux places réservées avec `Promise.all()` font rejeter la transaction avec 3B001, et rien n’est réservé.
- N’interceptez pas l’erreur d’une requête dans le callback du savepoint : une fois son travail annulé, `savepoint()` est rejetée avec 25P02. Interceptez-la autour de `savepoint()`, comme le fait l’exemple.
- Hors d’une transaction, Postgres refuse le `SAVEPOINT` avec 25P01, et le callback ne s’exécute jamais : appelez `savepoint()` sur le client d’une transaction.

Une `transaction()` appelée avec le client du callback d’une `transaction()` n’est pas un savepoint : elle n’envoie rien, et son callback rejoint la transaction extérieure ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)).

## Voir aussi {#see-also}

- [`savepoint()`](/fr/transaction#savepoint) : le SQL de chaque cas, les clients qu’elle accepte, sa profondeur et ses limites.
- [Retries](/fr/retries) : ce qui va dans le callback d’une transaction, et comment tester un retry.
- [Erreurs](/fr/handle-errors) : les erreurs d’une application, venues de Postgres et de pgcast.

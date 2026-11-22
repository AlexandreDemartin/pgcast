---
english: 5638bfc6b396
description: "Réservez des places sous SERIALIZABLE, pour que deux requêtes HTTP simultanées n’enfreignent pas une règle, et laissez pgcast relancer la transaction refusée."
---

# Retries

Réservez des places pour une séance sous `SERIALIZABLE`, pour que deux requêtes HTTP simultanées ne puissent pas enfreindre une règle, et laissez pgcast relancer la transaction quand Postgres en refuse une. Puis ce qui va dans le callback et ce qui reste dehors, et comment tester un retry. La page suppose les bases du [tutoriel](/fr/tutorial).
{.lede}

## Mettre la règle et ses écritures dans un seul callback {#put-the-rule-and-its-writes-in-one-callback}

La règle : quatre places par client et par séance, au plus. Aucune contrainte ne peut l’exprimer, donc le code compte, puis réserve, les deux dans une seule transaction [`serializable()`](/fr/transaction#serializable) :

<<< ../examples/plain/retries_book_seats.ts{ts twoslash}

Ines a deux onglets ouverts, et réserve depuis les deux à la fois. Chaque transaction compte 0 place détenue, puis réserve, ce qui lui en donnerait cinq. En `SERIALIZABLE`, Postgres refuse l’une des deux, à son `INSERT` ou à son `COMMIT`, avec 40001 (`serialization_failure`) ; pgcast annule la transaction et relance tout le callback. Ici, la transaction de `tabTwo` envoie :

<!-- probe: (refused => db.serializable({ connect: async () => ({ release() {}, query: async query => { await pool.query(query); if (query.text === 'COMMIT' && !refused++) throw Object.assign(new Error(), { code: '40001' }); return { rows: [] }; } }) }, async () => {}))(0) -->
```sql
-- attempt 1
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- count(): 0 seats held, then insert() of E4, E5 and E6
COMMIT
-- refused with 40001: tabOne has committed D4 and D5
ROLLBACK
-- attempt 2, 25 to 250 ms later
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- count(): 2 seats held, and 2 + 3 > 4, so no insert()
COMMIT
```

L’onglet dont la transaction est commitée la première obtient ses lignes, `seat_bookings.JSONSelectable[]` ; l’autre obtient `null`, ici `tabTwo`. Le SQL des requêtes du callback : [`count()`](/fr/aggregates#count) et [`insert()`](/fr/insert#insert) ; ce que pgcast envoie autour, et quand il réessaie : [Retries](/fr/transaction#retries).

- Exécutez chaque requête de la transaction sur `txnClient`. Une requête sur `pool` n’en fait pas partie : elle échappe au rollback, et la tentative suivante l’exécute de nouveau.
- Deux requêtes HTTP peuvent aussi passer l’une après l’autre, et alors aucune n’est réessayée : la seconde compte simplement les places de la première.

## Garder les effets de bord hors du callback {#keep-side-effects-out-of-the-callback}

Le callback s’exécute une fois par tentative, jusqu’à cinq fois par défaut. Postgres en annule les requêtes à chaque fois (`ROLLBACK`) ; rien d’autre n’est défait. Ce qui n’est pas une requête sur `txnClient` va donc avant la transaction ou après :

<<< ../examples/plain/retries_outside.ts{ts twoslash}

| Travail | Où |
|---|---|
| les requêtes de la règle et de la réservation | dans le callback, sur `txnClient` |
| un `fetch()`, un fichier, un prix venu d’un autre service | avant |
| un e-mail, un paiement, un message sur une file | après le `await`, à partir de ce que le callback a renvoyé |
| un compteur, un tableau, une ligne de log | à partir de la valeur renvoyée, jamais modifié dans le callback |

Si ce travail passe dans le callback, une réservation réessayée envoie deux e-mails de confirmation, et ajoute deux fois ses places à un tableau extérieur.

## Laisser passer l’erreur {#let-the-error-through}

pgcast ne réessaie que si l’erreur lui parvient. Après une erreur de requête, les requêtes ordinaires échouent avec 25P02 (`current transaction is aborted, commands ignored until end of transaction block`) jusqu’au rollback. Si le callback se termine normalement, pgcast envoie `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->.

Si Postgres répond à ce `COMMIT` par `ROLLBACK`, la promesse est rejetée sans retry et rien n’est enregistré. Avec [`transactionRequiresCommit: false`](/fr/runtime-config#Config.transactionRequiresCommit), elle se résout avec la valeur renvoyée par le callback. Une nouvelle erreur 40001 au `COMMIT` peut encore déclencher un retry.

Si vous en interceptez une à l’intérieur, relancez-la.

Interceptez-la hors de la transaction, une fois que pgcast a abandonné, avec [`isDatabaseError()`](/fr/transaction#isDatabaseError) :

<<< ../examples/plain/retries_catch.ts{ts twoslash}

| Ce qui s’est passé | `bookSeats()` | `reply()` |
|---|---|---|
| réservé | se résout avec les lignes | `'Booked'` |
| au-delà des quatre places | se résout avec `null` | `'Four seats each, at most'` |
| une place déjà réservée par quelqu’un d’autre | est rejetée avec 23505, parfois après un retry | `'Seat taken'` |
| un conflit à chaque tentative | est rejetée avec le 40001 ou le 40P01 de la dernière tentative | `'Busy: please try again'` |

## Réserver dans une transaction plus large {#book-inside-a-larger-transaction}

Avec le `txnClient` d’une transaction ouverte, `bookSeats()` la rejoint si le niveau d’isolation enregistré pour cette transaction satisfait le niveau demandé par `serializable()`. L’appel imbriqué n’envoie alors aucune requête SQL qui lui soit propre ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)). Un couple réserve deux places, les deux ou aucune :

<<< ../examples/plain/retries_larger.ts{ts twoslash}

Une seule transaction : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, les deux `count()` et `insert()`, `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->. Si l’un des `bookSeats()` se résout avec `null`, le `throw` envoie `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) --> au lieu de `COMMIT`, et l’`await` est rejeté avec cette `Error`, sans retry. Sur un 40001, c’est la transaction extérieure qui est annulée et relance son callback, y compris les deux réservations.

Typé `pg.Pool | db.TxnClientForSerializable`, le premier paramètre refuse le client d’une transaction de niveau inférieur, où la règle ne tiendrait plus (2345, avec `strict` activé ou non) :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const bookSeats = (txnClientOrPool: pg.Pool | db.TxnClientForSerializable,
  screening_id: number, seats: string[], customer: string) =>
  db.serializable(txnClientOrPool, async txnClient => {
    const held = await db.count('seat_bookings', { screening_id, customer }).run(txnClient);
    if (held + seats.length > 4) return null;
    return db.insert('seat_bookings', seats.map(seat => ({ screening_id, seat, customer }))).run(txnClient);
  });
// ---cut---
await db.readCommitted(pool, txnClient => bookSeats(txnClient, 1000, ['G1'], 'Wren Abernathy'));
```

Un paramètre de type [`db.Queryable`](/fr/sql-template#Queryable) accepte ce client. L’appel ci-dessous compile, puis sa promesse est rejetée avant que le callback de réservation soit appelé. Avec [`transactionRequiresSatisfyingLevel: false`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), la réservation s’exécuterait en `READ COMMITTED`.

<<< ../examples/plain/retries_lower_level.ts{ts twoslash}

## Mettre les requêtes en file avec un lock {#queue-the-requests-with-a-lock}

Plutôt que d’entrer en conflit et de réessayer, les requêtes HTTP pour une même séance peuvent attendre leur tour. Prenez [`advisoryXactLock()`](/fr/transaction#advisoryXactLock) en premier dans le callback, dans [`readCommitted()`](/fr/transaction#readCommitted), où chaque requête SQL lit ce qui a été commité avant elle :

<<< ../examples/plain/retries_lock.ts{ts twoslash}

L’onglet qui arrive en second attend à `SELECT pg_advisory_xact_lock($1, $2)`<!-- probe: db.readCommitted(pool, txnClient => db.advisoryXactLock(txnClient, [2, 1000])) --> jusqu’au `COMMIT` du premier, puis compte ses places et ne réserve rien : un onglet obtient ses lignes, l’autre `null`, sans 40001 ni retry. Postgres libère le lock à la fin de la transaction, au `ROLLBACK` de chaque tentative aussi, donc un retry n’en hérite jamais.

- Chaque transaction qui écrit ce que compte la règle prend d’abord le lock, sinon la règle ne tient plus.
- Gardez `readCommitted()`. Dans `serializable()`, l’instantané est pris avant l’attente : le second onglet reçoit quand même un 40001, et son retry voit les places ; dans `repeatableRead()`, il réserve aussi : cinq places en tout.
- Une clé est une paire d’entiers de 32 bits, ou un `bigint` ; une clé tirée d’un texte, et pourquoi il n’y a pas de lock de session : [`advisoryXactLock()`](/fr/transaction#advisoryXactLock).

## Régler et suivre les retries {#tune-and-watch-the-retries}

Quatre options de [`setConfig()`](/fr/runtime-config#setConfig), pour chaque transaction du processus :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 10,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
  transactionListener: (message, txnId) => console.log(`[txn ${txnId}] ${message}`),
  transactionEventListener: (event, txnId) => console.log(JSON.stringify({ txnId, ...event })),
});
```

Une transaction réessayée affiche alors chaque message, puis son événement, avec les mêmes nombres :

```txt
[txn 0] Transaction rollback (code 40001) on attempt 1 of 10, retrying in 292ms
{"txnId":0,"type":"rollback","code":"40001","attempt":1,"maxAttempts":10,"delayMs":292}
[txn 0] Retrying transaction, attempt 2 of 10
{"txnId":0,"type":"retry","attempt":2,"maxAttempts":10}
```

- [`transactionAttemptsMax`](/fr/runtime-config#Config.transactionAttemptsMax) : le nombre total de tentatives. `1` désactive les retries.
- [`transactionRetryDelay`](/fr/runtime-config#Config.transactionRetryDelay) : l’attente avant chaque retry. Le client n’est pas libéré pendant qu’il attend.
- [`transactionListener`](/fr/runtime-config#Config.transactionListener) : chaque message qu’il reçoit figure dans [Retries](/fr/transaction#retries).
- [`transactionEventListener`](/fr/runtime-config#Config.transactionEventListener) : la même chose, sous forme de [`TransactionEvent`](/fr/runtime-config#TransactionEvent), pour qu’un log ou une métrique lise le type, le code et la tentative dans des champs.

## Tester un retry {#test-a-retry}

Deux vraies requêtes HTTP simultanées peuvent entrer en conflit ou non, donc un test ne peut pas compter dessus. Provoquez plutôt l’échec vous-même : pgcast réessaie après toute erreur dont le `code` vaut `'40001'`. Depuis une transaction extérieure, `bookSeats()` la rejoint, donc ses lignes disparaissent avec le rollback de la tentative échouée :

<<< ../examples/plain/retries_test.ts{ts twoslash}

Ici avec `test` de `node:test` et `assert` de `node:assert/strict` ; n’importe quel test runner convient. Le premier test prouve que le callback peut s’exécuter deux fois : les deux places de la première tentative ont disparu, et la seconde les réserve une seule fois.

- Le second test abandonne : son callback lève une erreur à chaque tentative, donc avec `transactionAttemptsMax: 2` il s’exécute deux fois, et la promesse est rejetée avec l’erreur même qu’il a levée, après `on attempt 2 of 2, giving up`.
- `transactionRetryDelay` à `0` garde le test rapide. `setConfig()` vaut pour tout le processus : remettez ce qu’attendent les autres tests ([`getConfig()`](/fr/runtime-config#getConfig)).

## Voir aussi {#see-also}

- [`transaction()`](/fr/transaction#transaction) : ses niveaux d’isolation, le SQL qu’elle envoie, ses retries et ses erreurs.
- [`TxnClientForSerializable`](/fr/transaction#TxnClientForSerializable) et [`IsolationSatisfying`](/fr/transaction#IsolationSatisfying) : quel client un niveau accepte.
- [Savepoints](/fr/savepoints) : annuler une partie d’une transaction et garder le reste.
- [Erreurs](/fr/handle-errors) : les erreurs d’une application, venues de Postgres et de pgcast.

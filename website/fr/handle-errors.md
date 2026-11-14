---
english: f6ee680f8e97
---

# Erreurs

Comprendre ce qui a échoué dans une requête, et y répondre : une place déjà réservée, une séance qui n’existe pas, une option que votre propre code a mal donnée. Cette page suppose que vous connaissez les raccourcis de [Première requête](/fr/first-query).
{.lede}

## Intercepter un refus de Postgres {#catch-a-refusal-from-postgres}

Quand Postgres refuse une requête, la promesse de `.run()` est rejetée avec la `DatabaseError` de node-postgres, dont le `code` est le SQLSTATE. Donnez-le à [`isDatabaseError()`](/fr/transaction#isDatabaseError) avec le nom du refus que vous attendez, et laissez passer tout le reste. Réservez la place C4 de la séance 1002, que quelqu’un a peut-être déjà réservée :

<CastPanel example="errors_seat_taken">

<<< ../examples/errors_seat_taken.ts{ts twoslash}

</CastPanel>

Si C4 est prise, Postgres refuse l’`INSERT` avec 23505, une violation d’unicité, et `booking` vaut `undefined` ; sinon, c’est la nouvelle ligne. Toute autre erreur, de Postgres ou non, est relancée.

Avec `try` et `await`, la variable du `catch` est `unknown` sous `strict`. `isDatabaseError()` l’accepte, mais n’affine pas son type ([`isDatabaseError()`](/fr/transaction#isDatabaseError)) : pour lire ses champs, affinez-le d’abord avec `instanceof pg.DatabaseError` (pg 8.6 ou plus récent, pas `pg.native`, dont les erreurs sont de simples `Error`), et TypeScript les connaît alors.

```ts twoslash
// @strict: true
import * as db from 'zapatos/db';
import pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  if (!(err instanceof pg.DatabaseError && db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation'))) throw err;
  console.log(err.detail);  // Key (screening_id, seat)=(1002, C4) already exists.
}
```

## Distinguer les refus {#tell-the-refusals-apart}

Trois refus qu’une réservation peut rencontrer sur le schéma de la doc, chacun avec son `code` et la contrainte que nomme `err.constraint`, qui distingue deux contraintes du même genre :

| La réservation | `code` | `err.constraint` |
|---|---|---|
| une place déjà réservée | `23505` | `seat_bookings_pkey` |
| la place `'Z100'`, que le domaine `seat_label` refuse | `23514` | `seat_label_check` |
| la séance 1042, qui n’existe pas | `23503` | `seat_bookings_screening_id_fkey` |

Chaque code a son nom pour `isDatabaseError()`, donc une seule fonction peut donner à chacun sa réponse :

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
const bookingProblem = (err: pg.DatabaseError) =>
  db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation') ? 'That seat is taken.' :
  db.isDatabaseError(err, 'IntegrityConstraintViolation_CheckViolation') ? 'There is no such seat.' :
  db.isDatabaseError(err, 'IntegrityConstraintViolation_ForeignKeyViolation') ? 'There is no such screening.' :
  undefined;
```

- Un nom de classe, sans `_`, correspond à tous les codes de sa classe : `'IntegrityConstraintViolation'` correspond aux trois. Avec plusieurs noms, il suffit que l’un d’eux corresponde : `db.isDatabaseError(err, 'IntegrityConstraintViolation', 'DataException')`.
- Les noms sont les [codes d’erreur](https://www.postgresql.org/docs/current/errcodes-appendix.html) de Postgres en PascalCase, et le type refuse tout autre nom : votre éditeur les complète.
- Une valeur sans `code` donne `false`, y compris `null` et `undefined` ; les autres cas, comme les noms de la classe 53 : [`isDatabaseError()`](/fr/transaction#isDatabaseError).

## Intercepter hors d’une transaction {#catch-outside-a-transaction}

Dans une transaction, laissez l’erreur sortir du callback et interceptez-la autour de [`transaction()`](/fr/transaction#transaction) : pgcast envoie `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, puis la promesse est rejetée avec la même erreur. Un client réserve les places H1 et H2 de la séance 1001, les deux ou aucune, et H2 est prise :

<<< ../examples/plain/errors_book_pair.ts{ts twoslash}

`booked` vaut `false`, et H1 n’est pas réservée. La transaction envoie :

<!-- probe: db.serializable(pool, async () => { throw Object.assign(new Error(), { code: '23505' }); }) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the insert() of H1
-- the insert() of H2, which Postgres refuses with 23505
ROLLBACK
```

Le SQL de chaque `INSERT` : [`insert()`](/fr/insert#insert). Un échec de sérialisation (40001) ou un deadlock (40P01) a déjà fait l’objet de retries à ce stade, jusqu’à [`transactionAttemptsMax`](/fr/runtime-config#Config.transactionAttemptsMax) tentatives ; si la promesse est encore rejetée avec l’un d’eux, `'TransactionRollback'` reconnaît les deux, et la demande peut être réessayée plus tard ([Retries](/fr/retries)).

::: warning Écritures perdues
N’interceptez pas une erreur de base de données dans le callback pour continuer comme si de rien n’était. Postgres a interrompu la transaction : chaque requête suivante est refusée avec 25P02 (`InvalidTransactionState_InFailedSqlTransaction`), et si le callback rend la main, pgcast envoie `COMMIT`<!-- probe: db.serializable(pool, async () => {}) -->, que Postgres transforme en rollback sans erreur.

La promesse se résout, rien de ce que le callback a écrit n’est enregistré, et pgcast avertit une fois, `PGCAST_DEP003`. Avec [`transactionRequiresCommit: true`](/fr/runtime-config#Config.transactionRequiresCommit), la valeur par défaut à partir de la 7.0, elle est rejetée à la place ([`transaction()`, Erreurs](/fr/transaction#errors)).

Pour une place qui peut être prise, demandez à Postgres de ne pas refuser : [`upsert()` avec `doNothing`](/fr/insert#doNothing) écrit `ON CONFLICT ON CONSTRAINT "seat_bookings_pkey" DO NOTHING`<!-- probe: db.upsert('seat_bookings', { screening_id: 1001, seat: 'H2', customer: 'Wren Abernathy' }, db.constraint('seat_bookings_pkey'), { updateColumns: db.doNothing }) --> et donne `undefined` pour une place prise, sans erreur, et la transaction continue.
:::

## Distinguer une ligne manquante des autres erreurs {#tell-a-missing-row-from-the-others}

[`selectExactlyOne()`](/fr/select#selectExactlyOne) est fait pour une ligne qui doit exister. Sans ligne, la promesse de `.run()` est rejetée avec une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) : la séance 1042 n’existe pas.

<CastPanel example="errors_not_found">

<<< ../examples/errors_not_found.ts{ts twoslash}

</CastPanel>

- Reconnaissez-la avec `err instanceof db.NotExactlyOneError`. Ce n’est pas une `pg.DatabaseError` et elle n’a pas de `code`, donc `isDatabaseError()` donne `false`.
- Son message est "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message -->, et `err.query.compile()` donne le SQL et les valeurs du cast panel.
- Elle demande `LIMIT $2`<!-- probe: examples/errors_not_found.ts -->, de valeur `1`, donc deux lignes correspondantes ne sont pas une erreur : elle donne la première, comme dans Zapatos 6.6.1 ([#32](https://github.com/AlexandreDemartin/pgcast/issues/32)).
- Dans un `lateral`, une ligne manquante vaut `null`, et n’est pas une erreur ([`selectExactlyOne()`](/fr/select#selectExactlyOne)).
- Quand une ligne manquante est normale, comme dans une recherche, [`selectOne()`](/fr/select#selectOne) donne `undefined` à la place, et TypeScript vous oblige à le vérifier.

Loggez son SQL et ses valeurs là où vous l’interceptez, puis laissez l’erreur poursuivre son chemin :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const screening = await db.selectExactlyOne('screenings', { id: 1042 }).run(pool).catch((err: unknown) => {
  if (err instanceof db.NotExactlyOneError) console.error(err.query.compile());
  throw err;
});
```

## Corriger les erreurs que lève pgcast {#fix-the-errors-pgcast-throws}

pgcast lève une simple `Error`, sans `code`, avant l’envoi de la requête, quand une valeur n’est pas l’une de celles qu’il accepte : une option hors de son type (`'desc'`, `'serializable'`), ou une valeur qui n’a pas de sens en SQL (`db.Default` dans un filtre).

Ce sont des bugs du code appelant, à corriger plutôt qu’à intercepter : les messages disent comment. L’endroit où elles apparaissent dépend de qui les lève :

| Qui lève | Par exemple | Ce que vous obtenez |
|---|---|---|
| un raccourci qui reçoit une option hors de son type | `direction: 'desc'` dans un `order` de [`select()`](/fr/select#errors) | l’appel lève une erreur, avant `.run()` |
| `.compile()`, dans `.run()`, quand il reçoit une valeur sans sens en SQL | `db.Default` dans un filtre ([Objets Whereable](/fr/sql-template#whereable)) | la promesse de `.run()` est rejetée |
| [`transaction()`](/fr/transaction#errors), quand elle reçoit un niveau qui n’est pas un `IsolationLevel` | `'serializable'` | sa promesse est rejetée |

Chacune d’elles, avec sa page : [Erreurs que pgcast lève avant toute requête](/fr/transaction#errors-pgcast-throws-before-any-query). Zapatos 6.6.1 envoyait plutôt certaines de ces valeurs à Postgres : `db.Default` dans un filtre, sous la forme de la chaîne `'Symbol(DEFAULT)'`.

Un `.catch()` chaîné sur `.run()` manque ce que l’appel lève. Le type refuse `'desc'`, mais un cast le laisse passer, et `select()` lève l’erreur "Direction must be ASC/DESC, not 'desc'"<!-- message --> :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const request: { query: { sort: string } };  // ?sort=desc
// ---cut---
const direction = request.query.sort as 'ASC' | 'DESC';
db.select('films', db.all, { order: { by: 'title', direction } })
  .run(pool)
  .catch(err => console.error(err));  // never called: select() has thrown already
```

Vérifiez la valeur au lieu de la caster, pour que `direction` soit une valeur que vous avez écrite :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
declare const request: { query: { sort: string } };  // ?sort=desc
// ---cut---
const direction = request.query.sort === 'desc' ? 'DESC' : 'ASC';
const films = await db.select('films', db.all, { order: { by: 'title', direction } }).run(pool);
```

Si un appel lève quand même une erreur à l’intérieur d’une fonction `async`, elle devient le rejet de la promesse de cette fonction : le `.catch()` de l’appelant la reçoit donc, et un `try` autour de l’appel l’intercepte aussi. Dans un callback de `transaction()`, un `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) --> suit.

## Répondre à chaque genre d’erreur en un seul endroit {#answer-each-kind-in-one-place}

Le gestionnaire d’erreurs d’une application peut maintenant distinguer les trois genres, et donner à chacun sa réponse :

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
function statusOf(err: unknown) {
  if (err instanceof db.NotExactlyOneError) return 404;  // no such row
  if (err instanceof pg.DatabaseError) {
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) return 409;  // already there
    if (db.isDatabaseError(err, 'IntegrityConstraintViolation', 'DataException')) return 422;  // a value Postgres refuses
    if (db.isDatabaseError(err, 'TransactionRollback')) return 503;  // try again later
  }
  return 500;  // anything else: a bug, or the database out of reach
}
```

## Voir aussi {#see-also}

- [`isDatabaseError()`](/fr/transaction#isDatabaseError) : les noms qu’elle prend, et les codes du schéma de la doc.
- [Erreurs que pgcast lève avant toute requête](/fr/transaction#errors-pgcast-throws-before-any-query) : chacune, avec ce qui la lève et ses messages.
- [`transaction()`](/fr/transaction#transaction) : son `ROLLBACK`, ses retries et ses erreurs.
- [Retries](/fr/retries) : ce que le callback doit faire quand il peut s’exécuter de nouveau.

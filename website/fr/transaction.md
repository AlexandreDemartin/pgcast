---
english: b0ec5094d253
---

# Transactions

`transaction()` et ses sept raccourcis, un par niveau d’isolation : le SQL qu’ils envoient, leurs retries et les types du client qu’ils donnent. Puis les erreurs : `isDatabaseError()` pour celles de Postgres, et celles que pgcast lève avant toute requête.
{.lede}

<AtAGlance>

- Seules les requêtes que vous lancez avec `.run(txnClient)` sont dans la transaction ; une requête lancée sur le pool n’y est pas.
- Sur 40001 ou 40P01, tout le callback s’exécute de nouveau, cinq tentatives en tout par défaut : écrivez-le pour qu’il puisse être rejoué.
- Une erreur de requête que le callback intercepte change `COMMIT` en `ROLLBACK`, et rien n’est enregistré : laissez l’erreur remonter.

</AtAGlance>

## `transaction()` {#transaction}

```ts
db.transaction(txnClientOrQueryable, isolationLevel, callback)
```

Exécute `callback` dans une transaction, puis la commite, la réessaie ou l’annule. Elle renvoie une promesse de la valeur en laquelle `callback` se résout.

- `txnClientOrQueryable` : un `pg.Pool`, dont elle récupère un client, libéré à la fin ; un client, `pg.Client`, `pg.native.Client` ou un `pg.PoolClient` déjà récupéré, utilisé et laissé connecté ; ou le client d’une transaction déjà ouverte, [transmise](#passing-a-transaction-through).
- `isolationLevel` : un [`IsolationLevel`](#IsolationLevel).
- `callback` : `async txnClient => …`, qui reçoit un [`TxnClient`](#TxnClient) de ce niveau. Les requêtes de la transaction sont celles lancées avec `.run(txnClient)` ; une requête lancée sur le pool, ou sur tout autre client, n’y est pas.

`db.serializable(pool, callback)` équivaut à `db.transaction(pool, db.IsolationLevel.Serializable, callback)`. Deux clients réservent en même temps le siège F7 de la séance 1000 :

<<< ../examples/plain/serializable_booking.ts{ts twoslash}

De `ines` et `barnaby`, l’un vaut `true`, l’autre `false`. Quand les deux lisent avant que l’un ou l’autre ne commite, Postgres refuse l’un des deux `INSERT` avec 40001, et pgcast exécute de nouveau ce callback, qui trouve le siège pris. Cette transaction envoie :

<!-- probe: (n => db.serializable(pool, async () => { if (n++ === 0) throw Object.assign(new Error(), { code: '40001' }); }))(0) -->
```sql
-- attempt 1
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's selectOne(), then insert(), which Postgres refuses with 40001
ROLLBACK
-- attempt 2, 25 to 250 ms later
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's selectOne(), which returns the other booking
COMMIT
```

Le SQL des requêtes du callback : [`selectOne()`](/fr/select#selectOne) et [`insert()`](/fr/insert#insert).

Avec un client que vous avez récupéré, `transaction()` s’exécute dessus et le laisse connecté ; le libérer vous revient :

<<< ../examples/plain/checked_out_client.ts{ts twoslash}

Les deux `count()` s’exécutent sur `client`, hors de la transaction : après le bloc, `before` vaut 0, `after` 1.

### Le SQL envoyé {#the-sql-it-sends}

| Quand | SQL |
|---|---|
| avant le callback | `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) --> : la valeur du niveau, écrite telle quelle |
| le callback se résout | `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> |
| `START TRANSACTION`, le callback ou `COMMIT` est rejeté | `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, puis un retry ou le rejet |

- Ces trois-là s’exécutent sur le client de la transaction, comme les requêtes du callback. Chacune passe par [`queryListener`](/fr/runtime-config#Config.queryListener) et [`resultListener`](/fr/runtime-config#Config.resultListener) avec l’id de la transaction : un compteur à partir de 0, un par transaction ouverte, conservé d’une tentative à l’autre ; une transaction transmise garde celui de la transaction extérieure.
- Pas de `SAVEPOINT` : une transaction dans une autre est la transaction extérieure ([Transmettre une transaction](#passing-a-transaction-through)).
- Après une erreur de requête que le callback intercepte, Postgres répond au `COMMIT` par `ROLLBACK`, pas par une erreur, et rien n’est enregistré. `transaction()` se résout, comme dans Zapatos 6.6.1, et avertit une fois (`PGCAST_DEP003`) ; avec [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), elle est rejetée.
- Avec un client sur lequel vous avez envoyé `BEGIN`, elle termine votre transaction, à moins qu’avec [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient) elle ne soit rejetée avant ([Votre propre `BEGIN`](#your-own-begin)).

### Retries {#retries}

Quand `START TRANSACTION`, le callback ou `COMMIT` est rejeté avec un `code` 40001 (`serialization_failure`) ou 40P01 (`deadlock_detected`), à n’importe quel niveau, `transaction()` envoie `ROLLBACK`, attend, puis recommence : `START TRANSACTION`, tout le callback, `COMMIT`.

<RetryFlow />

| Option de [`Config`](/fr/runtime-config#Config) | Par défaut | Ce qu’elle fixe |
|---|---|---|
| [`transactionAttemptsMax`](/fr/runtime-config#Config.transactionAttemptsMax) | `5` | les tentatives en tout, la première comprise ; `0` ou `1` en donne une |
| [`transactionRetryDelay`](/fr/runtime-config#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | l’attente avant chaque retry : un nombre entier de ms, au hasard entre les deux |

- Après la dernière tentative, elle est rejetée avec l’erreur de cette tentative.
- Tout autre rejet : `ROLLBACK`, puis elle est rejetée avec lui, aussitôt.
- Un `COMMIT` auquel Postgres répond par `ROLLBACK` n’est pas relancé : pgcast ne sait pas quelle erreur le callback a interceptée.
- [`transactionListener`](/fr/runtime-config#Config.transactionListener) reçoit chaque message avec l’id de la transaction :

| Message | Quand |
|---|---|
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms``<!-- message --> | avant l’attente |
| ``Retrying transaction, attempt ${attempt} of ${maxAttempts}``<!-- message --> | avant de renvoyer `START TRANSACTION` |
| ``Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up``<!-- message --> | avant le rejet |

Le callback peut s’exécuter plusieurs fois : [Retries](/fr/retries).

### Transmettre une transaction {#passing-a-transaction-through}

Avec le client d’une transaction que `transaction()` a ouverte, elle n’envoie rien : elle appelle le callback avec ce client, aussitôt, et renvoie sa promesse. Ni `START TRANSACTION`, ni `COMMIT`, ni `ROLLBACK`, ni retry qui lui soit propre ; la transaction extérieure s’en charge. Une fonction peut ainsi s’exécuter dans sa propre transaction, ou dans celle de l’appelant :

<<< ../examples/plain/pass_through.ts{ts twoslash}

Une seule transaction, les deux sièges ou aucun : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, les deux `INSERT`, `COMMIT`.

- Le callback s’exécute au niveau de la transaction extérieure, et ce niveau n’est pas vérifié, ni à l’exécution ni par le type : chaque `TxnClient` est un [`Queryable`](/fr/sql-template#Queryable), donc `db.serializable(txnClient, …)` passe la vérification de types avec un client de `db.readCommitted()`, et son callback s’exécute dans cette transaction `READ COMMITTED`.
- Une fonction dont le paramètre est d’un type `TxnClientFor…` est vérifiée : [`IsolationSatisfying`](#IsolationSatisfying).
- Ce qui marque le client, c’est sa propre propriété `_zapatos` ([`TxnClient`](#TxnClient)).
- Une transaction que vous avez ouverte vous-même, par un `BEGIN` brut, n’a pas de marque : elle n’est pas transmise ([Votre propre `BEGIN`](#your-own-begin)). Ouvrez la transaction extérieure avec `transaction()`.

### Votre propre `BEGIN` {#your-own-begin}

Avec un client sur lequel vous avez envoyé `BEGIN`, `transaction()` envoie son propre `START TRANSACTION`<!-- probe: db.serializable(pool, async () => {}) -->, dont Postgres se contente d’avertir (25001), puis termine votre transaction :

| Votre transaction | Zapatos 6.6.1, et pgcast sans l’option | Avec [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient) |
|---|---|---|
| pas encore de requête, ou au niveau propre à la session (`readCommitted()`, sur un serveur par défaut) | son `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commite la vôtre, lignes comprises | rejetée avant d’envoyer son `START TRANSACTION` ; la vôtre reste ouverte |
| un autre niveau, après une requête | Postgres refuse (25001), et son `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> annule vos lignes | rejetée avant son `START TRANSACTION` ; la vôtre reste ouverte |
| interrompue par une requête qui a échoué | Postgres refuse (25P02), et son `ROLLBACK` termine la vôtre | rejetée avant son `START TRANSACTION` ; la vôtre reste ouverte, interrompue, pour votre `ROLLBACK` |

Dans tous les cas, sans l’option, votre propre `ROLLBACK` n’a ensuite plus rien à annuler (25P01), et pgcast avertit une fois, `PGCAST_DEP005`. Avec elle, votre `ROLLBACK` annule la réservation du siège :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
db.setConfig({ transactionRequiresIdleClient: true });

const client = await pool.connect();
await client.query('BEGIN');
await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(client);
await db.serializable(client, txnClient =>  // rejects, having sent only an empty query
  db.insert('seat_bookings', { screening_id: 1002, seat: 'D5', customer: 'Hollis Brandt' }).run(txnClient),
).catch(() => undefined);
await client.query('ROLLBACK');  // D4 is free again
client.release();
```

- pg signale le bloc à partir de pg 8.21. Avec les versions antérieures, `transaction()` s’exécute comme dans la 6.6.1, sans avertissement. Non testé avec `pg-native`.
- Avec l’option, quand pg en signale un, `transaction()` envoie d’abord une requête vide, afin de relire le statut : pg peut encore signaler un bloc juste après un `COMMIT` qui a échoué. Postgres ne la compte pas comme une de vos requêtes. [`queryListener`](/fr/runtime-config#Config.queryListener) et [`resultListener`](/fr/runtime-config#Config.resultListener) la reçoivent, avec l’id de la transaction, comme ils reçoivent son `START TRANSACTION`.
- Avec l’option, une `transaction()` lancée au même moment sur ce client est transmise, comme dans la 6.6.1, et ne commite ni n’annule rien : ses requêtes s’exécutent dans votre bloc, ou, quand pg signalait un bloc déjà terminé, comme le dit le dernier point.
- Sans elle, `transaction()` envoie ce qu’envoie la 6.6.1, et avertit avant son `START TRANSACTION`. Rien ne relit le statut, si bien que juste après un `COMMIT` qui a échoué, l’avertissement peut arriver une fois pour un client hors de tout bloc.
- Non détectés : un client récupéré du pool alors qu’il est encore dans un bloc, comme un client libéré avant son `ROLLBACK` ; un `BEGIN` envoyé sans `await` ; un `BEGIN` envoyé dans une même chaîne de requête avec une instruction qui échoue (`'BEGIN; …; SELECT 1/0'`), que pg peut encore signaler hors de tout bloc, si bien que `transaction()` s’exécute comme dans la 6.6.1, sans avertissement.
- Avec l’option, juste après un `COMMIT` qui a échoué, deux appels de `transaction()` au même moment sur un même client : quand pg signale encore le bloc, le premier envoie sa requête vide, puis continue, et le second, transmis, envoie sa première requête, et celles envoyées avec elle, avant le `START TRANSACTION` du premier, hors de toute transaction, si bien que chacune est commitée à part. Ses requêtes suivantes s’exécutent dans la transaction du premier appel.

### Erreurs {#errors}

<div class="stack">

| Rejetée avec | Quand | Depuis |
|---|---|---|
| `Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '…'`<!-- message --> | `isolationLevel` n’est pas une valeur d’`IsolationLevel` ; levée avant qu’un client soit récupéré ou qu’une requête soit envoyée | pgcast 6.6.2 |
| l’erreur du callback | après `ROLLBACK` ; pour 40001 et 40P01, après la dernière tentative | Zapatos |
| une `TypeError`, `Cannot destructure property 'code' of 'err' as it is null.` (ou `undefined`) | le callback lève `null` ou `undefined`, après `ROLLBACK` | Zapatos |
| "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message --> | avec [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), Postgres a répondu au `COMMIT` par `ROLLBACK` ; pas de retry, ni de `ROLLBACK` propre | pgcast 6.7.0 |
| "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, pass the pool, or run the queries on that client without transaction()"<!-- message --> | avec [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), un client à vous est dans un bloc de transaction ([Votre propre `BEGIN`](#your-own-begin)) ; après n’avoir envoyé que la requête vide | pgcast 6.7.0 |

</div>

Le type refuse un niveau qui n’est pas un `IsolationLevel` (2345), y compris une chaîne :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.transaction(pool, 'SERIALIZABLE', async txnClient => true);
```

Zapatos 6.6.1 écrivait toute valeur telle quelle après `ISOLATION LEVEL`, où elle pouvait exécuter une seconde instruction ([changelog](/fr/changelog#6.6.2-security)). Une transaction transmise n’est pas vérifiée.

## `serializable()` {#serializable}

```ts
db.serializable(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.Serializable` : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.transaction(pool, db.IsolationLevel.Serializable, async () => {}) -->. Son callback reçoit un [`TxnClientForSerializable`](#TxnClientForSerializable).

## `repeatableRead()` {#repeatableRead}

```ts
db.repeatableRead(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.RepeatableRead` : `START TRANSACTION ISOLATION LEVEL REPEATABLE READ`<!-- probe: db.transaction(pool, db.IsolationLevel.RepeatableRead, async () => {}) -->. Son callback reçoit un [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead).

## `readCommitted()` {#readCommitted}

```ts
db.readCommitted(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.ReadCommitted` : `START TRANSACTION ISOLATION LEVEL READ COMMITTED`<!-- probe: db.transaction(pool, db.IsolationLevel.ReadCommitted, async () => {}) -->. Son callback reçoit un [`TxnClientForReadCommitted`](#TxnClientForReadCommitted).

## `serializableRO()` {#serializableRO}

```ts
db.serializableRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.SerializableRO` : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.SerializableRO, async () => {}) -->. Son callback reçoit un [`TxnClientForSerializableRO`](#TxnClientForSerializableRO). Postgres y refuse toute écriture (25006).

## `repeatableReadRO()` {#repeatableReadRO}

```ts
db.repeatableReadRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.RepeatableReadRO` : `START TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.RepeatableReadRO, async () => {}) -->. Son callback reçoit un [`TxnClientForRepeatableReadRO`](#TxnClientForRepeatableReadRO). Postgres y refuse toute écriture (25006).

## `readCommittedRO()` {#readCommittedRO}

```ts
db.readCommittedRO(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.ReadCommittedRO` : `START TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY`<!-- probe: db.transaction(pool, db.IsolationLevel.ReadCommittedRO, async () => {}) -->. Son callback reçoit un [`TxnClientForReadCommittedRO`](#TxnClientForReadCommittedRO). Postgres y refuse toute écriture (25006).

## `serializableRODeferrable()` {#serializableRODeferrable}

```ts
db.serializableRODeferrable(txnClientOrQueryable, callback)
```

[`transaction()`](#transaction) au niveau `IsolationLevel.SerializableRODeferrable` : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE`<!-- probe: db.transaction(pool, db.IsolationLevel.SerializableRODeferrable, async () => {}) -->. Son callback reçoit un [`TxnClientForSerializableRODeferrable`](#TxnClientForSerializableRODeferrable). Postgres y refuse toute écriture (25006).

Avec `DEFERRABLE`, Postgres peut attendre un instantané, puis exécute la transaction sans le surcoût d’une transaction sérialisable et sans risque d’échec de sérialisation (40001) ([SET TRANSACTION](https://www.postgresql.org/docs/current/sql-set-transaction.html)) : adapté à un long rapport ou à une sauvegarde.

Un rapport dont les deux comptages lisent le même instantané :

<<< ../examples/plain/read_only_report.ts{ts twoslash}

`report` vaut `{ films: 4, bookings: 0 }` sur le schéma de la doc. La transaction envoie :

<!-- probe: db.serializableRODeferrable(pool, async () => {}) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE, READ ONLY, DEFERRABLE
-- the callback's two count() queries
COMMIT
```

Le SQL de chaque requête : [`count()`](/fr/select#count). Les autres raccourcis en lecture seule envoient la même chose, avec leur niveau ; dans [`readCommittedRO()`](#readCommittedRO), chaque requête lit son propre instantané, donc une réservation commitée entre les deux comptages figure dans le second.

## Types {#types}

### `IsolationLevel` {#IsolationLevel}

```ts
enum IsolationLevel {
  Serializable = 'SERIALIZABLE',
  RepeatableRead = 'REPEATABLE READ',
  ReadCommitted = 'READ COMMITTED',
  SerializableRO = 'SERIALIZABLE, READ ONLY',
  RepeatableReadRO = 'REPEATABLE READ, READ ONLY',
  ReadCommittedRO = 'READ COMMITTED, READ ONLY',
  SerializableRODeferrable = 'SERIALIZABLE, READ ONLY, DEFERRABLE',
}
```

Le deuxième argument de [`transaction()`](#transaction). Chaque valeur est écrite après `START TRANSACTION ISOLATION LEVEL` ; chaque membre a son raccourci :

| Membre | Raccourci | Son client |
|---|---|---|
| `Serializable` | [`serializable()`](#serializable) | [`TxnClientForSerializable`](#TxnClientForSerializable) |
| `RepeatableRead` | [`repeatableRead()`](#repeatableRead) | [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead) |
| `ReadCommitted` | [`readCommitted()`](#readCommitted) | [`TxnClientForReadCommitted`](#TxnClientForReadCommitted) |
| `SerializableRO` | [`serializableRO()`](#serializableRO) | [`TxnClientForSerializableRO`](#TxnClientForSerializableRO) |
| `RepeatableReadRO` | [`repeatableReadRO()`](#repeatableReadRO) | [`TxnClientForRepeatableReadRO`](#TxnClientForRepeatableReadRO) |
| `ReadCommittedRO` | [`readCommittedRO()`](#readCommittedRO) | [`TxnClientForReadCommittedRO`](#TxnClientForReadCommittedRO) |
| `SerializableRODeferrable` | [`serializableRODeferrable()`](#serializableRODeferrable) | [`TxnClientForSerializableRODeferrable`](#TxnClientForSerializableRODeferrable) |

### `IsolationSatisfying` {#IsolationSatisfying}

```ts
type IsolationSatisfying<T extends IsolationLevel>
```

Les niveaux dont le client est accepté là où un client de niveau `T` est demandé : `T` et les niveaux plus stricts. Un niveau en lecture-écriture vaut pour sa version en lecture seule, pas l’inverse ; `SerializableRODeferrable` ne vaut que pour lui-même.

| `T` | `IsolationSatisfying<T>` |
|---|---|
| `Serializable` | `Serializable` |
| `RepeatableRead` | `Serializable`, `RepeatableRead` |
| `ReadCommitted` | `Serializable`, `RepeatableRead`, `ReadCommitted` |
| `SerializableRO` | `Serializable`, `SerializableRO` |
| `RepeatableReadRO` | `Serializable`, `RepeatableRead`, `SerializableRO`, `RepeatableReadRO` |
| `ReadCommittedRO` | chaque niveau sauf `SerializableRODeferrable` |
| `SerializableRODeferrable` | `Serializable`, `SerializableRO`, `SerializableRODeferrable` |

Une fonction qui prend un [`TxnClientForRepeatableRead`](#TxnClientForRepeatableRead) accepte le client de `serializable()`, pas celui de `readCommitted()` (2345, avec `strict` activé ou non) :

```ts twoslash
// @errors: 2345
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const countBookings = (txnClient: db.TxnClientForRepeatableRead) =>
  db.count('seat_bookings', { screening_id: 1000 }).run(txnClient);

await db.serializable(pool, txnClient => countBookings(txnClient));
await db.readCommitted(pool, txnClient => countBookings(txnClient));
```

### `TxnClient` {#TxnClient}

```ts
interface TxnClient<T extends IsolationLevel> extends pg.PoolClient {
  _zapatos?: { isolationLevel: T; txnId: number };
}
```

Le client que reçoit le callback d’une [`transaction()`](#transaction) : celui récupéré du pool, ou le client donné.

- `_zapatos` est défini pendant que la transaction s’exécute : son `isolationLevel`, et son `txnId`, l’id que reçoivent les listeners. Une fois la transaction terminée, `transaction()` le supprime, et libère un client qu’elle a récupéré.
- `T` : les niveaux pour lesquels le client vaut, une union [`IsolationSatisfying`](#IsolationSatisfying) dans les sept types ci-dessous.
- `_zapatos` est optionnel dans le type, donc tout `pg.PoolClient` est accepté comme `TxnClient`, qu’une transaction y soit ouverte ou non.

### `TxnClientForSerializable` {#TxnClientForSerializable}

`TxnClient<IsolationSatisfying<IsolationLevel.Serializable>>` : le client de [`serializable()`](#serializable).

### `TxnClientForRepeatableRead` {#TxnClientForRepeatableRead}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableRead>>` : le client de [`repeatableRead()`](#repeatableRead) ; accepte aussi celui de `serializable()`.

### `TxnClientForReadCommitted` {#TxnClientForReadCommitted}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommitted>>` : le client de [`readCommitted()`](#readCommitted) ; accepte aussi celui de `serializable()` et de `repeatableRead()`.

### `TxnClientForSerializableRO` {#TxnClientForSerializableRO}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRO>>` : le client de [`serializableRO()`](#serializableRO) ; accepte aussi celui de `serializable()`.

### `TxnClientForRepeatableReadRO` {#TxnClientForRepeatableReadRO}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableReadRO>>` : le client de [`repeatableReadRO()`](#repeatableReadRO) ; accepte aussi celui de `serializable()`, de `repeatableRead()` et de `serializableRO()`.

### `TxnClientForReadCommittedRO` {#TxnClientForReadCommittedRO}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommittedRO>>` : le client de [`readCommittedRO()`](#readCommittedRO) ; accepte celui de chaque raccourci sauf `serializableRODeferrable()`.

### `TxnClientForSerializableRODeferrable` {#TxnClientForSerializableRODeferrable}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>` : le client de [`serializableRODeferrable()`](#serializableRODeferrable) ; accepte aussi celui de `serializable()` et de `serializableRO()`.

## `isDatabaseError()` {#isDatabaseError}

```ts
db.isDatabaseError(err, ...types)
```

`true` quand le `code` de `err`, cinq caractères, commence par le code de l’un des `types` ; sinon `false`, et toujours sans `types`.

- `err` : n’importe quelle valeur ; une valeur sans `code` de cinq caractères donne `false`, y compris `null` et `undefined`. Sur une erreur de Postgres, `.run()` est rejetée avec la `DatabaseError` de node-postgres, dont le `code` est le SQLSTATE ; elle a aussi `constraint`, `detail`, `table` et les autres champs qu’envoie Postgres.
  - Son type est `unknown`, donc il accepte une variable de `catch` telle quelle (ci-dessous), avec `strict` activé ou non. Zapatos 6.6.1 le typait `{ code?: string }`, qui refusait `unknown`, l’`Error` globale, `null` sous `strict` et `pg.DatabaseError` sous `exactOptionalPropertyTypes`, et la fonction levait une `TypeError` sur `null` ou `undefined` ([#178](https://github.com/AlexandreDemartin/pgcast/issues/178)).
- `types` : des noms, autant que vous voulez ; sans aucun, `false`. Deux sortes :

| Nom | Code | Correspond à |
|---|---|---|
| une classe : `IntegrityConstraintViolation` | `23` | chaque code de la classe : 23505, 23514, 23503… |
| une condition, `Class_Condition` : `IntegrityConstraintViolation_UniqueViolation` | `23505` | ce code |

Les noms sont ceux des [codes d’erreur de Postgres](https://www.postgresql.org/docs/current/errcodes-appendix.html), en PascalCase : `unique_violation` dans la classe `integrity_constraint_violation` devient `IntegrityConstraintViolation_UniqueViolation`. Le type refuse tout autre nom.

<<< ../examples/plain/is_database_error.ts{ts twoslash}

Sur le schéma de la doc :

| Requête | `code` | Nom de la condition |
|---|---|---|
| une seconde réservation du même siège | `23505` | `IntegrityConstraintViolation_UniqueViolation` |
| le siège `'Z100'`, que le domaine `seat_label` refuse | `23514` | `IntegrityConstraintViolation_CheckViolation` |
| une réservation d’une séance qui n’existe pas | `23503` | `IntegrityConstraintViolation_ForeignKeyViolation` |
| un `insert()` dans [`serializableRO()`](#serializableRO) | `25006` | `InvalidTransactionState_ReadOnlySqlTransaction` |
| deux réservations concurrentes d’un siège, en `SERIALIZABLE` (plus haut) | `40001` | `TransactionRollback_SerializationFailure` |

- `DiskFull`, `OutOfMemory`, `TooManyConnections` et `ConfigurationLimitExceeded` ont le code de la classe, `53`, comme `InsufficientResources` : chacun correspond à tous les codes de la classe. `InsufficientResources_DiskFull` ne correspond qu’à 53100.
- Les erreurs que pgcast lève lui-même n’ont pas de `code` : `false` pour chacune ([plus bas](#errors-pgcast-throws-before-any-query)).
- Avec `strict` activé, une variable de `catch` est `unknown`, et `isDatabaseError()` l’accepte :

```ts twoslash
// @strict: true
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
try {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'C4', customer: 'Tamsin Rowe' }).run(pool);
} catch (err) {
  if (!db.isDatabaseError(err, 'IntegrityConstraintViolation_UniqueViolation')) throw err;
}
```

- Elle renvoie un `boolean` sans affiner le type de `err` : pour lire `err.detail` ou `err.constraint`, affinez-le d’abord avec `instanceof pg.DatabaseError` ([Erreurs](/fr/handle-errors#catch-a-refusal-from-postgres)).

Les gérer dans une application : [Erreurs](/fr/handle-errors).

## Erreurs que pgcast lève avant toute requête {#errors-pgcast-throws-before-any-query}

Une simple `Error`, sans `code`, avant que rien ne soit envoyé. Un raccourci lève les siennes de façon synchrone, dès l’appel, sauf pour les options de `truncate()` dans un autre ordre et les `columns` ou le `lateral` d’un agrégat ([`count()`](/fr/select#count)) : `.run()` n’est jamais atteint, donc un `.catch()` chaîné dessus ne les reçoit pas.

Les autres sont levées quand `.compile()` compile la requête, donc `.run()` est rejetée avec elles ; `transaction()` est rejetée avec les siennes. Chacune est listée avec ce qui la lève :

<div class="stack">

| Levée par | Comment | Messages |
|---|---|---|
| `select()`, `selectOne()`, `selectExactlyOne()` et les agrégats, avec un `order`, un `lock` ou un `aggregate` invalide | l’appel lève | [`select()`, Erreurs](/fr/select#errors) |
| `upsert()` de lignes aux clés différentes, avec `upsertRequiresSameKeys` | l’appel lève | [Lignes aux clés différentes](/fr/insert#upsert-different-keys) |
| `update()` sans colonne à fixer | l’appel lève | [`update()`](/fr/insert#update) |
| `truncate()` avec une autre option | l’appel lève | [`truncate()`](/fr/insert#truncate) |
| une interpolation qui n’a pas de sens en SQL : un nombre, `null`, `db.all`, l’objet global | `.run()` est rejetée | [Interpolations](/fr/sql-template#interpolations) |
| `db.self` sans colonne ; `db.parent()` sans table parente, donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()` | `.run()` est rejetée | [`self`](/fr/sql-template#self), [`parent()`](/fr/sql-template#parent) |
| `count()` et les autres agrégats avec des `columns` sans colonne ou à plusieurs colonnes, ou sans `columns` du tout pour `sum()`, `avg()`, `min()` et `max()` ; ou une seule sous-requête comme `lateral` ; et donc une requête qui en imbrique un | `.run()` est rejetée | [`count()`](/fr/select#count) |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` ou `db.vals()` comme valeur de filtre ; `db.raw()`, `db.cols()` ou `db.vals()` comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, ou dans tout `vals({…})` | `.run()` est rejetée | [Objets Whereable](/fr/sql-template#whereable), [Conditions](/fr/conditions), [`insert()`](/fr/insert#insert), [`vals()`](/fr/sql-template#vals) |
| `truncate()` avec ses options dans un autre ordre | `.run()` est rejetée | [`truncate()`](/fr/insert#truncate) |
| `transaction()` avec un autre niveau d’isolation | sa promesse est rejetée | [`transaction()`, Erreurs](#errors) |
| `transaction()` qui reçoit un client dans un bloc de transaction, avec `transactionRequiresIdleClient`, après une requête vide | sa promesse est rejetée | [Votre propre `BEGIN`](#your-own-begin) |

</div>

Après une requête, pgcast rejette dans deux cas qui lui sont propres : `selectExactlyOne()` sans ligne, ou avec une seconde sous [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), avec une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) ; `transaction()` dont Postgres répond au `COMMIT` par `ROLLBACK`, avec [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit) ([Erreurs](#errors)).

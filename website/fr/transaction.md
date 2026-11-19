---
english: 6ce3417e27c7
---

# Transactions

`transaction()` et ses sept raccourcis, un par niveau d’isolation : le SQL qu’ils envoient, leurs retries et les types du client qu’ils donnent. `savepoint()`, pour une unité de travail qui peut échouer seule dans une transaction. `advisoryXactLock()`, un lock que la transaction détient jusqu’à sa fin. `setLocal()`, des réglages pour le reste de la transaction, comme les lit la sécurité niveau ligne. `cursor()`, les lignes d’une requête lues par batchs. Puis les erreurs : `isDatabaseError()` pour celles de Postgres, et celles que pgcast lève avant toute requête.
{.lede}

<AtAGlance>

- Seules les requêtes que vous lancez avec `.run(txnClient)` sont dans la transaction ; une requête lancée sur le pool n’y est pas.
- Sur 40001 ou 40P01, tout le callback s’exécute de nouveau, cinq tentatives en tout par défaut : écrivez-le pour qu’il puisse être rejoué.
- Si Postgres répond au `COMMIT` du raccourci par `ROLLBACK`, par défaut la promesse est rejetée sans retry et rien n’est enregistré. Laissez les erreurs de requête se propager hors du callback.

</AtAGlance>

## `transaction()` {#transaction}

```ts
db.transaction(txnClientOrQueryable, isolationLevel, callback)
```

Exécute `callback` dans une transaction, puis la commite, la réessaie ou l’annule. Elle renvoie une promesse de la valeur en laquelle `callback` se résout.

- `txnClientOrQueryable` : un `pg.Pool`, dont elle récupère un client, libéré à la fin ; un client, `pg.Client`, `pg.native.Client` ou un `pg.PoolClient` déjà récupéré, utilisé et laissé connecté ; le client d’une transaction déjà ouverte, [transmise](#passing-a-transaction-through) ; ou le [`PoolLike`](#PoolLike) d’un autre driver, utilisé comme un `pg.Pool` ([Le pool d’un autre driver](#another-drivers-pool)).
- `isolationLevel` : un [`IsolationLevel`](#IsolationLevel).
- `callback` : `async txnClient => …`, qui reçoit un [`TxnClient`](#TxnClient) de ce niveau, ou, d’un `PoolLike`, un [`TxnClientLike`](#TxnClientLike). Les requêtes de la transaction sont celles lancées avec `.run(txnClient)` ; une requête lancée sur le pool, ou sur tout autre client, n’y est pas.

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
- Pas de `SAVEPOINT` : une transaction dans une autre est la transaction extérieure ([Transmettre une transaction](#passing-a-transaction-through)). Pour imbriquer une unité de travail qui peut échouer seule : [`savepoint()`](#savepoint).
- Si le callback intercepte une erreur de requête et que Postgres répond au `COMMIT` par `ROLLBACK`, rien n’est enregistré. La promesse est rejetée sans retry. Avec [`transactionRequiresCommit: false`](/fr/runtime-config#Config.transactionRequiresCommit), elle se résout avec la valeur renvoyée par le callback.
- Lorsque `transactionRequiresIdleClient` est activée, pgcast vérifie de nouveau le statut de votre client sans marqueur si pg le signale déjà dans une transaction. Cette seconde vérification précède l’ouverture d’une transaction. Voir [Votre propre `BEGIN`](#your-own-begin).

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
- [`transactionListener`](/fr/runtime-config#Config.transactionListener) reçoit chaque message avec l’id de la transaction, et [`transactionEventListener`](/fr/runtime-config#Config.transactionEventListener) l’événement qui l’accompagne, juste après, avec les mêmes nombres :

| Message | Événement | Quand |
|---|---|---|
| ``Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms``<!-- message --> | `{ type: 'rollback', code, attempt, maxAttempts, delayMs }` | avant l’attente |
| ``Retrying transaction, attempt ${attempt} of ${maxAttempts}``<!-- message --> | `{ type: 'retry', attempt, maxAttempts }` | avant de renvoyer `START TRANSACTION` |
| ``Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up``<!-- message --> | `{ type: 'giveUp', code, attempt, maxAttempts }` | avant le rejet |

Le callback peut s’exécuter plusieurs fois : [Retries](/fr/retries).

### Transmettre une transaction {#passing-a-transaction-through}

Si le client est marqué par `transaction()` et que son niveau d’isolation satisfait le niveau demandé, l’appel imbriqué transmet aussitôt ce client au callback et renvoie sa promesse sans envoyer de requête. La transaction extérieure se charge de `START TRANSACTION`, du `COMMIT` ou du `ROLLBACK` et des retries. Une fonction peut ainsi s’exécuter dans sa propre transaction ou dans celle de l’appelant.

<<< ../examples/plain/pass_through.ts{ts twoslash}

Une seule transaction, les deux sièges ou aucun : `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, les deux `INSERT`, `COMMIT`.

- Chaque `TxnClient` est un [`Queryable`](/fr/sql-template#Queryable). TypeScript accepte donc `serializable()` avec le client de `readCommitted()`. Par défaut, pgcast rejette cet appel à l’exécution, avant d’appeler le callback.
- La transaction extérieure est annulée, sauf si son callback intercepte l’erreur. Avec [`transactionRequiresSatisfyingLevel: false`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), le callback imbriqué s’exécute au niveau d’isolation de la transaction extérieure. Si [ce niveau satisfait le niveau demandé](#IsolationSatisfying), le même client est transmis dans les deux cas.
- Une fonction dont le paramètre est d’un type `TxnClientFor…` est vérifiée : [`IsolationSatisfying`](#IsolationSatisfying).
- Ce qui marque le client, c’est sa propre propriété `_zapatos` ([`TxnClient`](#TxnClient)).
- Une transaction que vous avez ouverte vous-même, par un `BEGIN` brut, n’a pas de marque : elle n’est pas transmise ([Votre propre `BEGIN`](#your-own-begin)). Ouvrez la transaction extérieure avec `transaction()`.

### Le pool d’un autre driver {#another-drivers-pool}

À partir de la 6.12.0, `transaction()` et ses raccourcis acceptent aussi un [`PoolLike`](#PoolLike) : le pool de n’importe quel driver dont le `connect()` donne un client dont la `query()` prend l’objet de requête de `pg` et se résout en `{ rows, command }`, et qui a un `release()`. L’adaptateur d’un driver en donne un, un fake de test aussi. Aucun cast n’est nécessaire :

<<< ../examples/plain/transaction_other_pool.ts{ts twoslash}

Elle récupère un client du pool, y exécute la transaction, puis le libère, comme sur un `pg.Pool` :

<!-- probe: db.serializable({ connect: async () => ({ query: async q => { await pool.query(q); return { rows: [], command: q.text }; }, release() {} }) }, async () => 0) -->
```sql
START TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- the callback's count()
COMMIT
```

Le SQL de la requête du callback : [`count()`](/fr/select#count).

- Le callback reçoit le client du pool, marqué au niveau d’isolation demandé. Quand TypeScript connaît le type du client du pool, il infère un [`TxnClientLike`](#TxnClientLike), sauf si ce type étend `pg.PoolClient`. Dans ce cas, il infère le type du client de transaction de `pg`. `taken` est un `number`, comme sur un `pg.Pool`.
  Avec un pool, si vous indiquez explicitement le type du résultat à l’appel sans préciser celui du client du pool, TypeScript donne au paramètre du callback le type du client de transaction de `pg`. Pour conserver le type `ShowClient` dans l’exemple ci-dessous, laissez TypeScript inférer les arguments de type (vous pouvez annoter le type de retour du callback) ou indiquez aussi le type du client. Dans `transaction()`, le type du client vient en troisième, après le type du résultat et celui du niveau d’isolation.
- `command` est lu sur le `COMMIT`, auquel Postgres répond par `ROLLBACK` après une erreur de requête que le callback a interceptée ([Le SQL envoyé](#the-sql-it-sends)) : un pool dont le client ne donne pas de `command` ne compile pas. PGlite et postgres.js le donnent à l’exécution, mais le type de PGlite le rend optionnel, `command?: string` : un pool qui transmet le résultat de PGlite convertit donc `command` en `string`, comme le fait son adaptateur ([Drivers](/fr/drivers#pglite)).
- Un retry ne lit que le `code` de l’erreur : les 40001 et 40P01 d’un autre driver sont donc réessayés aussi ([Retries](#retries)).
- Si vous passez le client du callback à un appel imbriqué, il est transmis sans cast ([Transmettre une transaction](#passing-a-transaction-through)). Le callback imbriqué reçoit le même client, dont le type correspond en général au niveau d’isolation de la transaction extérieure. Si le client lui-même est compatible avec le paramètre `PoolLike`, TypeScript lui donne dans le callback le type qui correspond au niveau demandé par l’appel imbriqué, comme pour un client `pg` dans Zapatos 6.6.1. À l’exécution, pgcast compare comme d’habitude le niveau demandé à celui de la transaction extérieure.

  Une fonction qui s’exécute dans la transaction de son appelant prend le client du driver en paramètre, comme dans cet exemple.

  ```ts twoslash
  import * as db from 'zapatos/db';
  declare const showPool: db.PoolLike<ShowClient>;
  // ---cut---
  type ShowClient = {  // the client of your driver's pool
    query: (query: db.SQLQuery) => Promise<{ rows: any[]; command: string }>;
    release: () => void;
  };

  const countTaken = (txnClient: db.TxnClientLike<ShowClient, db.IsolationLevel.Serializable>) =>
    db.serializable(txnClient, inner =>  // passed through: inner is txnClient
      db.count('seat_bookings', { screening_id: 1000 }).run(inner));

  const taken = await db.serializable(showPool, countTaken);
  const alsoTaken = await db.serializable<number, ShowClient>(showPool, countTaken);
  ```

  Une fonction générique sur ce client, `<C extends db.TxnClientLike<ShowClient, db.IsolationLevel>>(txnClient: C)`, ne compile pas (2345), pas plus qu’une fonction générique sur celui du pool, `<C>(pool: db.PoolLike<C>, …)` ou `<C extends ShowClient>`, qui transmet un callback typé avec `C` ou imbrique un appel sur le client de son callback : nommez le client du driver, `db.TxnClientLike<ShowClient, …>` ou `db.PoolLike<ShowClient>`.

  Quand il infère les arguments de type, TypeScript refuse un `ShowClient` sans marque passé directement à `db.serializable()`, mais `countTaken()` l’accepte car `_zapatos` est optionnel dans un `TxnClientLike`. La vérification de types peut aussi accepter une valeur de repli écrite en ligne (`outer ?? { query, release }`) ou un client sans marque de type `ShowClient & Record<string, any>`. Avec un tel client sans marque, l’appel lève l’erreur `connect is not a function` avant que le callback ne s’exécute. Passez le client fourni par le callback de la transaction.

  Ne donnez jamais le pool à l’appel imbriqué. L’appel ouvre une seconde transaction sur un client du pool. Si le pool n’a qu’une connexion, comme celui de PGlite, il attend indéfiniment que la première transaction libère son client avec `release()`.
- Un paramètre qui accepte un `pg.Pool` ou le pool d’un autre driver se type `db.PoolLike`, ce qu’est un `pg.Pool` : `(pool: db.PoolLike) => db.serializable(pool, async txnClient => txnClient)`<!-- tsc: export const inAnyPool = …; -->. Typé comme une union, `pg.Pool | typeof showPool`, il donne au callback le client de l’autre driver, alors que celui de `pg` est un `pg.PoolClient`. Si le type est une union entre un client marqué d’un autre driver et un pool, affinez-le avant l’appel, sauf si le client lui-même est compatible avec le paramètre `PoolLike`. Dans ce cas, l’union compile. À l’exécution, un client qui possède sa propre propriété `_zapatos` est transmis au niveau d’isolation de la transaction extérieure. Affinez aussi le type si l’union combine des types de clients distincts, comme dans `db.TxnClientForSerializable | db.TxnClientLike<ShowClient, …>`.
- En fournissant un argument de type explicite pour le client, comme dans `readCommitted<T, C, Serial>(…)`, vous affirmez son type, comme avec un cast. Si une fonction accepte un client et que vous lui passez en réalité un pool, ce pool ouvre sa propre transaction au niveau d’isolation demandé par l’appel.
- Depuis la 6.12.0, le premier paramètre accepte aussi un `PoolLike`. Ce changement de type a deux effets.
  - `Parameters<typeof db.serializable>[0]`, ou le premier paramètre tel qu’un `infer` le lit : `.query('SELECT 1')` dessus donne TS2339 ;
  - une fonction fléchée donnée là où `typeof db.serializable` est attendu, `async (_, callback) => callback(txnClient)`, donne TS2345, et une fonction typée avec les paramètres de Zapatos 6.6.1 donne TS2322.

### Votre propre `BEGIN` {#your-own-begin}

Si pg signale un bloc de transaction, pgcast laisse par défaut votre transaction ouverte. Avec [`transactionRequiresIdleClient: false`](/fr/runtime-config#Config.transactionRequiresIdleClient), pgcast envoie son propre `START TRANSACTION`<!-- probe: db.serializable(pool, async () => {}) --> et peut mettre fin à la vôtre. Si le bloc est encore actif, Postgres émet l’avis 25001.

| Votre transaction | Zapatos 6.6.1 ou option à `false` | Par défaut en 7.0 |
|---|---|---|
| pas encore de requête, ou au niveau propre à la session (`readCommitted()`, sur un serveur par défaut) | son `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commite la vôtre, lignes comprises | rejetée avant d’envoyer son `START TRANSACTION` ; la vôtre reste ouverte |
| un autre niveau, après une requête | Postgres refuse (25001), et son `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> annule vos lignes | rejetée avant son `START TRANSACTION` ; la vôtre reste ouverte |
| interrompue par une requête qui a échoué | Postgres refuse (25P02), et son `ROLLBACK` termine la vôtre | rejetée avant son `START TRANSACTION` ; la vôtre reste ouverte, interrompue, pour votre `ROLLBACK` |

Par défaut, l’appelant peut encore annuler la réservation :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
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
- Par défaut, si pg signale un bloc, `transaction()` envoie d’abord une requête vide pour vérifier de nouveau le statut du client. En effet, pg peut encore signaler un bloc juste après l’échec d’un `COMMIT`. Postgres ne compte pas cette requête parmi les vôtres. [`queryListener`](/fr/runtime-config#Config.queryListener) et [`resultListener`](/fr/runtime-config#Config.resultListener) la reçoivent avec l’id de la transaction, comme pour `START TRANSACTION`.
- Pendant cette seconde vérification, le marqueur du premier appel contient le niveau d’isolation demandé par cet appel. Par défaut, un second appel n’exécute son callback sur ce client que si le niveau enregistré satisfait le niveau qu’il demande. Si un bloc de transaction est ouvert, les requêtes du callback s’exécutent au niveau d’isolation de ce bloc.
- Non détectés : un client récupéré du pool alors qu’il est encore dans un bloc, comme un client libéré avant son `ROLLBACK` ; un `BEGIN` envoyé sans `await` ; un `BEGIN` envoyé dans une même chaîne de requête avec une instruction qui échoue (`'BEGIN; …; SELECT 1/0'`), que pg peut encore signaler hors de tout bloc, si bien que `transaction()` s’exécute comme dans la 6.6.1, sans avertissement.
- Si pg signale encore un bloc après l’échec d’un `COMMIT`, la seconde vérification peut indiquer que le client est hors transaction. Les écritures du second callback peuvent être commitées séparément avant le `START TRANSACTION` du premier appel ou après la fin de sa transaction.

### Erreurs {#errors}

<div class="stack">

| Rejetée avec | Quand | Depuis |
|---|---|---|
| `Isolation level must be an IsolationLevel value (e.g. IsolationLevel.Serializable), not '…'`<!-- message --> | `isolationLevel` n’est pas une valeur d’`IsolationLevel` ; levée avant qu’un client soit récupéré ou qu’une requête soit envoyée | pgcast 6.6.2 |
| l’erreur du callback | après `ROLLBACK` ; pour 40001 et 40P01, après la dernière tentative | Zapatos |
| "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message --> | avec [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), Postgres a répondu au `COMMIT` par `ROLLBACK` ; pas de retry, ni de `ROLLBACK` propre | pgcast 6.7.0 |
| "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message --> | avec [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), un client à vous est dans un bloc de transaction ([Votre propre `BEGIN`](#your-own-begin)) ; après n’avoir envoyé que la requête vide | pgcast 6.7.0 |

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

## `savepoint()` {#savepoint}

```ts
db.savepoint(txnClient, callback)
```

À partir de la 6.12.0. Exécute `callback` dans un savepoint de la transaction en cours sur `txnClient`. La promesse renvoyée se résout avec la valeur produite par `callback`.

- `txnClient` : le client d’une transaction : un [`TxnClient`](#TxnClient), le [`TxnClientLike`](#TxnClientLike) du pool d’un autre driver, ou un `pg.PoolClient` sur lequel vous avez envoyé `BEGIN`. Un pool, un `pg.Client` ou un [`QueryableLike`](/fr/sql-template#QueryableLike) ne compile pas.
- `callback` : `async spClient => …`, qui reçoit ce même client, typé tel quel : dans `db.serializable()`, un [`TxnClientForSerializable`](#TxnClientForSerializable). Un callback typé pour un niveau que le client ne satisfait pas ne compile pas ([`IsolationSatisfying`](#IsolationSatisfying)).

Une cliente réserve trois sièges et passe celui qui est déjà pris ; les autres sont réservés dans une seule transaction :

<<< ../examples/plain/savepoint_seat.ts{ts twoslash}

`booked` vaut `['K1', 'K3']`. Chaque siège envoie :

<!-- probe: db.savepoint(pool, async () => {}).then(() => db.savepoint(pool, async () => { throw new Error(); })) -->
```sql
-- K1 and K3
SAVEPOINT pgcast_savepoint_1
-- the callback's insert()
RELEASE SAVEPOINT pgcast_savepoint_1
-- K2
SAVEPOINT pgcast_savepoint_1
-- the callback's insert(), which Postgres refuses with 23505
ROLLBACK TO SAVEPOINT pgcast_savepoint_1
RELEASE SAVEPOINT pgcast_savepoint_1
```

Le SQL de la requête du callback : [`insert()`](/fr/insert#insert).

| Quand | SQL |
|---|---|
| avant le callback | `SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => {}) --> |
| le callback se résout | `RELEASE SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => {}) --> |
| le callback ou ce `RELEASE` est rejeté | `ROLLBACK TO SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => { throw new Error(); }) -->, puis `RELEASE SAVEPOINT pgcast_savepoint_1`<!-- probe: db.savepoint(pool, async () => { throw new Error(); }) -->, puis elle est rejetée avec cette erreur |
| ce `ROLLBACK TO` ou ce `RELEASE` est rejeté | rien de plus : elle est rejetée avec son erreur, à la place de la première, comme `transaction()` quand son `ROLLBACK` est rejeté |
| elle est rejetée avec 40001 ou 40P01 | rien de plus : elle est rejetée avec cette erreur |

- Le nom se termine par la profondeur du savepoint : `pgcast_savepoint_1` directement dans la transaction, `pgcast_savepoint_2` à l’intérieur de celui-ci, et ainsi de suite, le même texte à chaque appel à une même profondeur. `ROLLBACK TO` et `RELEASE` suppriment aussi tous les savepoints établis après le leur, donc les savepoints s’imbriquent : chaque échec annule le travail de son propre niveau, niveaux intérieurs compris, quoi qu’ils aient laissé. Ne donnez pas un tel nom à l’un de vos savepoints.
- Une erreur 40001 ou 40P01 renvoyée par le serveur laisse la transaction en échec. Si l’erreur remonte jusqu’à l’appel englobant à `transaction()` et qu’il reste une tentative, `transaction()` réexécute tout le callback, savepoint compris ([Retries](#retries)). Un savepoint ne réessaie jamais de lui-même.
- Un callback qui intercepte l’erreur d’une requête et se termine : Postgres refuse le `RELEASE` (25P02), donc `savepoint()` annule jusqu’au savepoint et est rejetée avec ce 25P02. Son travail est annulé, niveaux intérieurs compris, et la transaction peut continuer. Ainsi, un 40001 ou un 40P01 que le callback intercepte n’est pas réessayé à cet endroit. Après un 40P01, ou un 40001 sous `REPEATABLE READ`, le `COMMIT` de la transaction enregistre ce qu’elle a écrit hors de ce savepoint ; après un 40001 sous `SERIALIZABLE`, Postgres peut refuser une requête suivante ou le `COMMIT` avec un nouveau 40001, et `transaction()` réessaie alors celui-ci. Laissez-les remonter, et relancez-les autour de `savepoint()`, comme le fait l’exemple.
- Les 40001 et 40P01 sont reconnus à leur `code`, comme dans [Retries](#retries). Une telle erreur levée depuis JavaScript, puis interceptée, ne reçoit pas de `ROLLBACK TO` : le travail de son savepoint reste en place, sauf si un niveau extérieur l’annule.
- Hors d’un bloc de transaction, Postgres refuse le `SAVEPOINT` (25P01) : `savepoint()` est rejetée avec cette erreur, et n’appelle jamais le callback.
- Sur un même client, attendez la fin de chaque appel à `savepoint()` avec `await`. pgcast ne vérifie pas si les appels se chevauchent. En cas de chevauchement, les savepoints s’imbriquent dans l’ordre des appels. Si le premier appel libère son savepoint avant que le second ait libéré le sien, Postgres supprime aussi le second savepoint. Le `RELEASE` du second appel échoue alors avec le code 3B001 et met la transaction en échec. Un `ROLLBACK TO` vers le second savepoint annule aussi les écritures du premier appel effectuées après la création de ce savepoint.
- La profondeur est comptée par objet client, par chaque copie de pgcast installée : un objet wrapper ou un `Proxy` du client repart de 1, tout comme, avec deux copies, par exemple deux versions dans `node_modules`, un savepoint de l’une placé dans un savepoint de l’autre. Le savepoint intérieur prend alors le nom de l’extérieur, et son 40001 intercepté par le callback extérieur laisse en place le travail du niveau extérieur.
- Ses requêtes passent par [`queryListener`](/fr/runtime-config#Config.queryListener) et [`resultListener`](/fr/runtime-config#Config.resultListener) avec l’id de la transaction ; [`transactionListener`](/fr/runtime-config#Config.transactionListener) n’en reçoit rien.
- Une `transaction()` appelée avec le client du callback d’une `transaction()` est [transmise](#passing-a-transaction-through) : elle n’envoie pas de `SAVEPOINT`. Appelée avec un `pg.PoolClient` sur lequel vous avez envoyé `BEGIN`, elle ne l’est pas ([Votre propre `BEGIN`](#your-own-begin)).

## `advisoryXactLock()` {#advisoryXactLock}

```ts
db.advisoryXactLock(txnClient, key)
```

À partir de la 6.12.0. Prend un advisory lock de transaction sur `key`, en attendant tant qu’une autre transaction le détient. Elle renvoie une promesse qui se résout en `undefined` une fois le lock détenu. Postgres le libère quand la transaction se termine ([Advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)).

- `txnClient` : le client d’une transaction : un [`TxnClient`](#TxnClient), le [`TxnClientLike`](#TxnClientLike) du pool d’un autre driver, ou un `pg.PoolClient` sur lequel vous avez envoyé `BEGIN`. Un pool, un `pg.Client` ou un [`QueryableLike`](/fr/sql-template#QueryableLike) ne compile pas.
- `key` : un `bigint`, `BigInt(42)` (`42n` demande une `target` ES2020), ou une paire d’entiers 32 bits, `[1, 42]`, écrite en ligne, `as const` ou typée `readonly [number, number]`. Un `number`, une chaîne ou un `number[]` ne compile pas.

Une séance vend ses dernières places une réservation à la fois :

<<< ../examples/plain/advisory_lock_seats.ts{ts twoslash}

`booked` vaut `true`. Une deuxième réservation au même moment attend le `COMMIT` de la première, puis compte sa place. Chacune envoie :

<!-- probe: db.readCommitted(pool, txnClient => db.advisoryXactLock(txnClient, [2, 1002])) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT pg_advisory_xact_lock($1, $2)
-- the callback's count(), then insert()
COMMIT
```

Le SQL des requêtes du callback : [`count()`](/fr/select#count) et [`insert()`](/fr/insert#insert).

| Clé | SQL | Valeurs |
|---|---|---|
| un `bigint`, `BigInt(42)` | `SELECT pg_advisory_xact_lock($1)`<!-- probe: db.advisoryXactLock(pool, BigInt(42)) --> | `['42']`, sa chaîne décimale, telle que `pg` l’enverrait |
| deux nombres, `[1, 42]` | `SELECT pg_advisory_xact_lock($1, $2)`<!-- probe: db.advisoryXactLock(pool, [1, 42]) --> | `[1, 42]` |

- La clé va telle quelle à `pg_advisory_xact_lock`, sans hachage. Ses deux formes sont deux espaces de clés : `BigInt(42)` et `[0, 42]` sont deux locks. Pour un lock sur un texte, hachez-le dans une requête à vous : `` db.sql`SELECT pg_advisory_xact_lock(hashtextextended(${db.param(title)}, 0))` ``.
- Postgres libère le lock au `COMMIT`, au `ROLLBACK`, et à un `ROLLBACK TO` vers un savepoint pris avant lui, comme celui d’un [`savepoint()`](#savepoint) dont le callback est rejeté ; un `RELEASE` ne le libère pas. Une tentative que `transaction()` réessaie ne détient donc jamais le lock de la précédente ([Retries](#retries)).
- En `REPEATABLE READ` et `SERIALIZABLE`, l’instantané de la transaction est pris par sa première requête, au plus tard le lock, donc avant l’attente : une ligne que l’autre transaction a commitée entre-temps n’est pas vue. En `REPEATABLE READ`, le `count()` de l’exemple ne voit alors pas l’autre réservation, et la dernière place est vendue deux fois ; en `SERIALIZABLE`, Postgres refuse l’une des deux avec 40001, et son retry voit la ligne. En `READ COMMITTED`, comme dans l’exemple, chaque requête prend son propre instantané : le `count()` la voit.
- Postgres vérifie la plage de la clé : 22003 hors de `bigint` ou d’un entier 32 bits, 22P02 pour une fraction ou `NaN`.
- Elle s’exécute, au lieu de renvoyer un fragment, pour que son type puisse demander le client d’une transaction, ce que le `run()` d’un fragment ne peut pas. Dans une requête à vous, écrivez `pg_advisory_xact_lock(${db.param(…)})` dans `sql`.
- Sa requête parvient à [`queryListener`](/fr/runtime-config#Config.queryListener) et à [`resultListener`](/fr/runtime-config#Config.resultListener) avec l’id de la transaction.
- Le lock de session, `pg_advisory_lock()`, n’a pas de fonction : il survit à la transaction, à ses retries et au retour du client dans le pool ([Savoir ce que laisse un rollback](/fr/testing#know-what-a-rollback-leaves)).

Elle est rejetée avant toute requête dans trois cas :

<div class="stack">

| Rejetée avec | Quand |
|---|---|
| "advisoryXactLock() was given a key that is neither a bigint nor an array of two numbers, so Postgres would take no lock: give a bigint, BigInt(42), or a pair of integers, [1, 42]"<!-- message --> | `key` n’est ni l’un ni l’autre, depuis JavaScript ou malgré un cast : `null`, `42`, `[1]`, `[null, 2]`. Postgres ne prend aucun lock sur une clé `NULL`, sans rien dire |
| "advisoryXactLock() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours"<!-- message --> | `txnClient` est un `pg.Pool`, depuis JavaScript ou malgré un cast, dont le `query()` exécuterait le `SELECT` comme une transaction à lui seul |
| "advisoryXactLock() was given a client outside a transaction block, so Postgres would release the lock as soon as it is taken: call it on the client of a transaction(), or after a BEGIN of yours"<!-- message --> | `pg` indique que le client est hors d’un bloc de transaction (à partir de `pg` 8.21), où le `SELECT` serait une transaction à lui seul. Ce statut est le dernier que `pg` a reçu : une requête qui n’a pas encore reçu de réponse, comme un `BEGIN` que vous n’avez pas attendu, n’est pas comptée, et un client dont le `COMMIT` de votre `BEGIN` vient d’échouer peut encore paraître dans un bloc. Un client qui n’en indique aucun, celui d’un autre driver ou `pg` avant 8.21, s’exécute |

</div>

## `setLocal()` {#setLocal}

```ts
db.setLocal(txnClient, settings)
```

À partir de la 6.12.0. Définit chacun des `settings` pour le reste de la transaction, comme le fait `SET LOCAL`. Elle renvoie une promesse qui se résout en `undefined`. Une politique de sécurité niveau ligne les lit ensuite avec `current_setting()` ([Row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)).

- `txnClient` : le client d’une transaction : un [`TxnClient`](#TxnClient), le [`TxnClientLike`](#TxnClientLike) du pool d’un autre driver, ou un `pg.PoolClient` sur lequel vous avez envoyé `BEGIN`. Un pool, un `pg.Client` ou un [`QueryableLike`](/fr/sql-template#QueryableLike) ne compile pas.
- `settings` : un objet de chaînes, chacune le nom d’un réglage et sa valeur : un littéral, un `Record<string, string>`, un alias de type, `as const`. Une interface n’a pas de signature d’index, elle ne compile donc pas : passez-en le spread, `{ ...context }`. Une valeur typée `number`, `null` ou `string | undefined`, une `Map` et un `Date` ne compilent pas non plus. À partir de TypeScript 4.2, une propriété optionnelle compile, `{ 'app.customer'?: string }`, et un `undefined` qu’elle contient est refusé à l’exécution. Seules ses clés propres, énumérables et de type chaîne sont envoyées : une clé `Symbol`, qui compile, et une propriété non énumérable sont ignorées, sans erreur.

Si vous définissez la politique `USING (customer = NULLIF(current_setting('app.customer', true), ''))` sur `seat_bookings`, chaque client ne peut lire que ses propres réservations :

<<< ../examples/plain/set_local_customer.ts{ts twoslash}

Le rôle avec lequel votre app se connecte ne doit pas être propriétaire de la table, sinon la politique demande `FORCE ROW LEVEL SECURITY` ; un superutilisateur ou un rôle doté de `BYPASSRLS` n’y est jamais soumis. Définir aussi `role`, `{ role: 'cinema_customer', 'app.customer': customer }`, exécute le reste de la transaction sous ce rôle, comme le ferait `SET LOCAL ROLE`. Elle envoie :

<!-- probe: db.readCommitted(pool, txnClient => db.setLocal(txnClient, { 'app.customer': 'Ada Quill' })) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
SELECT set_config($1, $2, true)
-- the callback's select()
COMMIT
```

| Réglages | SQL | Valeurs |
|---|---|---|
| un, `{ 'app.customer': 'Ada Quill' }` | `SELECT set_config($1, $2, true)`<!-- probe: db.setLocal(pool, { 'app.customer': 'Ada Quill' }) --> | `['app.customer', 'Ada Quill']` |
| deux, `{ role: 'cinema_customer', 'app.customer': 'Ada Quill' }` | `SELECT set_config($1, $2, true), set_config($3, $4, true)`<!-- probe: db.setLocal(pool, { role: 'cinema_customer', 'app.customer': 'Ada Quill' }) --> | `['role', 'cinema_customer', 'app.customer', 'Ada Quill']`, dans l’ordre de l’objet |
| aucun, `{}` | aucune requête | |

- Chaque nom et chaque valeur est un paramètre : `SET LOCAL` n’en prend aucun, donc un nom ou une valeur écrit dedans serait collé dans le SQL. Le texte ne dépend que du nombre de réglages.
- Postgres garde un réglage jusqu’au `COMMIT` ou au `ROLLBACK` : une tentative que `transaction()` réessaie ne voit donc jamais la valeur de la précédente ([Retries](#retries)). Il le garde aussi à travers le `RELEASE` d’un [`savepoint()`](#savepoint). Un `ROLLBACK TO` vers un savepoint pris avant ce réglage rend la valeur d’avant ce savepoint. Une valeur de session du même nom revient au `COMMIT`.
- Après la transaction, `current_setting('app.customer', true)` lit `''` sur cette connexion, et non `NULL` comme sur une connexion neuve : Postgres garde le nom défini pour la session. Une politique qui le caste, `current_setting('app.tenant', true)::int`, échoue alors à la transaction suivante de cette connexion du pool (22P02). Écrivez `NULLIF(current_setting('app.tenant', true), '')::int`.
- Postgres vérifie chaque nom. Un nom à vous demande un point, `app.customer` : 42704 sans point, `customer_id`, et 42602 quand une partie n’est pas un identifiant, `app.customer-id`. Il accepte un réglage natif comme `role`, `search_path` ou `statement_timeout`, mais refuse `is_superuser` (55P02). Il ignore la casse de `A` à `Z` : `app.Customer` est `app.customer`.
- Elle s’exécute, au lieu de renvoyer un fragment, pour que son type puisse demander le client d’une transaction, ce que le `run()` d’un fragment ne peut pas. Dans une requête à vous, écrivez `set_config(${db.param(name)}, ${db.param(value)}, true)` dans `sql`, et lisez un réglage avec `current_setting(${db.param(name)}, true)`.
- Sa requête parvient à [`queryListener`](/fr/runtime-config#Config.queryListener) et à [`resultListener`](/fr/runtime-config#Config.resultListener) avec l’id de la transaction ; [`transactionListener`](/fr/runtime-config#Config.transactionListener) et [`transactionEventListener`](/fr/runtime-config#Config.transactionEventListener) n’en reçoivent rien.
- Un réglage de session, `set_config(…, false)` ou `SET`, n’a pas de fonction dédiée : il survit à la transaction, et parvient au prochain utilisateur d’une connexion du pool.

Elle est rejetée avant toute requête dans cinq cas, dans cet ordre :

<div class="stack">

| Rejetée avec | Quand |
|---|---|
| "setLocal() was given settings that are not a plain object, whose own properties Postgres would not read as names and values: give an object of strings, { 'app.customer': 'Ada Quill' }"<!-- message --> | `settings` n’est pas un objet dont le prototype est `Object.prototype` ou `null`, depuis JavaScript ou malgré un cast : `null`, `42`, une chaîne, un tableau, une `Map`, un `Date`, l’instance d’une classe, et aussi un objet simple d’un autre realm (`vm`) : passez-en le spread. Une `Map` n’a pas de propres entrées : rien ne serait défini, sans rien dire |
| "setLocal() was given a value for ${name} that is not a string, which Postgres would take as a RESET for a null, or as a driver's text of its own: give a string"<!-- message --> | une valeur n’est pas une chaîne : `null` et `undefined` réinitialiseraient le réglage, comme le fait `RESET`, même par-dessus une valeur définie avant : à `''` pour un nom à vous qu’aucune base, aucun rôle ni aucune connexion ne définit, `0` pour `statement_timeout` par défaut ; un nombre, un `Date` ou un objet serait stocké tel que `pg` l’écrit. Le message nomme le réglage, jamais sa valeur |
| "setLocal() was given ${first} and ${name}, which Postgres takes for one setting, as it folds A to Z to lower case: give one of them"<!-- message --> | deux noms ne diffèrent que par la casse de `A` à `Z`, `app.customer` et `app.Customer` : la valeur que Postgres garderait n’est pas documentée. `app.é` et `app.É` sont deux réglages pour Postgres, et sont envoyés |
| "setLocal() was given a pg.Pool, which runs each query on a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or on a client of the pool after a BEGIN of yours"<!-- message --> | `txnClient` est un `pg.Pool`, depuis JavaScript ou malgré un cast, même avec `{}` |
| "setLocal() was given a client outside a transaction block, so Postgres would undo the settings as soon as they are set: call it on the client of a transaction(), or after a BEGIN of yours"<!-- message --> | `pg` indique que le client est hors d’un bloc de transaction (à partir de `pg` 8.21), même avec `{}`. Le `SELECT` y serait une transaction à lui seul : il renvoie chaque valeur, et le réglage disparaît aussitôt. Comme pour [`advisoryXactLock()`](#advisoryXactLock), ce statut est le dernier que `pg` a reçu, et un client qui n’en indique aucun, celui d’un autre driver ou `pg` avant 8.21, s’exécute |

</div>

## `cursor()` {#cursor}

```ts
db.cursor(txnClient, query, { batchSize })
```

À partir de la 6.12.0. Lit les lignes de `query` par batchs de `batchSize` lignes, à l’aide d’un curseur côté serveur. Elle renvoie un générateur asynchrone à parcourir avec `for await` et n’envoie rien tant que le premier batch n’est pas demandé ([`DECLARE`](https://www.postgresql.org/docs/current/sql-declare.html)).

- `txnClient` : le client d’une transaction : un [`TxnClient`](#TxnClient), le [`TxnClientLike`](#TxnClientLike) du pool d’un autre driver, ou un `pg.PoolClient` sur lequel vous avez envoyé `BEGIN`. Un pool, un `pg.Client` ou un [`QueryableLike`](/fr/sql-template#QueryableLike) ne compile pas.
- `query` : un fragment dont le type de résultat est assignable à `readonly unknown[]`. Chaque batch a ce type. Dans un template `sql`, vous pouvez préciser `s.films.Selectable[]`. Le type par défaut est `any[]`. [`select()`](/fr/select#select) et [`selectRows()`](/fr/select#selectRows) conviennent, tout comme `selectExactlyOne()` lorsqu’il renvoie directement le tableau d’une sous-requête latérale. Un scalaire comme le résultat de `count()` est refusé.
- `batchSize` : les lignes que lit chaque `FETCH`, un entier de 1 à 2147483647. Il n’y a pas de valeur par défaut : aucune taille ne convient à toutes les largeurs de ligne.

Les films d’un studio, lus 100 à la fois :

<<< ../examples/plain/cursor_films.ts{ts twoslash}

`titles` contient tous les titres, dans l’ordre. Cet exemple envoie :

<!-- probe: db.readCommitted(pool, async txnClient => { for await (const _ of db.cursor(txnClient, db.sql`SELECT * FROM ${'films'} WHERE ${{ studio_id: 1000 }} ORDER BY ${'id'}`, { batchSize: 100 })) { } }) -->
```sql
START TRANSACTION ISOLATION LEVEL READ COMMITTED
DECLARE pgcast_cursor_1 NO SCROLL CURSOR FOR SELECT * FROM "films" WHERE ("studio_id" = $1) ORDER BY "id"
FETCH FORWARD 100 FROM pgcast_cursor_1
-- the same FETCH again, until one returns no row
CLOSE pgcast_cursor_1
COMMIT
```

- Après `CURSOR FOR` vient le texte du fragment lui-même, avec ses valeurs, comme un template `sql` imbrique un fragment. Un `select()` passé tel quel envoie sa requête `jsonb_agg` : il est donc lu en un seul batch, le tableau entier, comme le dit son type. Pour ses lignes une à une, typées comme `select()` les type, donnez [`selectRows()`](/fr/select#selectRows), la même requête sans `jsonb_agg`.
- `pgcast_cursor_<n>` prend le plus petit numéro qu’aucun autre `cursor()` encore en cours sur ce client ne détient : des boucles imbriquées obtiennent 1, puis 2 ; une boucle après une autre obtient de nouveau 1 ; deux en même temps obtiennent deux noms. Ne donnez pas à l’un de vos curseurs un nom de la forme `pgcast_cursor_<n>`.
- `NO SCROLL` : le curseur ne lit qu’en avant. Sans lui, savoir si Postgres peut lire en arrière dépendrait du plan. C’est aussi la forme qu’exige une requête `FOR UPDATE`, dont les lignes sont verrouillées à mesure que chaque batch est lu, pas avant.
- Postgres n’accepte pas de paramètre dans `FETCH FORWARD` : la taille est donc écrite dans le SQL, une fois vérifiée.
- Le `runResultTransform` du fragment reçoit le résultat de chaque `FETCH` qui renvoie des lignes, command tag compris. Le premier `FETCH` qui ne renvoie aucune ligne termine la boucle.
- Le `DECLARE` est envoyé sans nom de requête préparée, même si un fragment imbriqué est préparé. Chaque fragment conserve son nom de requête préparée pour les appels hors du curseur. Le numéro du curseur peut changer le texte SQL de la déclaration. `pg` exige qu’un nom de requête préparée corresponde à un seul texte SQL.
- Une requête de sélection simple utilise l’instantané visible lors du `DECLARE` et ignore les lignes que la boucle insère ensuite. En `READ COMMITTED`, [une requête qui verrouille les lignes avec `FOR UPDATE`](/fr/cursors#work-inside-the-loop) peut lire une version plus récente d’une ligne. Un `ROLLBACK TO` vers un savepoint établi après la déclaration conserve la position du curseur.
- [`queryListener`](/fr/runtime-config#Config.queryListener) reçoit le `DECLARE`, chaque `FETCH` et le `CLOSE`, avec l’id de la transaction ; [`resultListener`](/fr/runtime-config#Config.resultListener) reçoit les lignes de chaque `FETCH`, le batch d’un fragment `sql`, puis `[]`. [`transactionListener`](/fr/runtime-config#Config.transactionListener) et [`transactionEventListener`](/fr/runtime-config#Config.transactionEventListener) n’en reçoivent rien.
- Elle s’exécute, au lieu de renvoyer un fragment, pour que son type puisse demander le client d’une transaction, ce que le `run()` d’un fragment ne peut pas. Dans une requête à vous, `DECLARE`, `FETCH` et `CLOSE` s’écrivent en simple `sql`.

Comment elle se termine :

<div class="stack">

| Quand | Elle envoie | Et |
|---|---|---|
| le dernier batch est lu, ou la boucle fait `break` ou `return` | `CLOSE` | |
| la boucle lève une erreur | `CLOSE` | l’erreur de la boucle sort, quoi que donne `CLOSE` |
| le `runResultTransform` du fragment lève une erreur, ou `resultListener` en lève une après `DECLARE` ou `FETCH` | `CLOSE` | l’erreur initiale remonte, sauf si une erreur autre que 25P02 survient lors du `CLOSE` et la remplace |
| une requête de la boucle échoue, sur `pg` | pas de `CLOSE`, que Postgres refuserait dans la transaction annulée (25P02) | l’erreur de cette requête remonte. Si une erreur 40001 ou 40P01 remonte jusqu’à l’appel englobant à `transaction()` et qu’il reste une tentative, `transaction()` réessaie. Ce statut est le dernier reçu par `pg`, et il peut arriver juste après l’erreur : un `CLOSE` peut alors encore partir. Un client qui n’indique aucun statut, celui d’un autre driver, envoie `CLOSE`. Dans les deux cas, son 25P02 est ignoré, dans un `for await` comme dans un `finally` qui appelle `return()`, et un `break` après une erreur que la boucle a interceptée termine la boucle |
| `pg` indique que le client est hors d’un bloc de transaction : un `COMMIT` de votre part est passé avant la fin de la boucle | pas de `CLOSE`, que Postgres refuserait (34000) | le curseur est parti avec la transaction |
| Postgres refuse un `FETCH`, par exemple avec le code 22012 ou 40001 | pas de `CLOSE` | l’erreur du `FETCH` remonte telle quelle. Si `transaction()` réessaie, le parcours recommence sur un nouvel instantané. Les batchs peuvent différer. |
| le générateur est abandonné, ni terminé ni arrêté par `return()` | rien | Postgres ferme le curseur au `COMMIT` ou au `ROLLBACK` ; son numéro reste pris sur ce client |

</div>

Si un écouteur de requête lève une erreur avant que le driver reçoive un `FETCH` ou un `CLOSE`, le curseur peut rester ouvert jusqu’à la fin de la transaction. Si vous réutilisez le nom de ce curseur dans la même transaction, Postgres renvoie le code 42P03.

Deux cas tournent mal, à dessein :

- Un curseur déclaré avant un [`savepoint()`](#savepoint), et dont le `FETCH` échoue à l’intérieur de celui-ci, reste ouvert après le `ROLLBACK TO`, inutilisable : le `cursor()` suivant sur ce client reçoit 42P03. Seul un `next()` appelé à la main dans un savepoint en arrive là.
- `transaction()` marque son client une seule fois pour toutes ses tentatives : un générateur qui a lu un batch dans une tentative et continue dans la suivante n’est donc pas refusé, et son `FETCH` reçoit 34000, son curseur parti avec le `ROLLBACK`. Un générateur créé dans une tentative et lu pour la première fois dans la suivante envoie alors son `DECLARE`, et lit toutes ses lignes. Créez-le dans la tentative qui le lit.

Postgres refuse avant toute ligne, et son erreur sort telle quelle :

- 25P01 pour un `DECLARE` hors d’un bloc de transaction : un `pg.Pool` passé malgré un cast, ou un `pg.PoolClient` sans `BEGIN` ;
- 42601 pour une instruction que `DECLARE` n’accepte pas : un `insert()` d’un tableau de lignes, qui passe le type puisque son résultat est un tableau, un `update()` ou un `deletes()` ; 0A000 pour un `WITH` qui écrit. `VALUES`, `TABLE` et `WITH … SELECT` sont acceptés ;
- 25P02 dans une transaction annulée.

`next()` est rejeté avant toute requête dans trois cas, dans cet ordre :

<div class="stack">

| Rejeté avec | Quand |
|---|---|
| "cursor() was given a query that is not a SQLFragment, such as a string or a { text, values } object: give a db.sql fragment or a select()"<!-- message --> | `query` n’est pas un fragment, depuis JavaScript ou malgré un cast |
| "cursor() was given a batchSize that is not an integer from 1 to 2147483647, the rows each FETCH reads: give a number of rows, { batchSize: 100 }"<!-- message --> | `batchSize` vaut `0`, où Postgres ne renverrait aucune ligne et la boucle s’arrêterait aussitôt, un négatif, une fraction, `NaN`, `Infinity`, une chaîne, un `bigint` ou un objet `Number`, ou `options` manque |
| "cursor() was iterated after its transaction ended, so its next query would run on a client that may be in another transaction, or in none: iterate it inside the transaction() callback that called cursor()"<!-- message --> | la `transaction()` dans laquelle elle a été appelée est terminée : un générateur renvoyé par le callback, avant son premier batch ou après un. C’est vérifié avant le `DECLARE` et chaque `FETCH` ; un `CLOSE` est alors sauté, sans erreur. Un client que `transaction()` n’a pas marqué, un `pg.PoolClient` après un `BEGIN` à vous, n’est pas vérifié |

</div>

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

Les niveaux d’isolation de la transaction extérieure qui satisfont le niveau `T` demandé par un appel imbriqué. Avec [`transactionRequiresSatisfyingLevel: false`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), tout niveau extérieur est accepté.

| `T` | `IsolationSatisfying<T>` |
|---|---|
| `Serializable` | `Serializable` |
| `RepeatableRead` | `Serializable`, `RepeatableRead` |
| `ReadCommitted` | `Serializable`, `RepeatableRead`, `ReadCommitted` |
| `SerializableRO` | `Serializable`, `SerializableRO`, `SerializableRODeferrable` |
| `RepeatableReadRO` | `Serializable`, `RepeatableRead`, `SerializableRO`, `RepeatableReadRO`, `SerializableRODeferrable` |
| `ReadCommittedRO` | tous les niveaux |
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

À partir de la 7.0.0. Une fonction qui attend un client `pg` de l’un des trois autres niveaux en lecture seule accepte celui de `serializableRODeferrable()`. Si vous utilisez la fonction ci-dessous aussi avec la 6.x, donnez à son paramètre le type `TxnClientForSerializableRO | TxnClientForSerializableRODeferrable`.

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const countSeats = (txnClient: db.TxnClientForSerializableRO) =>
  db.count('seat_bookings', { screening_id: 1000 }).run(txnClient);

await db.serializableRO(pool, txnClient => countSeats(txnClient));
await db.serializableRODeferrable(pool, txnClient => countSeats(txnClient));
// @ts-expect-error REPEATABLE READ, READ ONLY does not satisfy SERIALIZABLE, READ ONLY
await db.repeatableReadRO(pool, txnClient => countSeats(txnClient));
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
- `_zapatos` est optionnel dans le type, comme dans Zapatos 6.6.1, donc tout `pg.PoolClient` est accepté comme `TxnClient`, qu’une transaction y soit ouverte ou non, et un client gardé après la fin de sa transaction aussi. Rien ne permet de le voir à l’exécution : une fonction dont le paramètre est d’un type `TxnClientFor…`, si elle reçoit un tel client, exécute ses requêtes hors de toute transaction.

### `TxnClientForSerializable` {#TxnClientForSerializable}

`TxnClient<IsolationSatisfying<IsolationLevel.Serializable>>` : le client de [`serializable()`](#serializable).

### `TxnClientForRepeatableRead` {#TxnClientForRepeatableRead}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableRead>>` : le client de [`repeatableRead()`](#repeatableRead) ; accepte aussi celui de `serializable()`.

### `TxnClientForReadCommitted` {#TxnClientForReadCommitted}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommitted>>` : le client de [`readCommitted()`](#readCommitted) ; accepte aussi celui de `serializable()` et de `repeatableRead()`.

### `TxnClientForSerializableRO` {#TxnClientForSerializableRO}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRO>>` : le client `pg` de [`serializableRO()`](#serializableRO). Ce type accepte aussi le client de `serializable()` et de `serializableRODeferrable()`.

### `TxnClientForRepeatableReadRO` {#TxnClientForRepeatableReadRO}

`TxnClient<IsolationSatisfying<IsolationLevel.RepeatableReadRO>>` : le client `pg` de [`repeatableReadRO()`](#repeatableReadRO). Ce type accepte aussi le client de `serializable()`, de `repeatableRead()`, de `serializableRO()` et de `serializableRODeferrable()`.

### `TxnClientForReadCommittedRO` {#TxnClientForReadCommittedRO}

`TxnClient<IsolationSatisfying<IsolationLevel.ReadCommittedRO>>` : le client `pg` de [`readCommittedRO()`](#readCommittedRO). Ce type accepte le client de tout raccourci de transaction.

### `TxnClientForSerializableRODeferrable` {#TxnClientForSerializableRODeferrable}

`TxnClient<IsolationSatisfying<IsolationLevel.SerializableRODeferrable>>` : le client de [`serializableRODeferrable()`](#serializableRODeferrable) ; accepte aussi celui de `serializable()` et de `serializableRO()`.

### `PoolLike` {#PoolLike}

```ts
type PoolClientLike = { query: (query: SQLQuery) => PromiseLike<{ rows: any[]; command: string }>; release: () => void }

interface PoolLike<C = PoolClientLike> {
  connect: () => PromiseLike<C extends PoolClientLike ? C : PoolClientLike>
}
```

Le pool de n’importe quel driver, que [`transaction()`](#transaction) accepte comme un `pg.Pool`, à partir de la 6.12.0 ([Le pool d’un autre driver](#another-drivers-pool)).

- La `query()` de son client est celle d’un [`QueryableLike`](/fr/sql-template#QueryableLike), dont le résultat a aussi `command`, le command tag : `COMMIT`, ou `ROLLBACK` quand Postgres a annulé la transaction. `release()` est appelé une fois la transaction terminée, sans argument.
- `C` est le type de ce client, que reçoit le callback. `PoolClientLike` n’est pas exporté.
- Un `pg.Pool` est un `PoolLike`.

### `TxnClientLike` {#TxnClientLike}

```ts
type TxnClientLike<C, T extends IsolationLevel> = C & {
  _zapatos?: { isolationLevel: T; txnId: number }
}
```

À partir de la 6.12.0. Le client `C` d’un [`PoolLike`](#PoolLike), tel que le reçoit le callback de [`transaction()`](#transaction). Comme un [`TxnClient`](#TxnClient), ce client est marqué pendant la transaction et la propriété `_zapatos` est optionnelle dans son type. Le callback imbriqué reçoit le même client. Voir [comment TypeScript infère son niveau d’isolation](#another-drivers-pool). Le type d’un `TxnClient` correspond au niveau d’isolation demandé par l’appel imbriqué. Dans une fonction générique paramétrée par `C`, un appel imbriqué ne compile pas.

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

Les autres sont levées quand `.compile()` compile la requête, donc `.run()` est rejetée avec elles ; `transaction()`, `advisoryXactLock()` et `setLocal()` sont rejetées avec les leurs, et le `next()` de `cursor()` avec les siennes. Chacune est listée avec ce qui la lève :

<div class="stack">

| Levée par | Comment | Messages |
|---|---|---|
| `select()`, `selectOne()`, `selectExactlyOne()` et les agrégats, avec un `order`, un `lock` ou un `aggregate` invalide | l’appel lève | [`select()`, Erreurs](/fr/select#errors) |
| `upsert()` | Par défaut, un upsert de plusieurs lignes lève une erreur à l’appel si sa mise à jour implicite inclut une colonne absente d’une ligne, sauf si la cible du conflit la nomme ou si `updateValues` lui donne une valeur définie. Un `updateColumns` explicite désactive la vérification. Avec `noNullUpdateColumns` seul, elle s’applique toujours. | [Lignes aux clés différentes](/fr/insert#upsert-different-keys) |
| `update()` sans colonne à fixer | l’appel lève | [`update()`](/fr/insert#update) |
| `truncate()` avec une autre option | l’appel lève | [`truncate()`](/fr/insert#truncate) |
| une interpolation qui n’a pas de sens en SQL : un nombre, `null`, `db.all`, l’objet global ; `db.all` comme filtre de `deletes()` ou d’`update()` | `.run()` est rejetée | [Interpolations](/fr/sql-template#interpolations), [`all`](/fr/sql-template#all) |
| `db.self` sans colonne ; `db.parent()` sans table parente, donc comme valeur d’`insert()`, d’`upsert()` ou d’`update()` | `.run()` est rejetée | [`self`](/fr/sql-template#self), [`parent()`](/fr/sql-template#parent) |
| `count()` et les autres agrégats avec des `columns` sans colonne ou à plusieurs colonnes, ou sans `columns` du tout pour `sum()`, `avg()`, `min()` et `max()` ; ou une seule sous-requête comme `lateral` ; et donc une requête qui en imbrique un | `.run()` est rejetée | [`count()`](/fr/select#count) |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` ou `db.vals()` comme valeur de filtre ; `db.all` comme valeur de filtre, valeur d’une condition ou élément d’`isIn()` ou d’`isNotIn()` ; l’un d’eux, `db.param()`, un fragment ou `db.parent()` comme élément d’`arrayContains()`, d’`arrayContainedIn()` ou d’`arrayOverlaps()` ; `db.raw()`, `db.cols()` ou `db.vals()` comme valeur d’`insert()`, d’`upsert()` ou d’`update()`, ou dans tout `vals({…})` | `.run()` est rejetée | [Objets Whereable](/fr/sql-template#whereable), [Conditions](/fr/conditions#refused-values), [`insert()`](/fr/insert#insert), [`vals()`](/fr/sql-template#vals) |
| `truncate()` avec ses options dans un autre ordre | `.run()` est rejetée | [`truncate()`](/fr/insert#truncate) |
| `transaction()` avec un autre niveau d’isolation | sa promesse est rejetée | [`transaction()`, Erreurs](#errors) |
| `transaction()` qui reçoit un client dans un bloc de transaction, avec `transactionRequiresIdleClient`, après une requête vide | sa promesse est rejetée | [Votre propre `BEGIN`](#your-own-begin) |
| `advisoryXactLock()` qui reçoit une clé qui n’est ni un `bigint` ni un tableau de deux nombres, un `pg.Pool`, ou un client hors d’un bloc de transaction | sa promesse est rejetée | [`advisoryXactLock()`](#advisoryXactLock) |
| `setLocal()` qui reçoit des réglages qui ne sont pas un objet simple, une valeur qui n’est pas une chaîne, deux noms qui ne diffèrent que par la casse, un `pg.Pool`, ou un client hors d’un bloc de transaction | sa promesse est rejetée | [`setLocal()`](#setLocal) |
| `cursor()` qui reçoit une requête qui n’est pas un fragment ou un `batchSize` qui n’est pas un entier de 1 à 2147483647, ou parcourue après la fin de sa transaction | son premier `next()` est rejeté, ou le `next()` qui suit la transaction | [`cursor()`](#cursor) |

</div>

Après une requête, pgcast rejette dans deux cas qui lui sont propres : `selectExactlyOne()` sans ligne, ou avec une seconde sous [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), avec une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) ; `transaction()` dont Postgres répond au `COMMIT` par `ROLLBACK`, avec [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit) ([Erreurs](#errors)).

---
english: a64e40acff27
description: "Lancer pgcast sur pg, sur postgres.js ou PGlite via leurs adaptateurs, ou sur un driver à vous : le même SQL et les mêmes types sur chacun."
---

# Drivers

Lancez les requêtes et les transactions de pgcast sur `pg`, sur postgres.js ou PGlite via leurs adaptateurs, ou sur un driver à vous : `run()` prend un [`QueryableLike`](/fr/sql-template#QueryableLike), et `transaction()` un [`PoolLike`](/fr/transaction#PoolLike), à partir de la 6.12.0. Une requête donne le même SQL sur chacun, et se résout au même type, tant que le driver lit les valeurs comme `pg` les lit. Vous connaissez déjà `.run()` grâce au [tutoriel](/fr/tutorial).
{.lede}

Avec les adaptateurs postgres.js et PGlite, [`cursor()`](/fr/cursors) lit les batchs en appelant la méthode `query()` du client de la transaction.

## pg {#pg}

Ce qu’utilise le tutoriel, sans rien à ajouter : `.run()` prend un `pg.Pool` ou un client, et [`transaction()`](/fr/transaction#transaction) un pool ou un client.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

Les types que pgcast génère décrivent les valeurs telles que `pg` les parse ([Parser comme pg](#parse-like-pg)) : les adaptateurs ci-dessous parsent chaque colonne avec les parsers de `pg` lui-même. Quel que soit le driver qui lance les requêtes, gardez `pg` installé : `zapatos/db` le charge.

::: info Adaptateurs sur npm
Les paquets [`@pgcast/adapter-postgres-js`](https://www.npmjs.com/package/@pgcast/adapter-postgres-js) et [`@pgcast/adapter-pglite`](https://www.npmjs.com/package/@pgcast/adapter-pglite) sont disponibles sur npm. Il leur faut pgcast 6.12.0 ou une version plus récente. Chaque adaptateur a son propre changelog : [postgres.js](https://github.com/AlexandreDemartin/pgcast/blob/master/adapters/postgres-js/CHANGELOG.md) et [PGlite](https://github.com/AlexandreDemartin/pgcast/blob/master/adapters/pglite/CHANGELOG.md).
:::

## postgres.js {#postgres-js}

```sh
npm install zapatos@npm:@pgcast/pgcast@^6.12.0 @pgcast/adapter-postgres-js postgres
```

Passez à `asPool()` le `sql` que renvoie `postgres()`, importé comme d’habitude (`import postgres from 'postgres'`) :

```ts twoslash
import type { PostgresJsSql } from '@pgcast/adapter-postgres-js';
declare const postgres: (url: string) => PostgresJsSql;  // postgres.js's, as asPool() takes what it returns
// ---cut---
import { asPool } from '@pgcast/adapter-postgres-js';

const sql = postgres(process.env.DATABASE_URL!);
const pool = asPool(sql);
```

Puis lancez vos requêtes sur `pool` comme sur un `pg.Pool` :

<CastPanel example="drivers_postgres_js">

<<< ../examples/drivers_postgres_js.ts{ts twoslash}

</CastPanel>

Le code du panneau est typé sur un `pg.Pool` ; sur `asPool(sql)`, le SQL et le type sont les mêmes.

- `starts_at` est un `Date`, comme avec `pg` : l’adaptateur lit chaque colonne avec les parsers de `pg`, jamais ceux de postgres.js. Une `date` est donc un `Date` à minuit, heure locale, là où postgres.js seul donne minuit UTC.
- `asPool()` ne crée, ne configure ni ne ferme jamais `sql` : c’est à vous de le faire, comme avec un `pg.Pool`. Il lève une erreur sur un `sql` dont le `transform` change les colonnes, les valeurs ou les lignes qu’il lit (`postgres.camel`) : donnez à pgcast un `postgres()` à lui.
- Chaque requête passe par `sql.unsafe()`, sans être préparée, celles de [`prepared()`](/fr/sql-template#prepared) aussi : leur nom est ignoré.
- Une erreur est une `PostgresError` de postgres.js, pas une `pg.DatabaseError` : `code` est le SQLSTATE, donc [`isDatabaseError()`](/fr/transaction#isDatabaseError) et les [retries](/fr/retries) fonctionnent, mais ses autres champs portent les noms de postgres.js (`constraint_name`, `table_name`).

Ce qu’il lit et écrit, type par type, et en quoi il diffère de `pg` : [son README](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#readme).

## PGlite {#pglite}

```sh
npm install zapatos@npm:@pgcast/pgcast@^6.12.0 @pgcast/adapter-pglite @electric-sql/pglite
```

Passez à `asPool()` un PGlite où votre schéma est chargé, celui d’après lequel pgcast a généré ses types :

```ts twoslash
declare const schema: string;
// ---cut---
import { PGlite } from '@electric-sql/pglite';
import { asPool } from '@pgcast/adapter-pglite';

const pglite = new PGlite();  // in memory; or a directory, or 'idb://cinema' in a page
await pglite.exec(schema);
const pool = asPool(pglite);
```

<CastPanel example="drivers_pglite">

<<< ../examples/drivers_pglite.ts{ts twoslash}

</CastPanel>

Le code du panneau est typé sur un `pg.Pool` ; sur `asPool(pglite)`, le SQL et le type sont les mêmes.

- Un `bigint` arrive en chaîne, comme avec `pg`, là où le `query()` de PGlite lui-même donne un `number`, ou un `bigint` au-delà de 2^53.
- `asPool()` ne crée ni ne ferme jamais le PGlite : c’est à vous de le faire.
- [`prepared()`](/fr/sql-template#prepared) parse sa requête une fois sur ce PGlite, comme `pg` le fait une fois sur une connexion.
- Une erreur est une `DatabaseError` de PGlite, pas celle de `pg` : elle a les champs de `pg` (`code`, `constraint`…), donc `isDatabaseError()` et les retries fonctionnent.
- PGlite a une seule connexion, que le pool prête à une transaction à la fois : [Transactions](#transactions).

Dans une page web, chargez une implémentation de `Buffer` avant l’adaptateur. Si vous incluez le cœur de pgcast et le vrai `pg` dans le même bundle, l’absence de l’objet `global` de Node peut aussi provoquer une erreur. Le [worker du playground](https://github.com/AlexandreDemartin/pgcast/tree/master/website/.vitepress/playground) remplace `pg` par deux classes vides, `Pool` et `Client`. Il fournit `process.emitWarning` et une implémentation limitée de `Buffer` avant de charger `zapatos/db`. Dans cette implémentation, `Buffer.from()` lève une erreur.

Ce que l’adaptateur lit et écrit, type par type, et en quoi il diffère de `pg` : [son README](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#readme).

## Transactions {#transactions}

[`transaction()`](/fr/transaction#transaction) et ses raccourcis prennent le pool de l’un ou l’autre adaptateur comme ils prennent un `pg.Pool`. Une fonction typée [`db.PoolLike`](/fr/transaction#PoolLike) prend les trois :

```ts twoslash
import * as db from 'zapatos/db';
import type { PGlitePool } from '@pgcast/adapter-pglite';
declare const pool: PGlitePool;
// ---cut---
const bookSeat = (pool: db.PoolLike, seat: string, customer: string) =>
  db.serializable(pool, async txnClient => {
    const taken = await db.count('seat_bookings', { screening_id: 1000, seat }).run(txnClient);
    if (taken > 0) return false;
    await db.insert('seat_bookings', { screening_id: 1000, seat, customer }).run(txnClient);
    return true;
  });

const booked = await bookSeat(pool, 'F12', 'Ines Calloway');
```

Elle envoie ce qu’elle envoie sur un `pg.Pool` ([Le SQL envoyé](/fr/transaction#the-sql-it-sends)), sur une seule connexion : l’adaptateur de postgres.js en réserve une (`sql.reserve()`), et celui de PGlite prend la seule qu’il a.

- Sur PGlite, ou sur tout pool d’une seule connexion (`max: 1` pour un `pg.Pool` ou un `sql` de postgres.js), une requête sur le pool attend que la transaction libère la connexion. Avec un `await` dans le callback, `.run(pool)` attend indéfiniment : lancez les requêtes du callback sur `txnClient`.
- Les `query()` et `exec()` de PGlite lui-même n’attendent pas : dans la transaction, ils s’y exécutent ([How it differs from pg](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#how-it-differs-from-pg)).
- Une transaction imbriquée prend le client du callback sans cast, et son callback reçoit ce client, au niveau de la transaction extérieure ([Le pool d’un autre driver](/fr/transaction#another-drivers-pool), [#702](https://github.com/AlexandreDemartin/pgcast/issues/702)).

## Un driver à vous {#a-driver-of-your-own}

`run()` prend tout client dont le `query()` prend l’objet de requête de `pg`, `{ text, values, name? }`, et se résout à `{ rows }` : un [`QueryableLike`](/fr/sql-template#QueryableLike). Pour un driver dont le `query()` prend le texte et les valeurs séparément, il suffit d’une ligne :

```ts twoslash
import * as db from 'zapatos/db';
declare const client: { query(text: string, values?: unknown[]): Promise<{ rows: any[] }> };
// ---cut---
const queryable = {
  query: ({ text, values }: { text: string; values?: unknown[] }) => client.query(text, values),
};
const films = await db.select('films', db.all).run(queryable);
```

Un driver qui ignore `name`, comme celui-ci, lance une requête [`prepared()`](/fr/sql-template#prepared) sans la préparer. Pour `transaction()`, son pool est un [`PoolLike`](/fr/transaction#PoolLike) : un `connect()` qui se résout à un tel client, dont le résultat a aussi `command`, le command tag, avec un `release()`.

### Parser comme pg {#parse-like-pg}

Le SQL est le même sur tout driver, et les types décrivent ce que donne `pg` ([Types de valeurs](/fr/runtime-config#value-types)). Un driver à vous lit chaque type comme `pg` le lit, sinon ses lignes ne correspondent pas à leurs types, sans que rien ne le signale :

| Type | `pg` donne |
|---|---|
| `timestamptz`, `timestamp` | un `Date` |
| `date` | un `Date`, à minuit, heure locale |
| `int8` | une chaîne |
| `numeric` | une chaîne |
| `bytea` | un `Buffer` |
| `json`, `jsonb` | la valeur parsée |

Votre driver doit aussi écrire chaque valeur comme le fait `pg` avec son réglage par défaut (`parseInputDatesAsUTC: false`) pour que Postgres stocke la même valeur. Avec ce réglage, `pg` envoie un `Date` en heure locale avec son décalage horaire, tandis que le wrapper ci-dessus, qui appelle directement le `query()` de PGlite, l’envoie en UTC. Avec ce wrapper, Postgres stocke donc le 28 février dans une colonne `date` si le `Date` représente le 1er mars à 5 h à Tokyo.

Les deux adaptateurs lisent chaque colonne avec les parsers de `pg` ([pg-types](https://github.com/brianc/node-pg-types) 2), à partir du texte que donne leur driver. L’[adaptateur postgres.js](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#how-it-differs-from-pg) envoie un `Buffer` sous forme de texte hexadécimal. Pour `Buffer.from('hi')`, une colonne `text` reçoit `\x6869` là où `pg` envoie les octets de `hi`. Pour les différences de lecture et d’écriture sans adaptateur, voyez les sections [What it reads](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#what-it-reads) et [What it writes](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/postgres-js#what-it-writes) de postgres.js, puis les sections [What it reads](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-reads) et [What it writes](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters/pglite#what-it-writes) de PGlite. Le code source des adaptateurs et leurs tests sont dans [`adapters/`](https://github.com/AlexandreDemartin/pgcast/tree/master/adapters). Les tests lisent chaque type avec `pg` et avec l’adaptateur.

## Un fake pour les tests {#a-fake-for-tests}

Le fake d’un test est lui aussi un `QueryableLike` : `run()` le prend donc sans cast :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const answering = (rows: object[]) => ({ query: async () => ({ rows }) });

const films = await db.select('films', db.all, { columns: ['title'] })
  .run(answering([{ result: [{ title: 'Tidewater' }] }]));
```

Des lignes typées d’après le schéma, et ce qu’un fake ne vérifie pas : [Simuler un résultat typé d’après le schéma](/fr/testing#fake-a-result-typed-from-the-schema).

## Voir aussi {#see-also}

- [`QueryableLike`](/fr/sql-template#QueryableLike), [`PoolLike`](/fr/transaction#PoolLike) : ce que prennent `run()` et `transaction()`.
- [Le pool d’un autre driver](/fr/transaction#another-drivers-pool) : ce qu’en fait `transaction()`.
- [Pourquoi pgcast](/fr/why) : pourquoi pgcast ne crée ni ne gère jamais votre pool.

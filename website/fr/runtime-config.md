---
english: e6cbdd459a44
description: "Ce que zapatos/db vous laisse régler à l’exécution : setConfig() et chaque option de Config, les écouteurs, les opt-ins et leurs codes d’avertissement."
---

# Configuration

Ce que `zapatos/db` vous laisse régler pendant que votre code tourne : `setConfig()` et chaque option de `Config`, les écouteurs, les opt-ins et leurs codes d’avertissement.
{.lede}

## `setConfig()` {#setConfig}

```ts
db.setConfig(newConfig: NewConfig): Config
```

Donne aux clés de `newConfig` leur valeur dans la configuration, et laisse les autres telles qu’elles sont. Il y a une configuration par processus, partagée par `import` et `require`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionAttemptsMax: 3,
  transactionRetryDelay: { minMs: 50, maxMs: 500 },
});
```

- La fusion n’a qu’un niveau : `transactionRetryDelay` est remplacé en entier, donc le type exige à la fois `minMs` et `maxMs`.
- Une clé qui a une valeur par défaut et que vous réglez à `undefined` (ou `null`) revient à sa valeur par défaut : `setConfig({ transactionRetryDelay: undefined })` rétablit `{ minMs: 25, maxMs: 250 }`. Un écouteur n’en a pas, donc `undefined` le retire. Passer `undefined` compile, sauf sous `exactOptionalPropertyTypes`.
  - Zapatos 6.6.1 réglait la clé à `undefined`. Après `transactionAttemptsMax: undefined`, `transaction()` abandonnait après sa première tentative (« <span lang="en">… on attempt 1 of undefined, giving up</span> ») ; après `transactionRetryDelay: undefined`, chaque `transaction()` était rejetée avec « <span lang="en">TypeError: Cannot destructure property 'minMs' of 'config.transactionRetryDelay' as it is undefined.</span> » et ne libérait jamais le client qu’elle avait récupéré du pool ([#246](https://github.com/AlexandreDemartin/pgcast/issues/246)).
- Elle renvoie une copie de la nouvelle configuration, comme `getConfig()` : modifier cet objet ne change rien. Zapatos 6.6.1 renvoyait la configuration elle-même ([#245](https://github.com/AlexandreDemartin/pgcast/issues/245)).
- Elle garde l’objet `transactionRetryDelay` que vous lui donnez, pas une copie : modifier ensuite son `minMs` ou son `maxMs` modifie la configuration.
- Une clé que la 8.0 a supprimée, [`undefinedMeansMissing`](#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](#Config.transactionRequiresCommit), [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient), [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) ou [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), ne compile pas (TS2353). Donnée quand même, depuis une variable ou du JavaScript, elle lève une erreur, sauf si sa valeur est celle que la 8.0 applique toujours (`true`), `null` ou `undefined`, et la configuration n’en garde aucune. Erreur : `undefinedMeansMissing was removed in 8.0, which always does what undefinedMeansMissing: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-undefinedMeansMissing`<!-- message -->.
- Une clé inconnue ne compile pas (TS2353), pas plus qu’une valeur du mauvais type (TS2322) :

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ retries: 3 });
```

## `getConfig()` {#getConfig}

```ts
db.getConfig(): Config
```

Une copie de la configuration, `transactionRetryDelay` compris : `getConfig().transactionRetryDelay.minMs = 1` ne change rien. Les écouteurs sont les fonctions mêmes que vous avez passées. Zapatos 6.6.1 partageait `transactionRetryDelay`, si bien que cette ligne modifiait la configuration ([#245](https://github.com/AlexandreDemartin/pgcast/issues/245)).

Pour changer la configuration un moment, comme le font les tests, gardez la copie et rétablissez-la dans un `finally`, pour la restaurer même si une exception survient entre-temps (un test qui échoue, par exemple) :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const saved = db.getConfig();
db.setConfig({ transactionRetryDelay: { minMs: 0, maxMs: 0 } });
try {
  // … the transactions that should retry at once
} finally {
  db.setConfig(saved);
}
```

- Elle rétablit chaque clé que contient `saved`.
- Une clé que `saved` ne contient pas reste telle que réglée : un écouteur réglé entre-temps continue d’écouter. Réglez-le à `undefined` pour le retirer : `db.setConfig({ queryListener: undefined })`. Sous `exactOptionalPropertyTypes`, qui le refuse (TS2379), castez l’objet, car le type n’offre pas d’autre moyen, pas plus que dans Zapatos 6.6.1 : `{ queryListener: undefined } as unknown as db.NewConfig`.

## `Config` {#Config}

```ts
interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;
  castObjectParamsToJson: boolean;
  selectExactlyOneChecksForSecondRow?: boolean;
  shortcutsUseJson?: boolean;
  topLevelSelectAsRows?: boolean;
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
  transactionEventListener?: (event: TransactionEvent, txnId?: number) => void;
}
```

Les clés qu’ajoute pgcast sont facultatives, donc un `Config` écrit pour Zapatos 6.6.1 compile toujours. Le type que renvoie `getConfig()` pour ces clés est `boolean | undefined`, même si chacune a toujours une valeur.

<div class="stack">

| Option | Par défaut | Ce qu’elle change | Lue |
|---|---|---|---|
| [`transactionAttemptsMax`](#Config.transactionAttemptsMax) | `5` | combien de fois `transaction()` exécute son callback | à chaque `transaction()` |
| [`transactionRetryDelay`](#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | l’attente avant chaque retry | à chaque `transaction()` |
| [`castArrayParamsToJson`](#Config.castArrayParamsToJson) | `false` | un paramètre tableau : `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) --> au lieu de `$1` | à chaque `compile()` |
| [`castObjectParamsToJson`](#Config.castObjectParamsToJson) | `false` | un paramètre objet simple : `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) --> au lieu de `$1` | à chaque `compile()` |
| [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow) | `false` | un `selectExactlyOne()` exécuté seul demande deux lignes et sa promesse est rejetée s’il en trouve une deuxième | à chaque `selectExactlyOne()` |
| [`shortcutsUseJson`](#Config.shortcutsUseJson) | `false` | `select()` et ses semblables, et le `RETURNING` des écritures, construisent leur JSON avec les fonctions `json` : `coalesce(json_agg(result), '[]')`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) --> | à chaque `select()`, `selectOne()`, `selectExactlyOne()`, `selectRows()`, `withCTEs()`, `insert()`, `upsert()`, `update()` et `deletes()` |
| [`topLevelSelectAsRows`](#Config.topLevelSelectAsRows) | `false` | un `select()` exécuté seul envoie la requête de `selectRows()`, une ligne par résultat, au lieu d’une seule valeur agrégée | à chaque `select()` |
| [`queryListener`](#Config.queryListener) | aucun | appelé avec chaque requête qu’envoie `run()` | à chaque `run()` |
| [`resultListener`](#Config.resultListener) | aucun | appelé avec chaque résultat que donne `run()` | à chaque `run()` |
| [`transactionListener`](#Config.transactionListener) | aucun | appelé quand une tentative de `transaction()` échoue avec `40001` ou `40P01`, et à chaque retry | à chaque `transaction()` |
| [`transactionEventListener`](#Config.transactionEventListener) | aucun | appelé juste après `transactionListener`, avec un [`TransactionEvent`](#TransactionEvent) à la place du message | à chaque `transaction()` |

</div>

### `transactionAttemptsMax` {#Config.transactionAttemptsMax}

```ts
transactionAttemptsMax: number  // default: 5
```

Combien de fois [`transaction()`](/fr/transaction#transaction) exécute son callback. Après un échec de sérialisation (`40001`) ou un deadlock (`40P01`), elle annule la transaction (`ROLLBACK`) et exécute de nouveau le callback, jusqu’à ce que ce nombre de tentatives ait échoué ; elle lève alors la dernière erreur. Sur toute autre erreur, elle annule la transaction et lève l’erreur aussitôt.

- `1`, `0`, une valeur négative ou `NaN` : une tentative, aucun retry, et le message dit « <span lang="en">… on attempt 1 of 1, giving up</span> ». Une fraction est arrondie à l’entier supérieur : `2.5` donne trois tentatives.
- Lue quand `transaction()` démarre, donc un changement vaut pour la transaction suivante, pas pour celle en cours.
- Comment écrire un callback qui peut s’exécuter deux fois : [Retries](/fr/retries).

### `transactionRetryDelay` {#Config.transactionRetryDelay}

```ts
transactionRetryDelay: { minMs: number; maxMs: number }  // default: { minMs: 25, maxMs: 250 }
```

Avant chaque retry, `transaction()` attend un nombre entier de millisecondes de `minMs` à `maxMs`, arrondi d’un tirage uniforme entre les deux : `Math.round(minMs + (maxMs - minMs) * Math.random())`. Ainsi `minMs` et `maxMs` sortent deux fois moins souvent que chaque valeur entre eux. [`transactionListener`](#Config.transactionListener) est informé de l’attente, et [`transactionEventListener`](#Config.transactionEventListener) la reçoit dans `delayMs`.

### `castArrayParamsToJson` {#Config.castArrayParamsToJson}

```ts
castArrayParamsToJson: boolean  // default: false
```

Avec `true`, chaque tableau envoyé comme paramètre est envoyé en JSON : `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) -->, sa valeur passée par `JSON.stringify()`. Cela vaut pour `param(x)`, et pour les valeurs des raccourcis et des Whereables, qui sont aussi des paramètres. Sans l’option, `pg` envoie un tableau comme un tableau Postgres.

Un cast donné en chaîne l’emporte ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)) ; Zapatos 6.6.1 l’ignorait au profit de `"json"` :

- Un tableau dont le cast se termine par `[]` ou `[n]` est envoyé comme un tableau : `param([1, 2], 'int4[]')` donne `CAST($1 AS "int4"[])`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'int4[]')}`) -->.
- Tout autre tableau garde le JSON, `'_int4'` et un domaine sur un tableau compris : `param([1, 2], 'jsonb')` donne `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1, 2], 'jsonb')}`) -->.

<CastPanel example="castArrayParamsToJson">

<<< ../examples/castArrayParamsToJson.ts{ts twoslash}

</CastPanel>

- Sans l’option, la même requête échoue : `json_array_length($1)` donne 22P02 « <span lang="en">invalid input syntax for type json</span> ». `param(x, true)` envoie le tableau en JSON avec ou sans l’option.
- Sur une colonne tableau de Postgres, Postgres refuse un tableau envoyé en JSON : 42804 `column "genres" is of type text[] but expression is of type json` dans un `insert()` ou un `update()`, 42883 « <span lang="en">operator does not exist: text[] = json</span> » dans un Whereable, et « <span lang="en">… text[] && json</span> » avec [`arrayOverlaps()`](/fr/conditions#conditions.arrayOverlaps).
- Dans un `insert()`, un `update()` ou un Whereable, `db.param(genres, 'text[]')` l’envoie comme un tableau. Si vous devez comparer ce `Parameter` à une colonne de type tableau, utilisez un [fragment `sql`](/fr/conditions#arrays). Les conditions sur tableaux refusent un `Parameter` qui contient le tableau ([#40](https://github.com/AlexandreDemartin/pgcast/issues/40)).
- `param(x, false)` envoie le tableau tel quel, avec ou sans l’option : `{ genres: db.param(['mystery', 'drama'], false) }` donne `SET ("genres") = ROW($1)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.update('films', { genres: db.param(['mystery', 'drama'], false) }, { id: 1000 })) -->.
- Chaque élément d’`isIn()` est un paramètre à part, donc un tableau de nombres y reste inchangé : `"id" IN ($1, $2)`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${{ id: db.conditions.isIn([1000, 1001]) }}`) -->.
- Comment `param()` compile chaque `cast` : [`param()`](/fr/sql-template#param).

### `castObjectParamsToJson` {#Config.castObjectParamsToJson}

```ts
castObjectParamsToJson: boolean  // default: false
```

Avec `true`, chaque objet simple envoyé comme paramètre est envoyé comme `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) -->, sa valeur passée par `JSON.stringify()`. Sans l’option, c’est `$1`, et `pg` envoie le même texte JSON, sans type : Postgres en déduit alors un d’après la position de `$1`.

Un cast donné en chaîne l’emporte, la valeur restant du texte JSON : `param({ a: 1 }, 'jsonb')` donne `CAST($1 AS "jsonb")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 }, 'jsonb')}`) -->, que `=` et `@>` acceptent sur une colonne `jsonb` ([#36](https://github.com/AlexandreDemartin/pgcast/issues/36)) ; Zapatos 6.6.1 l’ignorait au profit de `"json"`, qu’ils refusent (42883).

<CastPanel example="castObjectParamsToJson">

<<< ../examples/castObjectParamsToJson.ts{ts twoslash}

</CastPanel>

- Sans l’option, la même requête échoue : `$1 ->> 'title'` donne 42725 « <span lang="en">operator is not unique: unknown ->> unknown</span> ». Un cast dans le SQL, `$1::jsonb`, fonctionne dans les deux cas.
- Un objet simple est un littéral objet, `{…}` : un `Date`, un `Buffer` ou une instance de classe est envoyé comme `$1`, inchangé.
- `param(x, false)` donne `$1`<!-- probe: db.sql`${db.param({ a: 1 }, false)}` --> avec ou sans l’option ; `param(x, true)` donne `CAST($1 AS "json")`<!-- probe: db.sql`${db.param({ a: 1 }, true)}` -->.

### `upsertRequiresSameKeys` {#Config.upsertRequiresSameKeys}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-upsertRequiresSameKeys)).

Un upsert de plusieurs lignes lève une erreur à l’appel si sa mise à jour implicite inclut une colonne absente d’une ligne, sauf si la cible du conflit la nomme ou si `updateValues` lui donne une valeur définie. Un `updateColumns` explicite désactive la vérification. Avec `noNullUpdateColumns` seul, elle s’applique toujours. Erreur : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

Pendant toute la 7.x, avec `false`, une clé absente pouvait écraser la valeur stockée sans avertissement. Voir [Lignes aux clés différentes](/fr/insert#upsert-different-keys).

### `undefinedMeansMissing` {#Config.undefinedMeansMissing}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-undefinedMeansMissing)).

Une valeur `undefined` dans [`insert()`](/fr/insert#insert), [`update()`](/fr/insert#update) et [`upsert()`](/fr/insert#upsert) est une clé manquante : `DEFAULT` dans `insert()`, omise dans `update()` et `upsert()`, `updateValues` compris. Pendant toute la 7.x, avec `false`, elle était envoyée comme `NULL` (dans `updateValues`, sa colonne prenait sa valeur dans `EXCLUDED`), comme dans Zapatos 6.6.1, sans avertissement. Pour le SQL de chaque appel, voir [Une valeur `undefined`](/fr/insert#undefined-values).

### `transactionRequiresCommit` {#Config.transactionRequiresCommit}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-transactionRequiresCommit)).

Si Postgres répond au `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> de [`transaction()`](/fr/transaction#transaction) par le command tag `ROLLBACK`, rien n’est enregistré.

`transaction()` est alors rejetée, sans retry, avec "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message -->.

Pendant toute la 7.x, avec `false`, la promesse se résolvait avec la valeur renvoyée par le callback, sans avertissement. Voir [Laisser passer l’erreur](/fr/retries#let-the-error-through).

- Non couvert : un callback qui envoie lui-même `COMMIT` ou `ROLLBACK`.
- Non testé avec `pg-native`.

### `transactionRequiresIdleClient` {#Config.transactionRequiresIdleClient}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-transactionRequiresIdleClient)).

Avec un client sur lequel vous avez ouvert vous-même une transaction, par `BEGIN`, [`transaction()`](/fr/transaction#transaction) terminerait votre transaction : son `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> la valide, ou son `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> l’annule ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)).

Elle est rejetée avant d’envoyer son `START TRANSACTION`, avec "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message -->. Votre transaction reste ouverte, pour votre `COMMIT` ou votre `ROLLBACK`.

Pendant toute la 7.x, avec `false`, `transaction()` envoyait `START TRANSACTION` sans vérifier de nouveau le statut du client, comme dans Zapatos 6.6.1. pgcast n’émettait aucun avertissement.

- pg dit si un client est dans un bloc à partir de pg 8.21 (`getTransactionStatus()`). Avec les versions antérieures, `transaction()` s’exécute comme dans la 6.6.1, sans avertissement.
- Quand pg signale un bloc, `transaction()` envoie d’abord une requête vide, pour relire le statut ; [`queryListener`](#Config.queryListener) et [`resultListener`](#Config.resultListener) la reçoivent, avec l’id de la transaction ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)).
- Pendant cette seconde vérification, le marqueur du premier appel contient le niveau d’isolation demandé par cet appel. Un second appel n’exécute son callback sur ce client que si le niveau enregistré satisfait le niveau qu’il demande. Si un bloc de transaction est ouvert, les requêtes du callback s’exécutent au niveau d’isolation de ce bloc.
- Seul un client que vous passez est vérifié : un client emprunté au pool, libéré alors qu’il était encore dans un bloc, ne l’est pas.
- Un `BEGIN` envoyé sans `await` n’est pas encore vu : le client paraît hors de tout bloc.
- Un `BEGIN` envoyé dans une même chaîne de requête avec une instruction qui échoue peut lui aussi paraître hors de tout bloc : `transaction()` s’exécute alors comme dans la 6.6.1, sans avertissement.
- Non testé avec `pg-native`.
- Si pg signale encore un bloc après l’échec d’un `COMMIT`, la seconde vérification peut indiquer que le client est hors transaction. Les écritures du second callback peuvent être commitées séparément avant le `START TRANSACTION` du premier appel ou après la fin de sa transaction.

### `transactionRequiresSatisfyingLevel` {#Config.transactionRequiresSatisfyingLevel}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-transactionRequiresSatisfyingLevel)).

Un callback imbriqué s’exécute au niveau d’isolation de la transaction extérieure. Un appel à `serializable()` avec le client de `readCommitted()` ne peut donc pas garantir le niveau demandé ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)).

Quand ce niveau ne vaut pas pour celui demandé ([`IsolationSatisfying`](/fr/transaction#IsolationSatisfying)), elle est rejetée avant d’appeler son callback, avec "transaction() at … was given the client of a transaction at …, so its callback would run at …: open the outer transaction at a level that satisfies … (IsolationSatisfying)"<!-- message -->, chaque `…` étant un niveau de l’appel (`SERIALIZABLE`, `READ COMMITTED`). À moins que le callback extérieur n’intercepte l’erreur, la transaction extérieure est alors annulée.

Pendant toute la 7.x, avec `false`, le client était transmis même si son niveau d’isolation était insuffisant, sans avertissement de pgcast.

- L’appel transmet le client si, dans le [tableau des niveaux d’isolation](/fr/transaction#IsolationSatisfying), son niveau figure sur la ligne correspondant au niveau demandé.
- Seul le client d’une `transaction()` est vérifié, par sa marque `_zapatos`, que porte aussi un client simple tant qu’une `transaction()` s’exécute dessus, si bien qu’un second appel au même moment sur ce client est vérifié : un pool, un client simple inactif et un client gardé après la fin de sa transaction reçoivent leur propre transaction, comme avant.
- Les types ne changent pas : un `Queryable` accepte le client de n’importe quel niveau ([`TxnClient`](/fr/transaction#TxnClient)).
- Un test qui exécute du code dans une `transaction()` à lui, et lui passe ce client : ouvrez-la en `IsolationLevel.Serializable`, qui vaut pour tous les niveaux.

### `selectExactlyOneChecksForSecondRow` {#Config.selectExactlyOneChecksForSecondRow}

```ts
selectExactlyOneChecksForSecondRow?: boolean  // default: false through 7.x; removed in 8.0
```

Avec la vérification activée et `withTies` désactivé, un [`selectExactlyOne()`](/fr/select#selectExactlyOne) exécuté seul demande deux lignes, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('films', { id: 1000 })) --> avec `2`, et la promesse de `.run()` est rejetée avec une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) si la requête trouve une deuxième ligne : "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->. Avec les deux options désactivées, il en demande une, `LIMIT 1`, et renvoie la première ligne qui correspond, comme dans Zapatos 6.6.1.

- Imbriqué dans un `lateral` ou un template `sql`, ou copié avec [`.copy()`](/fr/sql-template#copy), le raccourci demande une ligne.
- Avec [`withTies: true`](/fr/select#order-limit-offset-and-withties), chaque limite se compile en `FETCH FIRST … ROWS WITH TIES`. Une requête imbriquée peut renvoyer tous les ex æquo. Une copie exécutée seule demande toujours une ligne et les éventuelles lignes ex æquo. Si la vérification est activée et que Postgres renvoie une deuxième ligne, sa promesse est rejetée avec une `NotExactlyOneError`.
- Avec un [`lock`](/fr/select#lock), `LIMIT $2` verrouille aussi la deuxième ligne : une fois `.run()` rejetée, les deux lignes restent verrouillées jusqu’à la fin de la transaction, et le `FOR UPDATE NOWAIT` d’une autre session sur l’une d’elles reçoit 55P03.
- Sans l’option, aucun avertissement, et elle reste désactivée pendant toute la série 7.x : « au moins une ligne », c’est ainsi que Zapatos lit `selectExactlyOne()`, imbriqué dans un `lateral` sur une clé étrangère `NOT NULL` ([décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)). La 8.0 la retire : `selectExactlyOne()` ne demande plus que `LIMIT 1`, et la clé réglée à `true` lève une erreur ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).
- Lue quand `selectExactlyOne()` est appelée, pas à `.run()`.

### `aggregatesTypedByColumn` {#Config.aggregatesTypedByColumn}

À partir de la 7.0.0, l’option valait `true` par défaut. À partir de la 8.0.0, la clé est supprimée et pgcast se comporte toujours comme avec `true` ([migration vers la 8.0](/fr/switching#from-8-0-aggregatesTypedByColumn)).

[`sum()`](/fr/aggregates#sum), [`avg()`](/fr/aggregates#avg), [`min()`](/fr/aggregates#min) et [`max()`](/fr/aggregates#max) donnent `null` quand aucune ligne ne correspond. `min()` et `max()` donnent la valeur de la colonne telle que `pg` la lit : avec les parseurs par défaut, un `Date` pour une valeur finie de type `timestamptz` et une chaîne pour un `text` ou un enum. Le SQL généré et le comportement de [`count()`](/fr/aggregates#count) restent les mêmes.

Pendant toute la 7.x, avec `false`, `.run()` appliquait `Number()` au résultat, sans avertissement : un ensemble vide donnait `0`, une date finie lue comme un `Date` le nombre de millisecondes depuis l’époque Unix et un texte non numérique `NaN`. Déclaré aussi à `false` dans [`ConfigTypes`](#ConfigTypes), il typait les quatre agrégats en `number`.

- Sous une clé de `lateral` ou comme valeur d’`extras`, le résultat de l’agrégat est renvoyé en JSON et vaut `null` quand aucune ligne ne correspond. Il est typé comme le type `JSONSelectable` de la colonne.
  - Pour un [`lateral` transmis](/fr/select#lateral), appelez `.run()` sur la requête extérieure `selectOne()`, `selectExactlyOne()` ou `selectRows()` pour obtenir la colonne telle que `pg` la parse. Un `select()` extérieur renvoie du JSON. [`selectRows()`](/fr/select#selectRows) refuse à la compilation un fragment numérique transmis directement, comme `count()`.
- Les exemples, et chaque type : [Typé par colonne](/fr/aggregates#typed-by-column).

### `shortcutsUseJson` {#Config.shortcutsUseJson}

```ts
shortcutsUseJson?: boolean  // default: false; true in 8.0
```

À partir de la 7.3.0. Avec `true`, [`select()`](/fr/select#select), [`selectOne()`](/fr/select#selectOne), [`selectExactlyOne()`](/fr/select#selectExactlyOne) et [`selectRows()`](/fr/select#selectRows) construisent chaque ligne avec `to_json` et `json_build_object`, et `select()` son tableau avec `json_agg`, à la place de leurs équivalents `jsonb` : `to_json("films".*)`<!-- probe: (db.setConfig({ shortcutsUseJson: true }), db.select('films', db.all)) -->. [`insert()`](/fr/insert#insert), [`upsert()`](/fr/insert#upsert), [`update()`](/fr/insert#update) et [`deletes()`](/fr/insert#deletes) font de même dans leur `RETURNING`. `json` garde le texte tel que Postgres l’écrit, là où `jsonb` le parse et le trie : sur 1000 studios avec un `lateral` de 20 films chacun, 37 ms au lieu de 110 ([décision 018](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/018-json-output.md)). Le SQL de chaque option : [lectures](/fr/select#shortcutsUseJson) et [écritures](/fr/insert#shortcutsUseJson).

Les valeurs et les types sont les mêmes, sauf :

- Les clés d’une ligne viennent dans l’ordre de la table, puis `extras`, puis les clés de `lateral` ou le `$action` d’`upsert()`, et non les clés les plus courtes d’abord comme avec `jsonb` : un code qui lit `Object.keys()` ou compare des `JSON.stringify()` le voit. Une colonne `json` garde ses clés telles qu’elles sont stockées, et un `-0` de type `float8` reste `-0`.
- Un résultat imbriqué est du `json` : une fonction `jsonb` appliquée dessus échoue, `jsonb_typeof((…))` donne 42883, de même que `DISTINCT` et `UNION` ; `->` et `->>` fonctionnent, tout comme un cast, `::jsonb`.
- Un parseur de type réglé pour `jsonb` (3802) seul ne s’applique plus ; [`enableCustomJSONParsingForLargeNumbers()`](/fr/value-types#enableCustomJSONParsingForLargeNumbers) règle les deux.
- À côté de toutes les colonnes, chaque clé d’`extras` ou de `lateral` est un alias de colonne. Une clé que Postgres refuserait ou tronquerait, vide, avec un NUL ou de plus de 63 octets en UTF-8, lève une erreur à la compilation, donc `.run()` est rejetée avant toute requête : passez `columns`, ou le `returning` d’une écriture, dont les clés restent des paramètres.
- À côté de toutes les colonnes, les `extras` d’une écriture s’exécutent dans une sous-requête sur sa ligne, qui accepte certains `extras` que `RETURNING` refuse, option désactivée : `count(*)` y donne 1 ([Écritures](/fr/insert#shortcutsUseJson)).
- Avec `columns` ou `returning`, les colonnes, les clés d’`extras` et de `lateral` et `$action` partagent un seul `json_build_object()`, que Postgres limite à 100 arguments : au-delà de 50 clés, une erreur est levée à la compilation, là où chaque partie en avait 50 à elle seule.
- Le tableau de `select()` peut atteindre le 1 Go d’une valeur, là où `jsonb_agg` s’arrête à 256 Mo (54000).

[Les agrégats](/fr/aggregates) gardent leur SQL, car ils ne construisent pas de JSON. L’option est lue quand le raccourci est appelé, pas à `.run()`. Désactivée, le SQL est inchangé ; elle reste désactivée, sans avertissement, pendant toute la série 7.x. La 8.0 retire l’option et ne garde que `json` ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

### `topLevelSelectAsRows` {#Config.topLevelSelectAsRows}

```ts
topLevelSelectAsRows?: boolean  // default: false; true in 8.0
```

À partir de la 7.3.0. Avec l’option activée, un [`select()`](/fr/select#select) exécuté ou compilé seul envoie la requête de [`selectRows()`](/fr/select#selectRows), une ligne par résultat, et `.run()` donne le même tableau, `[]` quand aucune ligne ne correspond. Aucune valeur unique ne contient tout le résultat : une grosse lecture coûte moins cher, et la [limite](/fr/performance#limits) de 256 Mo de `jsonb_agg` ne s’y applique plus.

| Appel | `.compile().text` |
|---|---|
| `db.select('films', { studio_id: 1000 })` | `SELECT coalesce(jsonb_agg(result), '[]') AS result FROM (SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)) AS "sq_films"`<!-- probe: db.select('films', { studio_id: 1000 }) --> |
| le même, avec l’option | `SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('films', { studio_id: 1000 })) --> |

- `.compile()` montre la requête des lignes : du code qui exécute ce texte avec son propre client et lit `rows[0].result` n’obtient que la première ligne : lisez `rows.map(r => r.result)`, ou appelez `.run()`. La 8.0 retire l’option et ne garde que la requête des lignes ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).
- Comme requête principale de [`withCTEs()`](/fr/sql-template#withCTEs), de même. Imbriqué dans un `lateral`, des `extras`, un template `sql` ou une CTE, copié avec [`.copy()`](/fr/sql-template#copy), et dans [`cursor()`](/fr/transaction#cursor), `select()` garde son agrégat{N} : la requête parente le lit comme une seule valeur.
- Un [`lateral` transmis tel quel](/fr/select#lateral), seul, est converti au-dessus de la requête des lignes, `SELECT to_jsonb(result) AS result FROM (…) AS "sq_studios"`<!-- probe: (db.setConfig({ topLevelSelectAsRows: true }), db.select('studios', db.all, { lateral: db.count('films', { studio_id: db.parent('id') }) })) --> (`to_json` avec [`shortcutsUseJson`](#Config.shortcutsUseJson)), pour qu’un `count()` reste un nombre, comme dans le tableau de `select()`, là où `selectRows()` donne la chaîne que `pg` parse, et pour que `order` et `distinct` agissent sur sa valeur brute, comme dans l’agrégat.
- La requête des lignes s’exécute avec son propre `runResultTransform` : celui que vous définissez sur la requête ne s’applique qu’à ses copies et à la requête imbriquée.
- [`prepared()`](/fr/sql-template#prepared), `noop` et les écouteurs fonctionnent comme avant : [`queryListener`](#Config.queryListener) reçoit la requête des lignes.
- `selectOne()`, `selectExactlyOne()`, `selectRows()`, `count()` et les autres agrégats ne changent pas, ni les types.
- Lue quand `select()` est appelée, pas à `.run()`. Désactivée, l’option n’émet jamais d’avertissement : les valeurs sont les mêmes ([décision 018](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/018-json-output.md)).

### `queryListener` {#Config.queryListener}

```ts
queryListener?(query: SQLQuery, txnId?: number): void
```

Appelé par [`run()`](/fr/sql-template#run) une fois la requête compilée, avant son envoi.

- `query` : la [`SQLQuery`](#SQLQuery) qu’envoie `run()`, `{ text, values }`, et `name` une fois [préparée](/fr/sql-template#prepared).
- `txnId` : dans une [transaction](#transaction-ids), son id ; sinon `undefined`.
- Il est appelé aussi pour un fragment sans effet, qui n’envoie rien : `insert('tags', [])` donne `/* marked no-op: won't hit DB unless forced -> */ INSERT INTO "tags" SELECT null WHERE false`<!-- probe: db.insert('tags', []) -->.
- Il n’est pas appelé quand la compilation lève une erreur. S’il lève une erreur, `run()` est rejetée, et la requête n’est pas envoyée.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  queryListener: (query, txnId) =>
    console.log(`(${txnId ?? '-'})`, query.text, query.values),
  resultListener: (result, txnId, elapsedMs) =>
    console.log(`(${txnId ?? '-'}, ${elapsedMs?.toFixed(1)}ms)`, result),
  transactionListener: (message, txnId) =>
    console.log(`(${txnId})`, message),
});
```

### `resultListener` {#Config.resultListener}

```ts
resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void
```

Appelé par `run()` avec ce en quoi elle se résout, une fois [`runResultTransform`](/fr/sql-template#runResultTransform) exécutée.

- `result` : `{ title: 'The Salt Orchard' }` pour `selectOne('films', { id: 1000 }, { columns: ['title'] })`, un nombre pour `count()`, `[]` pour un fragment sans effet.
- `txnId` : comme pour [`queryListener`](#Config.queryListener).
- `elapsedMs` : de juste avant l’envoi de la requête à juste après la transformation, d’après `performance.now()`, en fractions de milliseconde.
- `query` : la requête, telle que `queryListener` l’a reçue.
- Il n’est pas appelé quand la requête est rejetée, ni quand la transformation lève une erreur (un `selectExactlyOne()` qui ne trouve aucune ligne).

### `transactionListener` {#Config.transactionListener}

```ts
transactionListener?(message: string, txnId?: number): void
```

Appelé par `transaction()` quand une tentative échoue avec `40001` ou `40P01`, et de nouveau quand la tentative suivante démarre, avec l’un de ces messages et l’id de la transaction :

| Quand | Message |
|---|---|
| une tentative a échoué, il en reste une autre | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` ``<!-- message --> |
| la tentative suivante démarre | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` ``<!-- message --> |
| la dernière tentative a échoué | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up` ``<!-- message --> |

Avec `transactionAttemptsMax: 3` et `transactionRetryDelay: { minMs: 1, maxMs: 2 }`, un callback qui échoue avec `40001` à chaque fois donne `Transaction rollback (code 40001) on attempt 1 of 3, retrying in 1ms`<!-- message -->, `Retrying transaction, attempt 2 of 3`<!-- message -->, puis la même chose pour la tentative 2, et `Transaction rollback (code 40001) on attempt 3 of 3, giving up`<!-- message -->.

Il n’est pas appelé pour une transaction commitée dès sa première tentative, ni pour toute autre erreur.

### `transactionEventListener` {#Config.transactionEventListener}

```ts
transactionEventListener?: (event: TransactionEvent, txnId?: number) => void
```

À partir de la 6.12.0. Appelé par `transaction()` juste après [`transactionListener`](#Config.transactionListener), aux trois mêmes moments, avec un [`TransactionEvent`](#TransactionEvent) qui porte les nombres du message, et avec l’id de la transaction. Chaque écouteur est appelé s’il est réglé, que l’autre le soit ou non. Un log ou une métrique lit ainsi la nature de l’événement, le code et la tentative comme des champs, et non dans le texte :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  transactionEventListener: (event, txnId) =>
    console.log(JSON.stringify({ txnId, ...event })),
});
```

Sur un `40001` à la première de cinq tentatives, ce code affiche `{"txnId":0,"type":"rollback","code":"40001","attempt":1,"maxAttempts":5,"delayMs":97}`, `delayMs` étant l’attente tirée de [`transactionRetryDelay`](#Config.transactionRetryDelay), puis `{"txnId":0,"type":"retry","attempt":2,"maxAttempts":5}`.

- Comme `transactionListener`, il n’est pas appelé pour une transaction commitée dès sa première tentative, ni pour toute autre erreur, ni par un `transaction()` qui reçoit le client d’une transaction et le transmet tel quel.
- S’il lève une erreur, `transaction()` est rejetée avec cette erreur, comme quand `transactionListener` en lève une : une fois le `ROLLBACK` envoyé, et le client libéré. Une erreur qu’il lève à `retry` avec un `code` `40001` ou `40P01` compte comme l’échec de cette tentative, qui est réessayée tant qu’il reste une tentative, comme tout `40001`.
- C’est une propriété, là où les autres écouteurs sont des méthodes : un écouteur typé pour une partie des événements, qui lirait une clé que les autres n’ont pas, ne compile pas sous `strict` (`strictFunctionTypes`).
- Zapatos 6.6.1 n’a pas cette option ([Revenir en arrière](/fr/switching#go-back)).

### Les ids de transaction {#transaction-ids}

Le `txnId` que reçoivent les écouteurs.

- Chaque appel de `transaction()` qui ouvre une transaction prend l’id suivant : `0` pour le premier du processus, puis `1`…
- Chaque requête que `run()` envoie sur son client reçoit cet id, d’une tentative à l’autre : les vôtres, et celles de `transaction()` elle-même, `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> et `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw new Error(); }) -->, qui passent par les deux écouteurs de requêtes comme toutes les autres.
- Un appel de `transaction()` qui reçoit ce client n’ouvre aucune transaction, et ses requêtes gardent l’id extérieur.
- Hors d’une transaction, et sur le client une fois celle-ci terminée, l’id est `undefined`.

## `NewConfig` {#NewConfig}

```ts
type NewConfig = Partial<Config>
```

Ce que prend [`setConfig()`](#setConfig) : n’importe quelles clés de `Config`, chacune entière.

## `ConfigTypes` {#ConfigTypes}

De la 6.7.0 à la fin de la 7.x. La 8.0 supprime l’interface avec [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), la seule clé qu’elle lisait ([migration vers la 8.0](/fr/switching#from-8-0-ConfigTypes)). Cette interface déclarait les options de `Config` qui changent un type, puisque TypeScript ne peut pas lire `setConfig()` :

```ts
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
```

- À partir de la 8.0.0, une déclaration restée de la 7.x compile toujours et ne change aucun type : `sum()`, `avg()`, `min()` et `max()` sont typés par colonne, quoi qu’elle contienne.
- Sans une telle déclaration, nommer `db.ConfigTypes` ne compile plus (TS2694).

## `SQLQuery` {#SQLQuery}

```ts
interface SQLQuery { text: string; values: any[]; name?: string }
```

Une requête compilée, telle que la prend le `query()` de `pg` : ce que renvoie [`compile()`](/fr/sql-template#compile) et ce que reçoivent les écouteurs. `name` est réglé par [`prepared()`](/fr/sql-template#prepared).

## `TransactionEvent` {#TransactionEvent}

```ts
type TransactionEvent =
  | { type: 'rollback'; code: '40001' | '40P01'; attempt: number; maxAttempts: number; delayMs: number }
  | { type: 'retry'; attempt: number; maxAttempts: number }
  | { type: 'giveUp'; code: '40001' | '40P01'; attempt: number; maxAttempts: number };
```

À partir de la 6.12.0. Ce que reçoit [`transactionEventListener`](#Config.transactionEventListener), un événement par message de [`transactionListener`](#Config.transactionListener) :

| `type` | Quand | Son message |
|---|---|---|
| `rollback` | une tentative a échoué, il en reste une autre : avant l’attente de `delayMs` | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` ``<!-- message --> |
| `retry` | la tentative suivante démarre, avant son `START TRANSACTION` | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` ``<!-- message --> |
| `giveUp` | la dernière tentative a échoué, avant que `transaction()` soit rejetée | `` `Transaction rollback (code ${code}) on attempt ${attempt} of ${maxAttempts}, giving up` ``<!-- message --> |

- `code` est le `code` de l’erreur, tel que le message l’affiche : une chaîne, bien que `isDatabaseError()` corresponde aussi à un objet `String`.
- `attempt` compte à partir de 1. `maxAttempts` est le nombre de tentatives que fait `transaction()`, que le message compte aussi : `1` pour un `transactionAttemptsMax` de `0`.
- `type` affine le type de l’événement : `event.delayMs` ne compile qu’après `event.type === 'rollback'`.

## Opt-ins et avertissements {#opt-ins-and-warnings}

En 6.x, [`undefinedMeansMissing`](#Config.undefinedMeansMissing), [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys), [`transactionRequiresCommit`](#Config.transactionRequiresCommit), [`aggregatesTypedByColumn`](#Config.aggregatesTypedByColumn), [`transactionRequiresIdleClient`](#Config.transactionRequiresIdleClient) et [`transactionRequiresSatisfyingLevel`](#Config.transactionRequiresSatisfyingLevel) étaient des opt-ins dont l’ancien comportement déclenchait un avertissement. La 7.0 les active par défaut et aucun ne déclenche d’avertissement. Un `false` explicite conserve l’ancien comportement sans avertissement pendant toute la série 7.x ; la 8.0 les supprime tous les six et se comporte toujours comme avec `true` (voir [Versions](/fr/versions) et la [migration vers la 7.0](/fr/switching#from-7-0)).

Un opt-in n’a pas d’avertissement et ne devient pas le comportement par défaut en 7.0 : [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow), puisque la lecture de `selectExactlyOne()` par la 6.6.1, au moins une ligne, est une lecture que Zapatos documente ; la 8.0 la retire et ne garde que `LIMIT 1`. [`shortcutsUseJson`](#Config.shortcutsUseJson), à partir de la 7.3.0, n’a pas d’avertissement non plus, puisque ses valeurs sont les mêmes : elle est désactivée en 7.x, et la 8.0 ne garde que `json`.

[`topLevelSelectAsRows`](#Config.topLevelSelectAsRows), à partir de la 7.3.0, n’émet pas d’avertissement non plus, puisque ses valeurs sont les mêmes : désactivée en 7.x ; la 8.0 la retire et ne garde que la requête des lignes ([décision 019](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/019-one-behaviour.md)).

Depuis la 7.0, le générateur active [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), [`enumArraysTypedAsText`](/fr/generator#generate.enumArraysTypedAsText) et [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects) par défaut, sans note de migration ; la 8.0 retire la première et ne garde que son comportement. L’option [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions) reste désactivée pendant toute la série 7.x et ne donne lieu à aucune note ; la 8.0 ne garde que ce comportement. L’option [`valuesTypedAsAliases`](/fr/generator#generate.valuesTypedAsAliases) ne donne lieu à aucune note non plus, puisque ses types sont les mêmes, et reste désactivée pendant toute la série 7.x ; la 8.0 la retire et écrit toujours les alias. Depuis la 7.0, le générateur cherche par défaut chaque enum dans son propre schéma ([`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas)) et écrit ses labels dans l’ordre de déclaration ([`enumOrder`](/fr/generator#generate.enumOrder)), sans note de migration ; la 8.0 retire ces deux options et ne garde que ce comportement. Il active également [`uniqueIndexConstraintsOnly`](/fr/generator#generate.uniqueIndexConstraintsOnly) par défaut, sans note de migration ; la 8.0 retire cette option de la même façon.

Avec pgcast 6.7.0, le générateur appelé depuis un programme pouvait transmettre `PGCAST_DEP006` à [`warningListener`](/fr/generator#generate.warningListener) avant d’arrêter le processus en cas d’erreur de base de données. Depuis la 7.0, [`rejectOnQueryError`](/fr/generator#generate.rejectOnQueryError) vaut `true` par défaut. En 7.x, la valeur explicite `false` conservait l’arrêt immédiat sans note de migration ; la 8.0 la retire ([migration vers la 8.0](/fr/switching#from-8-0-rejectOnQueryError)).

En 6.x, Node émet chaque [avertissement de migration](/fr/switching#read-the-warnings) une fois par processus et indique le nom de l’option dans le message. Par exemple, lorsque Postgres répondait à un `COMMIT` par `ROLLBACK`, pgcast 6.7.0 émettait l’avertissement ci-dessous sur `stderr`.

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
```

- `process.on('warning', …)` le recevait en 6.x, avec pour `name` `'DeprecationWarning'` et pour `code` `'PGCAST_DEP003'`.
- `node --no-deprecation` le masque, y compris pour ce hook ; `node --no-warnings` le masque sur `stderr` seulement. `node --throw-deprecation` le lève comme une erreur que rien n’intercepte, donc le processus s’arrête.
- Avec l’option activée, l’appel n’avertit jamais.

Pour repérer les avertissements de pgcast dans ce hook, et les logger à votre façon : `@types/node` type l’avertissement comme `Error`, qui n’a pas de `code`, donc indiquez qu’il peut en avoir un. Node affiche toujours chaque avertissement sur `stderr` ; lancez avec `node --no-warnings` pour que la sortie du hook soit la seule.

```ts twoslash
process.on('warning', (warning: Error & { code?: string }) => {
  if (warning.code?.startsWith('PGCAST_')) console.warn(warning.code, warning.message);
});
```

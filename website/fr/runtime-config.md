---
english: ca278d3159d6
---

# Configuration

Ce que `zapatos/db` vous laisse régler pendant que votre code tourne : `setConfig()` et chaque option de `Config`, les écouteurs, les opt-ins et leurs codes d’avertissement. Puis les types que le schéma généré donne aux valeurs que JSON ou `pg` rendent sous forme de chaînes, et les fonctions qui les convertissent.
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
  undefinedMeansMissing: true,
});
```

- La fusion n’a qu’un niveau : `transactionRetryDelay` est remplacé en entier, donc le type exige à la fois `minMs` et `maxMs`.
- Une clé qui a une valeur par défaut et que vous réglez à `undefined` (ou `null`) revient à sa valeur par défaut : `setConfig({ transactionRetryDelay: undefined })` rétablit `{ minMs: 25, maxMs: 250 }`. Un écouteur n’en a pas, donc `undefined` le retire. Passer `undefined` compile, sauf sous `exactOptionalPropertyTypes`.
  - Zapatos 6.6.1 réglait la clé à `undefined`. Après `transactionAttemptsMax: undefined`, `transaction()` abandonnait après sa première tentative (« <span lang="en">… on attempt 1 of undefined, giving up</span> ») ; après `transactionRetryDelay: undefined`, chaque `transaction()` était rejetée avec « <span lang="en">TypeError: Cannot destructure property 'minMs' of 'config.transactionRetryDelay' as it is undefined.</span> » et ne libérait jamais le client qu’elle avait emprunté au pool ([#246](https://github.com/AlexandreDemartin/pgcast/issues/246)).
- Elle renvoie une copie de la nouvelle configuration, comme `getConfig()` : modifier cet objet ne change rien. Zapatos 6.6.1 renvoyait la configuration elle-même ([#245](https://github.com/AlexandreDemartin/pgcast/issues/245)).
- Elle garde l’objet `transactionRetryDelay` que vous lui donnez, pas une copie : modifier ensuite son `minMs` ou son `maxMs` modifie la configuration.
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
- Une clé que `saved` ne contient pas reste telle que réglée : un écouteur réglé entre-temps continue d’écouter. Réglez-le à `undefined` pour le retirer : `db.setConfig({ queryListener: undefined })`.

## `Config` {#Config}

```ts
interface Config {
  transactionAttemptsMax: number;
  transactionRetryDelay: { minMs: number; maxMs: number };
  castArrayParamsToJson: boolean;
  castObjectParamsToJson: boolean;
  upsertRequiresSameKeys?: boolean;
  undefinedMeansMissing?: boolean;
  transactionRequiresCommit?: boolean;
  selectExactlyOneChecksForSecondRow?: boolean;
  queryListener?(query: SQLQuery, txnId?: number): void;
  resultListener?(result: any, txnId?: number, elapsedMs?: number, query?: SQLQuery): void;
  transactionListener?(message: string, txnId?: number): void;
}
```

Les clés qu’ajoute pgcast sont facultatives, donc un `Config` écrit pour Zapatos 6.6.1 compile toujours ; `getConfig()` les type `boolean | undefined`, bien qu’elle donne toujours une valeur. Aucune option ne change un type.

<div class="stack">

| Option | Par défaut | Ce qu’elle change | Lue |
|---|---|---|---|
| [`transactionAttemptsMax`](#Config.transactionAttemptsMax) | `5` | combien de fois `transaction()` exécute son callback | à chaque `transaction()` |
| [`transactionRetryDelay`](#Config.transactionRetryDelay) | `{ minMs: 25, maxMs: 250 }` | l’attente avant chaque nouvelle tentative | à chaque `transaction()` |
| [`castArrayParamsToJson`](#Config.castArrayParamsToJson) | `false` | un paramètre tableau : `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castArrayParamsToJson: true }), db.sql`${db.param([1])}`) --> au lieu de `$1` | à chaque `compile()` |
| [`castObjectParamsToJson`](#Config.castObjectParamsToJson) | `false` | un paramètre objet simple : `CAST($1 AS "json")`<!-- probe: (db.setConfig({ castObjectParamsToJson: true }), db.sql`${db.param({ a: 1 })}`) --> au lieu de `$1` | à chaque `compile()` |
| [`upsertRequiresSameKeys`](#Config.upsertRequiresSameKeys) | `false` | un `upsert()` de plusieurs lignes dont une clé, absente de certaines lignes, prend quand même sa valeur dans `EXCLUDED` : lever une erreur, pas avertir | à chaque `upsert()` |
| [`undefinedMeansMissing`](#Config.undefinedMeansMissing) | `false` | une valeur `undefined` dans `insert()`, `update()` et `upsert()` : une clé manquante, pas `NULL` | à chaque appel de l’une d’elles |
| [`transactionRequiresCommit`](#Config.transactionRequiresCommit) | `false` | un `COMMIT` auquel Postgres répond `ROLLBACK` : être rejetée, pas se résoudre | à chaque `transaction()` |
| [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow) | `false` | un `selectExactlyOne()` exécuté seul : `LIMIT 2`, et une deuxième ligne entraîne un rejet | à chaque `selectExactlyOne()` |
| [`queryListener`](#Config.queryListener) | aucun | appelé avec chaque requête qu’envoie `run()` | à chaque `run()` |
| [`resultListener`](#Config.resultListener) | aucun | appelé avec chaque résultat que donne `run()` | à chaque `run()` |
| [`transactionListener`](#Config.transactionListener) | aucun | appelé quand une tentative de `transaction()` échoue avec `40001` ou `40P01`, et à chaque nouvelle tentative | à chaque `transaction()` |

</div>

### `transactionAttemptsMax` {#Config.transactionAttemptsMax}

```ts
transactionAttemptsMax: number  // default: 5
```

Combien de fois [`transaction()`](/fr/transaction#transaction) exécute son callback. Après un échec de sérialisation (`40001`) ou un interblocage (`40P01`), elle annule la transaction et exécute de nouveau le callback, jusqu’à ce que ce nombre de tentatives ait échoué ; elle lève alors la dernière erreur. Sur toute autre erreur, elle annule la transaction et lève l’erreur aussitôt.

- `1`, `0` ou moins : une tentative, aucune nouvelle tentative. Avec `0`, le message dit « <span lang="en">… on attempt 1 of 0, giving up</span> » ([#179](https://github.com/AlexandreDemartin/pgcast/issues/179)).
- Lue quand `transaction()` démarre, donc un changement vaut pour la transaction suivante, pas pour celle en cours.
- Comment écrire un callback qui peut s’exécuter deux fois : [Nouvelles tentatives](/fr/retries).

### `transactionRetryDelay` {#Config.transactionRetryDelay}

```ts
transactionRetryDelay: { minMs: number; maxMs: number }  // default: { minMs: 25, maxMs: 250 }
```

Avant chaque nouvelle tentative, `transaction()` attend un nombre entier de millisecondes de `minMs` à `maxMs`, arrondi d’un tirage uniforme entre les deux : `Math.round(minMs + (maxMs - minMs) * Math.random())`. Ainsi `minMs` et `maxMs` sortent deux fois moins souvent que chaque valeur entre eux. [`transactionListener`](#Config.transactionListener) est informé de l’attente.

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
- Dans un `insert()`, un `update()` ou un Whereable, `db.param(genres, 'text[]')` l’envoie comme un tableau. Les conditions sur tableaux ne prennent pas de `Parameter` ([#40](https://github.com/AlexandreDemartin/pgcast/issues/40)) : faites-y la comparaison dans un [fragment `sql`](/fr/conditions#arrays).
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

```ts
upsertRequiresSameKeys?: boolean  // default: false; the default in 7.0
```

Avec `true`, un [`upsert()`](/fr/insert#upsert) de plusieurs lignes sans `updateColumns`, où une clé absente de certaines lignes prend quand même sa valeur dans `EXCLUDED`, lève une erreur dès l’appel, avant toute requête : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.

Sans l’option, il s’exécute comme dans Zapatos 6.6.1, avec un avertissement une fois par processus : `PGCAST_DEP001`. Quelles clés comptent, et le SQL : [Lignes aux clés différentes](/fr/insert#upsert-different-keys).

### `undefinedMeansMissing` {#Config.undefinedMeansMissing}

```ts
undefinedMeansMissing?: boolean  // default: false; the default in 7.0
```

Avec `true`, une valeur `undefined` dans [`insert()`](/fr/insert#insert), [`update()`](/fr/insert#update) et [`upsert()`](/fr/insert#upsert) est une clé manquante : `DEFAULT` dans `insert()`, omise dans `update()` et `upsert()`. Sans l’option, elle est envoyée comme `NULL`, comme dans Zapatos 6.6.1, avec un avertissement une fois par processus : `PGCAST_DEP002`. Le SQL de chacune : [Une valeur `undefined`](/fr/insert#undefined-values).

### `transactionRequiresCommit` {#Config.transactionRequiresCommit}

```ts
transactionRequiresCommit?: boolean  // default: false; the default in 7.0
```

Quand le callback de [`transaction()`](/fr/transaction#transaction) intercepte l’erreur d’une requête et se termine normalement, Postgres a interrompu la transaction : il répond au `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> par l’étiquette de commande `ROLLBACK`, pas par une erreur, et rien n’est enregistré.

Avec `true`, `transaction()` est alors rejetée, sans nouvelle tentative, avec "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message -->.

Sans l’option, elle se résout avec ce que le callback a renvoyé, comme dans Zapatos 6.6.1, avec un avertissement une fois par processus : `PGCAST_DEP003`. Que faire à la place : [Laisser passer l’erreur](/fr/retries#let-the-error-through).

- Non couvert : un callback qui envoie lui-même `COMMIT` ou `ROLLBACK`.
- Non testé avec `pg-native`.

### `selectExactlyOneChecksForSecondRow` {#Config.selectExactlyOneChecksForSecondRow}

```ts
selectExactlyOneChecksForSecondRow?: boolean  // default: false, in 7.0 too
```

Avec `true`, un [`selectExactlyOne()`](/fr/select#selectExactlyOne) exécuté seul demande deux lignes, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('films', { id: 1000 })) --> avec `2`, et `.run()` est rejetée avec une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) quand une deuxième ligne arrive : "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->. Sans l’option, il en demande une, `LIMIT 1`, et donne la première ligne qui correspond, comme dans Zapatos 6.6.1.

- Imbriqué dans une autre requête, dans un `lateral` ou un template `sql`, il garde `LIMIT 1`, avec ou sans l’option : une deuxième ligne y joindrait deux fois la ligne parente. « Seul » dépend de la façon dont la requête est compilée : `.run()` et `.compile()` la compilent seule, une requête parente la compile dans son propre SQL.
- Sans l’option, aucun avertissement, et elle reste désactivée en 7.0 : « au moins une ligne », c’est ainsi que Zapatos lit `selectExactlyOne()`, imbriqué dans un `lateral` sur une clé étrangère `NOT NULL` ([décision 003](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/003-fixes-and-deprecation.md)).
- Lue quand `selectExactlyOne()` est appelée, pas à `.run()`.

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
| une tentative a échoué, il en reste une autre | `` `Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, retrying in ${delayBeforeRetry}ms` ``<!-- message --> |
| la tentative suivante démarre | `` `Retrying transaction, attempt ${attempt} of ${maxAttempts}` ``<!-- message --> |
| la dernière tentative a échoué | `` `Transaction rollback (code ${err.code}) on attempt ${attempt} of ${maxAttempts}, giving up` ``<!-- message --> |

Avec `transactionAttemptsMax: 3` et `transactionRetryDelay: { minMs: 1, maxMs: 2 }`, un callback qui échoue avec `40001` à chaque fois donne `Transaction rollback (code 40001) on attempt 1 of 3, retrying in 1ms`<!-- message -->, `Retrying transaction, attempt 2 of 3`<!-- message -->, puis la même chose pour la tentative 2, et `Transaction rollback (code 40001) on attempt 3 of 3, giving up`<!-- message -->.

Il n’est pas appelé pour une transaction validée dès sa première tentative, ni pour toute autre erreur.

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

## `SQLQuery` {#SQLQuery}

```ts
interface SQLQuery { text: string; values: any[]; name?: string }
```

Une requête compilée, telle que la prend le `query()` de `pg` : ce que renvoie [`compile()`](/fr/sql-template#compile) et ce que reçoivent les écouteurs. `name` est réglé par [`prepared()`](/fr/sql-template#prepared).

## Opt-ins et avertissements {#opt-ins-and-warnings}

Un comportement de Zapatos 6.6.1 sur lequel du code peut compter, mais que pgcast changerait, reste celui par défaut jusqu’à la 7.0 : une option active le nouveau, et l’ancien émet un avertissement. Pourquoi ce choix : [Versions](/fr/versions).

<div class="stack">

| Option | Avertissement | Émis quand | Par défaut à partir de |
|---|---|---|---|
| [`upsertRequiresSameKeys: true`](#Config.upsertRequiresSameKeys) | `PGCAST_DEP001` | un `upsert()` de plusieurs lignes sans `updateColumns` a une clé absente de certaines lignes qui prend quand même sa valeur dans `EXCLUDED` ([Lignes aux clés différentes](/fr/insert#upsert-different-keys)) | 7.0 |
| [`undefinedMeansMissing: true`](#Config.undefinedMeansMissing) | `PGCAST_DEP002` | une valeur d’`insert()`, `update()` ou `upsert()` est `undefined` ([Une valeur `undefined`](/fr/insert#undefined-values)) | 7.0 |
| [`transactionRequiresCommit: true`](#Config.transactionRequiresCommit) | `PGCAST_DEP003` | Postgres répond au `COMMIT` de `transaction()` par `ROLLBACK`, après une erreur de requête que le callback a interceptée ([Laisser passer l’erreur](/fr/retries#let-the-error-through)) | 7.0 |

</div>

Un opt-in n’a pas d’avertissement et ne devient pas le comportement par défaut en 7.0 : [`selectExactlyOneChecksForSecondRow`](#Config.selectExactlyOneChecksForSecondRow), puisque la lecture de `selectExactlyOne()` par la 6.6.1, au moins une ligne, est une lecture que Zapatos documente.

Le générateur a les siens : [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas) et [`enumOrder`](/fr/generator#generate.enumOrder), dont les anciens chemins donnent des notes via [`warningListener`](/fr/generator#generate.warningListener), une fois par exécution, plutôt qu’un `DeprecationWarning` ; ils deviendront eux aussi le comportement par défaut en 7.0.

Chaque avertissement est un `DeprecationWarning` de Node.js, émis une fois par processus pour chaque code, quand le raccourci est appelé (`PGCAST_DEP003` : quand `transaction()` se résout), et seulement quand l’ancien comportement est utilisé. Son message nomme l’option. Node l’affiche sur `stderr` :

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
```

- `process.on('warning', …)` le reçoit, avec pour `name` `'DeprecationWarning'` et pour `code` `'PGCAST_DEP002'`.
- `node --no-deprecation` le masque, y compris pour ce hook ; `node --no-warnings` le masque sur `stderr` seulement. `node --throw-deprecation` le lève comme une erreur que rien n’intercepte, donc le processus s’arrête.
- Avec l’option activée, l’appel n’avertit jamais.

Pour repérer les avertissements de pgcast dans ce hook, et les journaliser à votre façon : `@types/node` type l’avertissement comme `Error`, qui n’a pas de `code`, donc indiquez qu’il peut en avoir un. Node affiche toujours chaque avertissement sur `stderr` ; lancez avec `node --no-warnings` pour que la sortie du hook soit la seule.

```ts twoslash
process.on('warning', (warning: Error & { code?: string }) => {
  if (warning.code?.startsWith('PGCAST_')) console.warn(warning.code, warning.message);
});
```

## Types de valeurs {#value-types}

`pg` et JSON donnent certaines valeurs Postgres sous forme de chaînes. Le schéma généré les type avec les types template literal ci-dessous, selon l’endroit où se trouve la valeur ([Le catalogue](/fr/catalog-types)) :

| Type Postgres | `Selectable` | `JSONSelectable` | `Insertable`, `Updatable`, `Whereable` |
|---|---|---|---|
| `int8` | [`Int8String`](#Int8String) | `number` | `number \| Int8String \| bigint` |
| `numeric` | [`NumericString`](#NumericString) | `number` | `number \| NumericString` |
| `bytea` | `Buffer` | [`ByteArrayString`](#ByteArrayString) | `ByteArrayString \| Buffer` |
| `date` | `Date` | [`DateString`](#DateString) | `DateString \| Date` |
| `timestamp` | `Date` | [`TimestampString`](#TimestampString) | `TimestampString \| Date` |
| `timestamptz` | `Date` | [`TimestampTzString`](#TimestampTzString) | `TimestampTzString \| Date` |
| `time` | [`TimeString`](#TimeString) | `TimeString` | `TimeString` |
| `timetz` | [`TimeTzString`](#TimeTzString) | `TimeTzString` | `TimeTzString` |
| `int4range`, `int8range`, `numrange` | [`NumberRangeString`](#NumberRangeString) | `NumberRangeString` | `NumberRangeString` |
| `tsrange`, `tstzrange`, `daterange` | [`DateRangeString`](#DateRangeString) | `DateRangeString` | `DateRangeString` |
| `json`, `jsonb` | [`JSONValue`](#JSONValue) | `JSONValue` | `JSONValue` |

- Une colonne tableau prend le tableau du type de son élément : `int8[]` donne `Int8String[]` dans un `Selectable`.
- Avec l’option [`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers) du générateur, `int8` et `numeric` sont `number | Int8String` et `number | NumericString` dans un `JSONSelectable` ([`enableCustomJSONParsingForLargeNumbers()`](#enableCustomJSONParsingForLargeNumbers)).
- Les raccourcis renvoient des `JSONSelectable`. Un `Selectable` est ce que `pg` renvoie pour un simple `SELECT` de la ligne.

Chaque type vérifie la forme d’une chaîne, pas sa valeur : `'2030-13-45'` est un `DateString`.

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
// ---cut---
const opening: db.DateString = '2030-03-01';
const premiere: db.TimestampTzString = '2030-03-01T19:30:00';
```

## JSON {#json}

### `JSONValue` {#JSONValue}

```ts
type JSONValue = null | boolean | number | string | JSONObject | JSONArray
```

Une valeur que JSON peut contenir : le type d’une colonne `json` ou `jsonb`. `undefined`, un `Date` et une fonction n’en sont pas.

### `JSONObject` {#JSONObject}

```ts
type JSONObject = { [k: string]: JSONValue }
```

### `JSONArray` {#JSONArray}

```ts
type JSONArray = JSONValue[]
```

## Grands nombres {#large-numbers}

### `Int8String` {#Int8String}

```ts
type Int8String = `${number}`
```

Un `int8` tel que `pg` le renvoie, une chaîne : `'9007199254740993'`, qu’aucun `number` ne peut contenir.

### `NumericString` {#NumericString}

```ts
type NumericString = `${number}`
```

Un `numeric` tel que `pg` le renvoie, une chaîne qui garde ses chiffres : `'1.10'`.

### `enableCustomJSONParsingForLargeNumbers()` {#enableCustomJSONParsingForLargeNumbers}

```ts
db.enableCustomJSONParsingForLargeNumbers(pg: typeof import('pg')): void
```

Fait analyser par `pg` les valeurs `json` et `jsonb` avec [json-custom-numbers](https://www.npmjs.com/package/json-custom-numbers), qui donne un nombre sous forme de chaîne quand le convertir en `number` le modifierait. Chaque raccourci sauf les agrégats renvoie du `jsonb`, donc elle s’applique à leurs résultats.

```ts twoslash
import * as db from 'zapatos/db';
import pg from 'pg';
// ---cut---
db.enableCustomJSONParsingForLargeNumbers(pg);
```

| Un nombre dans du JSON | `JSON.parse()`, par défaut | Une fois activée |
|---|---|---|
| `12`, `0.1` | `12`, `0.1` | `12`, `0.1` |
| `9007199254740993` | `9007199254740992` | `'9007199254740993'` |
| `9007199254740992`, un entier au-delà de `Number.MAX_SAFE_INTEGER` | `9007199254740992` | `'9007199254740992'` |
| `1.00000000000000000001` | `1` | `'1.00000000000000000001'` |
| un `numeric` au-delà de `Number.MAX_VALUE` | `Infinity` | ses chiffres, sous forme de chaîne |

- Elle ne fait rien pour `count()`, `sum()`, `avg()`, `min()` et `max()` : leur résultat n’est pas du JSON, et passe par `Number()` ([`count()`](/fr/select#count), [#163](https://github.com/AlexandreDemartin/pgcast/issues/163)). Un `sum()` de `9007199254740993` donne toujours `9007199254740992`.
- Elle règle les analyseurs de types du module `pg` que vous donnez, donc de chaque pool et chaque client de ce module, à partir de là, requêtes de pgcast ou non.
- Elle ne change pas les types : c’est l’option [`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers) du générateur qui le fait.
- Une colonne `int8` ou `numeric` hors JSON est déjà une chaîne, par l’analyseur de `pg` lui-même.

## Types range {#ranges}

### `RangeString` {#RangeString}

```ts
type RangeString<Bound extends string | number> = `${'[' | '('}${Bound},${Bound}${']' | ')'}`
```

Une valeur range telle que Postgres l’écrit : un crochet, deux bornes, un crochet. Le type ne couvre pas un range vide, que Postgres écrit `empty` : `to_jsonb('empty'::int4range)` vaut `"empty"`, et `const r: db.NumberRangeString = 'empty'` ne compile pas (TS2322, [#185](https://github.com/AlexandreDemartin/pgcast/issues/185)).

### `NumberRangeString` {#NumberRangeString}

```ts
type NumberRangeString = RangeString<number | ''>
```

Un `int4range`, `int8range` ou `numrange` : `'[1,5)'`, ou `'[1.5,)'` sans borne supérieure.

### `DateRangeString` {#DateRangeString}

```ts
type DateRangeString = RangeString<string>
```

Un `tsrange`, `tstzrange` ou `daterange`. Ses bornes suivent le `DateStyle` de la session, donc elles sont typées `string` : `daterange('2030-03-01', '2030-03-08')` vaut `'[2030-03-01,2030-03-08)'` avec le style `ISO`, et `'[01/03/2030,08/03/2030)'` avec `SQL, DMY`. Les bornes d’un `tsrange` ou d’un `tstzrange` arrivent entre guillemets, puisqu’elles contiennent une espace : `'["2030-03-01 19:30:00","2030-03-02 00:00:00")'`.

## Octets {#bytes}

### `ByteArrayString` {#ByteArrayString}

```ts
type ByteArrayString = `\\x${string}`
```

Un `bytea` en JSON, en hexadécimal après `\x` : `'\\x4c61'` dans le code source TypeScript.

### `toBuffer()` {#toBuffer}

```ts
db.toBuffer<T extends ByteArrayString | null>(d: T): T extends ByteArrayString ? Buffer<ArrayBuffer> | Exclude<T, ByteArrayString> : T
```

Décode l’hexadécimal d’un `ByteArrayString` en un `Buffer`, typé `Buffer<ArrayBuffer>`. `null` donne `null`, et le type le garde ; `undefined` lève une erreur, et le type le refuse avec `strictNullChecks` activé ([`strict()`](#strict)). Elle décode toute la valeur en mémoire.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const bytes = db.toBuffer('\\x4c61726b73707572');
const word = bytes.toString();  // 'Larkspur'
```

## Dates et heures {#dates-and-times}

Une date ou une heure dans un `JSONSelectable` est la chaîne qu’écrit `to_jsonb()`, en ISO 8601. Un `timestamptz` porte le décalage du `TimeZone` de la session : `'2030-03-01T19:30:00+00:00'` en `UTC`, `'2030-03-02T01:00:00+05:30'` en `Asia/Kolkata`.

<CastPanel example="toDate">

<<< ../examples/toDate.ts{ts twoslash}

</CastPanel>

| Type | Est | Par exemple |
|---|---|---|
| [`DateString`](#DateString) | `${number}-${number}-${number}` | `'2030-03-01'` |
| [`TimeString`](#TimeString) | `${number}:${number}`, puis un `:${number}` facultatif | `'19:30'`, `'19:30:00'` |
| [`TzSuffix`](#TzSuffix) | `'Z'`, ou `+` ou `-` et un nombre, puis un `:${number}` facultatif | `'Z'`, `'+01'`, `'+05:30'` |
| [`TimeTzString`](#TimeTzString) | `${TimeString}${TzSuffix}` | `'19:30:00+01'` |
| [`TimestampString`](#TimestampString) | `${DateString}T${TimeString}` | `'2030-03-01T19:30:00'` |
| [`TimestampTzString`](#TimestampTzString) | `${TimestampString}${TzSuffix}` | `'2030-03-01T19:30:00+00:00'` |

### `DateString` {#DateString}

```ts
type DateString = `${number}-${number}-${number}`
```

Une `date`.

### `TimeString` {#TimeString}

```ts
type TimeString = `${number}:${number}${'' | `:${number}`}`
```

Un `time`, avec ou sans ses secondes.

### `TzSuffix` {#TzSuffix}

```ts
type TzSuffix = 'Z' | `${'+' | '-'}${number}${'' | `:${number}`}`
```

Le fuseau horaire à la fin d’un `TimeTzString` ou d’un `TimestampTzString`.

### `TimeTzString` {#TimeTzString}

```ts
type TimeTzString = `${TimeString}${TzSuffix}`
```

Un `timetz`.

### `TimestampString` {#TimestampString}

```ts
type TimestampString = `${DateString}T${TimeString}`
```

Un `timestamp` : sans fuseau horaire.

### `TimestampTzString` {#TimestampTzString}

```ts
type TimestampTzString = `${TimestampString}${TzSuffix}`
```

Un `timestamptz`.

### `toDate()` {#toDate}

```ts
db.toDate<D extends null | TimestampTzString>(d: D, tzInterpretation?: undefined): D extends null ? null : Date
db.toDate<D extends null | TimestampString | DateString>(d: D, tzInterpretation: 'UTC' | 'local'): D extends null ? null : Date
```

Convertit en `Date` une chaîne venue de Postgres. Un `TimestampTzString` a son fuseau horaire. Un `TimestampString` ou un `DateString` n’en a pas, donc vous indiquez dans quel fuseau la lire : `'UTC'`, ou `'local'`, le fuseau horaire du processus JavaScript.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = db.toDate('2030-03-01T19:30:00+00:00');
const rehearsal = db.toDate('2030-03-01T15:00:00', 'UTC');
const opening = db.toDate('2030-03-01', 'local');
```

- `toDate('2030-03-01', 'UTC')` est minuit UTC ; `'local'` est minuit à l’heure locale.
- `null` donne `null` ; le type le garde, donc `TimestampTzString | null` donne `Date | null`.
- Un `Date` garde les millisecondes : les microsecondes d’une valeur Postgres sont perdues.
- Elle ne vérifie pas la chaîne : une chaîne qu’un `Date` ne sait pas lire donne une Invalid Date.

Un `TimestampString` ou un `DateString` sans `tzInterpretation` ne compile pas (TS2345). Un `TimestampTzString` avec un `tzInterpretation` non plus, puisque la première surcharge n’accepte `tzInterpretation` que comme `undefined` (TS2769) :

```ts twoslash
// @errors: 2345 2769
import * as db from 'zapatos/db';
// ---cut---
db.toDate('2030-03-01T15:00:00');
db.toDate('2030-03-01T19:30:00+00:00', 'UTC');
```

### `toString()` {#toString}

```ts
db.toString<D extends Date | null, T extends 'timestamptz' | 'timestamp:UTC' | 'timestamp:local' | 'date:UTC' | 'date:local'>(
  d: D,
  stringTypeTz: T,
): D extends null ? null : { timestamptz: TimestampTzString; 'timestamp:UTC': TimestampString; … }[T]
```

Convertit un `Date` en une chaîne que Postgres sait lire, typée selon `stringTypeTz` ; `null` donne `null`.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const curtain = new Date('2030-03-01T19:30:00Z');
const day: db.DateString = db.toString(curtain, 'date:UTC');              // '2030-03-01'
const stamp: db.TimestampTzString = db.toString(curtain, 'timestamptz');  // '2030-03-01T19:30:00.000Z'
```

| `stringTypeTz` | Donne | Pour 19 h 30 UTC le 1er mars 2030, dans un processus avec `TZ=Asia/Kolkata` |
|---|---|---|
| `'timestamptz'` | `TimestampTzString`, d’après `toISOString()` | `'2030-03-01T19:30:00.000Z'` |
| `'timestamp:UTC'` | `TimestampString` | `'2030-03-01T19:30:00.000'` |
| `'timestamp:local'` | `TimestampString`, dans le fuseau horaire du processus | `'2030-03-02T01:00:00.000'` |
| `'date:UTC'` | `DateString` | `'2030-03-01'` |
| `'date:local'` | `DateString`, dans le fuseau horaire du processus | `'2030-03-02'` |

## `strict()` {#strict}

```ts
db.strict<FnIn, FnOut>(fn: (x: FnIn) => FnOut):
  <T extends FnIn | null>(d: T) => T extends FnIn ? Exclude<T, FnIn> | FnOut : T
```

Enveloppe une fonction à un argument pour que `null` donne `null` sans l’appeler, comme le fait une fonction Postgres déclarée `STRICT`. Le type suit : `FnIn` donne `FnOut`, `FnIn | null` donne `FnOut | null`, `null` donne `null`. [`toBuffer()`](#toBuffer) est `strict()` d’un décodeur de `ByteArrayString`.

```ts twoslash
import * as db from 'zapatos/db';
declare const tagline: string | null;
// ---cut---
const shout = db.strict((s: string) => s.toUpperCase());
const loud = shout(tagline);
```

- Seul `null` passe sans appel, comme seul `NULL` le fait pour une fonction `STRICT` dans Postgres : `undefined` atteint `fn`. Une fonction qui l’accepte le gère : `db.strict((title: string | undefined) => title ?? 'untitled')(undefined)` donne `'untitled'`.
- Avec `strictNullChecks` activé, le type refuse `undefined` sauf si `fn` l’accepte : `shout(undefined)` et `db.toBuffer(undefined)` ne compilent pas (TS2345).
- Avec `strictNullChecks` désactivé, un type ne contient ni `null` ni `undefined`, et aucun de ces types n’en dit rien : `toDate(null)` est typé `Date`, `shout(null)` `any`. `db.toBuffer(undefined)` compile alors, et lève « <span lang="en">TypeError: Cannot read properties of undefined (reading 'slice')</span> ».

## `SchemaVersionCanary` {#SchemaVersionCanary}

```ts
interface SchemaVersionCanary { version: 104 }
```

La version du format du schéma généré que lit ce `zapatos/db`. Le `zapatos/schema` généré déclare `interface schemaVersionCanary extends db.SchemaVersionCanary { version: 104 }`, donc un schéma écrit pour un autre format ne compile pas :

```txt
error TS2430: Interface 'schemaVersionCanary' incorrectly extends interface 'SchemaVersionCanary'.
  Types of property 'version' are incompatible.
```

- La version de pgcast est celle de Zapatos 6.6.1, `104`, donc le canary d’un schéma généré par Zapatos 6.6.1 passe.
- Régénérer le schéma fait disparaître l’erreur ([Générateur](/fr/generator)).

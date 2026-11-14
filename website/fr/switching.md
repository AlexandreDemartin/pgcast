---
english: 7ba9ae3afa4b
---

# Venir de Zapatos

Passez un projet de Zapatos 6.6.1 à pgcast : changez une ligne de `package.json`, régénérez, puis laissez `tsc`, un coup d’œil à votre code et les avertissements de pgcast vous montrer les quelques appels dont le résultat change. La page suppose un projet qui tourne déjà sur Zapatos ; pour un nouveau, commencez par [Installation](/fr/install).
{.lede}

<AtAGlance>

- Une ligne de `package.json` remplace le paquet ; imports, configuration et fichiers générés restent tels quels.
- Quelques appels donnent d’autres lignes, ou lèvent une erreur : [l’étape 4](#find-the-calls-whose-result-changes) les liste, avec ce qu’il faut faire.
- Ce sur quoi du code peut compter est gardé, avec un avertissement, jusqu’à ce que vous activiez son opt-in.

</AtAGlance>

## Ce qui ne change pas {#what-stays-the-same}

- Les noms de modules : `zapatos/db`, `zapatos/schema`, `zapatos/custom` et `zapatos/generate`. Aucun import ne change ([décision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
- Le générateur : `zapatosconfig.json` et ses options, et `npx zapatos`, désormais aussi `npx pgcast` ([La CLI](/fr/generator#cli)).
- Vos placeholders dans `zapatos/custom/` : écrits une fois, jamais écrasés.
- Une `Config` écrite pour Zapatos 6.6.1 : les clés qu’ajoute pgcast sont facultatives ([`Config`](/fr/runtime-config#Config)).
- Le canary de version du schéma, pour qu’un schéma généré par Zapatos 6.6.1 compile tel quel ([`SchemaVersionCanary`](/fr/runtime-config#SchemaVersionCanary)).

## 1. Changer de paquet {#swap-the-package}

Installez pgcast sous le nom qu’avait Zapatos :

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6
```

:::

- `package.json` indique maintenant `"zapatos": "npm:@pgcast/pgcast@^…"`, et `node_modules/zapatos` contient pgcast.
- Rien d’autre à ajouter : les peer dependencies de pgcast sont celles de Zapatos 6.6.1, `pg`, `@types/pg` et TypeScript 4.1 ou plus récent.
- Pas sous le simple nom `@pgcast/pgcast` : vos imports `zapatos/*` ne se résoudraient plus ([Installation](/fr/install#add-the-package), § Pourquoi l’alias).

## 2. Régénérer le schéma {#regenerate-the-schema}

```sh
npx zapatos
```

Le générateur de pgcast est celui de Zapatos 6.6.1, avec deux corrections dans ce qu’il écrit. Un `git diff` sur votre dossier `zapatos/` ne montre rien, sauf si :

- un commentaire de colonne s’étend sur plusieurs lignes : chaque ligne commence maintenant par ` * ` ;
- une table a un index simple nommé comme l’index unique d’un autre schéma : son `UniqueIndex` n’emprunte plus ce nom.

## 3. Compiler {#compile}

```sh
npx tsc
```

Les types de pgcast refusent quelques appels que ceux de Zapatos 6.6.1 acceptaient. Celui que vous pourriez croiser : `db.raw()`, `db.cols()` ou `db.vals()` comme valeur d’un filtre ou d’une condition.

Zapatos 6.6.1 le prenait pour un `Parameter`, et l’envoyait en JSON, `{"value":"initcap('the salt orchard')"}`, si bien qu’il ne trouvait aucun film. pgcast le refuse (2322, `strict` activé ou non) :

```ts twoslash
// @errors: 2322
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const films = await db.select('films', {
  title: db.raw("initcap('the salt orchard')"),
}).run(pool);
```

Pour comparer avec du SQL, donnez un fragment `sql` comme valeur, `db.self` pour la colonne et la valeur en [`db.param()`](/fr/sql-template#param) :

<CastPanel example="switching_raw">

<<< ../examples/switching_raw.ts{ts twoslash}

</CastPanel>

- Pour comparer avec une simple valeur, donnez la valeur elle-même, ou `db.param(x)`.
- Dans un fragment, une simple chaîne est un nom, pas une valeur : `${'the salt orchard'}` serait la colonne `"the salt orchard"`<!-- probe: db.sql`${'the salt orchard'}` --> ([Identifiants](/fr/sql-template#identifiers)).
- [`DangerousRawString`](/fr/sql-template#DangerousRawString), [`ColumnNames`](/fr/sql-template#ColumnNames) et [`ColumnValues`](/fr/sql-template#ColumnValues) ne correspondent plus à un simple `{ value }`, ni l’un à l’autre : `const r: db.DangerousRawString = { value: 'x' }` échoue (2741). Créez-les avec `db.raw()`, `db.cols()` et `db.vals()`.
- Comme valeur insérée ou mise à jour de `insert()`, `update()` ou `upsert()` (pas dans `updateValues`), le type les refuse aussi, et ils lèvent une erreur avant toute requête ([`insert()`](/fr/insert#insert)).

## 4. Trouver les appels dont le résultat change {#find-the-calls-whose-result-changes}

pgcast corrige, sans option à activer, ce sur quoi aucun code ne pouvait compter dans Zapatos 6.6.1 : un appel que Postgres ou le type refusait, qui faisait le contraire de son nom, ou qui laissait une chaîne injecter du SQL. Quelques-uns de ces appels s’exécutaient bel et bien, et donnent maintenant d’autres lignes, ou lèvent une erreur.

Cherchez dans votre code la première colonne de chaque tableau ci-dessous. Chaque changement de la colonne Que faire donne le même résultat sous Zapatos 6.6.1, vous pouvez donc le faire avant de passer à pgcast ; seul celui du `jsonb` ne trouve ses lignes que sous pgcast.

### Conditions {#conditions}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| [`not()`](/fr/conditions#conditions.not) d’un fragment avec un `OR` ou un `AND` nu : sur `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, donc aussi le film de 1991 | `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | pour les anciennes lignes, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/fr/conditions#conditions.and) d’un fragment avec un `OR` nu et un autre opérande : `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, donc aussi le film 1000 | `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | pour les anciennes lignes, un seul fragment : `` db.sql`${'id'} = 1000 OR (${'id'} = 1001 AND ${'studio_id'} = ${db.param(1001)})` `` |

</div>

### `param()` et `parent()` {#param-and-parent}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| [`db.param()`](/fr/sql-template#param) comme valeur de filtre, dans [`isIn()`](/fr/conditions#conditions.isIn) et [`isNotIn()`](/fr/conditions#conditions.isNotIn), dans un simple objet de `updateValues` d’`upsert()`, ou dans un [`vals([…])`](/fr/sql-template#vals), écrit à la main ou dans un fragment donné comme valeur à `insert()`, `update()` ou `upsert()` | envoyé en JSON, `{"value":…}` : aucune ligne, toutes les lignes avec `isNotIn()`, d’autres booléens dans `updateValues`, `'{"value":…}'` stocké, ou 22P02 | la valeur, avec son cast | rien |
| `{ data: db.param(x, true) }` sur une colonne `jsonb` | aucune ligne | 42883, `jsonb = json` | `{ data: db.param(JSON.stringify(x), 'jsonb') }` |
| [`db.parent()`](/fr/sql-template#parent) dans `isIn()`, `isNotIn()` ou un `vals([…])` : dans une sous-requête `lateral`, ou dans un fragment donné comme valeur à `insert()`, `update()` ou `upsert()` | envoyé en JSON : aucune ligne, toutes les lignes avec `isNotIn()`, `'{"value":…}'` stocké, ou 22P02 | la colonne du parent ; hors d’une requête imbriquée, écriture comprise, il lève une erreur | rien dans un `lateral` ; dans une écriture, la valeur elle-même |

</div>

### `Default`, `self`, `raw()`, `cols()` et `vals()` {#default-self-raw-cols-and-vals}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| [`db.Default`](/fr/sql-template#Default) ou [`db.self`](/fr/sql-template#self) comme valeur de filtre, d’une condition (`ne()`, `add()`), ou dans un `vals([…])` d’un filtre ou d’un fragment donné comme valeur : `` insert('films', { …, tagline: db.sql`${db.vals([db.Default])}` }) `` | `'Symbol(DEFAULT)'` ou `'Symbol(self)'`, envoyé ou stocké | lève une erreur à la compilation de la requête | `db.Default` comme valeur elle-même, `{ …, tagline: db.Default }`, dans `insert()` ou `update()` ; dans un filtre, une valeur à comparer |
| `db.Default` dans un `vals([…])` d’une requête que vous écrivez : `` db.sql`INSERT INTO films (…) VALUES (${db.vals([…, db.Default])})` `` | `'Symbol(DEFAULT)'` | `DEFAULT`<!-- probe: db.sql`${db.vals([db.Default])}` --> | rien |
| `db.raw()`, `db.cols()` ou `db.vals()` comme valeur de filtre, d’une condition, ou dans un `vals([…])` d’un fragment donné comme valeur : `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | envoyé en JSON, `{"value":"'Cy'"}` stocké | refusé par `tsc` comme valeur de filtre, et lève une erreur à la compilation de la requête | dans un filtre, un fragment `sql` comme valeur ([Compiler](#compile)) ; dans une valeur écrite, `raw()` dans le fragment lui-même : `` db.sql`${db.raw("'Cy'")}` `` |
| `db.parent()`, `db.raw()`, `db.cols()` ou `db.vals()` comme valeur d’`insert()`, `update()` ou `upsert()` là où le type l’acceptait : sur une colonne typée `any`, comme l’est un placeholder de `zapatos/custom` laissé tel que généré (`{ c: db.parent('id') }`), ou dans un `vals({…})` d’une requête que vous écrivez, `` db.sql`INSERT INTO films (…) VALUES (${db.vals({ …, tagline: db.raw("upper('x')") })})` `` | envoyé en JSON, `'{"value":…}'` stocké | lève une erreur avant toute requête | dans une écriture, la valeur elle-même, ou pour du SQL un fragment `sql` comme valeur, `` db.sql`upper(${db.param('x')})` `` |
| `db.parent()` sans colonne dans un `vals({…})` d’une sous-requête `lateral` : `` db.sql`SELECT ${db.vals({ name: db.parent() })}` `` | `'{}'` | la colonne du parent nommée par sa clé ([`parent()`](/fr/sql-template#parent)) | rien |

</div>

### `updateValues` et un `update()` vide {#updatevalues-and-an-empty-update}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Une simple valeur dans [`upsert()`](/fr/insert#upsert-options) `updateValues` : une chaîne, `{ tagline: 'films.title' }`, ou un objet | un nom de colonne, `ROW("films"."title")`, ou pour un objet une condition sur ses clés (`TRUE` s’il n’en a aucune) | un paramètre, la valeur elle-même | pour l’ancien résultat, un fragment : `` db.sql`${'films'}.${'title'}` `` |
| [`update()`](/fr/insert#update) sans colonne : `update('films', {}, …)` | 42601, de Postgres | lève une erreur à l’appel : "nothing to update: an Updatable needs at least one column"<!-- message --> | rien, sauf si vous y interceptez une `DatabaseError` |

</div>

### `truncate()` {#truncate}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Le résultat de [`truncate()`](/fr/insert#truncate)`.run()` | `[]` | `undefined`, comme le dit son type | rien : il ne contenait aucune ligne |
| Des options de `truncate()` dans un ordre que Postgres refuse, en passant outre le type : `truncate('tags', 'CASCADE', 'RESTART IDENTITY')` | Postgres renvoie 42601 : `.run()` est rejetée avec une `DatabaseError` | lève une erreur à la compilation : `.run()` est rejetée avec une simple `Error`, "Truncate options must be CONTINUE IDENTITY/RESTART IDENTITY, then RESTRICT/CASCADE, one of each at most, not '…'"<!-- message --> | rien, sauf si votre code y attend une `DatabaseError` (42601) : c’est désormais une simple `Error` |

</div>

### Noms et mots-clés {#names-and-keywords}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Un nom (une colonne, une table, une clé de `lateral`, un `alias`) ou un cast de `param()` qui injecte du SQL, ou contient un commentaire entre ses parties entre guillemets : un [`order`](/fr/select#select) de `{ by: 'release_year" DESC, "title', … }` | `ORDER BY "release_year" DESC, "title" ASC` | `ORDER BY "release_year"" DESC, ""title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'release_year" DESC, "title', direction: 'ASC' } }) -->, un seul nom : 42703 | un nom par chaîne : `order: [{ by: 'release_year', direction: 'DESC' }, { by: 'title', direction: 'ASC' }]` |
| Un [`lock`](/fr/select#lock), une option de [`truncate()`](/fr/insert#truncate), un niveau d’isolation, ou un `aggregate` qui n’est pas un nom de fonction | écrit tel quel dans le SQL | lève une erreur avant toute requête | une valeur que le type accepte ; pour l’`aggregate`, un nom de fonction (`sum`, `my_schema.my_agg`) |

</div>

### Le SQL qui change, pas les lignes {#sql-that-changes-rows-that-don-t}

Le texte et les valeurs de `.compile()` changent aussi au-delà des cas ci-dessus, là où les lignes renvoyées restent les mêmes :

<div class="stack">

| Où | Zapatos 6.6.1 | pgcast |
|---|---|---|
| chaque `not()` : une paire de parenthèses en plus | `(NOT "release_year" = $2)` | `(NOT ("release_year" = $2))`<!-- probe: db.conditions.not(db.conditions.eq(1974)).compile({ text: '', values: [0] }, undefined, 'release_year') --> |
| chaque opérande d’`and()` : une paire chacun | `(a AND b)` | `((a) AND (b))`<!-- probe: db.conditions.and(db.sql`a`, db.sql`b`) --> |
| chaque valeur de filtre `param()`, envoyée telle quelle : `{ title: db.param('x', 'text') }` | `$2` avec `{"value":"x","cast":"text"}` | `CAST($2 AS "text")`<!-- probe: db.update('films', { tagline: 'x' }, { title: db.param('x', 'text') }) --> avec `'x'` |

</div>

- Les tests qui prennent le SQL en snapshot échouent à l’étape [Lire les avertissements](#read-the-warnings) : vérifiez d’abord les lignes, puis mettez les snapshots à jour.
- Chaque cas de chaque correction : le [changelog](/fr/changelog), § Fixed et § Security.

## 5. Lire les avertissements {#read-the-warnings}

Lancez vos tests, puis votre application. Là où Zapatos 6.6.1 faisait quelque chose sur quoi du code peut compter, pgcast le garde, et avertit une fois par processus, au premier appel qui le fait :

```txt
(node:4242) [PGCAST_DEP002] DeprecationWarning: An undefined value in insert(), update() or upsert() is sent as NULL, or, in upsert() updateValues, set from EXCLUDED. Set undefinedMeansMissing: true (db.setConfig) to treat it as a missing key instead (DEFAULT in insert(), left out of update() and upsert()); it will be the default in pgcast 7.0.
(Use `node --trace-deprecation ...` to show where the warning was created)
```

Pour trouver chaque appel :

1. Lancez avec `--trace-deprecation` : Node affiche la pile, et la première ligne sous les frames `dist/db/` de pgcast lui-même est la vôtre. Les processus d’un test runner le reçoivent via `NODE_OPTIONS` :

   ```sh
   NODE_OPTIONS=--trace-deprecation npm test
   ```

2. Corrigez l’appel, ou activez son option (tableau ci-dessous).
3. Relancez. Chaque code n’avertit qu’une fois, donc la pile ne montre que son premier appel : l’appel suivant avec le même code avertit à son tour.

<div class="stack">

| Avertissement | L’appel | Corrigez-le, ou activez |
|---|---|---|
| `PGCAST_DEP001` | un `upsert()` de plusieurs lignes sans [`updateColumns`](/fr/insert#upsert-options), avec une clé absente de certaines lignes : insérée comme `DEFAULT`, elle écrase la valeur existante ([Lignes aux clés différentes](/fr/insert#upsert-different-keys)) | donnez la clé à chaque ligne (`db.Default` garde le SQL), ou passez `updateColumns` ; ou [`upsertRequiresSameKeys`](/fr/runtime-config#Config.upsertRequiresSameKeys), et un tel appel lève une erreur |
| `PGCAST_DEP002` | une valeur `undefined` dans `insert()`, `update()` ou `upsert()`, envoyée comme `NULL`, ou, dans `updateValues` d’`upsert()`, qui prend sa valeur dans `EXCLUDED` ([Une valeur `undefined`](/fr/insert#undefined-values)) | omettez la clé, ou donnez `null` pour effacer la colonne ; ou [`undefinedMeansMissing`](/fr/runtime-config#Config.undefinedMeansMissing), et `undefined` est une clé absente |
| `PGCAST_DEP003` | une [`transaction()`](/fr/transaction#transaction) dont le callback intercepte l’erreur d’une requête et se termine : Postgres répond au `COMMIT` par `ROLLBACK`, et rien n’est enregistré ([Laisser passer l’erreur](/fr/retries#let-the-error-through)) | laissez l’erreur sortir du callback, ou faites `ROLLBACK TO` un `SAVEPOINT` avant de continuer ; ou [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), et une telle transaction est rejetée |
| `PGCAST_DEP004` | un [`sum()`, `avg()`, `min()` ou `max()`](/fr/select#typed-by-column) dont `Number()` change le résultat : `0` pour aucune ligne, les millisecondes d’une date, `NaN` pour un texte | activez [`aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn), déclaré dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes) : `tsc` montre alors chaque appel dont le résultat est désormais `null` ou du type de la colonne, et `?? 0` garde un `0` |
| `PGCAST_DEP005` | une [`transaction()`](/fr/transaction#transaction) qui reçoit un client sur lequel vous avez envoyé `BEGIN` : son `COMMIT` ou son `ROLLBACK` termine votre transaction ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)) | ouvrez la transaction extérieure avec `transaction()`, ou donnez-lui le pool ; ou [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), et un tel appel est rejeté avant d’envoyer son `START TRANSACTION` |

</div>

## 6. Activer les opt-ins {#turn-on-the-opt-ins}

Une fois qu’une exécution ne montre plus d’avertissement, ou que chacun vient d’un appel que vous avez vérifié, activez les options, une fois, avant la première requête :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({
  upsertRequiresSameKeys: true, undefinedMeansMissing: true,
  transactionRequiresCommit: true, transactionRequiresIdleClient: true,
});
```

Les quatre deviendront le comportement par défaut dans la 7.0 ([Versions](/fr/versions)). Avec elles, une valeur `undefined` est omise d’un `update()` :

<CastPanel example="switching_undefined">

<<< ../examples/switching_undefined.ts{ts twoslash}

</CastPanel>

- `insert()` envoie `DEFAULT`<!-- probe: (db.setConfig({ undefinedMeansMissing: true }), db.insert('tags', { film_id: 1000, tag: undefined })) --> pour une valeur `undefined`, et un `update()` sans autre clé lève l’erreur "nothing to update: an Updatable needs at least one column"<!-- message -->.
- L’`upsert()` de `PGCAST_DEP001` lève une erreur à l’appel, avant toute requête : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.
- Une `transaction()` dont Postgres répond au `COMMIT` par `ROLLBACK` est rejetée, sans retry ([`transaction()`, Erreurs](/fr/transaction#errors)).
- Une `transaction()` qui reçoit un client déjà dans un bloc de transaction est rejetée, et laisse cette transaction ouverte ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)).
- Aucune option n’avertit. Pour que cela dure, `NODE_OPTIONS=--throw-deprecation npm test` fait échouer l’exécution au premier avertissement.

Un opt-in de plus, [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), n’a pas d’avertissement à guetter, et reste désactivé dans la 7.0. Avec lui, un `selectExactlyOne()` exécuté seul est rejeté sur une deuxième ligne, pas seulement sur aucune. Activez-le là où vos tests ne montrent aucun `selectExactlyOne()` qui trouve deux lignes.

Le générateur a deux opt-ins qui lui sont propres, tous deux appelés à devenir le comportement par défaut dans la 7.0. Leur avertissement est une note de `npx zapatos`, pas de vos tests.

La note de [`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas) nomme chaque colonne dont le type est un enum d’un autre schéma, et cet enum, typé jusque-là comme `any` ou comme l’enum du même nom dans le schéma de la relation :

1. Activez-le dans `zapatosconfig.json`.
2. Supprimez le placeholder `zapatos/custom/` d’un domaine sur un tel enum : le générateur n’en écrase jamais un, donc le domaine garderait celui qu’il a déjà, typé à l’ancienne. Le nouveau reçoit les labels.
3. Régénérez, et laissez `tsc` montrer les valeurs que les labels de l’enum refusent.

La note d’[`enumOrder`](/fr/generator#generate.enumOrder) nomme chaque enum dont le générateur trie les labels, alors que Postgres les déclare dans un autre ordre. Réglez-le sur `"declared"` et régénérez : pour TypeScript, seul `every.<name>` change, donc le code à relire est celui qui y prend un label par son indice ou le compare à un tuple.

## Revenir en arrière {#go-back}

```sh
npm install zapatos@6.6.1
```

- D’abord, retirez de `setConfig()` les options que la `Config` de Zapatos 6.6.1 n’a pas (2353) : `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `transactionRequiresIdleClient`, `selectExactlyOneChecksForSecondRow` et `aggregatesTypedByColumn`.
- Avec [`moduleNames`](/fr/generator#generate.moduleNames) à `"pgcast"`, lancez aussi `npm uninstall pgcast` : les deux paquets ont une commande `zapatos`. Vos imports `pgcast/…` ne se résolvent alors plus, et la 6.6.1 écrit `zapatos/` mais laisse `pgcast/` en place. Remettez donc chaque import en `zapatos/…`, déplacez les placeholders que vous avez modifiés dans `zapatos/custom/`, leur `declare module 'pgcast/custom'` renommé en `'zapatos/custom'`, et supprimez `pgcast/`.
- Régénérez avec Zapatos 6.6.1. Il ignore `typeEnumsAcrossSchemas`, `enumOrder` et `moduleNames` dans `zapatosconfig.json`, et réécrit les types `any`, les labels triés, les lignes de commentaire sans préfixe et tout nom d’`UniqueIndex` emprunté.
- Chaque changement de [Trouver les appels dont le résultat change](#find-the-calls-whose-result-changes) s’exécute comme avant, sauf celui du `jsonb`, qui ne trouve de nouveau rien.

::: warning Sécurité
Le code écrit, ou laissé tel quel, en comptant sur les corrections de pgcast retrouve les résultats de Zapatos 6.6.1 : chaque ligne dont Que faire dit « rien », la ligne du `not()` et celle du `jsonb`.

`db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` supprime 11 rôles sous pgcast, et les 12 sous Zapatos 6.6.1.

Les failles du [§ Security de la 6.6.2](/fr/changelog#6.6.2-security) sont de nouveau ouvertes : un nom, un `lock`, un `aggregate`, une simple valeur dans `updateValues` ou un cast de `param()` peuvent injecter du SQL ([Sécurité](/fr/security)).
:::

## Voir aussi {#see-also}

- [Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings) : chaque option, son avertissement et son message.
- [Versions](/fr/versions) : pourquoi pgcast corrige certaines choses d’emblée et d’autres derrière une option.
- [Sécurité](/fr/security) : pourquoi un nom ou une valeur `raw()` ne peut plus injecter de SQL.

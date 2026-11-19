---
english: 34107932f207
description: "Passez de Zapatos 6.6.1 à pgcast : changez une ligne de package.json et régénérez ; tsc et les avertissements de pgcast montrent les rares appels qui changent."
---

# Venir de Zapatos

Passez un projet de Zapatos 6.6.1 à pgcast : changez une ligne de `package.json`, régénérez, puis laissez `tsc`, un coup d’œil à votre code et les avertissements de pgcast vous montrer les quelques appels dont le résultat change. La page suppose un projet qui tourne déjà sur Zapatos ; pour un nouveau, commencez par [Installation](/fr/install).
{.lede}

<AtAGlance>

- Une ligne de `package.json` remplace le paquet ; imports, configuration et fichiers générés restent tels quels.
- Quelques appels donnent d’autres lignes, ou lèvent une erreur : [l’étape 4](#find-the-calls-whose-result-changes) les liste, avec ce qu’il faut faire.
- À l’exécution, pgcast conserve les comportements sur lesquels votre code peut compter et émet un avertissement jusqu’à ce que vous activiez l’opt-in correspondant. Les [types des conditions sur tableaux en 7.0](#array-condition-types) changent sans avertissement.

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

Avec pgcast 6.x, lancez `git diff` sur votre dossier `zapatos/` régénéré pour voir les éventuelles différences avec Zapatos 6.6.1. En voici quelques exemples.

- un commentaire de colonne s’étend sur plusieurs lignes : chaque ligne commence maintenant par ` * ` ;
- une table a un index simple nommé comme l’index unique d’un autre schéma : son `UniqueIndex` n’emprunte plus ce nom ;
- une table a un `Insertable` : chacune de ses colonnes prend `db.SQLFragment<any>`, un fragment `sql` dont le résultat est typé, là où la 6.6.1 écrivait `db.SQLFragment`.

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
- Dans `updateValues` d’[`upsert()`](/fr/insert#upsert-options), `db.cols()` ou `db.vals()` d’une chaîne ou d’une autre valeur primitive, `{ title: db.cols('title') }` : le type le refuse (2769). Il lève une erreur à la compilation de la requête, et avec Zapatos 6.6.1, Postgres le refusait (42703, 42601), sauf `vals()` d’un seul caractère. Donnez la valeur elle-même, envoyée comme paramètre, ou un fragment `sql`.
- Dans `updateValues` aussi, `db.cols()` ou `db.vals()` d’un `Date` ou d’un `Buffer`, `{ booked_at: db.vals(new Date()) }`, et avec [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects) d’un [`PostgresInterval`](/fr/runtime-config#PostgresInterval) : le type le refuse (2769). Un `Date` sans clé propre énumérable et un `Buffer` lèvent aussi une erreur à la compilation, ici et dans tout appel à [`cols()`](/fr/sql-template#cols) ou [`vals()`](/fr/sql-template#vals) ; un `Date` doté de champs propres et un intervalle se compilent comme avant. Avec Zapatos 6.6.1, Postgres le refusait (42601, 42703), sauf `vals()` d’un `Buffer` d’un seul octet, qui stockait le nombre de cet octet, `97` pour `Buffer.from('a')` ; d’un `Date` doté d’un seul champ propre, qui stockait ce champ ; et d’un intervalle tel que `pg` le parse, d’une seule partie, qui stockait son nombre comme des secondes, `{ hours: 2 }` en 2 secondes. Donnez la valeur elle-même, envoyée comme paramètre.
- Un range sélectionné peut désormais valoir `'empty'`, puisque Postgres écrit ainsi un range vide ([`RangeString`](/fr/runtime-config#RangeString)) : il n’est donc plus assignable à un type qui commence par un crochet, `` `[${string}` | `(${string}` `` (2322). Vérifiez d’abord ce cas, `if (range !== 'empty')` ; dans un type, écrivez `Exclude<db.DateRangeString, 'empty'>`.
- À partir de la 6.11.0, une fois le schéma régénéré, une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`search` typée `any`, comme l’est un `tsvector`, ou `length` un nombre), n’accepte plus n’importe quelle chaîne comme nom dans son type `SQL` (2345) : `` db.sql<s.films.SQL>`${'titel'}` ``. Zapatos 6.6.1 acceptait la chaîne comme un nom, `"titel"`, que Postgres refuse quand aucune colonne ne le porte (42703). Pour un nom connu seulement à l’exécution, vérifiez-le, puis typez-le comme le `Column` de la table.
- À partir de la 6.11.0, sur une telle table, le `where` d’un raccourci, le `having` de `select()`, `exists()` et `isInSelect()`, ainsi que les lignes d’`insert()`, d’`upsert()` et d’`update()`, n’acceptent plus une chaîne, un `String` ni un tableau, quel que soit le schéma (2345, 2769) : `db.select('films', 'titel')`. Zapatos 6.6.1 exécutait la chaîne comme une colonne, `WHERE "titel"` (42703 quand aucune colonne ne porte ce nom ; quand elle nommait une colonne booléenne, la requête filtrait par cette colonne), et envoyait une ligne donnée en chaîne comme ses caractères, `("0", "1", …)` (42703). Écrivez un Whereable, `{ subtitled: true }`, ou un fragment, `` db.sql<s.screenings.SQL>`${'subtitled'}` `` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). Sur une table dont toutes les colonnes sont optionnelles, l’une nommée `length`, `[]`, un tableau de lignes contenu dans une variable, un tableau `readonly` et un tableau `as const`, contenu dans une variable ou écrit dans l’appel, donnés à `insert()` ou à `upsert()`, sont désormais typés comme un tableau, comme ils s’exécutent, et non comme une seule ligne ([#683](https://github.com/AlexandreDemartin/pgcast/issues/683)).

### À partir de la 7.0 {#from-7-0}

Les agrégats sont désormais [typés par colonne](/fr/select#typed-by-column). Traitez le cas où le résultat vaut `null` avant de l’utiliser dans un calcul, ou utilisez `?? 0` si la somme doit valoir zéro en l’absence de lignes. Pour conserver les résultats numériques tout au long de la série 7.x, réglez l’option sur `false` et déclarez cette valeur dans le module que vous importez (`pgcast/db` si vous utilisez ce nom).

```ts twoslash
import * as db from 'zapatos/db';

declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
db.setConfig({ aggregatesTypedByColumn: false });
```

<div class="stack">

| Votre code | Zapatos 6.6.1 et pgcast 6.x | pgcast 7.0 | Que faire |
|---|---|---|---|
| Une implémentation de `SelectOneSignatures` ou de `SelectExactlyOneSignatures` qui appelle `select()` avec un mode | Compile avec les signatures numériques de la 6.x | TS2322 (TS2375 avec `exactOptionalPropertyTypes`) | Appelez respectivement `selectOne()` ou `selectExactlyOne()`. |
| Un spread exporté du fragment qui calcule le minimum d’une date, avec `declaration: true` | Compile avec les signatures numériques de la 6.x | TS4023 | Exportez le fragment lui-même. |
| `db.serializableRO(pool, countSeats)`, où le paramètre de `countSeats` est de type `db.TxnClient<db.IsolationLevel.Serializable \| db.IsolationLevel.SerializableRO>` | Compile | TS2345 avec `strictFunctionTypes` (activé par `strict`), car TypeScript vérifie le callback avec le type de client élargi | Avec `pg`, donnez au paramètre le type [`db.TxnClientForSerializableRO`](/fr/transaction#TxnClientForSerializableRO). Avec un adaptateur dont le client est de type `C`, utilisez `db.TxnClientLike<C, db.IsolationSatisfying<db.IsolationLevel.SerializableRO>>`. Si la fonction examine `_zapatos.isolationLevel`, traitez aussi le cas `SerializableRODeferrable`. Les types construits à partir de ces niveaux sont aussi concernés : ajoutez la clé `SerializableRODeferrable` à un `Record` indexé par `IsolationSatisfying<…>`, élargissez le type du client dans une signature écrite à la main et passez un discriminant explicite si des surcharges choisissaient le résultat en fonction des types de clients ordinaire et différable, puisque les deux types coïncident désormais. Les callbacks de `transaction()`, de `savepoint()` et des appels imbriqués qui conservent le client reçoivent aussi le type élargi. |

</div>

### Les types des conditions sur tableaux en 7.0 {#array-condition-types}

Pour `arrayContains()`, `arrayContainedIn()` et `arrayOverlaps()` (`c = db.conditions`) :

- Si vous aviez un mock en 6.6.1, implémentez les deux surcharges, celle qui accepte une colonne parente et celle qui accepte un tableau.
- Remplacez `.map(c.arrayContains)` par `.map(xs => c.arrayContains(xs))` pour conserver le type des éléments. Si vous stockez le résultat de `c.arrayContains([1])` dans une variable, la contrainte du fragment est `number[]`.
- Omettez l’argument de type dans `c.arrayContains(db.parent('genres'))`. Si le type de l’opérande autorise un tableau ou une colonne parente, affinez-le avant l’appel.
- Pour inclure les colonnes parentes dans le type dérivé de l’opérande, utilisez `Parameters<typeof c.arrayContains>[0] | db.ParentColumn`.
- Si votre fonction appelle la condition avec `xs: T[]` et `T extends number[]`, laissez TypeScript inférer son type de retour. L’ancienne annotation `db.SQLFragment<boolean | null, T>` est refusée.
- Avec TypeScript 4.1 ou 5.9, passez les labels d’un enum sous la forme `['director'] as const` ou dans un tableau de type `s.crew_job[]`.

### Types des enums en 7.0 {#enum-types}

Avec les réglages par défaut de la 7.0, un enum d’un autre schéma fournit ses propres labels, même si un enum du schéma de la relation porte le même nom. Le tuple `every.<name>` suit l’ordre de déclaration des labels dans Postgres. Régénérez les types et lancez `tsc` pour repérer les écritures qui utilisent des labels invalides et le code qui dépend de la position d’un label.

- Lorsque vous générez les types dans un nouveau dossier, les placeholders d’enums d’autres schémas, comme `PgStatus` et `Pg_mood`, sont absents de `zapatos/custom`. Les fichiers existants restent sur disque, mais leurs colonnes ne les utilisent plus. Remplacez chaque import par le type de la colonne, par exemple `products.Selectable['status']`, ou réglez `typeEnumsAcrossSchemas: false` en 7.x.
- Si une colonne de type composite d’un autre schéma était typée avec l’enum local du même nom, elle a désormais son propre placeholder. Indiquez-y le type renvoyé par votre parser, ou réglez `typeEnumsAcrossSchemas: false` en 7.x.
- Si vous passez le tableau `columnsTypedByEnumName` à `definitionForRelationInSchema()`, seul le réglage `typeEnumsAcrossSchemas: false` le remplit.

Pour mettre à jour le placeholder existant d’un domaine sur un enum d’un autre schéma, générez les types dans un nouveau dossier avec `outDir`. Comparez les deux fichiers, reportez les nouveaux labels en conservant vos modifications, puis relancez `tsc`.

Dans toutes les versions 7.x, [`typeEnumsAcrossSchemas: false`](/fr/generator#generate.typeEnumsAcrossSchemas) rétablit la recherche dans le schéma de la relation et [`enumOrder: 'alphabetical'`](/fr/generator#generate.enumOrder) rétablit le tri alphabétique des labels. Vous pouvez régler ces options indépendamment, sans note de migration. La 8.0 supprime ces deux anciens comportements.

### Cibles de conflit nommées en 7.0 {#named-conflict-targets}

Régénérez le schéma puis lancez `tsc`. Pour [la table `festival_entries`](/fr/generator#generate.uniqueIndexConstraintsOnly), `constraint()` accepte encore `festival_entries_pkey` et `festival_entries_film_festival_key`. Dans un objet littéral de type `Record<s.festival_entries.UniqueIndex, string>`, gardez ces deux clés et retirez `festival_entries_live_idx` et `festival_entries_slot_key`. Si un upsert cible l’un de ces noms, choisissez une contrainte compatible avec `DO UPDATE`.

Si le type `UniqueIndex` d’une relation devient `never`, TypeScript accepte encore l’ancienne clé dans un objet littéral de type `Record` dont les clés sont définies par cette union. Vérifiez ces objets à la main.

Sur Postgres 18, un upsert qui cible par son nom une clé `WITHOUT OVERLAPS` non différable avec `updateColumns: db.doNothing` compilait et fonctionnait en 6.x. Avec le réglage par défaut de la 7.0, le compilateur refuse ce nom. Pour conserver `DO NOTHING`, écrivez une requête `sql` explicite qui nomme la clé ou utilisez `uniqueIndexConstraintsOnly: false` en 7.x.

Ce réglage rétablit le type union de la 6.x sans note de migration. C’est le seul qui renseigne le paramètre de sortie `uniqueIndexesNotArbiters` de `definitionForRelationInSchema()`.

### Domaines, tableaux d’enums et intervalles en 7.0 {#domain-and-parser-types}

Régénérez le schéma avec `npx pgcast`, puis lancez `tsc`. En 7.0, les trois options du générateur valent `true` par défaut. Aucune ne produit de note de migration.

- Avec [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), un numéro de billet de type domaine sur `bigint` est un nombre dans le JSON des raccourcis. Remplacez les appels à `.padStart()` sur ce nombre. Un domaine imbriqué dont le placeholder contient encore `any` prend le type de base du domaine au dernier niveau d’imbrication. Les placeholders modifiés gardent leur type. Si Zapatos 6.6.1 a écrit un placeholder sans l’import de `db`, [ajoutez cet import](/fr/custom-types#when-a-placeholder-does-not-compile). Pour retrouver les types de la 6.x jusqu’à la fin de la 7.x, réglez l’option sur `false`. Ce réglage disparaît en 8.0.
- Avec [`enumArraysTypedAsText`](/fr/generator#generate.enumArraysTypedAsText), une ligne renvoyée par une requête `sql` contient le texte du tableau. Pour appeler `.map()` ou réécrire les labels, utilisez le tableau renvoyé par un raccourci. Gardez `false` si votre parser `pg` renvoie déjà les labels sous forme de tableau.
- Avec [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects), une ligne renvoyée par une requête `sql` contient un `PostgresInterval`. Lisez ses champs ou réécrivez l’objet directement. Le JSON des raccourcis conserve le texte. Gardez `false` si votre parser renvoie le texte de l’intervalle. Les deux réglages liés aux parsers restent disponibles au-delà de la 8.0.

## 4. Trouver les appels dont le résultat change {#find-the-calls-whose-result-changes}

pgcast corrige, sans option à activer, ce sur quoi aucun code ne pouvait compter dans Zapatos 6.6.1 : un appel que Postgres ou le type refusait, qui faisait le contraire de son nom, ou qui laissait une chaîne injecter du SQL. Quelques-uns de ces appels s’exécutaient bel et bien, et donnent maintenant d’autres lignes, ou lèvent une erreur.

Cherchez dans votre code la première colonne de chaque tableau ci-dessous. Chaque changement de la colonne Que faire donne le même résultat sous Zapatos 6.6.1, vous pouvez donc le faire avant de passer à pgcast ; seul celui du `jsonb` ne trouve ses lignes que sous pgcast.

### Conditions {#conditions}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| [`not()`](/fr/conditions#conditions.not) d’un fragment avec un `OR` ou un `AND` nu : sur `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, donc aussi le film de 1991 | `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | pour les anciennes lignes, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/fr/conditions#conditions.and) d’un fragment avec un `OR` nu et un autre opérande : `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, donc aussi le film 1000 | `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | pour les anciennes lignes, un seul fragment : `` db.sql`${'id'} = 1000 OR (${'id'} = 1001 AND ${'studio_id'} = ${db.param(1001)})` `` |
| [`and()`](/fr/conditions#conditions.and) de fragments qui coupent une expression : `` and(db.sql`${'release_year'} BETWEEN 1970`, db.sql`2000`) `` | `(a BETWEEN 1970 AND 2000)`, les films 1000 et 1001 | `((a BETWEEN 1970) AND (2000))`<!-- probe: db.conditions.and(db.sql`a BETWEEN 1970`, db.sql`2000`) -->, que Postgres refuse (42601) | une seule condition : `{ release_year: db.conditions.between(1970, 2000) }` |
| `groupBy` qui reçoit un `and()` ou un `or()` sans argument : `count('films', db.all, { groupBy: db.conditions.and() })` | `GROUP BY ()`, l’ensemble de regroupement vide : 4 | `GROUP BY TRUE`<!-- probe: db.count('films', db.all, { groupBy: db.conditions.and() }) -->, que Postgres refuse (42601), `GROUP BY FALSE` pour `or()` | omettez `groupBy` : 4 |
| [`db.all`](/fr/sql-template#all) comme valeur d’une condition, `{ title: db.all }`, `isIn([db.all])` / `isNotIn([db.all])` ou `arrayContains([db.all])` : `deletes('films', { title: db.conditions.ne(db.all) })` ; `db.Default`, `db.self`, `raw()`, `cols()`, `vals()`, `param()`, un fragment ou `parent()` comme élément d’[`arrayContains()`](/fr/conditions#conditions.arrayContains), d’`arrayContainedIn()` ou d’`arrayOverlaps()` : `update('films', { title: 'Gone' }, { genres: db.conditions.not(db.conditions.arrayOverlaps([db.Default])) })` | `'Symbol(all)'`, donc tout film qui a un titre est supprimé ; l’élément sous forme de texte ou de JSON dans le tableau, `'{"Symbol(DEFAULT)"}'`, donc tout film est renommé | `tsc` refuse ces valeurs sur ces colonnes et les accepte sur une colonne de type `any`. La compilation de la requête lève une erreur. | pour les mêmes lignes, `{ title: db.conditions.isNotNull }`, `{ genres: db.conditions.isNotNull }` ; sinon, une valeur à comparer |

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
| [`db.all`](/fr/sql-template#all) ou [`db.self`](/fr/sql-template#self) comme valeur d’`insert()`, `update()` ou `upsert()`, `updateValues` compris, en passant outre le type, ou dans un `vals({…})` d’une requête que vous écrivez : `insert('films', { …, tagline: db.all })` sur une colonne typée `any`, `` db.sql`… WHERE tagline IN (${db.vals({ tagline: db.all })})` `` | `'Symbol(all)'` ou `'Symbol(self)'` stocké ; dans `IN (…)`, comparé à cette chaîne, donc aucune ligne, sauf celle qui la contient ; dans `updateValues`, une `TypeError` ou "The 'self' column alias has no meaning here" | à partir de la 6.11.0, lève une erreur à la compilation de la requête | la valeur elle-même |
| `db.all`, `db.self`, `db.raw()`, `db.cols()` ou `db.vals()` dans un `vals([…])` d’une requête que vous écrivez ou des `updateValues` d’`upsert()` : `` updateValues: { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | `'Symbol(all)'`, `'Symbol(self)'` ou `'{"value":"'Cy'"}'`, envoyé ou stocké | à partir de la 6.11.0, lève une erreur à la compilation de la requête | la valeur elle-même ; pour du SQL, hors de `vals([…])` : dans `updateValues`, `{ tagline: db.raw("'Cy'") }` |
| `db.raw()`, `db.cols()` ou `db.vals()` comme valeur de filtre, d’une condition, ou dans un `vals([…])` d’un fragment donné comme valeur : `` { tagline: db.sql`${db.vals([db.raw("'Cy'")])}` } `` | envoyé en JSON, `{"value":"'Cy'"}` stocké | refusé par `tsc` comme valeur de filtre, et lève une erreur à la compilation de la requête | dans un filtre, un fragment `sql` comme valeur ([Compiler](#compile)) ; dans une valeur écrite, `raw()` dans le fragment lui-même : `` db.sql`${db.raw("'Cy'")}` `` |
| `db.parent()`, `db.raw()`, `db.cols()` ou `db.vals()` comme valeur d’`insert()`, `update()` ou `upsert()` là où le type l’acceptait : sur une colonne typée `any`, comme l’est un placeholder de `zapatos/custom` laissé tel que généré (`{ c: db.parent('id') }`), ou dans un `vals({…})` d’une requête que vous écrivez, `` db.sql`INSERT INTO films (…) VALUES (${db.vals({ …, tagline: db.raw("upper('x')") })})` `` | envoyé en JSON, `'{"value":…}'` stocké | lève une erreur avant toute requête | dans une écriture, la valeur elle-même, ou pour du SQL un fragment `sql` comme valeur, `` db.sql`upper(${db.param('x')})` `` |
| [`db.cols()`](/fr/sql-template#cols) ou [`db.vals()`](/fr/sql-template#vals) d’un objet natif sans clé propre énumérable, ou d’un `Buffer`, dans une requête que vous écrivez : `` db.sql`SELECT ${db.cols(new Date())} FROM films` ``, `` db.sql`UPDATE films SET title = ${db.vals(Buffer.from('a'))}` `` | `SELECT  FROM films`, des lignes sans colonne ; `'97'` stocké ; dans une liste `IN`, les octets comme des nombres | lève une erreur à la compilation | les noms de colonnes dans un tableau, `db.cols(['title'])` ; la valeur dans un tableau, `db.vals([value])`, ou `db.param(value)` |
| `db.parent()` sans colonne dans un `vals({…})` d’une sous-requête `lateral` : `` db.sql`SELECT ${db.vals({ name: db.parent() })}` `` | `'{}'` | la colonne du parent nommée par sa clé ([`parent()`](/fr/sql-template#parent)) | rien |

</div>

### `updateValues` et les écritures sans colonne {#updatevalues-and-writes-with-no-column}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Une simple valeur dans [`upsert()`](/fr/insert#upsert-options) `updateValues` : une chaîne, `{ tagline: 'films.title' }`, ou un objet | un nom de colonne, `ROW("films"."title")`, ou pour un objet une condition sur ses clés (`TRUE` s’il n’en a aucune) | un paramètre, la valeur elle-même | pour l’ancien résultat, un fragment : `` db.sql`${'films'}.${'title'}` `` |
| [`update()`](/fr/insert#update) sans colonne : `update('films', {}, …)` | 42601, de Postgres | lève une erreur à l’appel : "nothing to update: an Updatable needs at least one column"<!-- message --> | rien, sauf si vous y interceptez une `DatabaseError` |
| [`insert()`](/fr/insert#insert) ou [`upsert()`](/fr/insert#upsert) d’une ligne sans colonne, `{}`, sur une table dont chaque colonne a une valeur par défaut ou accepte `NULL`, ou en passant outre le type | 42601, de Postgres | lève une erreur à l’appel : "nothing to insert: an Insertable needs at least one column; …"<!-- message --> | rien, sauf si vous y interceptez une `DatabaseError` ; pour une ligne de valeurs par défaut, `DEFAULT VALUES` dans un template `sql` |
| [`insert()`](/fr/insert#insert) ou [`upsert()`](/fr/insert#upsert) d’une ligne qui est un `Buffer`, ou un objet natif sans clé propre énumérable, parmi d’autres lignes, en passant outre le type : `[film, new Date()]` | une ligne de valeurs par défaut, écrite ; les octets d’un `Buffer` comme colonnes `"0"`, `"1"`… (42703) | lève une erreur à la compilation | un objet simple pour chaque ligne |

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

### Les options `null` {#null-options}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Une option `null`, en passant outre le type (depuis JavaScript, ou avec `strict` désactivé) : `order: null` ou `lock: null` dans un raccourci de lecture, agrégats compris, `columns: null` ou `extras: null` dans [`select()`](/fr/select#select), `returning: null` ou `extras: null` dans une [écriture](/fr/insert#insert-options) : `select('films', db.all, { order: null })` | une `TypeError` à l’appel, qu’un `.catch()` chaîné sur `.run()` n’intercepte pas | à partir de la 6.7.0, `.run()` est rejetée avec une simple `Error` avant toute requête : "`` `order: null` has no meaning: for no `ORDER BY`, leave `order` out; to sort, give it `{ by, direction }`, or an array of them. ``<!-- message -->", et de même pour chaque clé | omettre la clé : `select('films', db.all)` |

</div>

### Clés propres {#own-keys}

À partir de la 6.7.2, pgcast ne prend les colonnes d’un tableau de lignes et les valeurs de mise à jour d’`upsert()` que dans leurs clés propres, et à partir de la 6.8.0 les options des raccourcis aussi. Une clé qu’un autre code ajoute à `Object.prototype` n’est donc plus une colonne, une valeur de mise à jour ni une option : la section [Les corrections par version](/fr/security#fixes-by-release) dit ce qu’elle faisait. Aucun code ne devrait compter sur une telle clé ; sans elle, seuls ces appels changent :

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| Une colonne nommée `constructor`, `valueOf`, `toString` ou `hasOwnProperty` dans une ligne d’[`upsert()`](/fr/insert#upsert), que `updateValues` ne nomme pas | lève une erreur à la compilation, "Alien object while interpolating SQL: …"<!-- message -->, donc `.run()` est rejetée | à partir de la 6.7.2, prend sa valeur dans `EXCLUDED` en cas de conflit, comme toute autre colonne | rien |
| Une colonne nommée `__proto__`, clé propre telle que `JSON.parse` la donne : dans une ligne d’`upsert()`, que `updateValues` ne nomme pas ; dans un tableau de lignes donné à `insert()` ou `upsert()` | `upsert()` lui donne la valeur `TRUE` en cas de conflit ; dans un tableau, les clés de sa valeur sont aussi des colonnes, et une ligne qui ne l’a pas fait refuser la requête par Postgres (42601) | à partir de la 6.7.2, prend sa valeur dans `EXCLUDED` ; dans un tableau, une colonne à part entière, `DEFAULT` dans une ligne qui ne l’a pas | rien |
| Un élément d’[`order`](/fr/select#select) ou de [`lock`](/fr/select#lock) qui vaut `null` ou `undefined`, en passant outre le type : `select('films', db.all, { order: [null] })` | une `TypeError` à l’appel, « <span lang="en">Cannot read properties of null</span> » | à partir de la 6.8.0, une `Error` à l’appel, comme pour un élément sans `direction` ni `for` : "Direction must be ASC/DESC, not 'undefined'"<!-- message --> | rien, sauf si votre code y attend une `TypeError` |

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

Avant de passer de la 6.x à la 7.0, lancez vos tests et votre application avec les avertissements de dépréciation activés. En 6.x, pour chaque ancien comportement, le premier appel qui l’utilise émet un avertissement de ce type :

```txt
(node:4242) [PGCAST_DEP003] DeprecationWarning: transaction() resolved, but Postgres answered its COMMIT with ROLLBACK: a query failed and the callback caught the error, so nothing was saved. Set transactionRequiresCommit: true (db.setConfig) to reject instead; it will be the default in pgcast 7.0.
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
| `PGCAST_DEP003` | une [`transaction()`](/fr/transaction#transaction) dont le callback intercepte l’erreur d’une requête et se termine : Postgres répond au `COMMIT` par `ROLLBACK`, et rien n’est enregistré ([Laisser passer l’erreur](/fr/retries#let-the-error-through)) | laissez l’erreur sortir du callback, ou faites `ROLLBACK TO` un `SAVEPOINT` avant de continuer ; ou [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), et une telle transaction est rejetée |
| `PGCAST_DEP004` en 6.x | un [`sum()`, `avg()`, `min()` ou `max()`](/fr/select#typed-by-column) dont le résultat vaut `null` ou est absent, ou un minimum ou un maximum dont la valeur renvoyée par `pg` est d’un autre type que `number` | activez [`aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn) et déclarez-le dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes). `tsc` signale alors les utilisations incompatibles avec le nouveau type, et `?? 0` permet de garder `0` |
| `PGCAST_DEP005` | une [`transaction()`](/fr/transaction#transaction) qui reçoit un client sur lequel vous avez envoyé `BEGIN` : son `COMMIT` ou son `ROLLBACK` termine votre transaction ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)) | ouvrez la transaction extérieure avec `transaction()`, ou donnez le pool à cet appel, pour une transaction à lui, qui est commitée séparément de la transaction extérieure, ne voit pas les lignes non commitées de celle-ci, et reste bloquée (sauf si `lock_timeout` est défini) si elle écrit ou verrouille une ligne que la transaction extérieure a écrite ou verrouillée, ou insère une clé que celle-ci a insérée (deux verrous `FOR SHARE` n’entrent pas en conflit) ; ou [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), et un tel appel est rejeté avant d’envoyer son `START TRANSACTION` |
| `PGCAST_DEP007` | une [`transaction()`](/fr/transaction#transaction) qui reçoit le client d’une transaction à un niveau qui ne vaut pas pour le sien, `serializable()` avec celui de `readCommitted()` : son callback s’exécute au niveau extérieur ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)) | ouvrez la transaction extérieure à un niveau qui vaut pour l’appel intérieur, ou donnez le pool à cet appel, pour une transaction à lui, qui est commitée séparément de la transaction extérieure, ne voit pas les lignes non commitées de celle-ci, et reste bloquée (sauf si `lock_timeout` est défini) si elle écrit ou verrouille une ligne que la transaction extérieure a écrite ou verrouillée, ou insère une clé que celle-ci a insérée (deux verrous `FOR SHARE` n’entrent pas en conflit) ; ou [`transactionRequiresSatisfyingLevel`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), et un tel appel est rejeté avant son callback |

</div>

## 6. Activer les opt-ins {#turn-on-the-opt-ins}

En 6.x, quand une exécution se termine sans avertissement ou que vous avez vérifié chaque appel signalé, activez les options une seule fois, avant la première requête :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
db.setConfig({
  upsertRequiresSameKeys: true, undefinedMeansMissing: true,
  transactionRequiresCommit: true, transactionRequiresIdleClient: true,
  transactionRequiresSatisfyingLevel: true, aggregatesTypedByColumn: true,
});
```

En 7.0, `tagline: undefined` seul lève l’erreur `nothing to update`. Ici, la mise à jour s’exécute car elle affecte aussi `title`. L’accroche est conservée.

<CastPanel example="switching_undefined">

<<< ../examples/switching_undefined.ts{ts twoslash}

</CastPanel>

Pour garder un comportement d’écriture de la 6.x pendant toute la 7.x, passez son option à `false` dans `db.setConfig()`. Les deux choix sont indépendants : `undefinedMeansMissing: false` conserve les valeurs `undefined` à l’écriture, et `upsertRequiresSameKeys: false` permet d’écraser des valeurs stockées même si les clés correspondantes sont absentes. Aucun des deux réglages n’émet l’avertissement de la 6.x.

En 7.x, les trois vérifications de transaction sont activées par défaut. Dans `db.setConfig()`, passez à `false` uniquement les vérifications que vous voulez désactiver. Avec [`transactionRequiresCommit: false`](/fr/runtime-config#Config.transactionRequiresCommit), la promesse se résout avec la valeur renvoyée par le callback si Postgres répond au `COMMIT` par `ROLLBACK`. Avec [`transactionRequiresIdleClient: false`](/fr/runtime-config#Config.transactionRequiresIdleClient), le raccourci peut mettre fin à la transaction de l’appelant. Avec [`transactionRequiresSatisfyingLevel: false`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), le callback imbriqué s’exécute au niveau d’isolation de la transaction extérieure. Ces réglages n’émettent aucun avertissement en 7.x et disparaissent en 8.0.

- `insert()` envoie `DEFAULT`<!-- probe: db.insert('tags', { film_id: 1000, tag: undefined }) --> pour une valeur `undefined`, un `update()` sans autre clé lève l’erreur "nothing to update: an Updatable needs at least one column"<!-- message -->, et un `upsert()` sans autre clé "nothing to insert: an Insertable needs at least one column; for a row of defaults only, write INSERT ... DEFAULT VALUES in a sql template"<!-- message -->.
- Par défaut, un upsert de plusieurs lignes lève une erreur à l’appel si sa mise à jour implicite inclut une colonne absente d’une ligne, sauf si la cible du conflit la nomme ou si `updateValues` lui donne une valeur définie. Un `updateColumns` explicite désactive la vérification. Avec `noNullUpdateColumns` seul, elle s’applique toujours. Erreur : "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->.
- Une `transaction()` dont Postgres répond au `COMMIT` par `ROLLBACK` est rejetée, sans retry ([`transaction()`, Erreurs](/fr/transaction#errors)).
- Si votre client sans marqueur signale `T` ou `E` avant et après la requête vide, la promesse de `transaction()` est rejetée et votre bloc reste ouvert. Si le client ne fournit aucun statut, l’appel se poursuit. Un appel concurrent peut commiter des écritures avant le début de la première transaction. Sur un même client, attendez la fin de chaque appel avant de lancer le suivant ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)).
- La promesse d’un appel imbriqué à `transaction()` est rejetée avant l’exécution du callback si le niveau d’isolation enregistré à l’ouverture de la transaction extérieure ne satisfait pas le niveau demandé. Un `SET TRANSACTION` ultérieur laisse le marqueur inchangé. Ouvrez la transaction extérieure au niveau voulu avec le raccourci ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)).
- `sum()`, `avg()`, `min()` et `max()` donnent `null` quand aucune ligne ne correspond, et `min()` et `max()` la valeur de leur colonne, que la déclaration dans `ConfigTypes` type ainsi ([Typé par colonne](/fr/select#typed-by-column)).
- Aucune option n’avertit. Pour que cela dure, `NODE_OPTIONS=--throw-deprecation npm test` fait échouer l’exécution au premier avertissement.

Un opt-in de plus, [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), n’a pas d’avertissement à guetter, et reste désactivé dans la 7.0. Avec lui, un `selectExactlyOne()` exécuté seul est rejeté sur une deuxième ligne, pas seulement sur aucune. Activez-le là où vos tests ne montrent aucun `selectExactlyOne()` qui trouve deux lignes.

En 6.x, lancez `npx zapatos` pour voir quelles options du générateur changeraient les types de votre schéma.

De la 6.7 à la fin de la 6.x, `generate()` et `tsForConfig()` pouvaient signaler `PGCAST_DEP006` avant d’arrêter le processus en cas d’échec de connexion ou de requête. En 7.0, si vous omettez `rejectOnQueryError` ou fixez sa valeur à `null` en JSON, votre bloc `catch` peut intercepter l’erreur d’origine. La promesse est aussi rejetée si un écouteur lève une erreur. Les messages que les écouteurs ont déjà affichés restent visibles. Si le script doit échouer, relancez l’erreur ou utilisez `process.exitCode = 1`. Pour conserver l’arrêt immédiat, réglez [`rejectOnQueryError: false`](/fr/generator#generate.rejectOnQueryError). Ce choix reste possible au-delà de la 8.0. En cas d’échec de connexion ou de requête, la CLI affiche l’erreur et quitte avec le code 1.

## Revenir en arrière {#go-back}

```sh
npm install zapatos@6.6.1
```

- D’abord, retirez de `setConfig()` les options que la `Config` de Zapatos 6.6.1 n’a pas (2353) : `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel`, `selectExactlyOneChecksForSecondRow`, `aggregatesTypedByColumn` et `transactionEventListener`, que TypeScript prend pour une faute de frappe de `transactionListener` (2561). Zapatos 6.6.1 n’appelle jamais cet écouteur : alimentez plutôt un log ou une métrique avec les messages de `transactionListener`.
- Avec [`moduleNames`](/fr/generator#generate.moduleNames) à `"pgcast"`, lancez aussi `npm uninstall pgcast` : les deux paquets ont une commande `zapatos`. Vos imports `pgcast/…` ne se résolvent alors plus, et la 6.6.1 écrit `zapatos/` mais laisse `pgcast/` en place. Remettez donc chaque import en `zapatos/…`, déplacez les placeholders que vous avez modifiés dans `zapatos/custom/`, leur `declare module 'pgcast/custom'` renommé en `'zapatos/custom'`, et supprimez `pgcast/`.
- Renommez un `pgcastconfig.json` en `zapatosconfig.json` : la CLI de Zapatos 6.6.1 ne lit aucun autre fichier.
- Retirez [`--check`](/fr/generator#check) de vos scripts. Avant l’argument JSON, la CLI de Zapatos 6.6.1 le lit comme cet argument, et s’arrête avec le code 1 ; après lui, elle l’ignore, écrit les fichiers et se termine avec le code 0 : la vérification passe donc toujours. [`check()`](/fr/generator#check) aussi : le `zapatos/generate` de Zapatos 6.6.1 n’a pas cet export, ce que TypeScript refuse (2305) ; à l’exécution, `require()` donne `undefined` et l’appel lève `TypeError: check is not a function`, et un import de module ES échoue avant que le moindre code ne s’exécute.
- La CLI de Zapatos 6.6.1 n’affiche pas d’aide pour `--help` ou `-h` : elle les lit comme l’argument JSON, et s’arrête avec le code 1.
- Régénérez avec Zapatos 6.6.1. Il ignore `typeEnumsAcrossSchemas`, `enumOrder`, `uniqueIndexConstraintsOnly`, `domainsTypedByContext`, `enumArraysTypedAsText`, `intervalsTypedAsObjects`, `domainsTypedAsUnions` et `moduleNames` dans `zapatosconfig.json`, et réécrit les types `any`, les labels triés, les lignes de commentaire sans préfixe, chaque index unique dans `UniqueIndex`, tout nom d’`UniqueIndex` emprunté, le placeholder de chaque domaine dans les cinq interfaces, un tableau d’un enum comme un tableau dans `Selectable` et chaque `interval` comme une chaîne ; un placeholder qu’il trouve contenant `db.PostgresInterval` reste, bien que le `db` de Zapatos 6.6.1 n’ait pas ce type : le placeholder ne compile pas sans `skipLibCheck` (TS2694), et sous `skipLibCheck`, la colonne vaut `any`, sans bruit. Écrivez-y `string`. De même pour un placeholder qui nomme l’union d’un domaine, que Zapatos 6.6.1 ne déclare plus (TS2305, ou TS2694 pour un placeholder dans l’espace de noms d’un schéma) : écrivez-y `string` aussi. Son `generate()` ne connaît pas non plus `rejectOnQueryError` : TypeScript le refuse dans un littéral d’objet (2353), et à l’exécution une requête qui échoue arrête de nouveau le processus.
- Chaque changement de [Trouver les appels dont le résultat change](#find-the-calls-whose-result-changes) s’exécute comme avant, sauf celui du `jsonb`, qui ne trouve de nouveau rien.

::: warning Sécurité
Le code écrit, ou laissé tel quel, en comptant sur les corrections de pgcast retrouve les résultats de Zapatos 6.6.1 : chaque ligne dont Que faire dit « rien », la ligne du `not()` et celle du `jsonb`.

`db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` supprime 11 rôles sous pgcast, et les 12 sous Zapatos 6.6.1.

Les failles fermées par les corrections de sécurité de chaque version sont de nouveau ouvertes ([Les corrections par version](/fr/security#fixes-by-release)) : la chaîne d’un appelant peut injecter du SQL, un filtre peut correspondre à toutes les lignes, et une clé qu’un autre code a ajoutée à `Object.prototype` peut changer une requête.
:::

## Voir aussi {#see-also}

- [Opt-ins et avertissements](/fr/runtime-config#opt-ins-and-warnings) : chaque option, son avertissement et quand il est émis.
- [Versions](/fr/versions) : pourquoi pgcast corrige certaines choses d’emblée et d’autres derrière une option.
- [Sécurité](/fr/security) : pourquoi un nom ou une valeur `raw()` ne peut plus injecter de SQL.

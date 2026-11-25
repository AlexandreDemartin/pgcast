---
english: ac5b7668d293
description: "Passez de Zapatos 6.6.1 à pgcast 6.x, puis à la 7.0. Vérifiez les valeurs par défaut, les types et les dépendances à installer."
---

# Venir de Zapatos

Vous utilisez déjà pgcast 6.x ? Commencez par la [migration vers la 7.0](#from-7-0). Si vous partez de Zapatos 6.6.1, suivez d’abord les étapes 1 à 6 avec pgcast 6.x. Les avertissements de cette série vous aideront à préparer le passage à la 7.0. Pour un nouveau projet, commencez par [Installation](/fr/install). Ce que pgcast ajoute, une ligne par ajout : [Nouveautés](/fr/whats-new).
{.lede}

<AtAGlance>

- Une ligne de `package.json` remplace le paquet ; imports, configuration et fichiers générés restent tels quels.
- Quelques appels donnent d’autres lignes, ou lèvent une erreur : [l’étape 4](#find-the-calls-whose-result-changes) les liste, avec ce qu’il faut faire.
- Même sans avertissement en 6.x, [vérifiez les types et les dépendances en 7.0](#from-7-0).

</AtAGlance>

## Ce qui ne change pas {#what-stays-the-same}

- Les noms de modules : `zapatos/db`, `zapatos/schema`, `zapatos/custom` et `zapatos/generate`. Aucun import ne change ([décision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
- Le générateur : `zapatosconfig.json` et ses options, et `npx zapatos`, désormais aussi `npx pgcast` ([La CLI](/fr/generator#cli)).
- Vos placeholders dans `zapatos/custom/` : écrits une fois, jamais écrasés.
- Une `Config` écrite pour Zapatos 6.6.1 : les clés qu’ajoute pgcast sont facultatives ([`Config`](/fr/runtime-config#Config)).
- Le canary de version du schéma, pour qu’un schéma généré par Zapatos 6.6.1 compile tel quel ([`SchemaVersionCanary`](/fr/generated-files#SchemaVersionCanary)).

## 1. Changer de paquet {#swap-the-package}

Pour passer de Zapatos 6.6.1 à pgcast 6.x, installez pgcast 6.x sous l’alias `zapatos` pour que vos imports continuent de fonctionner.

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast@^6
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast@^6
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6
```

:::

- `package.json` indique maintenant `"zapatos": "npm:@pgcast/pgcast@^…"`, et `node_modules/zapatos` contient pgcast.
- Gardez `pg` dans vos dépendances. À partir de la 7.0, si vous vérifiez les types, déclarez aussi `typescript` et `@types/pg` dans vos `devDependencies`. [Installation](/fr/install#requirements).
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
- Dans `updateValues` aussi, `db.cols()` ou `db.vals()` d’un `Date` ou d’un `Buffer`, `{ booked_at: db.vals(new Date()) }`, et avec [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects) d’un [`PostgresInterval`](/fr/value-types#PostgresInterval) : le type le refuse (2769). Un `Date` sans clé propre énumérable et un `Buffer` lèvent aussi une erreur à la compilation, ici et dans tout appel à [`cols()`](/fr/sql-template#cols) ou [`vals()`](/fr/sql-template#vals) ; un `Date` doté de champs propres et un intervalle se compilent comme avant. Avec Zapatos 6.6.1, Postgres le refusait (42601, 42703), sauf `vals()` d’un `Buffer` d’un seul octet, qui stockait le nombre de cet octet, `97` pour `Buffer.from('a')` ; d’un `Date` doté d’un seul champ propre, qui stockait ce champ ; et d’un intervalle tel que `pg` le parse, d’une seule partie, qui stockait son nombre comme des secondes, `{ hours: 2 }` en 2 secondes. Donnez la valeur elle-même, envoyée comme paramètre.
- Un range sélectionné peut désormais valoir `'empty'`, puisque Postgres écrit ainsi un range vide ([`RangeString`](/fr/value-types#RangeString)) : il n’est donc plus assignable à un type qui commence par un crochet, `` `[${string}` | `(${string}` `` (2322). Vérifiez d’abord ce cas, `if (range !== 'empty')` ; dans un type, écrivez `Exclude<db.DateRangeString, 'empty'>`.
- À partir de la 6.11.0, une fois le schéma régénéré, une table dont une colonne porte le nom d’un membre de `String`, d’un type auquel ce membre correspond (`search` typée `any`, comme l’est un `tsvector`, ou `length` un nombre), n’accepte plus n’importe quelle chaîne comme nom dans son type `SQL` (2345) : `` db.sql<s.films.SQL>`${'titel'}` ``. Zapatos 6.6.1 acceptait la chaîne comme un nom, `"titel"`, que Postgres refuse quand aucune colonne ne le porte (42703). Pour un nom connu seulement à l’exécution, vérifiez-le, puis typez-le comme le `Column` de la table.
- À partir de la 6.11.0, sur une telle table, le `where` d’un raccourci, le `having` de `select()`, `exists()` et `isInSelect()`, ainsi que les lignes d’`insert()`, d’`upsert()` et d’`update()`, n’acceptent plus une chaîne, un `String` ni un tableau, quel que soit le schéma (2345, 2769) : `db.select('films', 'titel')`. Zapatos 6.6.1 exécutait la chaîne comme une colonne, `WHERE "titel"` (42703 quand aucune colonne ne porte ce nom ; quand elle nommait une colonne booléenne, la requête filtrait par cette colonne), et envoyait une ligne donnée en chaîne comme ses caractères, `("0", "1", …)` (42703). Écrivez un Whereable, `{ subtitled: true }`, ou un fragment, `` db.sql<s.screenings.SQL>`${'subtitled'}` `` ([#674](https://github.com/AlexandreDemartin/pgcast/issues/674)). Sur une table dont toutes les colonnes sont optionnelles, l’une nommée `length`, `[]`, un tableau de lignes contenu dans une variable, un tableau `readonly` et un tableau `as const`, contenu dans une variable ou écrit dans l’appel, donnés à `insert()` ou à `upsert()`, sont désormais typés comme un tableau, comme ils s’exécutent, et non comme une seule ligne ([#683](https://github.com/AlexandreDemartin/pgcast/issues/683)).


## 4. Trouver les appels dont le résultat change {#find-the-calls-whose-result-changes}

pgcast corrige, sans option à activer, ce sur quoi aucun code ne pouvait compter dans Zapatos 6.6.1 : un appel que Postgres ou le type refusait, qui faisait le contraire de son nom, ou qui laissait une chaîne injecter du SQL. Quelques-uns de ces appels s’exécutaient bel et bien, et donnent maintenant d’autres lignes, ou lèvent une erreur.

Cherchez dans votre code la première colonne de chaque tableau ci-dessous. Chaque changement de la colonne Que faire donne le même résultat sous Zapatos 6.6.1, vous pouvez donc le faire avant de passer à pgcast ; seul celui du `jsonb` ne trouve ses lignes que sous pgcast.

### Conditions {#conditions}

<div class="stack">

| Votre code | Zapatos 6.6.1 | pgcast | Que faire |
|---|---|---|---|
| [`not()`](/fr/conditions#conditions.not) d’un fragment avec un `OR` ou un `AND` nu : sur `release_year`, `` not(db.sql`${db.self} = 1974 OR ${db.self} = 1991`) `` | `(NOT a) OR b`, donc aussi le film de 1991 | `(NOT (a OR b))`<!-- probe: db.conditions.not(db.sql`a OR b`) --> | pour les anciennes lignes, `` db.sql`(NOT ${db.self} = 1974) OR ${db.self} = 1991` `` |
| [`and()`](/fr/conditions#conditions.and) d’un fragment avec un `OR` nu et un autre opérande : `` and(db.sql`${'id'} = 1000 OR ${'id'} = 1001`, { studio_id: 1001 }) `` | `a OR (b AND c)`, donc aussi le film 1000 | `((a OR b) AND (c))`<!-- probe: db.conditions.and(db.sql`a OR b`, db.sql`c`) --> | pour les anciennes lignes, un seul fragment : <code v-pre>db.sql&#96;${'id'} = 1000 OR (${'id'} = 1001 AND ${{ studio_id: 1001 }})&#96;</code> |
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

En 6.x, lancez vos tests et votre application avec les avertissements de dépréciation activés. Par exemple, pgcast 6.7.0 émet cet avertissement la première fois que Postgres répond à un `COMMIT` par `ROLLBACK` après que le callback a intercepté une erreur de requête.

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
| `PGCAST_DEP001` | Un upsert de plusieurs lignes mettrait à jour une colonne absente d’une ligne. | Ajoutez la clé de cette colonne à chaque ligne ou précisez `updateColumns`. |
| `PGCAST_DEP002` | Une valeur vaut `undefined` dans une ligne, ou la seule raison de mettre à jour une colonne est la présence d’une clé à `undefined` dans `updateValues`. | Utilisez `null` pour mettre la colonne à `NULL` ou omettez la clé pour conserver sa valeur lors d’une mise à jour. Voir la [règle de `updateValues`](/fr/insert#undefined-values). |
| `PGCAST_DEP003` | une [`transaction()`](/fr/transaction#transaction) dont le callback intercepte l’erreur d’une requête et se termine : Postgres répond au `COMMIT` par `ROLLBACK`, et rien n’est enregistré ([Laisser passer l’erreur](/fr/retries#let-the-error-through)) | laissez l’erreur sortir du callback, ou faites `ROLLBACK TO` un `SAVEPOINT` avant de continuer ; ou [`transactionRequiresCommit`](/fr/runtime-config#Config.transactionRequiresCommit), et une telle transaction est rejetée |
| `PGCAST_DEP004` en 6.x | un [`sum()`, `avg()`, `min()` ou `max()`](/fr/aggregates#typed-by-column) dont le résultat vaut `null` ou est absent, ou un minimum ou un maximum dont la valeur renvoyée par `pg` est d’un autre type que `number` | activez [`aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn) et déclarez-le dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes). `tsc` signale alors les utilisations incompatibles avec le nouveau type, et `?? 0` permet de garder `0` |
| `PGCAST_DEP005` | une [`transaction()`](/fr/transaction#transaction) qui reçoit un client sur lequel vous avez envoyé `BEGIN` : son `COMMIT` ou son `ROLLBACK` termine votre transaction ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)) | ouvrez la transaction extérieure avec `transaction()`, ou donnez le pool à cet appel, pour une transaction à lui, qui est commitée séparément de la transaction extérieure, ne voit pas les lignes non commitées de celle-ci, et reste bloquée (sauf si `lock_timeout` est défini) si elle écrit ou verrouille une ligne que la transaction extérieure a écrite ou verrouillée, ou insère une clé que celle-ci a insérée (deux verrous `FOR SHARE` n’entrent pas en conflit) ; ou [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient), et un tel appel est rejeté avant d’envoyer son `START TRANSACTION` |
| `PGCAST_DEP007` | une [`transaction()`](/fr/transaction#transaction) qui reçoit le client d’une transaction à un niveau qui ne vaut pas pour le sien, `serializable()` avec celui de `readCommitted()` : son callback s’exécute au niveau extérieur ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)) | ouvrez la transaction extérieure à un niveau qui vaut pour l’appel intérieur, ou donnez le pool à cet appel, pour une transaction à lui, qui est commitée séparément de la transaction extérieure, ne voit pas les lignes non commitées de celle-ci, et reste bloquée (sauf si `lock_timeout` est défini) si elle écrit ou verrouille une ligne que la transaction extérieure a écrite ou verrouillée, ou insère une clé que celle-ci a insérée (deux verrous `FOR SHARE` n’entrent pas en conflit) ; ou [`transactionRequiresSatisfyingLevel`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel), et un tel appel est rejeté avant son callback |

</div>

## 6. Activer les opt-ins {#turn-on-the-opt-ins}

En 6.x, quand une exécution se termine sans avertissement ou que vous avez vérifié chaque appel signalé, activez les options une seule fois, avant la première requête :

```ts
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
db.setConfig({
  upsertRequiresSameKeys: true, undefinedMeansMissing: true,
  transactionRequiresCommit: true, transactionRequiresIdleClient: true,
  transactionRequiresSatisfyingLevel: true, aggregatesTypedByColumn: true,
});
```

En 6.x, lancez `npx zapatos` pour repérer les options du générateur qui modifieraient le schéma généré. Le générateur transmet ses notes de migration via `warningListener`.

## Passer de pgcast 7.x à la 8.0 {#from-8-0}

La 8.0.0 n’est pas encore publiée : cette section recense ses changements au fur et à mesure. D’ici sa sortie, la 7.x est la version à installer ([migration vers la 7.0](#from-7-0)). Une fois la 8.0.0 publiée, conservez l’alias du paquet et choisissez la commande qui correspond à vos imports.

::: code-group

```sh [zapatos/db]
npm install zapatos@npm:@pgcast/pgcast@^8
```

```sh [pgcast/db]
npm install pgcast@npm:@pgcast/pgcast@^8
```

:::

Chaque option ci-dessous a quitté `Config`. La donner dans un objet littéral ne compile plus (TS2353). Donnée quand même, depuis une variable, du JavaScript, `pgcastconfig.json`, `zapatosconfig.json` ou l’argument JSON de la CLI, une option d’exécution fait lever une erreur à `setConfig()`, et une option du générateur fait rejeter la promesse de `generate()` et de `check()`, et arrêter la CLI, avant la première requête et sans écrire aucun fichier, sauf si sa valeur est celle que la 8.0 applique toujours, `null` ou `undefined`, que la configuration écarte alors. Un programme ou une configuration qui n’a jamais donné l’option ne voit aucun changement.

### `undefinedMeansMissing` {#from-8-0-undefinedMeansMissing}

La 8.0 fait toujours ce que faisait `undefinedMeansMissing: true`, la valeur par défaut de la 7.x : une valeur `undefined` dans `insert()`, `update()` et `upsert()` est une clé absente, `DEFAULT` dans `insert()` et omise dans `update()` et `upsert()` ([Une valeur `undefined`](/fr/insert#undefined-values)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `undefinedMeansMissing was removed in 8.0, which always does what undefinedMeansMissing: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-undefinedMeansMissing`<!-- message -->. Une fois l’option retirée, une cellule `undefined` vaut `DEFAULT` dans `insert()`, et non `NULL`, et `update()` laisse sa colonne telle quelle ; un `update()` à qui il ne reste aucune colonne lève "nothing to update…"<!-- message -->.
- **Trouver les appels** : `grep -rn undefinedMeansMissing`. Une valeur qui n’est `undefined` qu’à l’exécution échappe à `grep` : en 7.x, retirez d’abord l’option et lancez vos tests.
- **Avant → après** : là où `undefined` voulait dire « effacer », donnez `null`. `db.update('films', { tagline: form.tagline }, { id: 1002 })`<!-- tsc: const form = { tagline: undefined as string | undefined }; … --> devient `db.update('films', { tagline: form.tagline ?? null }, { id: 1002 })`<!-- tsc: const form = { tagline: undefined as string | undefined }; … -->.

### `upsertRequiresSameKeys` {#from-8-0-upsertRequiresSameKeys}

La 8.0 fait toujours ce que faisait `upsertRequiresSameKeys: true`, la valeur par défaut de la 7.x : un upsert de plusieurs lignes dont la mise à jour implicite inclut une colonne absente d’une ligne lève une erreur à l’appel, sauf si la cible du conflit nomme cette colonne, si `updateValues` lui donne une valeur définie ou si `updateColumns` dit quelles colonnes mettre à jour ([Lignes aux clés différentes](/fr/insert#upsert-different-keys)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `upsertRequiresSameKeys was removed in 8.0, which always does what upsertRequiresSameKeys: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-upsertRequiresSameKeys`<!-- message -->. Une fois l’option retirée, un tel lot lève "rows have different keys: pass updateColumns, or give every row the same keys"<!-- message -->, là où la 7.x avec `false` mettait la cellule absente à `DEFAULT` par-dessus la valeur stockée.
- **Trouver les appels** : `grep -rn upsertRequiresSameKeys`. Chaque lot aux clés différentes lève une erreur à l’appel, donc vos tests le trouvent.
- **Avant → après** : `db.upsert('ratings', [{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4 }], ['film_id', 'stars'])`<!-- tsc -->, avec `false`, devient soit chaque ligne avec chaque clé et la valeur voulue, `db.upsert('ratings', [{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4, votes: 1 }], ['film_id', 'stars'])`<!-- tsc -->, soit un [`updateColumns`](/fr/insert#upsert-options) qui ne nomme que les clés que toutes les lignes donnent, `db.upsert('ratings', [{ film_id: 1002, stars: 5, votes: 3 }, { film_id: 1002, stars: 4, votes: 1 }], ['film_id', 'stars'], { updateColumns: ['votes'] })`<!-- tsc -->. Une clé absente d’une ligne met toujours la valeur stockée de cette ligne à `DEFAULT`, sans erreur, comme le faisait `false`.

### `transactionRequiresCommit` {#from-8-0-transactionRequiresCommit}

La 8.0 fait toujours ce que faisait `transactionRequiresCommit: true`, la valeur par défaut de la 7.x : quand le callback de [`transaction()`](/fr/transaction#transaction) intercepte l’erreur d’une requête et se termine, Postgres répond au `COMMIT` par `ROLLBACK`, rien n’est enregistré, et la promesse est rejetée sans retry ([Laisser passer l’erreur](/fr/retries#let-the-error-through)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `transactionRequiresCommit was removed in 8.0, which always does what transactionRequiresCommit: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-transactionRequiresCommit`<!-- message -->. Une fois l’option retirée, une telle transaction est rejetée avec "the transaction was rolled back, not committed: a query in it failed and the callback caught the error, so Postgres answered COMMIT with ROLLBACK; let the error out of the callback, or ROLLBACK TO a SAVEPOINT before going on"<!-- message -->, là où la 7.x avec `false` se résolvait avec la valeur renvoyée par le callback.
- **Trouver les appels** : `grep -rn transactionRequiresCommit`, puis chaque `catch` autour d’une requête dans un callback de `transaction()`. Chaque `catch` qui intercepte une erreur fait rejeter la promesse, donc vos tests le trouvent dès qu’ils y passent.
- **Avant → après** : avec `false`, la promesse se résolvait, et ni la réservation ni la note n’étaient enregistrées :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.serializable(pool, async txnClient => {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(txnClient);
  try {
    await db.insert('ratings', { film_id: 1002, stars: 5 }).run(txnClient);
  } catch { }
});
```

Exécutez la requête qui peut échouer dans un [`savepoint()`](/fr/transaction#savepoint), et laissez passer les erreurs 40001 et 40P01, que `transaction()` réessaie. La réservation est enregistrée, avec ou sans la note :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
await db.serializable(pool, async txnClient => {
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(txnClient);
  await db.savepoint(txnClient, spClient => db.insert('ratings', { film_id: 1002, stars: 5 }).run(spClient))
    .catch((err: unknown) => {
      if (db.isDatabaseError(err, 'TransactionRollback_SerializationFailure', 'TransactionRollback_DeadlockDetected')) throw err;
    });
});
```

### `transactionRequiresIdleClient` {#from-8-0-transactionRequiresIdleClient}

La 8.0 fait toujours ce que faisait `transactionRequiresIdleClient: true`, la valeur par défaut de la 7.x : avec un client sur lequel vous avez envoyé `BEGIN`, la promesse de [`transaction()`](/fr/transaction#transaction) est rejetée avant l’envoi de son `START TRANSACTION`, et votre transaction reste ouverte pour votre `COMMIT` ou votre `ROLLBACK` ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)). pg signale le bloc à partir de pg 8.21 ; avec les versions antérieures, `transaction()` s’exécute comme dans Zapatos 6.6.1.

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `transactionRequiresIdleClient was removed in 8.0, which always does what transactionRequiresIdleClient: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-transactionRequiresIdleClient`<!-- message -->. Une fois l’option retirée, un tel appel est rejeté avec "transaction() was given a client inside a transaction block, so its COMMIT or ROLLBACK would end that transaction: COMMIT or ROLLBACK it first, or run the queries on that client without transaction()"<!-- message -->, là où la 7.x avec `false` commitait votre transaction, ou l’annulait.
- **Trouver les appels** : `grep -rn transactionRequiresIdleClient`, puis `grep -rn "'BEGIN"` : chaque client sur lequel vous envoyez `BEGIN` avant de le donner à un raccourci de transaction.
- **Avant → après** : avec `false`, le `COMMIT` de `readCommitted()`, au niveau propre à la session, commitait la réservation et la note, et le `ROLLBACK` de l’appelant ne trouvait plus de transaction :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(client);
  await db.readCommitted(client, txnClient => db.insert('ratings', { film_id: 1002, stars: 5 }).run(txnClient));
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

Dans votre propre bloc, exécutez ce travail dans un [`savepoint()`](/fr/transaction#savepoint), qui s’exécute au niveau de votre bloc : le `ROLLBACK` de l’appelant annule les deux lignes. Ou ouvrez la transaction avec `db.readCommitted(pool, …)` à la place de votre `BEGIN`, pour ses retries :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await db.insert('seat_bookings', { screening_id: 1002, seat: 'D4', customer: 'Hollis Brandt' }).run(client);
  await db.savepoint(client, spClient => db.insert('ratings', { film_id: 1002, stars: 5 }).run(spClient));
  await client.query('ROLLBACK');
} finally {
  client.release();
}
```

### `transactionRequiresSatisfyingLevel` {#from-8-0-transactionRequiresSatisfyingLevel}

La 8.0 fait toujours ce que faisait `transactionRequiresSatisfyingLevel: true`, la valeur par défaut de la 7.x : un appel imbriqué qui reçoit le client d’une transaction à un niveau d’isolation qui ne satisfait pas le sien ([`IsolationSatisfying`](/fr/transaction#IsolationSatisfying)) est rejeté avant son callback, et la transaction extérieure est annulée, sauf si son callback intercepte l’erreur ([Transmettre une transaction](/fr/transaction#passing-a-transaction-through)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `transactionRequiresSatisfyingLevel was removed in 8.0, which always does what transactionRequiresSatisfyingLevel: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-transactionRequiresSatisfyingLevel`<!-- message -->. Une fois l’option retirée, un tel appel est rejeté avec "transaction() at … was given the client of a transaction at …, so its callback would run at …: open the outer transaction at a level that satisfies … (IsolationSatisfying)"<!-- message -->, chaque `…` étant un niveau de l’appel, là où la 7.x avec `false` exécutait son callback au niveau de la transaction extérieure.
- **Trouver les appels** : `grep -rn transactionRequiresSatisfyingLevel`, puis chaque raccourci de transaction qui reçoit un client plutôt qu’un pool. TypeScript y accepte le client de n’importe quel niveau : c’est l’erreur, qui nomme les deux niveaux, qui permet à vos tests de trouver chacun d’eux.
- **Avant → après** : avec `false`, `db.readCommitted(pool, txnClient => db.serializable(txnClient, inner => db.insert('ratings', { film_id: 1002, stars: 5 }).run(inner)))`<!-- tsc --> exécutait son `insert()` en `READ COMMITTED`. Ouvrez la transaction extérieure au niveau dont l’appel imbriqué a besoin : `db.serializable(pool, txnClient => db.serializable(txnClient, inner => db.insert('ratings', { film_id: 1002, stars: 5 }).run(inner)))`<!-- tsc -->.

### `aggregatesTypedByColumn` {#from-8-0-aggregatesTypedByColumn}

La 8.0 fait toujours ce que faisait `aggregatesTypedByColumn: true`, la valeur par défaut de la 7.x : [`sum()`](/fr/aggregates#sum), [`avg()`](/fr/aggregates#avg), [`min()`](/fr/aggregates#min) et [`max()`](/fr/aggregates#max) donnent `null` quand aucune ligne ne correspond, et `min()` et `max()` donnent la valeur de la colonne telle que `pg` la lit, là où `false` en donnait `Number()` ([Typé par colonne](/fr/aggregates#typed-by-column)). Le SQL et `count()` ne changent pas.

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, `setConfig()` lève `aggregatesTypedByColumn was removed in 8.0, which always does what aggregatesTypedByColumn: true did; delete it from setConfig(): https://pgcast.dev/switching#from-8-0-aggregatesTypedByColumn`<!-- message -->. Une fois l’option retirée, un `sum()` sur un ensemble vide donne `null` là où la 7.x avec `false` donnait `0`, un `min()` d’un `timestamptz` un `Date` là où elle donnait des millisecondes, et un `max()` d’un `text` le texte là où elle donnait `NaN`.
- **Trouver les appels** : `grep -rn aggregatesTypedByColumn`. Puis `tsc` : quoi que contienne un [`ConfigTypes`](#from-8-0-ConfigTypes) resté de la 7.x, les quatre agrégats sont typés par colonne, donc un calcul sur une somme donne TS18047, et une date minimale passée à un `number` TS2322.
- **Avant → après** : avec `false`, `const total = await db.sum('films', db.all, { columns: ['runtime_minutes'] }).run(pool)`<!-- tsc --> donnait `0` sur un ensemble vide. Pour obtenir le même `number` : `const total = (await db.sum('films', db.all, { columns: ['runtime_minutes'] }).run(pool)) ?? 0`<!-- tsc -->.

### `ConfigTypes` {#from-8-0-ConfigTypes}

La 8.0 supprime l’interface `ConfigTypes` avec `aggregatesTypedByColumn`, la seule clé qu’elle lisait : les agrégats sont typés par colonne, comme une interface `ConfigTypes` vide les typait en 7.x.

- **Ce que vous voyez** : une déclaration `declare module 'zapatos/db' { interface ConfigTypes { … } }` restée de la 7.x compile toujours et ne change aucun type, `aggregatesTypedByColumn: false` compris. Une fois la déclaration retirée, nommer `db.ConfigTypes` donne TS2694.
- **Trouver les appels** : `grep -rn ConfigTypes`.
- **Avant → après** : supprimez la déclaration, et le fichier s’il ne contenait rien d’autre. Si elle contenait `false`, lisez d’abord [`aggregatesTypedByColumn`](#from-8-0-aggregatesTypedByColumn).

### `typeEnumsAcrossSchemas` {#from-8-0-typeEnumsAcrossSchemas}

La 8.0 fait toujours ce que faisait `typeEnumsAcrossSchemas: true`, la valeur par défaut de la 7.x : un enum d’un autre schéma est cherché dans son propre schéma et écrit par ses labels ([`typeEnumsAcrossSchemas`](/fr/generator#generate.typeEnumsAcrossSchemas)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, le générateur lève `typeEnumsAcrossSchemas was removed in 8.0, which always does what typeEnumsAcrossSchemas: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-typeEnumsAcrossSchemas`. Une fois l’option retirée et les types régénérés, une colonne d’un enum d’un autre schéma prend les labels de cet enum : dans l’exemple du générateur, écrire `'director'` dans `prints.keeper` ne compile plus, et plus aucune colonne n’utilise les placeholders `any` comme `PgPrint_format` (leurs fichiers restent).
- **Trouver les appels** : `grep -rn typeEnumsAcrossSchemas` dans vos fichiers de configuration et vos scripts, puis régénérez les types et lancez `tsc` : chaque écriture d’un label que l’enum de l’autre schéma n’a pas ne compile plus. L’import d’un placeholder qu’aucune colonne n’utilise compile toujours, puisque son fichier reste : `grep -rnE "(zapatos|pgcast)/custom"` les liste.
- **Avant → après** : retirez `"typeEnumsAcrossSchemas": false` de `pgcastconfig.json`, ou `typeEnumsAcrossSchemas: false` de la configuration passée à `generate()`. Ensuite, `import type { PgPrint_format } from 'zapatos/custom'` devient `import type { prints } from 'zapatos/schema'`, et `PgPrint_format` devient `prints.Selectable['format']`, `('nitrate' | 'safety' | 'digital')`. `db.update('prints', { keeper: 'director' }, { id: 1 })`, qui compilait avec `public.crew_job` et que Postgres refusait, prend un label d’`archive.crew_job` : `db.update('prints', { keeper: 'archivist' }, { id: 1 })`.

### `enumOrder` {#from-8-0-enumOrder}

La 8.0 fait toujours ce que faisait `enumOrder: "declared"`, la valeur par défaut de la 7.x : les labels d’un enum suivent leur ordre de déclaration, celui que Postgres utilise pour `ORDER BY`, les comparaisons et `enum_range()` ([`enumOrder`](/fr/generator#generate.enumOrder)).

- **Ce que vous voyez** : avec `"alphabetical"`, ou toute valeur autre que `"declared"`, `null` et `undefined`, le générateur lève `enumOrder was removed in 8.0, which always does what enumOrder: "declared" did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-enumOrder`. Une fois l’option retirée et les types régénérés, seul `every.<name>` change, puisqu’une union est le même type dans n’importe quel ordre : `every.crew_job[0]` vaut `'director'`, et non `'cinematographer'`.
- **Trouver les appels** : `grep -rn enumOrder` dans vos fichiers de configuration et vos scripts, puis `grep -rnE 'every\.\w+\['` pour le code qui lit un label par sa position ; `tsc` trouve un tuple de tous les labels écrit dans l’ordre alphabétique.
- **Avant → après** : retirez `"enumOrder": "alphabetical"`. Un label lu par sa position, `type Lead = s.every.crew_job[0]`<!-- tsc: import type * as s from 'zapatos/schema'; … -->, `'cinematographer'` en 7.x avec `"alphabetical"`, devient ce label écrit tel quel, `type Lead = 'cinematographer'`<!-- tsc -->. Un tuple de tous les labels, `const jobs: s.every.crew_job = ['cinematographer', 'composer', 'director', 'editor', 'writer']`, prend l’ordre de déclaration, `const jobs: s.every.crew_job = ['director', 'writer', 'editor', 'cinematographer', 'composer']`<!-- tsc: import type * as s from 'zapatos/schema'; … -->.

### `uniqueIndexConstraintsOnly` {#from-8-0-uniqueIndexConstraintsOnly}

La 8.0 fait toujours ce que faisait `uniqueIndexConstraintsOnly: true`, la valeur par défaut de la 7.x : le `UniqueIndex` d’une relation, les noms qu’accepte [`constraint()`](/fr/insert#constraint), ne liste que ses contraintes `UNIQUE` et `PRIMARY KEY` non différables qui s’appuient sur un index valide autre qu’un index d’exclusion ([`uniqueIndexConstraintsOnly`](/fr/generator#generate.uniqueIndexConstraintsOnly)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, le générateur lève `uniqueIndexConstraintsOnly was removed in 8.0, which always does what uniqueIndexConstraintsOnly: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-uniqueIndexConstraintsOnly`. Une fois l’option retirée et les types régénérés, les autres index uniques quittent `UniqueIndex` : dans l’exemple du générateur, la contrainte différable `festival_entries_slot_key` et l’index seul `festival_entries_live_idx`. Un `constraint()` qui nomme l’un d’eux ne compile plus (TS2345) ; Postgres les refusait déjà tous deux avec `DO UPDATE` (55000, 42704). Le paramètre de sortie `uniqueIndexesNotArbiters` de `definitionForRelationInSchema()` reste vide.
- **Trouver les appels** : `grep -rn uniqueIndexConstraintsOnly` dans vos fichiers de configuration et vos scripts, puis régénérez les types et lancez `tsc` : chaque `constraint()` qui nomme un nom sorti de la liste ne compile plus. Un objet littéral `Record` typé par une union devenue `never` compile toujours avec l’ancienne clé ([Cibles de conflit nommées en 7.0](#named-conflict-targets)) : `grep -rn UniqueIndex` les liste, et `grep -rn uniqueIndexesNotArbiters` le code qui lit le paramètre de sortie.
- **Avant → après** : retirez `"uniqueIndexConstraintsOnly": false`. Un type qui lisait tous les index uniques dans `UniqueIndex`, comme `Record<s.festival_entries.UniqueIndex, string>`, les lit dans `Constraint` avec [`constraintNames: true`](/fr/generator#generate.constraintNames) : `Partial<Record<s.festival_entries.Constraint, string>>`, dont les noms comprennent `festival_entries_live_idx`. Un `DO NOTHING` nommé sur une clé `WITHOUT OVERLAPS`, que Postgres 18 accepte et que `UniqueIndex` laisse de côté, devient une requête [`sql`](/fr/sql-template) explicite avec `ON CONFLICT ON CONSTRAINT … DO NOTHING`.

### `domainsTypedByContext` {#from-8-0-domainsTypedByContext}

La 8.0 fait toujours ce que faisait `domainsTypedByContext: true`, la valeur par défaut de la 7.x : un domaine sur `int8`, `numeric`, `bytea`, `money` ou une date, ou sur un tableau de l’un d’eux, est typé selon le contexte, comme son type de base, tant que son placeholder contient ce que le générateur y a écrit ; un domaine sur un domaine, ou un tableau d’un domaine, prend les types du type de base de son domaine le plus intérieur ([`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, le générateur lève `domainsTypedByContext was removed in 8.0, which always does what domainsTypedByContext: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-domainsTypedByContext`. Une fois l’option retirée et les types régénérés, dans l’exemple du générateur, `seat_bookings.ticket` est un `number` dans une ligne d’un raccourci avec le parser JSON par défaut, et `insert()` accepte `ticket: 1`, que la 7.x refusait avec `false` (TS2769). `vip_ticket` et `tickets`, `any` en 7.x avec `false`, prennent les types de leur type de base : `insert()` refuse `vip_ticket: 'abc'` (TS2769). Les paramètres de sortie `domainsNotByContext` et `domainsUnderDomains` de `definitionForRelationInSchema()` restent vides.
- **Trouver les appels** : `grep -rn domainsTypedByContext` dans vos fichiers de configuration et vos scripts, puis régénérez les types et lancez `tsc` : chaque lecture d’une ligne d’un raccourci qui attend la chaîne du placeholder, et chaque écriture que refuse le type de base, ne compile plus. `grep -rnE 'domainsNotByContext|domainsUnderDomains'` liste le code qui lit les paramètres de sortie.
- **Avant → après** : retirez `"domainsTypedByContext": false`. Pour qu’une colonne garde le type de son placeholder dans les cinq interfaces, comme avec `false`, donnez au placeholder un autre type que celui généré, comme `export type PgTicket_no = number | db.Int8String` ([Quand un placeholder ne compile pas](/fr/custom-types#when-a-placeholder-does-not-compile)), ou `unknown` pour un domaine sur un domaine : un placeholder modifié en `any` compte comme laissé tel que généré.

### `rejectOnQueryError` {#from-8-0-rejectOnQueryError}

La 8.0 fait toujours ce que faisait `rejectOnQueryError: true`, la valeur par défaut de la 7.x : en cas d’échec de connexion ou de requête, la promesse de `generate()`, de `tsForConfig()` ou de `check()` est rejetée avec l’erreur d’origine, avant toute écriture de fichier ([`rejectOnQueryError`](/fr/generator#generate.rejectOnQueryError)). La CLI l’affiche comme en 7.x, `*** error <n> ***` et l’erreur sur la sortie standard, et quitte avec le code 1, avec ou sans `--check` ([CLI](/fr/generator#cli)).

- **Ce que vous voyez** : avec `false`, ou toute valeur autre que `true`, `null` et `undefined`, le générateur lève `rejectOnQueryError was removed in 8.0, which always does what rejectOnQueryError: true did; delete it from the generator's config: https://pgcast.dev/switching#from-8-0-rejectOnQueryError`, et la CLI aussi quand son fichier de configuration ou son argument JSON la contient, alors que la 7.x l’y ignorait. Une fois l’option retirée, une requête qui échoue rejette la promesse, là où la 7.x avec `false` affichait l’erreur et arrêtait le processus. Si l’erreur n’est pas interceptée, Node l’affiche sur la sortie d’erreur et quitte avec le code 1 ; interceptée, votre programme continue. Sans la clé, la CLI affiche l’erreur et quitte comme en 7.x.
- **Trouver les appels** : `grep -rn rejectOnQueryError` dans vos fichiers de configuration et vos scripts ; chaque `false` lève aussi une erreur dès le démarrage du générateur, avant la première requête.
- **Avant → après** : `await generate({ …, rejectOnQueryError: false })` devient `await generate({ … }).catch(e => { console.error(e); process.exit(1); })` ; dans un fichier de configuration, retirez `"rejectOnQueryError": false`.

## Passer de pgcast 6.x à la 7.0 {#from-7-0}

En 6.x, commencez par [repérer les avertissements](#read-the-warnings) et [activer les corrections](#turn-on-the-opt-ins). Pour installer la 7.x, conservez l’alias du paquet. Choisissez la commande qui correspond à vos imports.

::: code-group

```sh [zapatos/db]
npm install zapatos@npm:@pgcast/pgcast@^7
```

```sh [pgcast/db]
npm install pgcast@npm:@pgcast/pgcast@^7
```

:::

Même si la 6.x n’a émis aucun avertissement, vérifiez [les écritures par lots, les agrégats et les callbacks de transaction en lecture seule](#runtime-migration), [les conditions sur tableaux](#array-condition-types), [les types générés](#regenerate-for-7-0) et [les peer dependencies facultatives pour la vérification des types](/fr/install#requirements). Si vous comptiez sur l’installation automatique de ces dépendances pour vérifier les types, ajoutez uniquement celle qui manque à vos dépendances de développement (`typescript` ou `@types/pg`). Lancez `npm install --save-dev typescript @types/pg` si les deux manquent. En JavaScript, seule la peer dependency `pg` est requise. [#592](https://github.com/AlexandreDemartin/pgcast/issues/592).

### Vérifier les appels au runtime {#runtime-migration}

Les six options ci-dessous valent désormais `true` par défaut. Pour conserver un comportement de la 6.x, réglez l’option correspondante sur `false` dans `db.setConfig()`. Ces anciens réglages restent disponibles sans avertissement pendant toute la 7.x et disparaissent en 8.0.

| Réglage temporaire | Ce qu’il faut vérifier en 7.0 | Avec le réglage 6.x |
|---|---|---|
| [`undefinedMeansMissing: false`](/fr/runtime-config#Config.undefinedMeansMissing) | À l’insertion, une cellule à `undefined` reçoit la valeur par défaut de la colonne. Une mise à jour avec `tagline: undefined` conserve l’accroche si elle modifie aussi `title`. Pour effacer l’accroche, passez `null`. | Dans une ligne, une valeur `undefined` est transmise à Postgres sous forme de `NULL`. Voir la [règle de `updateValues`](/fr/insert#undefined-values). |
| [`upsertRequiresSameKeys: false`](/fr/runtime-config#Config.upsertRequiresSameKeys) | Si une seule ligne d’un lot fournit `tagline` et que la mise à jour implicite écraserait cette colonne, l’upsert lève une erreur dès sa construction. Une propriété non énumérable compte désormais comme absente, même si les deux corrections étaient activées en 6.x. Pour écrire sa valeur, utilisez `{ ...row, tagline: row.tagline }`. Voir les [exceptions pour la cible de conflit, `updateValues` et `updateColumns`](/fr/insert#upsert-options). | Si la colonne manque dans une ligne, sa valeur par défaut peut remplacer la valeur stockée. |
| [`transactionRequiresCommit: false`](/fr/runtime-config#Config.transactionRequiresCommit) | Si le callback intercepte une erreur de requête et que Postgres répond au `COMMIT` par `ROLLBACK`, la promesse est rejetée. [Erreurs](/fr/transaction#errors). | La promesse se résout avec le résultat du callback. |
| [`transactionRequiresIdleClient: false`](/fr/runtime-config#Config.transactionRequiresIdleClient) | Après votre propre `BEGIN`, la promesse est rejetée si le client signale toujours une transaction ouverte à la seconde vérification. Terminez d’abord votre transaction. Sur ce client, attendez la fin de chaque appel à un raccourci de transaction avant de lancer le suivant. [Votre propre `BEGIN`](/fr/transaction#your-own-begin). | Le raccourci peut mettre fin à la transaction de l’appelant. |
| [`transactionRequiresSatisfyingLevel: false`](/fr/runtime-config#Config.transactionRequiresSatisfyingLevel) | Dans un `readCommitted()`, la promesse de `serializable()` est rejetée avant l’exécution de son callback. Ouvrez la transaction extérieure au niveau voulu. [Transmettre une transaction](/fr/transaction#passing-a-transaction-through). | Le callback imbriqué s’exécute au niveau d’isolation de la transaction extérieure. |
| [`aggregatesTypedByColumn: false`](/fr/runtime-config#Config.aggregatesTypedByColumn) | `sum()` renvoie `null` en l’absence de lignes. Sur une colonne de dates, `min()` renvoie la date minimale. Traitez le cas `null` avant tout calcul. [Typé par colonne](/fr/aggregates#typed-by-column). | Un appel direct à `.run()` applique `Number()`. Une somme sans lignes vaut donc zéro. Dans `extras`, cette somme vaut `null` en JSON et la date minimale reste une chaîne de caractères. |

<CastPanel example="switching_undefined">

<<< ../examples/switching_undefined.ts{ts twoslash}

</CastPanel>

Pendant toute la 7.x, conserver les résultats numériques d’un appel direct à un agrégat demandait le littéral `false` aux deux endroits, dans le module que vous importez (`pgcast/db` si vous utilisez ce nom) ; la 8.0 supprime les deux ([`aggregatesTypedByColumn`](#from-8-0-aggregatesTypedByColumn), [`ConfigTypes`](#from-8-0-ConfigTypes)).

```ts
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: false }
}
db.setConfig({ aggregatesTypedByColumn: false });
```

<div class="stack">

| Votre code | Zapatos 6.6.1 et pgcast 6.x | pgcast 7.0 | Que faire |
|---|---|---|---|
| Une implémentation de `SelectOneSignatures` ou de `SelectExactlyOneSignatures` qui appelle `select()` avec un mode | Compile avec les signatures numériques de la 6.x | TS2322 (TS2375 avec `exactOptionalPropertyTypes`) | Appelez respectivement `selectOne()` ou `selectExactlyOne()`. |
| Un spread exporté du fragment qui calcule la date minimale, avec `declaration: true` | Compile avec les signatures numériques de la 6.x | TS4023 | Exportez le fragment lui-même. |
| [#694](https://github.com/AlexandreDemartin/pgcast/issues/694) · `db.serializableRO(pool, countSeats)`, où le paramètre de `countSeats` est de type `db.TxnClient<db.IsolationLevel.Serializable \| db.IsolationLevel.SerializableRO>` | Compile | TS2345 avec `strictFunctionTypes` (activé par `strict`), car TypeScript vérifie le callback avec le type de client élargi | Avec `pg`, donnez au paramètre le type [`db.TxnClientForSerializableRO`](/fr/transaction#TxnClientForSerializableRO). Avec un adaptateur dont le client est de type `C`, utilisez `db.TxnClientLike<C, db.IsolationSatisfying<db.IsolationLevel.SerializableRO>>`. Si la fonction examine `_zapatos.isolationLevel`, traitez aussi le cas `SerializableRODeferrable`. Les types construits à partir de ces niveaux sont aussi concernés : ajoutez la clé `SerializableRODeferrable` à un `Record` indexé par `IsolationSatisfying<…>`, élargissez le type du client dans une signature écrite à la main et passez un discriminant explicite si des surcharges choisissaient le résultat en fonction des types de clients ordinaire et différable, puisque les deux types coïncident désormais. Les callbacks de `transaction()`, de `savepoint()` et des appels imbriqués qui conservent le client reçoivent aussi le type élargi. |

</div>

### Types des conditions sur tableaux en 7.0 {#array-condition-types}

Pour un fragment contenu dans une variable, remplacez la contrainte scalaire `number` par `number[]`. Vous pouvez simplifier `arrayContains<number[]>([[1]])` en `arrayContains([1])`. Dans un mock de l’ancienne signature, implémentez les deux surcharges. Voir [Les tableaux](/fr/conditions#arrays) pour les opérandes et les callbacks. [#705](https://github.com/AlexandreDemartin/pgcast/issues/705).

Pour `arrayContains()`, `arrayContainedIn()` et `arrayOverlaps()` (`c = db.conditions`) :

- Omettez l’argument de type dans `c.arrayContains(db.parent('genres'))`. Si le type de l’opérande autorise un tableau ou une colonne parente, affinez-le avant l’appel.
- Pour inclure les colonnes parentes dans le type dérivé de l’opérande, utilisez `Parameters<typeof c.arrayContains>[0] | db.ParentColumn`.
- Si votre fonction appelle la condition avec `xs: T[]` et `T extends number[]`, laissez TypeScript inférer son type de retour. L’ancienne annotation `db.SQLFragment<boolean | null, T>` est refusée.

### Régénérer et compiler {#regenerate-for-7-0}

Régénérez le schéma dès que vous changez de version du générateur ou d’option de sortie. Lancez `npx pgcast`, puis examinez le diff du schéma généré. Les quatre premiers anciens réglages du tableau, et le dernier, restent disponibles sans avertissement en 7.x et disparaissent en 8.0 ; les deux choix de parser restent.

| Valeur par défaut en 7.0 | Ce qui change pour votre code | Ancien réglage |
|---|---|---|
| [`typeEnumsAcrossSchemas: true`](/fr/generator#generate.typeEnumsAcrossSchemas) | Une écriture dans `prints.keeper` accepte le label `'archivist'` de l’autre schéma. TypeScript refuse désormais le label local `'director'`. Vérifiez les [collisions de noms et les imports de placeholders](#enum-types). | `false` |
| [`enumOrder: 'declared'`](/fr/generator#generate.enumOrder) | `every.crew_job[0]` vaut `'director'`, le premier label déclaré. Vérifiez le code qui accède aux éléments du tuple par leur indice. | `'alphabetical'` |
| [`uniqueIndexConstraintsOnly: true`](/fr/generator#generate.uniqueIndexConstraintsOnly) | Un index unique sans contrainte, comme `festival_entries_live_idx`, disparaît de `UniqueIndex`. Choisissez une contrainte admissible pour un [upsert à cible nommée](#named-conflict-targets). | `false` |
| [`domainsTypedByContext: true`](/fr/generator#generate.domainsTypedByContext) | Avec le placeholder généré et les parseurs par défaut, un domaine sur `bigint` donne une chaîne dans une ligne brute et un nombre dans le JSON d’un raccourci. Il accepte un `bigint` à l’écriture. [Types des domaines](#domain-and-parser-types). | `false` |
| [`enumArraysTypedAsText: true`](/fr/generator#generate.enumArraysTypedAsText) | Dans une ligne brute, un tableau d’enums est du texte, par exemple `'{writer,editor}'`. Utilisez le tableau du raccourci pour appeler `.map()`, ou choisissez `false` si votre parser renvoie un tableau. | `false` (permanent) |
| [`intervalsTypedAsObjects: true`](/fr/generator#generate.intervalsTypedAsObjects) | Dans une ligne brute, un intervalle possède la méthode `toPostgres()`. Le JSON d’un raccourci conserve le texte. Choisissez `false` si votre parser renvoie du texte. | `false` (permanent) |
| [`rejectOnQueryError: true`](/fr/generator#generate.rejectOnQueryError) | Les promesses de `generate()` et de `tsForConfig()` sont rejetées avec l’erreur de connexion ou de requête d’origine. Relancez l’erreur ou définissez `process.exitCode = 1` si le script doit échouer. Une erreur synchrone d’un écouteur rejette aussi la promesse de génération. Gérez les promesses que renvoie l’écouteur. | `false` (arrêt immédiat, en 7.x) |

Par défaut, la promesse de `check()` est déjà rejetée en cas d’erreur de base de données. La fonction compare le contenu du schéma et, si le générateur produit un index des types personnalisés, celui de cet index. Elle vérifie aussi la présence de chaque placeholder. Si la vérification échoue, la promesse se résout avec `false`. En 7.x, avec `rejectOnQueryError: false`, les trois fonctions arrêtaient le processus en cas d’erreur de base de données ; la 8.0 retire l’option ([`rejectOnQueryError`](#from-8-0-rejectOnQueryError)). Les deux commandes, `pgcast` et `zapatos`, quittent avec le code 1 dans ce cas. Leur option `--check` renvoie aussi le code 1 quand cette vérification renvoie `false`. [Erreurs du générateur](/fr/generator#generate.rejectOnQueryError).

La régénération conserve les placeholders existants dans `custom/`. Générez une seconde copie dans un `outDir` vide, hors de votre projet TypeScript. Comparez ses placeholders aux vôtres et intégrez les changements adaptés à vos parsers. Lancez ensuite `npx tsc` avec le schéma régénéré, puis vos tests.

Trois réglages conservent leur valeur par défaut. `selectExactlyOneChecksForSecondRow` reste désactivé. Si vous l’activez, la promesse d’une requête exécutée seule est rejetée si Postgres renvoie une deuxième ligne. [Les requêtes imbriquées et les copies](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow) demandent une ligne et, avec `withTies: true`, les éventuelles lignes ex æquo. Dans le générateur, [`domainsTypedAsUnions`](/fr/generator#generate.domainsTypedAsUnions) reste un opt-in et [`moduleNames`](/fr/generator#generate.moduleNames) vaut toujours `'zapatos'` par défaut.

### Types des enums en 7.0 {#enum-types}

En 7.0, `prints.keeper` utilise les labels de l’enum de l’autre schéma. Vérifiez les [exceptions du générateur en cas de collision de noms](/fr/generator#generate.typeEnumsAcrossSchemas). Le tuple `every.<name>` suit l’ordre de déclaration des labels dans Postgres. Régénérez les types et lancez `tsc` pour repérer les écritures qui utilisent des labels invalides et le code qui dépend de la position d’un label.

- Lorsque vous générez les types dans un nouveau dossier, les placeholders d’enums d’autres schémas, comme `PgStatus` et `Pg_mood`, sont absents de `zapatos/custom`. Les fichiers existants restent sur disque. Les colonnes concernées sont désormais typées à partir de l’enum de l’autre schéma. Remplacez chaque import par le type de la colonne, par exemple `products.Selectable['status']`, ou réglez `typeEnumsAcrossSchemas: false` en 7.x.
- Si une colonne de type composite d’un autre schéma était typée avec l’enum local du même nom, elle a désormais son propre placeholder. Indiquez-y le type renvoyé par votre parser, ou réglez `typeEnumsAcrossSchemas: false` en 7.x.
- Si vous passez le tableau `columnsTypedByEnumName` à `definitionForRelationInSchema()`, seul le réglage `typeEnumsAcrossSchemas: false` le remplit, en 7.x ; la 8.0 le laisse vide.

Pour un domaine sur un enum d’un autre schéma, [comparez le placeholder existant au nouveau](#regenerate-for-7-0) et intégrez les nouveaux labels.

Dans toutes les versions 7.x, [`typeEnumsAcrossSchemas: false`](/fr/generator#generate.typeEnumsAcrossSchemas) rétablit la recherche dans le schéma de la relation et [`enumOrder: 'alphabetical'`](/fr/generator#generate.enumOrder) rétablit le tri alphabétique des labels. Vous pouvez régler ces options indépendamment, sans note de migration. La 8.0 supprime ces deux anciens comportements ([`typeEnumsAcrossSchemas`](#from-8-0-typeEnumsAcrossSchemas), [`enumOrder`](#from-8-0-enumOrder)).

### Cibles de conflit nommées en 7.0 {#named-conflict-targets}

Régénérez le schéma puis lancez `tsc`. Pour [la table `festival_entries`](/fr/generator#generate.uniqueIndexConstraintsOnly), `constraint()` accepte encore `festival_entries_pkey` et `festival_entries_film_festival_key`. Dans un objet littéral de type `Record<s.festival_entries.UniqueIndex, string>`, gardez ces deux clés et retirez `festival_entries_live_idx` et `festival_entries_slot_key`. Si un upsert cible l’un de ces noms, choisissez une contrainte compatible avec `DO UPDATE`.

Si le type `UniqueIndex` d’une relation devient `never`, un objet littéral de type `Record` dont les clés sont typées par cette union compile encore avec l’ancienne clé. Vérifiez ces objets à la main.

Sur Postgres 18, un upsert qui cible par son nom une clé `WITHOUT OVERLAPS` non différable avec `updateColumns: db.doNothing` compilait et fonctionnait en 6.x. Avec le réglage par défaut de la 7.0, le compilateur refuse ce nom. Pour conserver `DO NOTHING`, écrivez une requête `sql` explicite qui nomme la clé ou utilisez `uniqueIndexConstraintsOnly: false` en 7.x.

Sur une table partitionnée, le type union suit l’index de la table parente. Il exclut une clé différable de la table parente, même si la clé non différable de la partition permet à l’upsert à cible nommée de fonctionner avec `{ reportAction: 'suppress' }`. Utilisez une requête SQL explicite ou réglez `uniqueIndexConstraintsOnly: false` en 7.x. Avec une clé non différable sur la table parente et une clé différable sur la partition, TypeScript accepte le nom, mais Postgres peut renvoyer l’erreur `55000`.

En 7.x, ce réglage rétablissait le type union de la 6.x sans note de migration, et lui seul renseignait le paramètre de sortie `uniqueIndexesNotArbiters` de `definitionForRelationInSchema()` ; la 8.0 le retire et laisse ce paramètre vide ([`uniqueIndexConstraintsOnly`](#from-8-0-uniqueIndexConstraintsOnly)).

### Domaines, tableaux d’enums et intervalles en 7.0 {#domain-and-parser-types}

Régénérez le schéma avec `npx pgcast`, puis lancez `tsc`. En 7.0, les trois options du générateur valent `true` par défaut. Aucune ne produit de note de migration.

Si vous appelez `definitionForRelationInSchema()`, les quatre tableaux facultatifs recensent toujours les colonnes, que les écouteurs reçoivent des messages ou non.

| Paramètre de sortie | Quand il recense une colonne |
|---|---|
| `domainsNotByContext` | Avec `domainsTypedByContext: false`, pour un domaine dont le type de base est connu et varie selon le contexte, en 7.x ; vide à partir de la 8.0 |
| `domainsUnderDomains` | Avec le même réglage, pour un domaine imbriqué ou un tableau de domaines dont le type de base est connu, en 7.x ; vide à partir de la 8.0 |
| `enumArraysNotAsText` | Si `enumArraysTypedAsText` est omis ou vaut `null`, pour un tableau d’enums reconnu ou un domaine portant directement sur ce tableau |
| `intervalsAsText` | Si `intervalsTypedAsObjects` est omis ou vaut `null`, pour un intervalle, un tableau d’intervalles ou un domaine portant directement sur l’un des deux. Si la résolution du type de base donne un intervalle ou un tableau d’intervalles, la colonne est aussi recensée quand `domainsTypedByContext` est activé (par défaut en 7.0, et toujours à partir de la 8.0). |

- Avec [`domainsTypedByContext`](/fr/generator#generate.domainsTypedByContext), les raccourcis renvoient un nombre pour un domaine sur `bigint` avec le parser JSON par défaut. Avec `customJSONParsingForLargeNumbers: true` et le parser correspondant, affinez le type `number | db.Int8String` avant d’appeler `.padStart()`.
- Un domaine imbriqué dont le placeholder vaut `any` prend le type de base du domaine le plus intérieur. Un tableau de domaines sur `bigint` passe de `any` à `number[]` dans le JSON des raccourcis avec le parser par défaut. Si un tableau comporte plusieurs dimensions ou des éléments `null`, vérifiez sa structure avant d’utiliser un élément. Déclarez ces formes de tableau et le type brut `string` dans le placeholder du tableau, ou utilisez `domainsTypedByContext: false` en 7.x ; la 8.0 retire cette option ([`domainsTypedByContext`](#from-8-0-domainsTypedByContext)).
- Avec [`enumArraysTypedAsText`](/fr/generator#generate.enumArraysTypedAsText), une ligne renvoyée par une requête `sql` contient le texte du tableau. Pour appeler `.map()` ou enregistrer à nouveau les labels, utilisez le tableau renvoyé par un raccourci. Gardez `false` si votre parser `pg` renvoie déjà les labels sous forme de tableau.
- Avec le réglage par défaut de la 7.0, si `sub` est une sous-requête `isInSelect()` qui sélectionne `c_enum_array`, la comparaison utilise le type brut `string`. TypeScript refuse désormais `{ c_enum_array: sub }` et accepte la comparaison avec une colonne de type texte. Postgres rejette cette dernière comparaison (42883). Réglez `enumArraysTypedAsText` sur `false` ou écrivez une condition `sql` explicite.
- Avec [`intervalsTypedAsObjects`](/fr/generator#generate.intervalsTypedAsObjects), une ligne renvoyée par une requête `sql` contient un `PostgresInterval`. Lisez ses champs ou enregistrez de nouveau l’objet tel quel. Le JSON des raccourcis conserve le texte. Gardez `false` si votre parser renvoie le texte de l’intervalle. Les deux réglages liés aux parsers restent disponibles au-delà de la 8.0.

Le typage par contexte compare le type du placeholder à celui qu’une nouvelle génération produirait avec les réglages actuels. Un ancien placeholder pour un domaine sur `interval` garde le type `string`. Si vous lui donnez le type `db.PostgresInterval`, il correspond au nouveau type par défaut et les raccourcis renvoient du texte en JSON. Si vous repassez à `intervalsTypedAsObjects: false`, un placeholder existant de type objet garde son type. [Comparez votre placeholder à celui d’une nouvelle génération](#regenerate-for-7-0). S’il manque l’import de `db`, [ajoutez-le](/fr/custom-types#when-a-placeholder-does-not-compile).

Pour les domaines imbriqués dont le placeholder vient d’être généré, comparez le type dans les lignes brutes à celui obtenu avec vos réglages de la 6.x.

- Sur un tableau d’enums, le type brut passe de `any` (réglages par défaut de la 6.x) ou d’un tableau de labels (toutes les corrections activées en 6.x) à `string`. Pour réécrire ces valeurs en base, reprenez le tableau du JSON du raccourci ou réglez `enumArraysTypedAsText: false` si votre parser renvoie un tableau. Pour un domaine portant directement sur le tableau, ce seul réglage rétablit le type brut du placeholder de la 6.x.
- Sur `numeric[]`, le type brut passe de `any` (réglages par défaut de la 6.x) à `db.NumericString[]`. En 6.x, le typage par contexte donnait déjà ce type. Le parser par défaut de `pg` lit les éléments numériques comme des nombres. Traitez chaque élément du tableau lu dans une ligne brute comme `unknown` et vérifiez `typeof value === 'number'` avant de l’utiliser comme nombre. Le placeholder sert aussi à typer le JSON des raccourcis, où `NaN` est une chaîne. Utilisez `number[]` seulement si tous les contextes de lecture renvoient des tableaux à une dimension composés de nombres, sans valeur `null`.

### Revenir à pgcast 6.x {#roll-back-to-6-x}

Rétablissez le paquet 6.x et son fichier de verrouillage, réinstallez les dépendances et remettez la configuration du runtime et du générateur que vous utilisiez avec cette version. Annulez aussi les modifications d’appels et d’annotations de types qui nécessitent la 7.0. Reprenez la [régénération, la comparaison des placeholders et la compilation](#regenerate-for-7-0) avec le générateur 6.x, puis lancez vos tests. Pour Zapatos 6.6.1, suivez [Revenir en arrière](#go-back).

## Revenir en arrière {#go-back}

```sh
npm install zapatos@6.6.1
```

- D’abord, retirez de `setConfig()` les options que la `Config` de Zapatos 6.6.1 n’a pas (2353) : `upsertRequiresSameKeys`, `undefinedMeansMissing`, `transactionRequiresCommit`, `transactionRequiresIdleClient`, `transactionRequiresSatisfyingLevel`, `selectExactlyOneChecksForSecondRow`, `aggregatesTypedByColumn`, `shortcutsUseJson`, `topLevelSelectAsRows` et `transactionEventListener`, que TypeScript prend pour une faute de frappe de `transactionListener` (2561). Zapatos 6.6.1 n’appelle jamais cet écouteur : alimentez plutôt un log ou une métrique avec les messages de `transactionListener`.
- Avec [`moduleNames`](/fr/generator#generate.moduleNames) à `"pgcast"`, lancez aussi `npm uninstall pgcast` : les deux paquets ont une commande `zapatos`. Vos imports `pgcast/…` ne se résolvent alors plus, et la 6.6.1 écrit `zapatos/` mais laisse `pgcast/` en place. Remettez donc chaque import en `zapatos/…`, déplacez les placeholders que vous avez modifiés dans `zapatos/custom/`, leur `declare module 'pgcast/custom'` renommé en `'zapatos/custom'`, et supprimez `pgcast/`.
- Renommez un `pgcastconfig.json` en `zapatosconfig.json` : la CLI de Zapatos 6.6.1 ne lit aucun autre fichier.
- Retirez [`--check`](/fr/generator#check) de vos scripts. Avant l’argument JSON, la CLI de Zapatos 6.6.1 le lit comme cet argument, et s’arrête avec le code 1 ; après lui, elle l’ignore, écrit les fichiers et se termine avec le code 0 : la vérification passe donc toujours. [`check()`](/fr/generator#check) aussi : le `zapatos/generate` de Zapatos 6.6.1 n’a pas cet export, ce que TypeScript refuse (2305) ; à l’exécution, `require()` donne `undefined` et l’appel lève `TypeError: check is not a function`, et un import de module ES échoue avant que le moindre code ne s’exécute.
- La CLI de Zapatos 6.6.1 n’affiche pas d’aide pour `--help` ou `-h` : elle les lit comme l’argument JSON, et s’arrête avec le code 1.
- Régénérez avec Zapatos 6.6.1. Il ignore `typeEnumsAcrossSchemas`, `enumOrder`, `uniqueIndexConstraintsOnly`, `constraintNames`, `domainsTypedByContext`, `enumArraysTypedAsText`, `intervalsTypedAsObjects`, `domainsTypedAsUnions`, `valuesTypedAsAliases` et `moduleNames` dans `zapatosconfig.json`. La régénération supprime aussi chaque type `Constraint` généré avec `constraintNames: true`. Zapatos réécrit les types `any`, les labels triés, les lignes de commentaire sans préfixe, chaque index unique dans `UniqueIndex`, tout nom d’`UniqueIndex` emprunté, le placeholder de chaque domaine dans les cinq interfaces, un tableau d’un enum comme un tableau dans `Selectable`, chaque `interval` comme une chaîne et l’union de la valeur de chaque colonne en entier ; un placeholder qu’il trouve contenant `db.PostgresInterval` reste, bien que le `db` de Zapatos 6.6.1 n’ait pas ce type : le placeholder ne compile pas sans `skipLibCheck` (TS2694), et sous `skipLibCheck`, la colonne vaut `any`, sans bruit. Écrivez-y `string`. De même pour un placeholder qui nomme l’union d’un domaine, que Zapatos 6.6.1 ne déclare plus (TS2305, ou TS2694 pour un placeholder dans l’espace de noms d’un schéma) : écrivez-y `string` aussi. Son `generate()` ne connaît pas non plus `rejectOnQueryError` : TypeScript le refuse dans un littéral d’objet (2353), et à l’exécution une requête qui échoue arrête de nouveau le processus.
- Chaque changement de [Trouver les appels dont le résultat change](#find-the-calls-whose-result-changes) s’exécute comme avant, sauf celui du `jsonb`, qui ne trouve de nouveau rien.

::: warning Sécurité
Le code écrit, ou laissé tel quel, en comptant sur les corrections de pgcast retrouve les résultats de Zapatos 6.6.1 : chaque ligne dont Que faire dit « rien », la ligne du `not()` et celle du `jsonb`.

`db.deletes('roles', { character: db.conditions.isNotIn([db.param('The ferryman')]) })` supprime 11 rôles sous pgcast, et les 12 sous Zapatos 6.6.1.

Les failles fermées par les corrections de sécurité de chaque version sont de nouveau ouvertes ([Les corrections par version](/fr/security#fixes-by-release)) : la chaîne d’un appelant peut injecter du SQL, un filtre peut correspondre à toutes les lignes, et une clé qu’un autre code a ajoutée à `Object.prototype` peut changer une requête.
:::

## Voir aussi {#see-also}

- [Lire les avertissements](#read-the-warnings) pour retrouver, en 6.x, l’appel qui déclenche chaque code.
- [Versions](/fr/versions) : pourquoi pgcast corrige certaines choses d’emblée et d’autres derrière une option.
- [Sécurité](/fr/security) : pourquoi un nom ou une valeur `raw()` ne peut plus injecter de SQL.

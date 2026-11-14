---
english: 5daadf5ea1b7
---

# Lectures {#select-and-the-aggregates}

Les raccourcis de lecture : `select()`, `selectOne()` et `selectExactlyOne()` pour des lignes, `count()`, `sum()`, `avg()`, `min()` et `max()` pour un nombre. Chaque option, le SQL qu’elle ajoute et son effet sur le type, puis les types qu’ils partagent.
{.lede}

## `select()` {#select}

```ts
db.select(table, where, options?, mode?, aggregate?)
```

Construit un seul `SELECT` des lignes de `table` qui correspondent à `where`. Renvoie un [`SQLFragment`](/fr/sql-template#SQLFragment) : `.run(pool)` donne un tableau des lignes `JSONSelectable` de la table, `[]` quand aucune ne correspond.

- `table` : une table du schéma généré.
- `where` : un `Whereable`, un objet de colonnes et de leurs valeurs ou [conditions](/fr/conditions), ses clés dans l’ordre alphabétique, jointes par `AND` dans une seule paire de parenthèses, une condition ou une valeur `sql` dans la sienne (`("id" = $1 AND ("studio_id" > $2) AND "title" = $3)`<!-- probe: db.select('films', { title: 'x', id: 1000, studio_id: db.conditions.gt(1000) }) -->) ; un fragment [`sql`](/fr/sql-template#sql), écrit tel quel ; ou [`db.all`](/fr/sql-template#all), pour aucun `WHERE`.
- `options` : les [options](#options) ci-dessous, toutes facultatives.
- `mode` et `aggregate` : ce que passent `selectOne()`, `count()` et les autres ; voir [`SelectResultMode`](#SelectResultMode).

<CastPanel example="select">

<<< ../examples/select.ts{ts twoslash}

</CastPanel>

### Le SQL qu’il écrit {#the-sql-it-writes}

- Chaque ligne est une seule valeur `jsonb`, `to_jsonb("films".*)`<!-- probe: examples/select.ts -->, donc les dates et les heures reviennent en chaînes et un `bigint` en nombre : les types `JSONSelectable` le disent ([Le catalogue](/fr/catalog-types)).
- Les lignes sont rassemblées en un seul tableau, `coalesce(jsonb_agg(result), '[]')`<!-- probe: examples/select.ts -->, autour d’une sous-requête d’alias `"sq_<alias or table>"`, pour que `ORDER BY` et `LIMIT` s’appliquent aux lignes. Une requête, une valeur en retour.
- À l’intérieur, les clauses viennent dans cet ordre : `SELECT [DISTINCT …]` · les colonnes `AS result` · `FROM` la table `[AS alias]` · chaque `LEFT JOIN LATERAL` · `WHERE` · `GROUP BY` · `HAVING` · `ORDER BY` · `LIMIT` ou `FETCH FIRST … WITH TIES` · `OFFSET` · chaque verrou `FOR …`.
- Chaque valeur est un paramètre (`$1`, `$2`) ; chaque nom est mis entre guillemets comme le fait Postgres, et tout `"` qu’il contient est doublé. Zapatos 6.6.1 laissait un nom contenant un `"` fermer ses guillemets ; pgcast l’a corrigé ([changelog](/fr/changelog#6.6.2-security)).

### Options {#options}

Le SQL de chaque ligne du tableau est ce que compile la bibliothèque construite, sur le schéma de la doc ; `…` tient lieu d’un fragment `sql`.

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| `columns: ['title']` | `jsonb_build_object($1::text, "title")`<!-- probe: db.select('films', db.all, { columns: ['title'] }) --> à la place de `to_jsonb("films".*)` | seulement ces clés (`JSONOnlyColsForTable`) |
| `order: { by: 'title', direction: 'ASC' }` | `ORDER BY "title" ASC`<!-- probe: db.select('films', db.all, { order: { by: 'title', direction: 'ASC' } }) --> | aucun |
| `limit: 2` | `LIMIT $1`<!-- probe: db.select('films', db.all, { limit: 2 }) --> | aucun |
| `offset: 2` | `OFFSET $1`<!-- probe: db.select('films', db.all, { offset: 2 }) --> | aucun |
| `withTies: true` | `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.select('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, limit: 2, withTies: true }) --> à la place de `LIMIT $1` | aucun |
| `extras: { cinema: 'name' }` | `\|\| jsonb_build_object($1::text, "name")`<!-- probe: db.select('cinemas', db.all, { extras: { cinema: 'name' } }) --> | une clé par extra (`ExtrasResult`) |
| `lateral: { cast: … }` | `LEFT JOIN LATERAL (…) AS "lateral_cast" ON true`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) -->, lu par `\|\| jsonb_build_object($1::text, "lateral_cast".result)`<!-- probe: db.select('films', db.all, { lateral: { cast: db.select('roles', { film_id: db.parent('id') }) } }) --> | une clé par sous-requête (`LateralResult`) |
| `lateral: …`, une seule sous-requête | `"lateral_passthru".result`<!-- probe: db.select('films', db.all, { lateral: db.select('roles', { film_id: db.parent('id') }) }) --> à la place des colonnes, et son `LEFT JOIN LATERAL` | le résultat de la sous-requête, à la place de la ligne |
| `alias: 'mentor'` | `FROM "crew" AS "mentor"`<!-- probe: db.select('crew', db.all, { alias: 'mentor' }) -->, puis `"mentor"` pour la table | aucun |
| `distinct: true` | `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) --> | aucun |
| `distinct: 'cinema_id'` | `SELECT DISTINCT ON ("cinema_id")`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) --> | aucun |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.select('ratings', db.all, { columns: ['film_id'], groupBy: 'film_id' }) --> | aucun |
| `having: …` | `HAVING sum("votes") >= $1`<!-- probe: db.select('ratings', db.all, { groupBy: 'film_id', having: db.sql`sum(${'votes'}) >= ${db.param(10)}` }) --> | aucun |
| `lock: { for: 'UPDATE' }` | `FOR UPDATE`<!-- probe: db.select('films', db.all, { lock: { for: 'UPDATE' } }) --> | aucun |

::: tip Strict
`columns`, `extras` et `lateral` ne changent le type qu’avec `strictNullChecks` (ou `strict`) activé. Sans lui, le résultat reste le `JSONSelectable` complet, et une clé d’extra ou de lateral n’est pas dans le type ; le type ne refuse rien, pas même `columns` à côté d’une seule sous-requête `lateral`, et une sous-requête seule est typée comme la ligne de la table, alors que c’est son propre résultat qui revient.
:::

### `columns` {#columns}

`columns?: readonly ColumnForTable<T>[]`, un [`ColumnsOption`](#ColumnsOption) : seulement ces colonnes, chacune une clé de l’objet résultat, à la place de la ligne entière. Il ne renomme pas une colonne : c’est le rôle d’[`extras`](#extras).

Un tableau `readonly`, `['id', 'title'] as const` ou un `readonly ColumnForTable<T>[]`, donne le même SQL et le même type qu’un tableau modifiable. Avec `strictNullChecks`, Zapatos 6.6.1 typait ses lignes comme `never`, que tout type acceptait ; un type que la requête ne renvoie pas est maintenant refusé :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
const columns = ['id', 'title'] as const;

async function filmCards(queryable: db.Queryable) {
  const cards: { id: number; title: string }[] = await db.select('films', db.all, { columns }).run(queryable);
  // @ts-expect-error tagline is not among the columns
  const withTaglines: { title: string; tagline: string | null }[] = await db.select('films', db.all, { columns }).run(queryable);
  return [cards, withTaglines];
}
```

### `order`, `limit`, `offset` et `withTies` {#order-limit-offset-and-withties}

- `order` : un `{ by, direction, nulls? }` ou un tableau de ceux-ci, dans cet ordre. `by` est une colonne ou tout SQL de la table, son type `SQL` : un fragment `sql` (`` db.sql`array_length(${'genres'}, 1)` ``), [`db.parent()`](/fr/sql-template#parent) ; `direction` vaut `'ASC'` ou `'DESC'` ; `nulls`, `'FIRST'` ou `'LAST'`.
- `limit` et `offset` : des nombres, envoyés comme paramètres.
- `withTies: true`, avec `limit` et `order` : aussi les lignes ex æquo avec la dernière sur l’`order`. Sans `limit`, il n’ajoute rien ; sans `order`, Postgres refuse la requête (42601).

<CastPanel example="selectPage">

<<< ../examples/selectPage.ts{ts twoslash}

</CastPanel>

<CastPanel example="selectWithTies">

<<< ../examples/selectWithTies.ts{ts twoslash}

</CastPanel>

Parcourir une longue liste page par page : [Pagination](/fr/paginate).

### `extras` {#extras}

`extras?: { [key: string]: column | SQLFragment }`, un [`ExtrasOption`](#ExtrasOption) : d’autres clés sur chaque objet résultat. Une colonne donne sa valeur sous une autre clé ; un fragment `sql` donne le type de son second paramètre de type, `` db.sql<s.cinemas.SQL, number>`…` ``, donc `number` ici. Les clés sont ajoutées à la ligne avec `||`, après `columns`.

<CastPanel example="selectExtras">

<<< ../examples/selectExtras.ts{ts twoslash}

</CastPanel>

### `lateral` {#lateral}

`lateral?: { [key: string]: SQLFragment } | SQLFragment`, un [`LateralOption`](#LateralOption) : d’autres raccourcis, imbriqués, chacun joint par `LEFT JOIN LATERAL … ON true`. Dans ceux-ci, [`db.parent()`](/fr/sql-template#parent) nomme une colonne de la table de cette requête.

- **Un objet** : chaque clé devient une clé du résultat, qui contient le résultat de sa sous-requête : un tableau pour `select()`, un objet ou `null` pour `selectOne()`, un nombre pour `count()`. Les clés sont jointes dans l’ordre alphabétique ; chacune est un seul identifiant, `"lateral_<key>"`.
- **Une seule sous-requête** : son résultat est transmis à la place de chaque ligne. `columns` et `extras` n’ont alors rien à quoi s’ajouter, et le type les refuse, avec `strictNullChecks` activé.

Étapes, imbrication et auto-jointures : [Jointures](/fr/lateral). Depuis pgcast 6.6.2, une clé ou un `alias` contenant un `"` reste un seul identifiant ; dans Zapatos 6.6.1, il pouvait fermer ses guillemets ([changelog](/fr/changelog#6.6.2-security)).

### `alias` {#alias}

`alias?: string` : un nom pour la table dans cette requête, nécessaire pour joindre une table à elle-même (`crew` et son `mentor_id`). Il remplace le nom de la table dans les colonnes, dans `"sq_<alias>"` et pour le `parent()` de chaque sous-requête `lateral`, et `lock.of` l’accepte. Ses étapes : [Joindre une table à elle-même](/fr/lateral#join-a-table-to-itself).

### `distinct` {#distinct}

Avec `true` : `SELECT DISTINCT`<!-- probe: db.select('films', db.all, { distinct: true }) -->, sur l’objet résultat entier. La liste du select est ce seul `result`, donc Postgres refuse avec lui un `order` sur une colonne (42P10).

<CastPanel example="selectDistinctAll">

<<< ../examples/selectDistinctAll.ts{ts twoslash}

</CastPanel>

Avec une colonne, un tableau de colonnes ou un fragment `sql` : `SELECT DISTINCT ON (…)`<!-- probe: db.select('screenings', db.all, { distinct: 'cinema_id' }) -->, une ligne par valeur. Donnez un `order` qui commence par les mêmes colonnes, sinon c’est Postgres qui choisit la ligne obtenue.

<CastPanel example="selectDistinct">

<<< ../examples/selectDistinct.ts{ts twoslash}

</CastPanel>

### `groupBy` et `having` {#groupby-and-having}

- `groupBy` : une colonne, un tableau de colonnes (`GROUP BY "film_id", "stars"`<!-- probe: db.select('ratings', db.all, { groupBy: ['film_id', 'stars'] }) -->) ou un fragment `sql`.
- `having` : un `Whereable`, entre parenthèses comme dans `where`, ou un fragment `sql`.

Postgres ne renvoie que les colonnes groupées, celles qu’une clé primaire groupée détermine, et des agrégats, et refuse toute autre colonne (42803) : la ligne entière, sans `columns`, passe quand `groupBy` contient la clé primaire.

<CastPanel example="selectGroupBy">

<<< ../examples/selectGroupBy.ts{ts twoslash}

</CastPanel>

### `lock` {#lock}

`lock?: SelectLockingOptions | SelectLockingOptions[]` : une clause de verrouillage par élément, dans l’ordre, écrite après tout le reste.

| Clé | Valeurs | SQL |
|---|---|---|
| `for` | `'UPDATE'`, `'NO KEY UPDATE'`, `'SHARE'`, `'KEY SHARE'` | `FOR UPDATE`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE' } }) --> |
| `of`, facultatif | un nom de table, ou l’`alias` ; ou un tableau de ceux-ci | `OF "screenings"`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', of: 'screenings' } }) --> |
| `wait`, facultatif | `'NOWAIT'`, `'SKIP LOCKED'` | `NOWAIT`<!-- probe: db.select('screenings', db.all, { lock: { for: 'UPDATE', wait: 'NOWAIT' } }) --> |

Postgres refuse un verrou avec `DISTINCT`, `GROUP BY` ou un agrégat (0A000).

<CastPanel example="selectLock">

<<< ../examples/selectLock.ts{ts twoslash}

</CastPanel>

### Erreurs {#errors}

`select()` lève ces erreurs en construisant la requête, avant d’en envoyer aucune :

| Message | Quand | Depuis |
|---|---|---|
| `Direction must be ASC/DESC, not '…'`<!-- message --> | un `order` avec une autre `direction` | Zapatos |
| `Nulls must be FIRST/LAST/undefined, not '…'`<!-- message --> | un `order` avec un autre `nulls` | Zapatos |
| `Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '…'`<!-- message --> | un `lock` avec un autre `for` | pgcast 6.6.2 |
| `Lock wait must be NOWAIT/SKIP LOCKED/undefined, not '…'`<!-- message --> | un `lock` avec un autre `wait` | pgcast 6.6.2 |
| `Aggregate must be a function name (e.g. sum, or my_schema.my_agg), not '…'`<!-- message --> | un `aggregate` qui n’en est pas un, dans `SelectResultMode.Numeric` | pgcast 6.6.2 |

Le type refuse une mauvaise `direction`, un mauvais `nulls` ou un mauvais `lock`, pas un mauvais `aggregate`, qui est un `string`. Zapatos 6.6.1 écrivait un mauvais `lock` ou `aggregate` tel quel dans le SQL, où il pouvait exécuter une seconde instruction. Une valeur qui n’a pas de sens dans `where` ou `having` (`db.Default`, `db.self`, `db.raw()`) lève une erreur à la compilation de la requête : [Conditions](/fr/conditions).

## `selectOne()` {#selectOne}

```ts
db.selectOne(table, where, options?)
```

Comme [`select()`](#select), avec `LIMIT $1`<!-- probe: db.selectOne('films', db.all) -->, de valeur `1`, et sans `jsonb_agg` : `.run(pool)` donne la première ligne, ou `undefined` quand aucune ne correspond. Tout `limit` passé est remplacé par `1` ; `offset` et les autres options sont gardés. Dans un `lateral`, sa clé contient la ligne ou `null`.

Avec `withTies` et `order`, il écrit `FETCH FIRST $1 ROWS WITH TIES`<!-- probe: db.selectOne('films', db.all, { order: { by: 'release_year', direction: 'ASC' }, withTies: true }) -->, ici et dans `selectExactlyOne()`. `.run()` donne alors l’une des lignes ex æquo ; dans un `lateral`, la ligne parente revient une fois par ligne ex æquo.

<CastPanel example="selectOne">

<<< ../examples/selectOne.ts{ts twoslash}

</CastPanel>

## `selectExactlyOne()` {#selectExactlyOne}

```ts
db.selectExactlyOne(table, where, options?)
```

Comme [`selectOne()`](#selectOne), mais son type n’a pas d’`undefined` : quand aucune ligne ne correspond, `.run()` est rejetée avec une [`NotExactlyOneError`](#NotExactlyOneError). Il vérifie qu’il y a au moins une ligne, pas exactement une : avec `LIMIT $2`<!-- probe: examples/selectExactlyOne.ts -->, de valeur `1`, il prend la première. Dans un `lateral`, une ligne manquante donne `null` et aucune erreur, même si le type dit autre chose.

<CastPanel example="selectExactlyOne">

<<< ../examples/selectExactlyOne.ts{ts twoslash}

</CastPanel>

Avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), la requête exécutée seule demande deux lignes, `LIMIT $2`<!-- probe: (db.setConfig({ selectExactlyOneChecksForSecondRow: true }), db.selectExactlyOne('studios', { id: 1000 })) --> avec `2`, et `.run()` est rejetée aussi sur une seconde ligne. Imbriquée dans une autre requête, dans un `lateral` ou un template `sql`, elle garde `LIMIT 1`, avec l’option ou non : une seconde ligne y joindrait deux fois la ligne parente.

### `NotExactlyOneError` {#NotExactlyOneError}

```ts
class NotExactlyOneError extends Error {
  query: SQLFragment;
}
```

L’erreur avec laquelle `selectExactlyOne()`, le mode `ExactlyOne` de `select()`, est rejetée quand aucune ligne ne correspond. Son `name` est `'NotExactlyOneError'`, son `message` "One result expected but none returned (hint: check `.query.compile()` on this Error)"<!-- message --> ; avec [`selectExactlyOneChecksForSecondRow`](/fr/runtime-config#Config.selectExactlyOneChecksForSecondRow), une seconde ligne donne "One result expected but more returned (hint: check `.query.compile()` on this Error)"<!-- message -->.

Sa `query` est le [`SQLFragment`](/fr/sql-template#SQLFragment) exécuté : `err.query.compile()` donne son SQL et ses valeurs. `err instanceof db.NotExactlyOneError` la reconnaît ; pour l’intercepter : [Distinguer une ligne manquante des autres erreurs](/fr/handle-errors#tell-a-missing-row-from-the-others).

## `count()` {#count}

```ts
db.count(table, where, options?)
```

`SELECT count(*) AS result`<!-- probe: db.count('films', db.all) -->, sans `jsonb_agg` : `.run(pool)` donne un `number`, `0` quand aucune ligne ne correspond au `where`. Le `bigint` que renvoie Postgres passe par `Number()`.

<CastPanel example="count">

<<< ../examples/count.ts{ts twoslash}

</CastPanel>

`count()` et les quatre ci-dessous prennent les options de [`select()`](#options), avec ces différences :

<div class="stack">

| Option | SQL ajouté | Effet sur le type |
|---|---|---|
| `columns: ['subtitled']` | `count("subtitled")`<!-- probe: db.count('screenings', db.all, { columns: ['subtitled'] }) --> à la place de `count(*)` : les lignes où elle n’est pas `NULL` ; une seule colonne, car plusieurs (ou aucune, `[]`) lèvent une erreur | aucun |
| `distinct: true` | `SELECT DISTINCT count(*)`<!-- probe: db.count('films', db.all, { distinct: true }) -->, sur l’unique résultat : pas `count(DISTINCT …)`, qui demande un template `sql` | aucun |
| `groupBy: 'film_id'` | `GROUP BY "film_id"`<!-- probe: db.count('ratings', db.all, { groupBy: 'film_id' }) --> ; `.run()` ne donne que la valeur du premier groupe, et sans groupe, ce que donne l’absence de ligne (ci-dessous) | aucun |
| `extras` | rien | aucun |
| `lateral: { … }` | ses `LEFT JOIN LATERAL`, dont les résultats ne sont pas lus ; une seule sous-requête lève une erreur, puisqu’il n’y a pas de ligne à laquelle la transmettre | aucun |
| `having`, `limit`, `offset` | comme dans `select()` ; quand ils ne laissent aucune ligne (un `having` qui n’en garde aucune, `limit: 0`, `offset: 1`), ce que donne l’absence de ligne (ci-dessous) | aucun |

</div>

`count()` et les quatre ci-dessous lèvent ces erreurs à la compilation, donc `.run()` est rejetée avec une simple `Error`, pas une `DatabaseError`, avant toute requête, et `.compile()` lève l’erreur ; de même pour une requête qui en imbrique une :

| Message | Quand | Depuis |
|---|---|---|
| `…() needs one column to aggregate: pass columns: ['column']`<!-- message --> | `sum()`, `avg()`, `min()` ou `max()` sans `columns` | pgcast 6.7.0 |
| `…() takes one column in columns, not …`<!-- message --> | `columns` avec plusieurs colonnes, ou aucune (`[]`) | pgcast 6.7.0 |
| `…() cannot pass a lateral query through: nest it in the lateral of a select() instead`<!-- message --> | une seule sous-requête comme `lateral` | pgcast 6.7.0 |

Zapatos 6.6.1 envoyait le SQL, que Postgres refusait : `sum(*)` et `count("id", "mood")` (42883), `count()` (42809), `SELECT  AS result` (42601). Le type est celui de 6.6.1, qui laisse passer ces appels, une seule sous-requête comme `lateral` quand il n’y a ni `columns` ni `extras`.

Deux appels qui passaient sous 6.6.1 sont maintenant rejetés aussi :

- Un agrégat à vous, qui prend un autre nombre d’arguments sous le nom d’un agrégat intégré. Après `CREATE AGGREGATE max(int4, int4) (…)`, `db.max('ratings', db.all, { columns: ['stars', 'votes'] })` envoyait `max("stars", "votes")`. `db.select('ratings', db.all, { columns: ['stars', 'votes'] }, db.SelectResultMode.Numeric, 'max')` envoie le même SQL.
- Un agrégat refusé marqué `noop`, qui se résolvait en son `noopResult` : `run()` compile la requête avant de lire `noop`.

Avec `columns`, il compte deux des quatre séances : les deux autres ont `subtitled` à `NULL`.

<CastPanel example="count_columns">

<<< ../examples/count_columns.ts{ts twoslash}

</CastPanel>

`count(DISTINCT …)` est un template `sql`. Le `count()` de Postgres renvoie un `bigint`, que `pg` donne en chaîne (`'3'`) : `::int` en fait un nombre, ici `3` cinémas.

<CastPanel example="count_distinct">

<<< ../examples/count_distinct.ts{ts twoslash}

</CastPanel>

`where`, `alias`, `withTies` et `lock` ajoutent ce qu’ils ajoutent à `select()`. De même pour `order`, par une colonne de `groupBy` ou un fragment `sql` (`` db.sql`count(*)` ``) : par une autre colonne, Postgres refuse la requête (42803).

`.run()` lit la première ligne du résultat. Quand la requête n’en renvoie aucune, `.run()` lit un `NULL` : `count()` donne `0`, et `sum()`, `avg()`, `min()` et `max()` ce qu’ils donnent pour un ensemble vide, `0`, ou `null` avec [`aggregatesTypedByColumn`](#typed-by-column). Sous Zapatos 6.6.1, `.run()` était rejetée avec `TypeError: Cannot read properties of undefined (reading 'result')`. Imbriquée dans un `lateral`, une requête qui ne renvoie aucune ligne donne `null`, celle de `count()` aussi, bien que son type dise `number`.

## `sum()` {#sum}

```ts
db.sum(table, where, options?)
```

`SELECT sum("column") AS result`<!-- probe: db.sum('ratings', db.all, { columns: ['column'] }) -->, un `number` ; pour le reste, comme [`count()`](#count). Donnez une colonne dans `columns` : sans elle, `.run()` est rejetée avant toute requête, là où Zapatos 6.6.1 envoyait `sum(*)`, que Postgres refuse (42883). Le type laisse passer cet appel, comme en 6.6.1. Quand aucune ligne ne correspond au `where`, Postgres renvoie `NULL`, et `Number(null)` en fait `0` ; `.run()` avertit alors une fois, `PGCAST_DEP004`. À partir de la 6.7.0, [`aggregatesTypedByColumn`](#typed-by-column) donne `null`.

<CastPanel example="sum">

<<< ../examples/sum.ts{ts twoslash}

</CastPanel>

## `avg()` {#avg}

```ts
db.avg(table, where, options?)
```

`SELECT avg("column") AS result`<!-- probe: db.avg('ratings', db.all, { columns: ['column'] }) --> : la moyenne, via `Number()`, donc `0` quand aucune ligne ne correspond. Pour le reste, comme [`sum()`](#sum).

<CastPanel example="avg">

<<< ../examples/avg.ts{ts twoslash}

</CastPanel>

## `min()` {#min}

```ts
db.min(table, where, options?)
```

`SELECT min("column") AS result`<!-- probe: db.min('ratings', db.all, { columns: ['column'] }) -->, via `Number()`, donc `0` quand aucune ligne ne correspond. Le type dit `number` quelle que soit la colonne :

- une colonne de date ou d’heure (`date`, `timestamp`, `timestamptz`) donne ses millisecondes depuis 1970, car node-postgres la lit comme un `Date` ;
- du texte ou un enum donne `NaN`, sauf si le texte se lit comme un nombre : `'9'` donne `9`.

`.run()` avertit une fois, `PGCAST_DEP004`, quand `Number()` change la valeur. À partir de la 6.7.0, [`aggregatesTypedByColumn`](#typed-by-column) la garde. Pour le reste, comme [`sum()`](#sum).

<CastPanel example="min">

<<< ../examples/min.ts{ts twoslash}

</CastPanel>

## `max()` {#max}

```ts
db.max(table, where, options?)
```

`SELECT max("column") AS result`<!-- probe: db.max('ratings', db.all, { columns: ['column'] }) --> ; comme [`min()`](#min) : `0` quand aucune ligne ne correspond, les millisecondes d’une date, et `NaN` sur du texte ou un enum, sauf si le texte se lit comme un nombre.

<CastPanel example="max">

<<< ../examples/max.ts{ts twoslash}

</CastPanel>

## Typé par colonne {#typed-by-column}

À partir de la 6.7.0, [`aggregatesTypedByColumn`](/fr/runtime-config#Config.aggregatesTypedByColumn) retire le `Number()`. Déclaré aussi dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes), il type chaque résultat tel que Postgres l’envoie :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
declare module 'zapatos/db' {
  interface ConfigTypes { aggregatesTypedByColumn: true }
}
db.setConfig({ aggregatesTypedByColumn: true });

const firstShow = await db.min('screenings', db.all, {
  columns: ['starts_at'],
}).run(pool);
```

<div class="stack">

| Appel | Désactivé | Activé |
|---|---|---|
| `min()` de `starts_at`, un `timestamptz` | ses millisecondes, `number` | un `Date`, `Date \| null` |
| `max()` de `title`, un `text` | `NaN`, `number` | `'The Salt Orchard'`, `string \| null` |
| `sum()` ou `avg()`, sans ligne correspondante, ou sans ligne renvoyée | `0`, `number` | `null`, `number \| null` |
| `max()` de `runtime_minutes`, un `integer` | `131`, `number` | `131`, `number \| null` |
| `min()` imbriqué dans un `lateral` | une chaîne ISO, typée `number` | la même chaîne, `TimestampTzString \| null` |
| `min()` comme unique `lateral` d’un `selectOne()` | un `Date`, typé `number \| undefined` | le même `Date`, `Date \| null \| undefined` |

</div>

- Le SQL est le même dans les deux cas : `SELECT min("starts_at") AS result FROM "screenings"`<!-- probe: (db.setConfig({ aggregatesTypedByColumn: true }), db.min('screenings', db.all, { columns: ['starts_at'] })) -->.
- `min()` et `max()` donnent un `bigint` ou un `numeric` tel que `pg` l’envoie, en chaîne ; imbriqués, en nombre JSON.
- `count()` ne donne jamais `NULL` : il ne change pas.
- Passé comme unique `lateral`, l’agrégat est typé comme au premier niveau par `selectOne()` et `selectExactlyOne()`, qui rendent sa colonne telle quelle, et comme imbriqué par `select()`, qui enveloppe ses lignes dans `jsonb_agg()`. Ce `selectOne()` ou ce `selectExactlyOne()`, imbriqué à son tour, est typé comme imbriqué.
- `.copy()` renvoie un simple `SQLFragment`, typé comme au premier niveau : imbriquée à son tour, une copie revient en JSON avec ce type.

## Types {#types}

Ce dont sont faites les signatures ci-dessus, tirées de `zapatos/db`. `T` est une table, `C` les `columns`, `E` les `extras`, `L` le `lateral` et `A` l’`alias`.

### `SelectResultMode` {#SelectResultMode}

```ts
enum SelectResultMode { Many, One, ExactlyOne, Numeric }
```

Le quatrième argument de `select()` : un tableau de lignes (`select()`), une ligne ou `undefined` (`selectOne()`), une ligne ou une erreur (`selectExactlyOne()`), un nombre (`count()` et les autres).

Avec `Numeric`, le cinquième argument nomme l’agrégat, `'count'` par défaut ; depuis pgcast 6.6.2, ce doit être un nom de fonction, simple, entre guillemets ou entre guillemets `U&`, en trois parties au plus séparées par des points (`stddev_pop`, `my_schema."MyAgg"`). Tout agrégat qui renvoie un nombre convient :

<CastPanel example="selectAggregate">

<<< ../examples/selectAggregate.ts{ts twoslash}

</CastPanel>

### `SelectOptionsForTable` {#SelectOptionsForTable}

`SelectOptionsForTable<T, C, L, E, A>` : l’objet `options` de `select()`, `selectOne()`, `selectExactlyOne()` et des agrégats, chaque clé facultative, comme dans [Options](#options).

### `SelectLockingOptions` {#SelectLockingOptions}

```ts
interface SelectLockingOptions<A extends string> {
  for: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: Unprefixed<Table> | A | (Unprefixed<Table> | A)[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}
```

Une clause de verrouillage de [`lock`](#lock). `of` prend un nom de table sans son schéma, ou l’`alias` de la requête (`A`).

### `ColumnsOption` {#ColumnsOption}

`ColumnsOption<T> = readonly ColumnForTable<T>[] | undefined` : le type de `columns`, et de `returning` dans [`insert()`](/fr/insert#insert) et les autres écritures. Un tableau `readonly` donne le même type qu’un tableau modifiable ([`columns`](#columns)).

### `ExtrasOption` {#ExtrasOption}

`ExtrasOption<T> = SQLFragmentOrColumnMap<T> | undefined` : le type d’`extras`, ici et dans les écritures.

### `LateralOption` {#LateralOption}

`LateralOption<C, E>` : le type de `lateral`. Un objet de sous-requêtes ([`SQLFragmentMap`](#SQLFragmentMap)) ; ou une seule sous-requête, seulement quand ni `columns` ni `extras` n’est donné.

### `SQLFragmentMap` {#SQLFragmentMap}

`interface SQLFragmentMap { [k: string]: SQLFragment<any> }` : la forme objet de `lateral`, une clé par sous-requête.

### `SQLFragmentOrColumnMap` {#SQLFragmentOrColumnMap}

`interface SQLFragmentOrColumnMap<T> { [k: string]: SQLFragment<any> | ColumnForTable<T> }` : la forme d’`extras`, une clé par colonne ou par fragment.

### `JSONOnlyColsForTable` {#JSONOnlyColsForTable}

`JSONOnlyColsForTable<T, C> = Pick<JSONSelectableForTable<T>, C[number]>` : une ligne avec seulement les `columns` (ou le `returning`) donnés. Il nomme cette ligne dans une signature :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
type FilmCard = db.JSONOnlyColsForTable<'films', ['id', 'title']>;

function filmCardsOf(queryable: db.Queryable, studio_id: number): Promise<FilmCard[]> {
  return db.select('films', { studio_id }, { columns: ['id', 'title'] }).run(queryable);
}
```

- `C` peut être un tuple `readonly`, comme `columns` ([`columns`](#columns)).

### `ExtrasResult` {#ExtrasResult}

`ExtrasResult<T, E>` : les clés qu’ajoute `extras`, chacune typée comme sa colonne dans `JSONSelectable`, ou comme le résultat de son fragment.

### `LateralResult` {#LateralResult}

`LateralResult<L> = { [K in keyof L]: RunResultForSQLFragment<L[K]> }` : les clés qu’ajoute un objet `lateral`, chacune typée comme le résultat de sa sous-requête, `undefined` devenant `null` ([`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment)).

### `FullSelectReturnTypeForTable` {#FullSelectReturnTypeForTable}

`FullSelectReturnTypeForTable<T, C, L, E, M>` : ce que donne `.run()` pour un mode `M` : la ligne (le `JSONSelectable`, réduit par `columns`, avec `extras` et `lateral` ; ou le résultat de la sous-requête transmise), en tableau, telle quelle ou avec `undefined` ; ou un `number`. La ligne des écritures est [`ReturningTypeForTable`](/fr/insert#ReturningTypeForTable).

### `SelectSignatures` {#SelectSignatures}

La signature d’appel de `select()` : `table`, `where`, `options?`, `mode?` (`Many` par défaut) et `aggregate?`, qui renvoie `SQLFragment<FullSelectReturnTypeForTable<…>>`.

### `SelectOneSignatures` {#SelectOneSignatures}

La signature d’appel de `selectOne()` : `table`, `where`, `options?`, avec le mode `One`. Avec `aggregatesTypedByColumn` déclaré dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes), elle renvoie un [`ColumnAggregateFragment`](#ColumnAggregateFragment) quand son unique `lateral` est un `min()` ou un `max()`, et un `SQLFragment` sinon ([Typé par colonne](#typed-by-column)) : une fonction typée `SelectOneSignatures` renvoie alors ce que renvoie `selectOne()`, et non son propre `SQLFragment`.

### `SelectExactlyOneSignatures` {#SelectExactlyOneSignatures}

La signature d’appel de `selectExactlyOne()` : `table`, `where`, `options?`, avec le mode `ExactlyOne`. Avec `aggregatesTypedByColumn` déclaré, elle renvoie un `ColumnAggregateFragment` dans le même cas que [`SelectOneSignatures`](#SelectOneSignatures) : une fonction typée `SelectExactlyOneSignatures` renvoie alors ce que renvoie `selectExactlyOne()`.

### `NumericAggregateSignatures` {#NumericAggregateSignatures}

La signature d’appel de `count()`, `sum()`, `avg()`, `min()` et `max()` : `table`, `where`, `options?`, qui renvoie `SQLFragment<number>`. Avec `aggregatesTypedByColumn` déclaré dans [`ConfigTypes`](/fr/runtime-config#ConfigTypes), `sum()` et `avg()` prennent [`NullableNumericAggregateSignatures`](#NullableNumericAggregateSignatures), et `min()` et `max()` [`ColumnAggregateSignatures`](#ColumnAggregateSignatures) ([Typé par colonne](#typed-by-column)).

### `NullableNumericAggregateSignatures` {#NullableNumericAggregateSignatures}

À partir de la 6.7.0. La signature d’appel de `sum()` et `avg()` avec `aggregatesTypedByColumn` déclaré : comme [`NumericAggregateSignatures`](#NumericAggregateSignatures), qui renvoie `SQLFragment<number | null>`.

### `ColumnAggregateSignatures` {#ColumnAggregateSignatures}

À partir de la 6.7.0. La signature d’appel de `min()` et `max()` avec `aggregatesTypedByColumn` déclaré : comme [`NumericAggregateSignatures`](#NumericAggregateSignatures), qui renvoie un [`ColumnAggregateFragment`](#ColumnAggregateFragment) de la colonne de `columns`.

### `ColumnAggregateFragment` {#ColumnAggregateFragment}

```ts
interface ColumnAggregateFragment<RunResult, NestedResult> extends SQLFragment<RunResult>
```

À partir de la 6.7.0. Ce que renvoient `min()` et `max()` avec `aggregatesTypedByColumn` déclaré : `.run()` donne `RunResult`, le type `Selectable` de la colonne ou `null` ; imbriqué dans un `lateral`, il est typé `NestedResult`, son type `JSONSelectable` ou `null`, comme le lit [`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment). De même dans `extras`, une fois que [#262](https://github.com/AlexandreDemartin/pgcast/issues/262) l’aura mis entre parenthèses ; aujourd’hui, Postgres le refuse sans parenthèses. Si une de vos fonctions en renvoie un, dans un projet compilé avec `declaration: true`, son `.d.ts` l’écrit sous ce nom.

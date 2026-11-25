---
english: 09d2f93a3d22
---

# Agrégats

`count()`, `sum()`, `avg()`, `min()` et `max()` réduisent les lignes d’une table à une seule valeur, et prennent les options de `select()`. Par défaut, `count()` renvoie un nombre, `sum()` et `avg()` un nombre ou `null`, et `min()` et `max()` une valeur de la colonne ou `null`.
{.lede}

## `count()` {#count}

```ts
db.count(table, where, options?)
```

`SELECT count(*) AS result`<!-- probe: db.count('films', db.all) -->, sans `jsonb_agg` : `.run(pool)` donne un `number`, `0` quand aucune ligne ne correspond au `where`. Le `bigint` que renvoie Postgres passe par `Number()`.

<CastPanel example="count">

<<< ../examples/count.ts{ts twoslash}

</CastPanel>

`count()` et les quatre ci-dessous prennent les options de [`select()`](/fr/select#options), avec ces différences :

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
| `…() takes columns as an array, not …: pass columns: ['column']…`<!-- message --> | une chaîne ou une autre valeur primitive comme `columns`, `'title'` pour `['title']` ; une chaîne vide, `0` ou `false` équivaut à l’absence de `columns` | pgcast 6.7.0 |
| `…() cannot pass a lateral query through: nest it in the lateral of a select() instead`<!-- message --> | une seule sous-requête comme `lateral` | pgcast 6.7.0 |

Zapatos 6.6.1 envoyait le SQL, que Postgres refusait : `sum(*)` et `count("id", "mood")` (42883), `count()` (42809), `count("0", "1")` pour `'id'` en passant outre le type (42703), `SELECT  AS result` (42601). Le type est celui de 6.6.1, qui laisse passer les autres appels, une seule sous-requête comme `lateral` quand il n’y a ni `columns` ni `extras`.

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

`.run()` lit la première ligne du résultat. Quand la requête n’en renvoie aucune, `.run()` lit un `NULL` : `count()` donne `0`. `sum()`, `avg()`, `min()` et `max()` donnent `null`, comme pour un ensemble vide. Sous Zapatos 6.6.1, `.run()` était rejetée avec `TypeError: Cannot read properties of undefined (reading 'result')`. Imbriquée dans un `lateral`, une requête qui ne renvoie aucune ligne donne `null`. Cela vaut aussi pour `count()`, dont le type reste `number`.

## `sum()` {#sum}

```ts
db.sum(table, where, options?)
```

`SELECT sum("column") AS result`<!-- probe: db.sum('ratings', db.all, { columns: ['column'] }) -->, un `number | null`. Pour le reste, comme [`count()`](#count). Donnez une colonne dans `columns` : sans elle, `.run()` est rejetée avant toute requête, là où Zapatos 6.6.1 envoyait `sum(*)`, que Postgres refuse (42883). Le type laisse passer cet appel, comme en 6.6.1. Quand aucune ligne ne correspond, la somme vaut `null`.

<CastPanel example="sum">

<<< ../examples/sum.ts{ts twoslash}

</CastPanel>

## `avg()` {#avg}

```ts
db.avg(table, where, options?)
```

`SELECT avg("column") AS result`<!-- probe: db.avg('ratings', db.all, { columns: ['column'] }) --> : la moyenne sous forme de nombre, avec le même résultat sur un ensemble vide et le même type que [`sum()`](#sum).

<CastPanel example="avg">

<<< ../examples/avg.ts{ts twoslash}

</CastPanel>

## `min()` {#min}

```ts
db.min(table, where, options?)
```

`SELECT min("column") AS result`<!-- probe: db.min('ratings', db.all, { columns: ['column'] }) -->, la valeur de la colonne telle que `pg` la lit, ou `null`. Le parseur par défaut donne un `Date` pour une valeur finie de type `date` et une chaîne pour une valeur de type `text`.

<CastPanel example="min">

<<< ../examples/min.ts{ts twoslash}

</CastPanel>

## `max()` {#max}

```ts
db.max(table, where, options?)
```

`SELECT max("column") AS result`<!-- probe: db.max('ratings', db.all, { columns: ['column'] }) -->, le maximum de la colonne, avec le même type de retour que [`min()`](#min).

<CastPanel example="max">

<<< ../examples/max.ts{ts twoslash}

</CastPanel>

## Typé par colonne {#typed-by-column}

À partir de la 8.0.0, les agrégats sont toujours typés par colonne, comme ils l’étaient par défaut depuis la 7.0. Pendant toute la 7.x, [`aggregatesTypedByColumn: false`](/fr/runtime-config#Config.aggregatesTypedByColumn), réglé à l’exécution et déclaré dans `ConfigTypes`, donnait les résultats numériques de la 6.x ([migration vers la 8.0](/fr/switching#from-8-0-aggregatesTypedByColumn)).

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const firstShow = await db.min('screenings', db.all, {
  columns: ['starts_at'],
}).run(pool);
```

<div class="stack">

| Appel | `false`, pendant la 7.x | Typé par colonne |
|---|---|---|
| `min()` d’une valeur finie de `starts_at` (`timestamptz`), avec le parseur par défaut de `pg` | ses millisecondes, `number` | un `Date`, `Date \| null` |
| `max()` de `title`, un `text` | `NaN`, `number` | `'The Salt Orchard'`, `string \| null` |
| `sum()` ou `avg()`, sans ligne correspondante, ou sans ligne renvoyée | `0`, `number` | `null`, `number \| null` |
| `max()` de `runtime_minutes`, un `integer` | `131`, `number` | `131`, `number \| null` |
| `min()` sous une clé de `lateral` | une chaîne ISO, typée `number` | la même chaîne, `TimestampTzString \| null` |
| `min()` comme unique `lateral` d’un `selectOne()` | un `Date`, typé `number \| undefined` | le même `Date`, `Date \| null \| undefined` |

</div>

- Le SQL est le même dans les deux cas : `SELECT min("starts_at") AS result FROM "screenings"`<!-- probe: db.min('screenings', db.all, { columns: ['starts_at'] }) -->.
- `min()` et `max()` donnent un `bigint` ou un `numeric` sous forme de chaîne avec le parseur par défaut de `pg`. Sous une clé de `lateral`, le parseur JSON de la requête extérieure lit le nombre et peut conserver les grandes valeurs sous forme de chaînes.
- `count()` n’est pas typé par colonne : `0` au premier niveau, et `null` imbriqué dans un `lateral` ou comme valeur d’`extras` quand sa requête ne renvoie aucune ligne.
- Passé comme unique `lateral`, l’agrégat est typé comme au premier niveau par `selectOne()` et `selectExactlyOne()`, qui rendent sa colonne telle quelle, et comme imbriqué par `select()`, qui enveloppe ses lignes dans `jsonb_agg()`. Ce `selectOne()` ou ce `selectExactlyOne()`, imbriqué à son tour, est typé comme imbriqué.
- `.copy()` renvoie un simple `SQLFragment`. Dans `extras` ou sous une clé de `lateral`, imbriquez le fragment d’origine de `min()` ou de `max()`. La copie d’un agrégat sur une colonne de type date conserve le type du résultat direct, `Date | null`. En JSON, Postgres renvoie les dates non nulles sous forme de chaînes.

## Types {#types}

Ce dont sont faites les signatures ci-dessus, tirées de `zapatos/db`.

### `NumericAggregateSignatures` {#NumericAggregateSignatures}

La signature de `count()` prend `table`, `where` et `options?`, et renvoie `SQLFragment<number>`. `sum()` et `avg()` prennent [`NullableNumericAggregateSignatures`](#NullableNumericAggregateSignatures), et `min()` et `max()` [`ColumnAggregateSignatures`](#ColumnAggregateSignatures) ([Typé par colonne](#typed-by-column)). Pendant toute la 7.x, `aggregatesTypedByColumn: false` dans `ConfigTypes` donnait celle-ci aux quatre agrégats.

### `NullableNumericAggregateSignatures` {#NullableNumericAggregateSignatures}

La signature de `sum()` et `avg()` reprend les paramètres de [`NumericAggregateSignatures`](#NumericAggregateSignatures) et renvoie `SQLFragment<number | null>`.

### `ColumnAggregateSignatures` {#ColumnAggregateSignatures}

La signature de `min()` et `max()` reprend les paramètres de [`NumericAggregateSignatures`](#NumericAggregateSignatures) et renvoie un [`ColumnAggregateFragment`](#ColumnAggregateFragment) pour la colonne indiquée dans `columns`.

### `ColumnAggregateFragment` {#ColumnAggregateFragment}

```ts
interface ColumnAggregateFragment<RunResult, NestedResult> extends SQLFragment<RunResult>
```

`min()` et `max()` utilisent `RunResult` (le type `Selectable` de la colonne ou `null`) pour les appels directs et le `lateral` unique de `selectOne()`, `selectExactlyOne()` et `selectRows()`. Ces requêtes transmettent la valeur lue par `pg`, tout comme un appel direct. Sous une clé de `lateral`, dans `extras` ou dans un `select()`, la valeur est renvoyée en JSON et typée `NestedResult` (le type `JSONSelectable` de la colonne ou `null`), comme l’indique [`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment). Avec `declaration: true`, le fichier `.d.ts` d’une fonction qui renvoie ce fragment le désigne par son nom. Un spread du fragment (`{ ...db.min(…) }`) déclenche l’erreur TS4023, car ses membres font référence à un symbole que `zapatos/db` n’exporte pas.
